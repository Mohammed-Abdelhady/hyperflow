---
name: spec
description: |
  Use when the user is exploring a design idea, weighing approaches, or has an ambiguous request. Asks structured questions, proposes 2-3 approaches, walks the design section-by-section. On approval, auto-chains into /hyperflow:scope.
  Trigger with /hyperflow:spec, "should I", "how should we", "what's the best way to", "design this", "explore the approach".
allowed-tools: Write, AskUserQuestion
argument-hint: "<design question or feature idea> [chain-mode=auto|manual] [--thorough | depth=max]"
version: 3.1.2
license: MIT
compatibility: Designed for Claude Code
tags: [design, brainstorming, planning, multi-agent]
---

# Spec

This phase is **thinking, not building**. No code until the user approves the design. On approval, the chain advances to `scope` → `dispatch`. The user picks the advancement mode at Step 0.

This skill drives **Layer 0.5 (Task Triage)** and **Layer 4 (Brainstorming/Spec)** from the doctrine. Multi-level review (L1–L5) runs later during `/hyperflow:dispatch` per the triage's chosen flow profile.

## Per-Step Agent Map (DOCTRINE rule 12)

Every substantive step dispatches at least one Agent per DOCTRINE rule 12. Trivial steps per §12.1 may be performed inline by the orchestrator.

| Step | Worker tier | Thinking tier | Notes |
|---|---|---|---|
| 0 — Chain mode | — | — | `AskUserQuestion` only (exempt) |
| 1+2 — Triage + Context | Searcher (Sonnet) [P3 concurrent] | **Classifier** (Opus) [P3 concurrent] | P3: dispatched in same message; no coverage Reviewer (D4) |
| 3 — Multi-dim analysis | — | **Analyst** (Opus) produces 6-dim brief | P4-skippable: ambiguity < 0.6 AND complexity != high |
| 4 — Smart questions | — | — | `AskUserQuestion` only (exempt) · floor: 2 always |
| 5+6 — Synthesis + Approaches | Writer ×2 (Sonnet) [P3 concurrent] | **Reviewer** (Sonnet · per-batch tier) batched over both drafts [P2] | P3: dispatched together · Step 6 is P4-skippable · Sonnet because diff is small |
| 7 — Design sections | Writer ×5 (Sonnet) [P1 parallel] | **Reviewer** (Sonnet · per-batch tier) batched over all 5 [P2] | One combined user gate after batch review · Sonnet handles per-section L1-L2 work |
| 8 — Spec output | Writer (Sonnet) | **Reviewer** (Opus · final-pass tier) final spec sanity check | Sequential · Opus because this is the buck-stops-here pass over the full spec |
| 9 — Hand off | — | — | Skill tool invocation — trivial inline per §12.1 (one tool call, no generation, no review) |

Substantive steps = 1, 2, 3, 5, 6, 7, 8. Each appears in the usage summary.

## Approval Gates

| Gate | When | Format |
|---|---|---|
| Chain mode | Step 0, once per chain | `AskUserQuestion` — auto / manual |
| Design section approval | Step 7, one combined gate after batched review | `AskUserQuestion` — approve / revise per section |
| Phase advance (if `manual` mode) | Step 9, before invoking `scope` | `AskUserQuestion` — continue / stop |

## Flow

### Step 0 — Choose chain mode (FIRST tool call · STRUCTURAL GATE)

This is a **structural gate** per DOCTRINE rule 8. It MUST fire every time the skill is invoked directly. "No clarifying questions" / "auto-pilot" / "always-on" / any other autonomy directive does NOT skip it. The agent MUST `AskUserQuestion` here — defaulting to `auto` without asking is a doctrine violation.

If invoked with a `chain-mode=<auto|manual>` arg (from a prior skill in the chain), skip this step — the previous chain-starter already asked.

Otherwise, **before any research, triage, or analysis**, ask via `AskUserQuestion`. Per DOCTRINE rule 8, the recommended option goes first with `(Recommended)`:

```
How should I advance through the chain after each phase?

  Auto (Recommended)  — chain forward through spec → scope → dispatch with no gates.
                        Fewer interruptions, faster end-to-end.

  Manual              — pause between phases and ask before advancing.
                        More control, more confirmations.
```

`Auto` is the recommended default because most users invoking a chain-starter want momentum; `Manual` exists for high-risk or exploratory work. Wait for the user's answer. Do not proceed without it. Save the chosen mode and propagate via `args: "chain-mode=<mode>"`.

If the agent cannot present `AskUserQuestion` (e.g., headless mode), it should print an error and stop — never silently default.

**`--thorough` / `depth=max` flag:** When passed, patterns P1, P2, and P4 are disabled and the original sequential flow runs (one Writer at a time, one Reviewer per section, all steps always run). P3 and P5 stay on — they carry no quality tradeoff. Record the flag at Step 0 and propagate it; every step below that references P1, P2, or P4 should check for this flag before applying the pattern.

### Steps 1+2 — Triage and Context Exploration (P3 — concurrent dispatch)

**P3 applies:** Step 1 (Classifier triage) and Step 2 (Searcher context mapping) are independent — the Searcher does not need the triage output to begin. Dispatch both in a single message, then wait for both to return before advancing to the Reviewer.

**If `--thorough` / `depth=max`:** run Step 1 first (wait for it to complete), then Step 2 sequentially.

#### Step 1 — Triage (Layer 0.5)

Agents — **Classifier** (Opus, thinking-tier).

Dispatch `**Classifier** — triaging request` per [task-triage.md](references/task-triage.md). The Classifier produces `{ types[], complexity, risk, scope, ambiguity, flow, personas[] }` JSON. The classification drives:

- **P4 gate** — read `ambiguity` and `complexity` here; triage-driven skipping applies at Steps 3 and 6 (see below)
- **Spec depth** at Step 4 — **floor: 2 questions always**:
  - `ambiguity 0.0–0.5` → light: **2 questions**
  - `0.5–0.8` → standard: **3 questions**
  - `0.8–1.0` → deep: **4–5 questions**
- **Flow profile** for the downstream `dispatch` phase — `fast`, `standard`, `deep`, `research`, `creative`, or `scientific` (see [flow-profiles.md](references/flow-profiles.md))
- **Persona stitching** for worker prompts later (full personas defined in DOCTRINE)

Persist the triage output and propagate it forward through `chain-mode=<mode> triage=<base64-json>` args. Print:

```
**Classifier** — triaging request  [concurrent with Searcher]
Triage — types: [<types>] · flow: <profile> · ambiguity: <score>
```

#### Step 2 — Context Exploration

Agents — `Searcher` (Sonnet).

1. Dispatch `Searcher — mapping context relevant to <idea>` (concurrent with Classifier above). Find existing code, patterns, similar features. Do not ask the user what you can find in the code.
2. Trust the Searcher output and advance. No coverage Reviewer is dispatched — downstream Writers will flag `MISSING CONTEXT: <subsystem>` if anything was missed.

**Fallback:** If a downstream Writer flags `MISSING CONTEXT: <subsystem>`, the orchestrator redispatches the Searcher with the gap before continuing. This trades a small bad-case path penalty for a large good-case path win.

### Step 3 — Multi-Dimensional Analysis (P4-skippable)

Agents — **Analyst** (Opus, thinking-tier).

**P4 gate:** If `triage.ambiguity < 0.6 AND triage.complexity != high`, skip this step entirely — jump to Step 4. Nothing ambiguous to analyze; the 6-dimension brief adds no value. Border rounding rule: **round up** — if ambiguity is 0.59, treat as 0.6 and run this step. Favor running optional steps when on the fence.

**If `--thorough` / `depth=max`:** always run this step regardless of triage scores.

If not skipped: dispatch `**Analyst** — 6-dimension exploration` with the request + context from Step 2. The Analyst produces a brief covering:

1. **User intent** — what is the real underlying need?
2. **Technical fit** — how does this fit existing architecture?
3. **Scope** — minimum viable vs maximum scope
4. **Constraints** — time, deps, perf, compatibility
5. **Risks** — what could go wrong, what's irreversible
6. **Alternatives** — at least 3 ways to solve this

The Analyst flags which dimensions have unknowns the user must resolve. Those unknowns become the Step 4 question set.

### Step 4 — Smart Questions (`AskUserQuestion` — MANDATORY · floor 2)

Use the `AskUserQuestion` tool. Never plain text questions. Ask about unknowns from Step 3 (or from triage + context if Step 3 was skipped).

**Hard floor: every spec run asks at least 2 questions**, regardless of how confident the triage was. The two minimum questions give the user a structural place to redirect before any decomposition runs. This floor is non-negotiable — P4's bounce-to-scope path (below) is the ONLY way to skip Step 4, and that path exits the spec phase entirely. Never skip or reduce below 2 inside the spec phase.

**P4 bounce gate:** If `triage.ambiguity < 0.4 AND triage.complexity == low`, do NOT run Step 4 — bounce directly to `/hyperflow:scope`. Print:

```
That's clear enough to skip the design phase. Auto-chaining to /hyperflow:scope...
```

Then invoke `Skill` with `skill: scope` immediately. This enforces the "bounces back to scope when clear" aspirational example as a hard rule.

Question budget (when Step 4 runs):

- light depth (ambiguity 0.0–0.5) — **exactly 2 questions**
- standard depth (0.5–0.8) — **3 questions**
- deep depth (0.8–1.0) — **4–5 questions**

Never stack more than 2 questions per `AskUserQuestion` call.

**Multi-option lists (3+ options) MUST mark a recommended choice; binary lists (2 options) MUST NOT** — per DOCTRINE rule 8 binary-gate clause. For multi-option questions, the Analyst's leading hypothesis from Step 3 (or the triage leading hypothesis if Step 3 was skipped) goes first with `(Recommended)`; alternatives follow. The user can pick anything — the marker is guidance, not a default. Per-section approval gates at Step 7 (`Approve / Revise`) are binary — no marker.

Question categories (in order — pick the first N for depth N):

1. **Intent clarification** — confirm the real goal (always ask)
2. **Constraint discovery** — what must / must not happen (always ask)
3. **Assumption challenging** — "you said X, did you mean Y instead?"
4. **Scope boundaries** — what's IN vs OUT
5. **Edge-case stance** — how strict on the unhappy paths

If the request feels "completely clear" — ask anyway. The first two questions exist so the user can spot a misalignment the agent missed.

Example structure (DON'T omit the recommendation marker):

```
?  Where should auth state live?
   Server sessions (Recommended)  — revocable, refreshable, fits this project's DB conventions
   JWT stateless                  — simpler, no DB, harder to revoke
```

### Steps 5+6 — Requirement Synthesis and Approach Proposals (P3 + P2)

**P3 applies:** Step 5 (Synthesis Writer) and Step 6 (Approaches Writer) both depend on Step 4 answers but not on each other. Dispatch both Writers in a single message, then wait for both to return before dispatching the batched Reviewer.

**P2 applies:** After both Writers return, dispatch ONE Opus Reviewer using `reviewer-prompt-batched.md` to review both drafts in a single pass, returning per-draft verdicts.

**If `--thorough` / `depth=max`:** run Step 5 (Writer → Reviewer) sequentially, then Step 6 (Writer → Reviewer) sequentially.

#### Step 5 — Requirement Synthesis

1. Dispatch `Writer — drafting requirement synthesis` (concurrent with Step 6 Writer). The Writer produces a one-paragraph restatement: "So the goal is X, with constraints Y, excluding Z."
2. (Reviewed in the batched pass below.)
3. After the batched Reviewer approves, print the synthesis and ask for explicit confirmation via `AskUserQuestion` before moving on.

#### Step 6 — Propose 2–3 Approaches with Trade-offs (P4-skippable)

**P4 gate:** If `triage.ambiguity < 0.6 AND triage.complexity != high`, skip Step 6 — proceed to Step 7 with a default approach implied by the synthesis. No approach-selection gate fires; the orchestrator annotates the spec with "Approach: derived from synthesis (ambiguity low, single approach)".

**If `--thorough` / `depth=max`:** always run Step 6 regardless of triage scores.

If not skipped:

1. Dispatch `Writer — drafting 2–3 approaches` (concurrent with Step 5 Writer above). The Writer produces, for each approach:
   - **Name** — short label
   - **What** — 1–2 sentence summary
   - **Pros** — what this gets right
   - **Cons** — what it sacrifices
   - **Fit** — how well it matches the stated goal/constraints
2. (Reviewed in the batched pass below.)

**Batched Reviewer (P2):** After both the Step 5 Writer and Step 6 Writer have returned, dispatch one `**Reviewer** (Sonnet · per-batch tier) — batched review: synthesis + approaches` (`reviewer-prompt-batched.md`, `model: "<resolved-worker>"`). Per the DOCTRINE tier split, per-batch reviewers default to Sonnet because the diff is small (one synthesis paragraph + 2–3 approach paragraphs). `--thorough` escalates to Opus. The Reviewer returns:

```
§1 Synthesis:  PASS
§2 Approaches: NEEDS_FIX — [specific feedback]
```

On `NEEDS_FIX` for either draft: re-dispatch only that Writer; single Opus re-review of just that draft. The passing draft is accepted as-is.

After the batched Reviewer approves: present the synthesis and approaches to the user. Recommend one approach, but the choice is the user's. Ask via `AskUserQuestion`.

### Step 7 — Section-by-Section Design (P1 + P2 · file-first · one combined gate)

**File-first artefact rule (DOCTRINE rule 8 file-first clause):** every section Writer writes its draft directly to `.hyperflow/specs/<slug>.draft.md` — never returns the section content for the orchestrator to paste inline. The Reviewer reads sections from the file. The approval gate references the file path, not the content. Inline pasting of section text into chat is a doctrine violation — chat output is ephemeral and unscrollable; a file is reviewable, editable, and persistent across sessions.

**P1 applies:** All 5 design sections share the same upstream input (the chosen approach) and have no inter-dependencies. Dispatch all 5 Writers in ONE parallel message — the same pattern `dispatch` uses for batch workers. Each Writer is instructed to `Write` its section into the file at a stable anchor (`## 1. Architecture`, `## 2. Data flow`, etc.) — the orchestrator pre-seeds the file with the 5 H2 headers before dispatching so Writers can use `Edit` with the heading as a unique anchor and avoid append-order races.

**Mode resolution (one-time per chain).** Before dispatching the 5 Writers, run `python3 $PLUGIN_ROOT/scripts/resolve-mode.py $PROJECT_ROOT --from-args "$CHAIN_ARGS"` and propagate the result via chain args (`mode=<default|lean|thorough>`). When `mode=lean`, Writers receive the lean Project Context block (paths to `.hyperflow/memory/session-context.md` etc., not inlined content) per `worker-prompt.md`'s lean variant. Spec section content, the 2-question floor, section-approval gates, persona stitching, memory injection, reviewer model + template, and security blocklist remain unchanged regardless of mode.

**P2 applies:** After all 5 Writers return, dispatch ONE per-batch Reviewer (`model: "<resolved-worker>"` — Sonnet by default; Opus under `--thorough`) using `reviewer-prompt-batched.md` to read `.hyperflow/specs/<slug>.draft.md` and review all 5 sections in a single pass, returning per-section verdicts:

```
§1 Architecture:   PASS
§2 Data flow:      NEEDS_FIX — [specific feedback]
§3 Key decisions:  PASS
§4 Edge cases:     PASS
§5 File structure: PASS
```

**Cross-section coherence benefit:** the batched Reviewer sees all sections simultaneously and catches conflicts that per-section passes miss (e.g., a contradiction between §1 Architecture and §5 File structure).

**On `NEEDS_FIX`:** re-dispatch only the failed section's Writer with the Reviewer's feedback; that Writer rewrites only its own H2-anchored block in the draft file. Single per-batch tier re-review (Sonnet by default, same tier as the original batched review) of just that section. Do not redraft passing siblings.

**Special case — 4+ sections NEEDS_FIX:** likely the chosen approach itself is wrong. Bounce back to Step 6 and re-pick an approach rather than redrafting 4 sections individually.

**Eligibility guard:** this P1+P2 structure applies because all 5 sections share the same review-level cap. If a future flow assigns different review-level caps per section (e.g., one section requires L5 security review while others are L3), fall back to per-section reviewers for those sections.

**If `--thorough` / `depth=max`:** for each section sequentially — (1) dispatch Writer (still writes to file at the H2 anchor), (2) dispatch Reviewer (reads the file), (3) print one-line `Section <N> ready — review at .hyperflow/specs/<slug>.draft.md` + `AskUserQuestion` approve / revise, before moving to the next section.

**Worker rate-limit handling — inline fallback BANNED:** if a Writer fails (rate limit, timeout, runtime error), the orchestrator MUST retry the Writer (max 2 retries), then if still failing surface `ESCALATE: section-<N> writer failed after 2 retries — chain paused, run /hyperflow:status to inspect`. Drafting the section inline in chat as a "fallback" violates the file-first rule and produces an ungrounded section that downstream Writers/Reviewers will not see in the draft file.

After the batched Reviewer approves (or `NEEDS_FIX` sections are resolved), the orchestrator fires ONE combined `AskUserQuestion`. The gate body is a one-line section roster + the file path — NOT the section content:

```
?  Design draft ready at .hyperflow/specs/<slug>.draft.md
   §1 Architecture · §2 Data flow · §3 Key decisions · §4 Edge cases · §5 File structure
   Review the file, then choose:

   Approve all   — finalize and chain to /hyperflow:scope
   Revise §<N>   — send the named section back to the Writer with your feedback (free-form)
```

Per-section revise is allowed — the user may mark individual sections for revision. Only the revised section's Writer loops back; the rest of the draft file is untouched.

Sections (always in this order):

1. **Architecture** — how components fit together
2. **Data flow** — what goes where
3. **Key decisions** — trade-offs made and why
4. **Edge cases** — what could go wrong
5. **File structure** — what gets created/modified

### Step 8 — Spec Finalize

Agents — `Writer` (Sonnet) ⇒ **Reviewer** (Opus).

Kept sequential — this is the final sanity check before hand-off; no parallelism applies.

The draft already lives at `.hyperflow/specs/<slug>.draft.md` (written progressively in Step 7). This step finalizes it, formatting per [`artefact-format.md`](../hyperflow/artefact-format.md):

```markdown
# <Feature name>

## Status

| Field    | Value                                          |
|----------|------------------------------------------------|
| Status   | approved                                       |
| Sections | 5 / 5 approved                                 |
| Date     | <YYYY-MM-DD>                                   |
| Trigger  | `<slash command or trigger phrase>`            |
| Approach | <one-line approach name from Step 6>           |

## TL;DR

<2–3 sentences in plain English: what the feature does + the single
most important design decision. The user should be able to read this
and decide if the design is on track without scrolling further.>

## Components

- **<name>** — <one-line role>
- **<name>** — <one-line role>
...

## 1. Architecture

<section content — written progressively by Step 7 Writers at this H2 anchor>

## 2. Data flow

<section content>

## 3. Key decisions

<numbered decisions with rationale>

**Trade-offs accepted:**
- <what the design says yes to and why>

**Trade-offs rejected:**
- <what the design said no to and why>

## 4. Edge cases

<numbered cases with Scenario / Behaviour / Fallback>

## 5. File structure

### 5.1 Files created
| Path | Purpose | Created by |
|---|---|---|
| `<path>` | <one-line> | <agent or milestone> |

### 5.2 Files modified
| Path | Purpose | Created by |
|---|---|---|

### 5.3 Runtime artefacts (not committed)
| Path | Purpose | Created by |
|---|---|---|
```

Finalize procedure:

1. Dispatch `Writer — finalizing spec at .hyperflow/specs/<slug>.draft.md` to:
   - Prepend the status block + TL;DR + Components sections (TL;DR derived from the approved synthesis from Step 5; Components derived from Section 1 architecture names).
   - Append `Trade-offs accepted/rejected` blocks at the end of Section 3 if not already there (the Writer extracts them from the Section 3 prose if Section-3 Writer didn't already separate them).
   - Rename: `mv .hyperflow/specs/<slug>.draft.md .hyperflow/specs/<slug>.md` (plain `mv` — `.hyperflow/` is gitignored).
2. Dispatch `**Reviewer** (Opus · final-pass tier) — final spec sanity check` (`model: "<resolved-thinking>"` — always Opus, regardless of `--thorough`) to read the finalized file and verify: status block present and correct, TL;DR is 2–3 sentences in plain English (not a wall of text), every approved section is captured, the H2 ordering is right (1–5), Trade-offs blocks exist, no contradiction exists between sections. Opus tier is mandatory because this is the one Reviewer that sees the full spec and is the buck-stops-here pass before the spec leaves the design phase.

**No inline summary fallback.** Even for "simple" designs, the spec lives in a file. Chat-only summaries were a doctrine violation pattern from earlier versions; removed.

### Step 9 — Hand off to `/hyperflow:scope`

Once the design is approved:

**If `chain-mode=auto`** — immediately invoke `Skill` with `skill: scope` and `args: "chain-mode=auto <spec-ref>"`. Print:

```
Spec complete — design approved
Auto-chaining to /hyperflow:scope…
```

**If `chain-mode=manual`** — ask via `AskUserQuestion`: "Spec done. Continue to /hyperflow:scope?" → yes / no / stop. On yes, invoke `Skill` with `skill: scope` and `args: "chain-mode=manual <spec-ref>"`. Print:

```
Spec complete — design approved
Awaiting your go-ahead for /hyperflow:scope…
```

In both modes, the `scope` skill decomposes the design into worker batches; `dispatch` then picks up the task file (respecting the same chain mode).

## Anti-Patterns

- Writing code during the spec phase
- Asking more than 5 questions total (the Step 0 chain-mode question doesn't count)
- **Asking fewer than 2 questions** — the floor is mandatory even when the request looks unambiguous
- Stacking 3+ questions in one `AskUserQuestion` call
- Skipping the alternatives step (always offer 2–3) unless P4 skip is in effect
- Asking what's discoverable from the codebase
- Adding features the user didn't request (YAGNI ruthlessly)
- Pausing for "should I proceed to plan?" when `chain-mode=auto` — that was already answered at Step 0
- **Sequentializing siblings when they have no inter-dependency** — Steps 1+2, Steps 5+6, and Step 7's 5 sections are independent; dispatching them one-at-a-time when P3/P1 apply is a latency violation
- **Using per-section reviewers when a single batched reviewer covers the same review-level cap** — collapsing N Opus calls into 1 improves cross-section coherence and reduces latency; only fall back to per-section reviewers when siblings have different level caps
- **Wrapping a one-Skill-call hand-off (or any §12.1-trivial step) in an Agent dispatch** — trivial steps (≤ 2 tool calls, no generation, no decisions, mechanically verifiable, orchestrator-natural) run inline; adding an Agent wrapper adds latency with no quality benefit

## Memory Integration

After design approval:
- Persist key decisions to `.hyperflow/memory/decisions.md` with tags
- Pitfalls discovered → `.hyperflow/memory/pitfalls.md`

## Overview

`/hyperflow:spec` is the design phase — thinking, not building. No code lands until the user approves the design section-by-section.

Opus Classifier and Sonnet Searcher run concurrently (P3); no coverage Reviewer — downstream Writers surface gaps via `MISSING CONTEXT`. Opus Analyst produces 6-dimension analysis (P4-skippable at ambiguity < 0.6 AND complexity != high). The orchestrator asks 2–5 `AskUserQuestion` calls (one at a time) to resolve ambiguities.

Writer + Reviewer pairs (in parallel batches where independent — P1+P2+P3) draft and validate each design section. All 5 sections are drafted in parallel, reviewed in one batched Opus pass, and presented to the user in one combined approval gate. On final approval, auto-chains into `/hyperflow:scope` → `/hyperflow:dispatch`.

## Prerequisites

- Project initialized via `/hyperflow:scaffold` (recommended — analyst uses `.hyperflow/profile.md` and friends).
- An idea, feature request, or design question — anything ambiguous enough to need exploration. Clear-cut decompositions should skip straight to `/hyperflow:scope`.
- `AskUserQuestion` available — required for the 2-5 spec questions + per-section approval gates. Headless / non-interactive mode is rejected at Step 0.

## Instructions

The 10 numbered steps live in [Step 0 — Choose chain mode](#step-0--choose-chain-mode-first-tool-call--structural-gate) through [Step 9 — Hand off to /hyperflow:scope](#step-9--hand-off-to-hyperflowscope) above. Summary:

1. Ask `chain-mode` (auto / manual) — structural gate, fires every direct invocation. Record `--thorough` / `depth=max` flag if present.
2. Dispatch Opus Classifier + Sonnet Searcher concurrently (P3); trust Searcher output — no coverage Reviewer (downstream Writers surface gaps via `MISSING CONTEXT`).
3. Opus Analyst produces 6-dimension analysis (intent, fit, scope, constraints, risks, alternatives) — P4-skipped if ambiguity < 0.6 AND complexity != high.
4. If ambiguity < 0.4 AND complexity == low: bounce to scope directly. Otherwise: ask 2-5 `AskUserQuestion` calls, one at a time, with `(Recommended)` markers — floor of 2 always.
5. Dispatch Synthesis Writer + Approaches Writer concurrently (P3); one batched Opus Reviewer covers both (P2); user confirms synthesis and picks approach.
6. Dispatch all 5 section Writers in one parallel message (P1); one batched Opus Reviewer covers all 5 (P2); present all 5 to user in one combined approval gate.
7. Writer composes spec file at `.hyperflow/specs/<slug>.md` (or inline summary for trivial designs); Reviewer final sanity check.
8. Hand off to `/hyperflow:scope` (auto or with confirmation gate per chain mode).

## Output

Two outputs:

1. The approved design — either inline in the conversation (trivial features) or saved to `.hyperflow/specs/<slug>.md` (3+ file features). Format: Architecture, Data flow, Key decisions, Edge cases, File structure — each as its own H2 section.
2. The hand-off line:
   ```
   Spec complete — design approved
   Auto-chaining to /hyperflow:scope...        (chain-mode=auto)
   Awaiting your go-ahead for /hyperflow:scope...   (chain-mode=manual)
   ```

## Error Handling

| Failure | Behavior |
|---|---|
| `AskUserQuestion` unavailable (headless) | Refuse at Step 0; print error and exit. Spec requires interactive design exploration. |
| Triage classifier rejects request (off-topic, abuse) | Stop. Print neutral reason. |
| User picks "revise" on a design section | Loop back to Writer for that section with the user's feedback. Max 3 revise cycles per section before suggesting a different approach. |
| Searcher returns no relevant context | A downstream Writer flags `MISSING CONTEXT: <subsystem>`; orchestrator redispatches Searcher with the gap. After 2 retries, surface to user: design proceeds with caveat about thin context. |
| User picks none of the 2-3 proposed approaches | Writer drafts a 4th approach incorporating user's stated objection. |
| User answers an `AskUserQuestion` with "Other" + free-form text | Treat as a new constraint; integrate into the next section's draft. |
| Batched Reviewer returns NEEDS_FIX on 4+ of 5 sections | Likely the chosen approach is wrong. Bounce back to Step 6 and re-pick an approach rather than redrafting 4 sections. |
| Concurrent dispatch rate-limited (too many parallel Agent calls) | Cap parallel section drafts at 5 (already the natural limit); cap concurrent pre-conditions at 2. If the platform rate-limits further, degrade gracefully to sequential — quality unchanged, latency reverts to current. |

## Examples

Worked transcripts moved to [examples.md](references/examples.md) so the SKILL body stays lean. The examples are illustrative — not load-bearing for behaviour. Read the companion file when you want to see end-to-end transcripts.

## Resources

- [brainstorming-advanced.md](references/brainstorming-advanced.md) — deeper question framework.
- [memory-system.md](references/memory-system.md) — persistence format for decisions / pitfalls.
- [DOCTRINE.md](references/DOCTRINE.md) — shared rules (especially #8 structural gates).
- [output-style.md](references/output-style.md) — elegant label format.
- [task-triage.md](references/task-triage.md) — Classifier output schema.
- [flow-profiles.md](references/flow-profiles.md) — fast/standard/deep/research/creative/scientific profiles.
- [latency-patterns.md](references/latency-patterns.md) — P1–P5 latency-reduction patterns reference.
- [worker-prompt-lean.md](../hyperflow/worker-prompt-lean.md) — P5 lean worker template.
- [reviewer-prompt-batched.md](../hyperflow/reviewer-prompt-batched.md) — P2 batched reviewer template.
