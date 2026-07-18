# Latency patterns (P1–P5 + Round 2 L1-L9)

## Purpose

Five orthogonal latency-reduction patterns (P1–P5, round 1) plus nine additional levers (L1–L9, round 2) applied across `plan` and `dispatch`. Round 1 patterns change *when* and *how* calls fire, not the agent count. Round 2 patterns reduce call *count* and eliminate unnecessary review passes — acknowledging that review ceremony around mechanical orchestration steps costs wall-clock without quality return.

Executable ops use [runtime-contract.md](runtime-contract.md): prefer concurrent sibling `spawn` when the host supports true parallelism; otherwise **sequenced labelled inline** phases with honest wording (never claim parallel subagents for serial work). Structural gates use `structured_question` (or Hyperflow Question + end turn). Every agent runs on the **current session model** — no model-tier routing, no effort used as a substitute for model selection.

## Metrics honesty (non-negotiable)

These patterns describe **structure** (how work is grouped, which steps can skip, which reviews consolidate). They do **not** authorize fabricated performance claims.

| Rule | Requirement |
|---|---|
| Report timing only with evidence | Wall-clock, speedup ratios, and absolute durations require measured start/end times from the host or orchestrator clock for **that run** |
| Report usage only with evidence | Token / cache / agent-count lines use `usage_metrics` or explicit `estimated=true` character estimates — never host-UI parsing as a universal source |
| No baseline fiction | Do not emit "~5x", "~60% faster", "30–45s", or similar figures as if they were observed unless this session measured them |
| Parallelism claims | Require true concurrent spawns **or** explicit "sequenced inline" wording |
| Absent sources | Print `unavailable` or omit the metric — never invent numbers to fill a template |

Illustrative tables below use **call-structure language** (sibling count, review passes collapsed, steps skipped) — not promised wall-clock.

### Structural effect (what changes)

| Pattern | Applies to | Structural effect |
|---|---|---|
| P1 — Parallel sibling drafts | plan Step 7, plan Step 3 (context Searchers) + Step 10 (Writer-internal section parallelism) | N independent drafts fire as one concurrent wave (or sequenced inline when spawn absent) instead of N serial drafts |
| P2 — Batched single-pass review | plan Step 7, plan decomposition (Step 9), dispatch | N per-sibling reviewer calls collapse to 1 batched review at the same level cap |
| P3 — Concurrent independent pre-conditions | plan Step 1+Step 3, Step 5+Step 6, all skills | Independent pre-conditions share one dispatch wave |
| P4 — Triage-driven step skipping | plan Step 4, Step 6 | Low-ambiguity paths skip ceremony steps (no quality-role removal) |
| P5 — Lean worker prompts via memory references | all skills | Smaller prompts; workers load context on demand |

**Plan design-phase structure (round 1):** many sequential round-trips collapse to fewer waves (parallel drafts + batched review). Roles that review each section remain assigned.

**Dispatch structure (round 1):** P2 collapses N per-sub-task Reviewer calls into 1 batched review per batch. Example shape only: 3 batches × 4 sub-tasks → 12 sequential reviewer calls become 3 batch reviews. Measure actual wall-clock per run; do not print a universal "% latency reduction".

### Round 2 structural outcomes (shape, not timed)

| Phase | Round 1 structure | Round 2 structure | Call-count effect |
|---|---|---|---|
| Plan (design phase) | Full ceremony + optional coverage Reviewer | L4 may drop coverage Reviewer; L8 may skip multi-dim / bounce | Fewer optional plan review/ceremony calls |
| Dispatch (per-batch) | Batch workers + batch Reviewer + wrap-up Reviewer path | L5 drops wrap-up Reviewer; L9 may inline trivial wrap-up | Fewer orchestration review calls |
| Wrap-up | Agent-dispatched wrap-up | Inline when §12.1 criteria met | Removes one non-implementation dispatch |
| End-of-chain gates | Two sequential structured questions | L2 one multi-question `structured_question` | One fewer user round-trip |

**Reviewer call count (shape):** round 2 drops wrap-up and optional coverage/integration reviews when their skip conditions hold. Implementation batch Reviewers remain. Report exact call counts only from the run's evidence.

---

## P1 — Parallel sibling drafts

**What it is:** Draft multiple independent sections simultaneously by dispatching all sibling workers in a single concurrent `spawn` wave (or one message of parallel host children) — the same pattern `dispatch` uses for batch workers, applied back to `plan` Step 7 and `plan` decomposition (Step 9). When `spawn` is unavailable: run **sequenced labelled inline worker** phases for each sibling, then continue — do not claim parallel execution.

**When siblings qualify:**
- No inter-dependencies (section A's output is not an input to section B)
- All share the same upstream input (e.g., a single approved approach feeds all 5 design sections)
- Sibling count matches the natural structure: 5 plan design sections (Architecture, Data flow, Key decisions, Edge cases, File structure); do not artificially split to inflate parallelism

**Dispatch pattern:** Fire all sibling Worker agents in one concurrent wave when the host supports it. Wait (`wait` op or same-turn collection) for all to return before advancing to the Reviewer step.

**Example:**

```
[plan Step 7] approved approach → single concurrent wave →
  Worker §A (Architecture)    ↘
  Worker §B (Data flow)        → all parallel (or sequenced inline if no spawn)
  Worker §C (Key decisions)    →
  Worker §D (Edge cases)       →
  Worker §E (File structure)  ↗
→ collect all 5 → P2 batched review
```

**Why quality is preserved:** The Reviewer still reviews every section. Parallelizing the draft phase does not touch the review phase.

**When to disable:** `--thorough` / `depth=max` flag disables P1 for steps where a prior section's output could meaningfully shape a later section's approach (rare in plan Step 7, common in narrative prose).

**Plan-specific carve-out (critical):** `--thorough` does NOT disable P1 for plan Step 3's parallel context Searchers. Those two Searchers are independent reads — neither's output is an input to the other — so sequencing them provides no quality benefit regardless of flag. `--thorough` only disables P1 where section-order dependency is plausible:
- Step 7 design-section drafts and Step 10 task-file section drafts
- Anywhere else sibling content could cross-influence

**Plan P1 surface under `--thorough`:**

| Plan step | P1 under default | P1 under `--thorough` |
|---|---|---|
| Step 3 — parallel context Searchers | On | **On** (independent reads, no tradeoff) |
| Step 7/10 — Writer section parallelism | On | **Off** (serialized for section coherence) |

If in doubt about whether siblings are truly independent, keep P1 on — the Reviewer catches cross-section conflicts.

---

## P2 — Batched single-pass review

**What it is:** After N parallel (or sequenced) drafts complete, dispatch **one** Reviewer with all N sections in its prompt instead of N separate reviewer calls. Use `spawn` for the Reviewer when available; otherwise a labelled **inline reviewer** phase. Never the same child/phase that drafted the sections.

**When applicable:** N siblings have completed at the same review-level cap (e.g., all are L3 or all are L5). Do not batch siblings that have different level caps — see "When NOT to use" below.

**Per-sibling verdict format** (Reviewer must return one block per section):

```
§1 Architecture:   PASS
§2 Data flow:      NEEDS_FIX — [specific feedback]
§3 Key decisions:  PASS
§4 Edge cases:     PASS
§5 File structure: PASS
```

For each `NEEDS_FIX` section: re-dispatch only that section's Worker; single re-review of just that section. Do not redraft passing siblings.

**Cross-section coherence benefit:** Batched review is strictly better for coherence than sequential per-section review — the Reviewer sees all sections simultaneously and can catch conflicts that per-section passes miss (e.g., a contradiction between §1 Architecture and §5 File structure that neither section alone would reveal).

**Prompt template:** See `skills/hyperflow/reviewer-prompt-batched.md` for the exact prompt structure, verdict format, and NEEDS_FIX handling rules.

**When NOT to use:**
- Siblings have different reviewer-level caps (e.g., some are L3, some require L5 — batch only within the same cap)
- One sibling's content is logically dependent on another sibling's draft completing first (use P1's sequencing to resolve, then batch the independent set)
- The batch would exceed the Reviewer's safe context window — cap at 5 siblings per batch call

**Why quality is preserved:** A single Reviewer pass over N sections is at least as rigorous as N separate passes, and cross-section coherence checking improves.

---

## P3 — Concurrent independent pre-conditions

**What it is:** Dispatch two or more pre-condition steps in the same concurrent wave when their outputs do not depend on each other.

**Identifying independence:** Step A and Step B are independent if the output of A is not an input to B and the output of B is not an input to A. Both may share an upstream input without losing independence.

**Examples (plan flow):**

| Concurrent pair | Why independent |
|---|---|
| Step 1 Classifier ∥ Step 3 context Searcher | Searcher maps existing context; does not need triage output to begin |
| Step 6 synthesis ∥ Step 6 approaches | Step 5 answers feed both Step 6 synthesis and Step 6 approach drafting; neither sub-part depends on the other's output |

**Dispatch pattern:** Fire both in one concurrent wave when spawn supports it; wait for both before advancing to the dependent step. Without spawn: sequence labelled inline phases and say so.

**Race-case handling:** If one step fails or returns thin output before the other completes:
- Allow the other to complete
- Reviewer at the next step redispatches the thin result with a better-scoped query informed by the companion output
- Do not re-run both — only the incomplete one

**P3 stays on always.** The `--thorough` flag does not disable P3 — there is no quality tradeoff in running truly independent steps concurrently. Never introduce artificial sequencing between independent steps to appear more thorough.

---

## P4 — Triage-driven step skipping

**What it is:** Skip plan ceremony steps that add no value when the request is already clear and unambiguous.

**Thresholds (round 2 — updated by D8/L8):**

| Condition | Steps skipped | Rationale |
|---|---|---|
| `ambiguity < 0.6 AND complexity != complex` | Step 4 (6-dim analysis) + Step 6 (approach proposals) | Nothing ambiguous to analyze; one clear approach exists |
| `ambiguity < 0.4 AND complexity IN [trivial, simple]` | Design phase (Steps 6-8) | Bounce directly to decomposition (Step 9) — design ceremony adds no value |

**Steps always kept when their preconditions apply:**
- Step 7 sections when the design walk-through is the deliverable
- Structural gates; clarification questions are skipped when grounded ambiguity is below 0.2

**Borderline rounding rule:** When `ambiguity` lands at or near the threshold (e.g., 0.39, 0.41), **round up** — run the optional steps. The latency win matters on the clearly unambiguous cases; borderline cases keep the full ceremony. Never skip on the fence.

**How this is enforced:** The skill reads `triage.ambiguity` and `triage.complexity` from the triage JSON (see `task-triage.md`) at Step 0, before any step dispatch. Gate logic executes inline in the orchestrator, not inside a Worker.

**When to disable:** `--thorough` / `depth=max` flag disables P4. All steps run regardless of triage scores.

---

## P5 — Lean worker prompts via memory references

**What it is:** Replace inlined context blocks in worker prompts with a compact pointer to `.hyperflow/memory/`, letting workers read only what they need rather than receiving everything upfront.

**Why smaller prompts help:** Time-to-first-token and total tokens often grow with prompt size on real hosts. Prefer lean pointers so workers load files on demand. **Do not quote a universal TTFT %** unless this run measured it. Token cost reduction is a side benefit when measured via `usage_metrics`; wall-clock structure is the design goal.

**Pointer pattern (replaces inlined blocks):**

```
You have access to project context — read these files as needed:

.hyperflow/ root (project analysis from scaffold Step 1):
  - profile.md        — project conventions
  - architecture.md   — system architecture
  - conventions.md    — naming, patterns, standards

.hyperflow/memory/ (orchestration + accumulated state from scaffold Step 2):
  - doctrine.md       — orchestration rules (read once if unfamiliar)
  - learnings.md      — accumulated lessons from prior batches in this run
  - decisions.md, pitfalls.md, patterns.md — memory stubs

Your task: <inline task description here>
```

Workers read only the files relevant to their task via host file tools. Doctrine is read once per session by the first worker that needs it, not re-inlined on every dispatch.

**Prompt template:** See `skills/hyperflow/worker-prompt-lean.md` for the full lean-prompt template — that file is the canonical source. This block is illustrative only.

**Fallback for absent or stub files:** If a referenced file is absent OR appears to be an unpopulated stub (matches a `<!-- to be populated -->` sentinel or has fewer than ~5 meaningful body lines), the worker falls back to a brief inline default for THAT file only — not a wholesale switch to the full prompt. Partial population is the expected failure mode (scaffold creates the directory with stubs); a wholly-missing `.hyperflow/` is the rare edge case.

**P5 stays on always.** The `--thorough` flag does not disable P5 — there is no quality tradeoff in lean prompts. Workers still have access to the full context; they fetch it on demand.

---

## Round 2 patterns (L1-L9)

Round 2 reduces call **count** by eliminating unnecessary review passes. The doctrine floor `review agents ≥ batches + 2` becomes `≥ batches + 1` (L5 drops wrap-up Reviewer), and several Reviewer calls become conditional or are dropped when the work they review is mechanical.

---

### L1 — Lightweight Classifier (D1)

**What it is:** Run deterministic `route-task.py` first. Dispatch the lean structured-output Classifier only when the preflight cannot safely prove an inline-fast route.

**When applicable:** Every new-work request runs deterministic preflight; uncertain, explicit, gated, or non-fast requests then use the Classifier. Both paths produce the same triage contract. Classifier runs on the **current session model** (no cheaper-tier routing).

**`--thorough` behavior:** Does NOT change this lever. Lean classification is high-quality for the structured JSON output shape; no accuracy tradeoff justifies a heavier ceremony prompt.

---

### L2 — Combined audit+deploy gate (D2)

**What it is:** Merge the two sequential end-of-chain `structured_question` calls (audit gate + deploy gate) into a single multi-question call. Prefer host structured UI; otherwise one Hyperflow Question block covering both (and PR when `pr=ask`) and **end the turn**.

**When applicable:** Always at end-of-chain — two sequential user round-trips is pure latency overhead. Branching logic (audit Yes + deploy No → run audit, stop before deploy) is fully preserved. Gates remain **blocking** — never silent-default.

**`--thorough` behavior:** Does NOT change this lever. No quality tradeoff — questions are identical, branching is identical. The only change is one fewer user round-trip.

---

### L3 — Session-cached context (D3)

**What it is:** `hooks/session-start` concatenates `.hyperflow/profile.md`, `architecture.md`, and `conventions.md` into a single `.hyperflow/memory/session-context.md` bundle at session start. Workers reference the bundle instead of reading three separate files.

**When applicable:** Always when `.hyperflow/` is populated. Mid-session changes to source files do not propagate until next session-start (document the limit). Workers can still read source files directly if they suspect staleness.

**`--thorough` behavior:** Does NOT change this lever. Workers retain full context access; they simply read it from a pre-bundled file rather than three files.

---

### L4 — Drop plan context-Searcher coverage Reviewer (D4)

**What it is:** Remove the Reviewer that reviewed the plan Step 3 Searcher output for coverage completeness.

**When applicable:** Always on the default path when prior runs show the coverage pass is mechanical. Fallback: if a downstream Writer flags `MISSING CONTEXT: <subsystem>`, redispatch the Searcher with the gap before continuing. Slower on the rare bad-case path; faster on the common good-case path. Do not invent a pass-rate percentage as fact.

**`--thorough` behavior:** RESTORES the coverage Reviewer. Step 3 reverts to Worker + Reviewer pattern for coverage validation.

---

### L5 — Drop dispatch wrap-up Reviewer (D5)

**What it is:** Remove the Reviewer from dispatch Step 4 (delete task file + append memory entry + chore commit). Step 4 executes inline by the orchestrator; no Reviewer dispatch.

**When applicable:** Always for wrap-up — this work is mechanically simple and already validated by per-batch reviewers and the final integration review. Iron rule updates from `≥ batches + 2` to `≥ batches + 1`.

**`--thorough` behavior:** RESTORES the wrap-up Reviewer. Dispatch Step 4 reverts to Worker + Reviewer pattern. Iron rule reverts to `≥ batches + 2`.

---

### L6 — Default L1-L2 cap (D6)

**What it is:** Batched Reviewer level cap defaults to L1-L2 (was L1-L3 in practice). Triage flags `security: bool` or `integration_risk: bool` elevate the cap to L1-L3+ when warranted.

**When applicable:** Standard complexity tasks without security or integration flags. L3 adds integration/security checks; L4 adds perf; L5 adds a11y — most doc edits, small refactors, and config changes don't need L3 review.

**`--thorough` behavior:** Elevates default cap to L1-L3. All batches reviewed at L3 regardless of triage flags.

---

### L7 — Conditional final integration review (D7)

**What it is:** Skip the final integration review when all batches passed first-try AND no escalations AND no security flags fired. Print `"Final integration review skipped — all batches PASSed first try"` and proceed to Step 4.

**When applicable:** Triggered when `all_batches_passed_first_try AND no_escalations AND no_security_flags`. If ANY batch had ≥1 NEEDS_FIX retry, ANY escalation fired, or ANY security flag tripped → integration review runs unconditionally.

**`--thorough` behavior:** Disables the skip entirely. Final integration review always runs regardless of batch outcomes.

---

### L8 — Aggressive P4 thresholds (D8)

**What it is:** P4 skips the multi-dim Analyst at `ambiguity < 0.6` and bounces clear trivial/simple work to decomposition at `ambiguity < 0.4`. Requests below 0.2 ask no clarification unless inspection exposes a material unknown.

**When applicable:** Whenever `ambiguity < 0.6 AND complexity != complex` (skip multi-dim) or `ambiguity < 0.4 AND complexity IN [trivial, simple]` (bounce). Borderline rounding rule unchanged: round up on the fence.

**`--thorough` behavior:** Reverts to round-1 thresholds: skip multi-dim at `ambiguity < 0.4`; bounce at `ambiguity < 0.2`. All ceremony runs on higher-ambiguity cases.

---

### L9 — DOCTRINE §12.1 trivial inline (D9)

**What it is:** §12.1 amendment to DOCTRINE §12 — trivial steps (≤ 2 tool calls, no content generation, no decision-making, no review needed, orchestrator is the natural executor) may be performed inline by the orchestrator without a `spawn` wrapper. Examples: dispatch Step 4 wrap-up (delete + memory append + commit), plan hand-off invocations via `skill_continuation`.

**When applicable:** Only when ALL five §12.1 criteria are met. Non-trivial steps (any code/doc generation, multi-file change, cross-file consistency reasoning, research/read of unfamiliar context, Reviewer-eligible output) remain dispatched per §12 (`spawn` when available; labelled inline worker otherwise). Trivial-eligibility is checked at step-start; if the orchestrator discovers mid-step that the work needs generation/research, it MUST abort the inline path and dispatch a Worker.

**`--thorough` behavior:** Disables §12.1 entirely. All steps dispatched as in round 1 — no inline execution regardless of triviality.

---

## When to disable

### Round 1 patterns

| Flag | Disables | Keeps |
|---|---|---|
| `--thorough` / `depth=max` | P1, P2, P4 | P3, P5 |
| (none) | — | All five on |

P3 and P5 are always on because they carry no quality tradeoff. P1, P2, and P4 restructure dispatch shape and skip steps; `--thorough` restores sequential drafts, per-section reviews, and full step execution.

**Exception within P1:** plan Step 3's parallel context Searchers stay on even under `--thorough`. They are independent reads with no ordering dependency, so serializing them yields no quality gain. Only P1 surfaces with plausible section-order coupling are serialized by `--thorough` (Step 7 design sections, Step 10 task-file sections).

### Round 2 levers

| Lever | Default | `--thorough` restores |
|---|---|---|
| L1 — Lightweight Classifier | On (lean structured-output prompt) | No change — lean prompt stays |
| L2 — Combined audit+deploy gate | On (1 round-trip `structured_question`) | No change — combined gate stays |
| L3 — Session-cached context | On (bundle) | No change — bundle stays |
| L4 — Drop plan context-Searcher coverage Reviewer | On (no Reviewer) | Step 3 coverage Reviewer restored |
| L5 — Drop dispatch wrap-up Reviewer | On (inline only) | Wrap-up Reviewer restored; iron rule reverts to `≥ batches + 2` |
| L6 — Default L1-L2 cap | On (L1-L2 default) | Cap elevated to L1-L3 default |
| L7 — Conditional integration review | On (skippable when all green) | Integration review always runs |
| L8 — Aggressive P4 thresholds | On (skip at 0.6 / bounce at 0.4) | Reverts to round-1 thresholds (skip at 0.4 / bounce at 0.2) |
| L9 — §12.1 trivial inline | On (inline-allowed) | §12.1 disabled; all steps spawn-dispatched (or labelled inline) |

---

## Quality preservation

### Round 1 (structural)

Round 1 patterns do not change:
- Which roles review what — Reviewers remain on every Worker output (P2 consolidates calls, does not eliminate them)
- Review level caps — L1–L5 assignments per sub-task are unchanged
- Worker access to context — workers still reach full doctrine and project context via `.hyperflow/memory/` (P5 makes access on-demand, not absent)
- Step coverage on ambiguous requests — P4 skips only on low-ambiguity, and rounds up on borderline cases

What changes is **structure**: when calls fire, in what grouping, with what prompt payload. The quality floor is held by the Reviewer still seeing every output and workers retaining full context access.

### Round 2 (count + ceremony)

Round 2 acknowledges a narrow tradeoff: **orchestration ceremony** (wrap-up, conditional integration review, trivial inline steps) is relaxed; **implementation work** is not.

What round 2 does NOT change:
- Implementation work still hits a per-batch Reviewer (L5 drops the wrap-up Reviewer, not the batch Reviewer)
- Per-sub-task commit cadence — preserved unconditionally
- SECURITY_VIOLATION halt — preserved unconditionally
- Material-question rule — clear grounded work asks none; unresolved implementation choices still ask
- Borderline rounding rule — preserved (round up on ambiguity boundary; never skip on the fence)
- Blocking structural gates — still fire via `structured_question` / Hyperflow Question; never silent-default
- Session model — no model-tier or per-role model routing

What round 2 relaxes:
- Reviewing mechanical orchestration steps (delete task file, memory append, chore commit) — L5 + L9
- A final integration review that would redundantly check already-green first-try batches — L7
- A coverage Reviewer over a Searcher output that is usually complete — L4
- A heavyweight Classifier prompt for structured JSON classification — L1

The net: implementation Reviewer calls are unchanged. Orchestration Reviewer calls drop by a small constant per median chain shape. `--thorough` restores L4, L5, L7, L8, L9 for runs where maximum ceremony is warranted.

## Related

- [runtime-contract.md](runtime-contract.md) — spawn, structured_question, metrics honesty
- [chain-router.md](chain-router.md) — end-of-chain gates
- [reviewer-prompt-batched.md](reviewer-prompt-batched.md) · [worker-prompt-lean.md](worker-prompt-lean.md)
- [escalation.md](escalation.md) — usage accounting with evidence only
