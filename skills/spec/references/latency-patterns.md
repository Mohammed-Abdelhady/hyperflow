# Latency patterns (P1–P5)

## Purpose

Five orthogonal latency-reduction patterns applied across `spec`, `scope`, and `dispatch`. Each preserves the Worker (Sonnet) ⇒ Reviewer (Opus) tier doctrine — they change *when* and *how* calls fire, not the tier mix.

## Wall-clock impact

| Pattern | Applies to | Wall-clock win |
|---|---|---|
| P1 — Parallel sibling drafts | spec §7, scope decomposition | ~5x on section work |
| P2 — Batched single-pass review | spec §7, scope, dispatch | ~5x reviewer calls collapsed |
| P3 — Concurrent independent pre-conditions | spec §1+§2, §5+§6, all skills | ~2x on independent steps |
| P4 — Triage-driven step skipping | spec §3, §6 | up to 100% on low-ambiguity |
| P5 — Lean worker prompts via memory references | all skills | ~30% TTFT reduction |

**Median spec run:** ~16 sequential round-trips before → ~6 after. ~60% wall-clock reduction, zero change to which tier reviews what.

**Dispatch (workhorse):** P2 alone collapses N per-sub-task Opus reviews into 1 batched review per batch. On a 3-batch task with 4 sub-tasks per batch: 12 reviewer calls → 3. ~75% reviewer-phase latency reduction.

---

## P1 — Parallel sibling drafts

**What it is:** Draft multiple independent sections simultaneously by dispatching all sibling workers in a single message with parallel `Agent` calls — the same pattern `dispatch` uses for batch workers, applied back to `spec` §7 and `scope` decomposition.

**When siblings qualify:**
- No inter-dependencies (section A's output is not an input to section B)
- All share the same upstream input (e.g., a single approved approach feeds all 5 design sections)
- Sibling count matches the natural structure: 5 spec sections (Architecture, Data flow, Key decisions, Edge cases, File structure); do not artificially split to inflate parallelism

**Dispatch pattern:** Fire all sibling Worker agents in one message. Wait for all to return before advancing to the Reviewer step.

**Example:**

```
[spec §7] approved approach → single message →
  Worker §A (Architecture)    ↘
  Worker §B (Data flow)        → all parallel
  Worker §C (Key decisions)    →
  Worker §D (Edge cases)       →
  Worker §E (File structure)  ↗
→ wait for all 5 → P2 batched review
```

**Why quality is preserved:** The Reviewer still reviews every section. Parallelizing the draft phase does not touch the review phase.

**When to disable:** `--thorough` / `depth=max` flag. Sequential drafts are safer when a prior section's content meaningfully shapes a later section's approach (rare in spec, common in narrative prose). If in doubt, keep P1 on — the Reviewer catches cross-section conflicts.

---

## P2 — Batched single-pass review

**What it is:** After N parallel drafts complete, dispatch **one** Opus Reviewer with all N sections in its prompt instead of N separate reviewer calls.

**When applicable:** N siblings have completed at the same review-level cap (e.g., all are L3 or all are L5). Do not batch siblings that have different level caps — see "When NOT to use" below.

**Per-sibling verdict format** (Reviewer must return one block per section):

```
§1 Architecture:   PASS
§2 Data flow:      NEEDS_FIX — [specific feedback]
§3 Key decisions:  PASS
§4 Edge cases:     PASS
§5 File structure: PASS
```

For each `NEEDS_FIX` section: re-dispatch only that section's Worker; single Opus re-review of just that section. Do not redraft passing siblings.

**Cross-section coherence benefit:** Batched review is strictly better for coherence than sequential per-section review — the Reviewer sees all sections simultaneously and can catch conflicts that per-section passes miss (e.g., a contradiction between §1 Architecture and §5 File structure that neither section alone would reveal).

**Prompt template:** See `skills/hyperflow/reviewer-prompt-batched.md` for the exact prompt structure, verdict format, and NEEDS_FIX handling rules.

**When NOT to use:**
- Siblings have different reviewer-level caps (e.g., some are L3, some require L5 — batch only within the same cap)
- One sibling's content is logically dependent on another sibling's draft completing first (use P1's sequencing to resolve, then batch the independent set)
- The batch would exceed the Reviewer's safe context window — cap at 5 siblings per batch call

**Why quality is preserved:** Thinking-tier reasoning over N sections in one pass is at least as rigorous as N separate passes, and cross-section coherence checking improves.

---

## P3 — Concurrent independent pre-conditions

**What it is:** Dispatch two or more pre-condition steps in the same message when their outputs do not depend on each other.

**Identifying independence:** Step A and Step B are independent if the output of A is not an input to B and the output of B is not an input to A. Both may share an upstream input without losing independence.

**Examples (spec flow):**

| Concurrent pair | Why independent |
|---|---|
| Step 1 Classifier ∥ Step 2 Searcher | Searcher maps existing context; does not need triage output to begin |
| Step 5 Synthesis Writer ∥ Step 6 Approaches Writer | Both depend on Step 4 answers, but neither depends on the other's output |

**Dispatch pattern:** Fire both in one message; wait for both before advancing to the dependent step.

**Race-case handling:** If one step fails or returns thin output before the other completes:
- Allow the other to complete
- Reviewer at the next step redispatches the thin result with a better-scoped query informed by the companion output
- Do not re-run both — only the incomplete one

**P3 stays on always.** The `--thorough` flag does not disable P3 — there is no quality tradeoff in running truly independent steps concurrently. Never introduce artificial sequencing between independent steps to appear more thorough.

---

## P4 — Triage-driven step skipping

**What it is:** Skip spec ceremony steps that add no value when the request is already clear and unambiguous.

**Thresholds:**

| Condition | Steps skipped | Rationale |
|---|---|---|
| `ambiguity < 0.4 AND complexity != high` | Step 3 (6-dim analysis) + Step 6 (2–3 approach proposals) | Nothing ambiguous to analyze; one clear approach exists |
| `ambiguity < 0.2 AND complexity == low` | Entire spec skill | Bounce directly to `scope` — spec ceremony adds no value |

**Steps always kept regardless of triage:**
- Step 7 sections (the design walk-through is the deliverable)
- Step 4 questions (2-question floor is a structural gate per DOCTRINE rule 8)

**Borderline rounding rule:** When `ambiguity` lands at or near the threshold (e.g., 0.39, 0.41), **round up** — run the optional steps. The latency win matters on the clearly unambiguous cases; borderline cases keep the full ceremony. Never skip on the fence.

**How this is enforced:** The skill reads `triage.ambiguity` and `triage.complexity` from the triage JSON (see `task-triage.md`) at Step 0, before any step dispatch. Gate logic executes inline in the orchestrator, not inside a Worker.

**When to disable:** `--thorough` / `depth=max` flag disables P4. All steps run regardless of triage scores.

---

## P5 — Lean worker prompts via memory references

**What it is:** Replace inlined context blocks in worker prompts with a 200-token pointer to `.hyperflow/memory/`, letting workers `Read` only what they need rather than receiving everything upfront.

**Why TTFT matters:** Time-to-first-token at the API layer grows with prompt size. Smaller prompts = faster first token = lower wall-clock latency per call, multiplied across every worker in a batch. Token cost is a side benefit; wall-clock is the goal.

**Pointer pattern (replaces inlined blocks):**

```
You have access to .hyperflow/memory/ — read these files as needed:
  - doctrine.md       — orchestration rules (read once if unfamiliar)
  - profile.md        — project conventions
  - architecture.md
  - conventions.md
  - learnings.md      — accumulated lessons from prior batches in this run
Your task: <inline task description here>
```

Workers `Read` only the files relevant to their task. Doctrine is read once per session by the first worker that needs it, not re-inlined on every dispatch.

**Prompt template:** See `skills/hyperflow/worker-prompt-lean.md` for the full lean-prompt template and field substitution rules.

**Fallback when memory files don't exist (fresh project):** If a referenced file is absent, the worker falls back to a brief inline default for that file only. The gap is noted; suggest the user run `/hyperflow:scaffold` to populate `.hyperflow/memory/` before the next dispatch. Workers do not fail on a missing memory file — they degrade gracefully to inline defaults.

**P5 stays on always.** The `--thorough` flag does not disable P5 — there is no quality tradeoff in lean prompts. Workers still have access to the full context; they fetch it on demand.

---

## When to disable

| Flag | Disables | Keeps |
|---|---|---|
| `--thorough` / `depth=max` | P1, P2, P4 | P3, P5 |
| (none) | — | All five on |

P3 and P5 are always on because they carry no quality tradeoff. P1, P2, and P4 restructure dispatch shape and skip steps; `--thorough` restores sequential drafts, per-section reviews, and full step execution.

---

## Quality preservation

Running the latency patterns does not change:
- Which tier reviews what — Opus reviewers remain on every Worker output (P2 consolidates calls, does not eliminate them)
- Review level caps — L1–L5 assignments per sub-task are unchanged
- Worker access to context — workers still reach full doctrine and project context via `.hyperflow/memory/` (P5 makes access on-demand, not absent)
- Step coverage on ambiguous requests — P4 skips only on low-ambiguity, and rounds up on borderline cases

What changes is **structure**: when calls fire, in what grouping, with what prompt payload. The quality floor is held by the Reviewer still seeing every output (D2) and workers retaining full context access (D5).
