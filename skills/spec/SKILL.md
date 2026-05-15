---
name: spec
description: Use when the user is exploring a design idea, weighing approaches, has an ambiguous request, or says "should I", "how should we", "what's the best way to". Asks structured questions, proposes 2–3 approaches, walks the design section-by-section. On approval, **auto-chains into `/hyperflow:scope`** — no manual gate.
---

# Spec

This phase is **thinking, not building**. No code until the user approves the design. On approval, the chain advances to `scope` → `dispatch`. The user picks the advancement mode at Step 0.

This skill drives **Layer 0.5 (Task Triage)** and **Layer 4 (Brainstorming/Spec)** from the doctrine. Multi-level review (L1–L5) runs later during `/hyperflow:dispatch` per the triage's chosen flow profile.

## Per-Step Agent Map (DOCTRINE rule 12)

Every substantive step dispatches at least one Agent. The orchestrator never does "real" work inline — it only coordinates dispatches and prints status.

| Step | Worker tier | Thinking tier | Notes |
|---|---|---|---|
| 0 — Chain mode | — | — | `AskUserQuestion` only (exempt) |
| 1 — Triage | — | **Classifier** (Opus) | Pure thinking work |
| 2 — Context | Searcher (Sonnet) | **Reviewer** (Opus) verifies coverage | Both tiers per step |
| 3 — Multi-dim analysis | — | **Analyst** (Opus) produces 6-dim brief | Pure thinking |
| 4 — Smart questions | — | — | `AskUserQuestion` only (exempt) |
| 5 — Requirement synthesis | Writer (Sonnet) drafts | **Reviewer** (Opus) verifies fidelity | Both tiers |
| 6 — Propose approaches | Writer (Sonnet) drafts 2–3 | **Reviewer** (Opus) probes for missing alternatives | Both tiers |
| 7 — Design sections | Writer (Sonnet) drafts each section | **Reviewer** (Opus) checks each section before user sees it | Both tiers · per section |
| 8 — Spec output | Writer (Sonnet) writes file | **Reviewer** (Opus) final spec sanity check | Both tiers |
| 9 — Hand off | — | — | `Skill` tool invocation (exempt) |

Substantive steps = 1, 2, 3, 5, 6, 7, 8. Each appears in the usage summary.

## Approval Gates

| Gate | When | Format |
|---|---|---|
| Chain mode | Step 0, once per chain | `AskUserQuestion` — auto / manual |
| Design section approval | Step 7, after each of 5 design sections | `AskUserQuestion` — approve / revise |
| Phase advance (if `manual` mode) | Step 9, before invoking `scope` | `AskUserQuestion` — continue / stop |

## Flow

### Step 0 — Choose chain mode (FIRST tool call)

If invoked with a `chain-mode=<auto|manual>` arg (from a prior skill in the chain), skip this step.

Otherwise, **before any research or analysis**, ask via `AskUserQuestion` with a short explanation:

```
How should I advance through the chain after each phase?

  Auto     — chain forward through spec → scope → dispatch with no gates.
             Fewer interruptions, faster end-to-end.

  Manual   — pause between phases and ask before advancing.
             More control, more confirmations.
```

Save the chosen mode (`auto` or `manual`) and propagate it via `args: "chain-mode=<mode>"` whenever this skill invokes the next phase. Default to `auto` if the user gives no clear answer.

### Step 1 — Triage (Layer 0.5)

Agents — **Classifier** (Opus, thinking-tier).

Dispatch a thinking-tier triage call per [task-triage.md](../hyperflow/task-triage.md). The Classifier produces `{ types[], complexity, risk, scope, ambiguity, flow, personas[] }` JSON. The classification drives:

- **Spec depth** at Step 4 — `ambiguity 0.0–0.2` → silent, `0.2–0.5` → light (1–2 questions), `0.5–0.8` → standard (3 questions), `0.8–1.0` → deep (4–5 questions)
- **Flow profile** for the downstream `dispatch` phase — `fast`, `standard`, `deep`, `research`, `creative`, or `scientific` (see [flow-profiles.md](../hyperflow/flow-profiles.md))
- **Persona stitching** for worker prompts later (see [personas-A.md](../hyperflow/personas-A.md), [personas-B.md](../hyperflow/personas-B.md))

Persist the triage output and propagate it forward through `chain-mode=<mode> triage=<base64-json>` args. Print:

```
**Classifier** — triaging request
Triage — types: [<types>] · flow: <profile> · ambiguity: <score>
```

### Step 2 — Context Exploration

Agents — `Searcher` (Sonnet) ⇒ **Reviewer** (Opus).

1. Dispatch `Searcher — mapping context relevant to <idea>` (worker). Find existing code, patterns, similar features. Do not ask the user what you can find in the code.
2. Dispatch `**Reviewer** — verifying context coverage` (thinking-tier). Confirm the Searcher hit the relevant subsystems; if gaps remain, redispatch the Searcher with the missing scope before moving on.

### Step 3 — Multi-Dimensional Analysis

Agents — **Analyst** (Opus, thinking-tier).

Dispatch `**Analyst** — 6-dimension exploration` with the request + context from Step 2. The Analyst produces a brief covering:

1. **User intent** — what is the real underlying need?
2. **Technical fit** — how does this fit existing architecture?
3. **Scope** — minimum viable vs maximum scope
4. **Constraints** — time, deps, perf, compatibility
5. **Risks** — what could go wrong, what's irreversible
6. **Alternatives** — at least 3 ways to solve this

The Analyst flags which dimensions have unknowns the user must resolve. Those unknowns become the Step 4 question set.

### Step 4 — Smart Questions (`AskUserQuestion` — MANDATORY)

Use the `AskUserQuestion` tool. Never plain text questions. Ask only about unknowns from step 3.

**Question budget scales with triage depth** — see Step 1: silent (0), light (1–2), standard (3), deep (4–5). Never stack more than 2 questions per `AskUserQuestion` call.

Question categories (in order):
1. **Intent clarification** — confirm the real goal
2. **Constraint discovery** — what must / must not happen
3. **Assumption challenging** — "you said X, did you mean Y instead?"
4. **Scope boundaries** — what's IN vs OUT

### Step 5 — Requirement Synthesis

Agents — `Writer` (Sonnet) ⇒ **Reviewer** (Opus).

1. Dispatch `Writer — drafting requirement synthesis` with the user's answers from Step 4. The Writer produces a one-paragraph restatement: "So the goal is X, with constraints Y, excluding Z."
2. Dispatch `**Reviewer** — verifying requirement fidelity` to confirm the synthesis matches what the user actually said (catches paraphrase drift).
3. Print the synthesis to the user and ask for explicit confirmation via `AskUserQuestion` before moving on.

### Step 6 — Propose 2–3 Approaches with Trade-offs

Agents — `Writer` (Sonnet) ⇒ **Reviewer** (Opus).

1. Dispatch `Writer — drafting 2–3 approaches` with the synthesized requirements. The Writer produces, for each approach:
   - **Name** — short label
   - **What** — 1–2 sentence summary
   - **Pros** — what this gets right
   - **Cons** — what it sacrifices
   - **Fit** — how well it matches the stated goal/constraints
2. Dispatch `**Reviewer** — probing for missing alternatives` to challenge whether the proposed set covers the design space (catches anchor bias). If gaps surface, redispatch the Writer with the gap.
3. Recommend one, but the choice is the user's. Ask via `AskUserQuestion`.

### Step 7 — Section-by-Section Design (approval-gated · per-section multi-level)

Agents per section — `Writer` (Sonnet) ⇒ **Reviewer** (Opus) ⇒ user approval.

For each of the 5 sections below:

1. Dispatch `Writer — drafting section: <name>` with the chosen approach + prior approved sections.
2. Dispatch `**Reviewer** — reviewing section: <name>` (Opus thinking-tier) to validate coherence, surface unstated assumptions, and check against the multi-dim analysis from Step 3.
3. Present the reviewed draft to the user; ask via `AskUserQuestion`: approve / revise.
4. If revise → redispatch the Writer with the user's feedback. Loop until approved.

Sections (always in this order):

1. **Architecture** — how components fit together
2. **Data flow** — what goes where
3. **Key decisions** — trade-offs made and why
4. **Edge cases** — what could go wrong
5. **File structure** — what gets created/modified

### Step 8 — Spec Output

Agents — `Writer` (Sonnet) ⇒ **Reviewer** (Opus).

1. Dispatch `Writer — writing spec to docs/specs/<slug>.md` for non-trivial features (3+ files / multiple subsystems). For simpler designs, the Writer composes an inline summary instead.
2. Dispatch `**Reviewer** — final spec sanity check` to verify every approved section is captured and no contradiction exists between sections.

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
- Stacking 3+ questions in one `AskUserQuestion` call
- Skipping the alternatives step (always offer 2–3)
- Asking what's discoverable from the codebase
- Adding features the user didn't request (YAGNI ruthlessly)
- Pausing for "should I proceed to plan?" when `chain-mode=auto` — that was already answered at Step 0

## Memory Integration

After design approval:
- Persist key decisions to `.hyperflow/memory/decisions.md` with tags
- Pitfalls discovered → `.hyperflow/memory/pitfalls.md`

## References

- [brainstorming-advanced.md](../hyperflow/brainstorming-advanced.md) — deeper question framework
- [memory-system.md](../hyperflow/memory-system.md) — persistence format
- [DOCTRINE.md](../hyperflow/DOCTRINE.md) — shared rules
- [output-style.md](../hyperflow/output-style.md) — elegant label format
