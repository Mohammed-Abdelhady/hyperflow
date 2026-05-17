---
name: scope
description: |
  Use when the user has a clear-enough task and wants it decomposed into batched worker sub-tasks before any code is written. Writes a task file under .hyperflow/tasks/ and auto-chains into /hyperflow:dispatch.
  Trigger with /hyperflow:scope, "plan this", "decompose this task", "break this down", "write the task file".
allowed-tools: Read, Write, Edit, Bash(git:*), Glob, Grep
argument-hint: "<task description> [chain-mode=auto|manual]"
version: 3.1.2
license: MIT
compatibility: Designed for Claude Code
tags: [planning, decomposition, task-graph, multi-agent]
---

# Scope

Decompose, don't build. Read-only with respect to source code. The only writes are to `.hyperflow/tasks/`, `.hyperflow/memory/`, and `.hyperflow/specs/`. When the task file is ready, hand off to `dispatch` (auto or with a gate, depending on chain mode).

This skill exercises **Layer 0 (Project Analysis)** for context, **Layer 6 (Project Memory)** for past-learning surfacing, and **Layer 7 (Task Templates)** for decomposition patterns. It also inherits the triage classification from `/hyperflow:spec` to size each batch correctly.

## Per-Step Agent Map (DOCTRINE rule 12)

Every substantive step dispatches at least one Agent per DOCTRINE rule 12. Trivial steps per §12.1 may be performed inline by the orchestrator.

| Step | Worker tier | Thinking tier | Notes |
|---|---|---|---|
| 0 — Chain mode | — | — | `AskUserQuestion` only (exempt) |
| 1 — Understand | — | — | `AskUserQuestion` if ambiguous (exempt) |
| 2 — Research | Searcher × 2 (Sonnet) **parallel** (P1) | **Reviewer** (Sonnet · per-batch tier) verifies coverage | Both tiers; P1 applied; Sonnet because coverage check is anchored to the Searcher outputs |
| 3 — Decompose | — | **Planner** (Opus · pure thinking) produces the batch graph | Opus — decomposition is the orchestration brain |
| 4 — Write task file | Writer (Sonnet) emits the markdown (P1 internal parallelism) | **Reviewer** (Sonnet · per-batch tier) verifies the plan vs the design | Both tiers; P1 applied; Sonnet because the check is plan-vs-spec, not architectural |
| 4+6 — parallel | Writer (Step 4) ∥ Writer (Step 6) fire after Step 3 (P3) | — | Concurrent dispatch; both wait on Planner output |
| 5 — Output | — | — | Print only (exempt) |
| 6 — Memory | Writer (Sonnet) appends to memory files (fires in parallel with Step 4 — P3) | **Reviewer** (Sonnet · per-batch tier) checks for duplicates / contradictions | Both tiers; P3 applied; Sonnet because dedup check is line-level pattern matching |
| 7 — Hand off | — | — | `Skill` tool invocation — trivial inline per §12.1 (one tool call, no generation, no review) |

**Latency flags:** `--thorough` disables P1 **in Step 4 only** (sequential Writer-internal section drafts instead of parallel). The Step 2 Searchers (also marked P1) are NOT affected — they stay parallel under all flag configurations because they are independent reads with no quality tradeoff. P3 (Steps 4 + 6 concurrent) is always on. See [`../spec/references/latency-patterns.md`](../spec/references/latency-patterns.md) for pattern definitions.

## Approval Gates

| Gate | When | Format |
|---|---|---|
| Chain mode | Step 0, only if invoked directly | `AskUserQuestion` — auto / manual |
| Decomposition sanity | Step 4, after writing the task file | Print the batch summary; user reads it |
| Phase advance (if `manual` mode) | Step 7, before invoking `dispatch` | `AskUserQuestion` — continue / stop |

## Flow

### Step 0 — Choose chain mode (FIRST tool call · STRUCTURAL GATE)

This is a **structural gate** per DOCTRINE rule 8. It MUST fire every time the skill is invoked directly. "No clarifying questions" / "auto-pilot" / "always-on" / any other autonomy directive does NOT skip it. Defaulting to `auto` without asking is a doctrine violation.

**Latency arg:** `--thorough` (or `depth=max`) disables P1 **in Step 4 only** (sequential Writer-internal section drafts instead of parallel). The Step 2 parallel Searchers are NOT affected — they stay parallel under all flag configurations because they are independent reads with no quality tradeoff. P3 (Step 4 + Step 6 concurrent dispatch) stays on always. If the user passes `--thorough`, note it and apply to Step 4 dispatch only.

If invoked with a `chain-mode=<auto|manual>` arg (from `/hyperflow:spec` or a prior skill), skip this step — the previous chain-starter already asked.

Otherwise, **before research**, ask via `AskUserQuestion`. Per DOCTRINE rule 8, the recommended option goes first with `(Recommended)`:

```
How should I advance through the chain after this phase?

  Auto (Recommended)  — chain forward through scope → dispatch with no gate.
                        Fewer interruptions, faster end-to-end.

  Manual              — pause between phases and ask before advancing.
                        More control, more confirmations.
```

Wait for the user's answer. Do not proceed without it. Save the chosen mode and propagate via `args: "chain-mode=<mode>"` when invoking dispatch.

If the agent cannot present `AskUserQuestion` (e.g., headless mode), it should print an error and stop — never silently default.

### Step 1 — Route

Pure routing decision — no clarification questions here. Clarification fires at Step 2.5, AFTER research has analyzed the requirement against the codebase.

- Pure design question (the user is asking *should we?* not *how do we?*) → suggest `/hyperflow:spec` instead and stop
- Anything else → proceed to Step 2 (research first, then ask only about what research couldn't resolve)

### Step 2 — Research (parallel · P1)

Agents — `Searcher` × 2 (Sonnet) ⇒ **Reviewer** (Opus).

1. Dispatch in a **single message** (parallel — P1 applied: both Searchers are independent siblings sharing the same upstream task description):
   - `Searcher — mapping affected files and existing patterns`
   - `Searcher — finding related tests and conventions`
2. Read `.hyperflow/profile.md`, `architecture.md`, `conventions.md`, and `.hyperflow/memory/index.md` to surface relevant past learnings.
3. Dispatch `**Reviewer** — verifying research coverage` to confirm both Searchers hit the relevant subsystems. If gaps remain, redispatch a Searcher targeting the gap before moving on.

**P1 rationale:** the two Searchers do not depend on each other's output. Firing both in one message cuts the research phase wall-clock in half. See [`../spec/references/latency-patterns.md`](../spec/references/latency-patterns.md) §P1.

Note: `--thorough` does NOT affect Step 2. The two parallel Searchers stay on under all flag configurations because they are independent reads with no quality tradeoff. `--thorough` only disables P1 internal parallelism in Step 4 (Writer-internal section parallelism).

### Step 2.5 — Clarify (post-analysis · max 3)

Only the ambiguities that Step 2 research did NOT resolve become questions. Per DOCTRINE rule 8 (post-analysis clarification clause), clarification stages fire AFTER the orchestrator has read the relevant code and analyzed the requirement — never before.

- If research fully grounded every assumption → skip this step entirely. No question for question's sake.
- If ≥1 ambiguity remains (target file unclear, two equally plausible interfaces, a config the codebase doesn't reveal a precedent for) → fire `AskUserQuestion`, max 3 questions, each tied to a specific finding the Searchers surfaced.
- Frame every question by citing what research found: *"Searcher mapped both `src/auth/middleware.ts` and `src/api/auth/route.ts` — which is the intended target for the new guard?"* — never *"where should the new guard go?"* in the abstract.

The 2-question floor from `/hyperflow:spec` does NOT apply to scope. Scope asks zero questions when research is conclusive; it asks 1-3 when genuine post-analysis ambiguity remains.

### Step 2.6 — Operational Choices (auto-mode only · STRUCTURAL GATE · fires once per chain)

This is the **last** time the orchestrator interrupts the user before dispatch runs end-to-end. In `chain-mode=auto`, every operational preference is collected here in a single batched `AskUserQuestion` block so dispatch can run silently from Step 3 onwards until the end-of-chain audit/deploy gates. Per DOCTRINE rule 8, this is a structural gate — it always fires when `chain-mode=auto`; it is exempt in `chain-mode=manual` because manual users already get to interject between every phase and batch.

Skip this step when:
- `chain-mode=manual` — manual users review every phase, so operational choices can be deferred to the existing gates
- Operational args were already propagated from a prior chain-starter (`commit=…`, `branch=…`, `push=…`) — re-asking is an invented-gate violation

Fire ONE `AskUserQuestion` call containing all three questions (the tool supports up to 4 questions per call). Order them as below, each with a `(Recommended)` first option:

```
Commit cadence?
  Per-task (Recommended)   — one commit per sub-task; cleanest bisectable history
  Per-batch                — one commit per batch; tidier branch graph, less granular
  Per-task (deferred)      — queue per-task commits on hyperflow/staging-<id> during chain;
                             flush all onto user's branch at end (faster mid-chain; useful
                             for runs with many sub-tasks where you don't want N hooks firing)
  Single                   — one commit at end of chain; smallest log footprint
  None                     — leave dirty working tree; you'll commit manually

Branch behaviour?
  Create feat/<slug> (Recommended on main/master) — new feature branch
  Stay on <current>                                — direct commits on the current branch

Push at end?
  Ask at deploy gate (Recommended) — standard push confirmation after release.sh
  Auto-push                        — push branch + tag without asking at end
  Never                            — always hold local; user pushes manually
```

Recommended defaults adapt:
- Commit: `Per-task` unless triage shows `complexity=low AND sub-tasks<=2` (then `Single` is recommended)
- Branch: `Create` if currently on `main` or `master`; `Stay` otherwise (already on a feature branch)
- Push: `Ask at deploy gate` always — bumping to auto-push without explicit user consent violates rule 8

Save the chosen values and propagate via chain args: `commit=<per-task|per-batch|per-task-deferred|single|none> branch=<new|current> push=<ask|auto|never>`. Dispatch (Step 2) reads commit + branch; deploy (Step 6) reads push.

When the user picks **Per-task (deferred)**, dispatch routes through `scripts/queue-commit.sh` after each sub-task PASS instead of `git commit` directly. Commits land on a private `hyperflow/staging-<chain-id>` branch with original messages + per-task file scope. At Step 4 wrap-up, dispatch runs `scripts/flush-commits.sh` which fast-forward-merges the staging branch onto the user's working branch — every queued commit lands in order with original SHAs preserved. Same N commits as Per-task immediate, just produced atomically at the end. See [`skills/flush/SKILL.md`](../flush/SKILL.md) for crash-recovery (`/hyperflow:flush` if dispatch was interrupted).

If the user is invoking scope directly without going through spec (no prior `chain-mode=auto` propagation), Step 0 fires the chain-mode question and this step (Step 2.6) fires only if they pick auto.

### Step 3 — Decompose

Agents — **Planner** (Opus, thinking-tier).

Dispatch `**Planner** — producing batch graph` with the research findings, triage classification, and applicable templates from [task-templates.md](references/task-templates.md) (CRUD Feature, API Endpoint, UI Component, Database Migration, Refactor, Bug Fix — else bespoke).

The Planner produces, for each sub-task:
- Worker role — Implementer / Searcher / Writer
- Files to read / modify / create
- Dependencies — parallel vs sequential
- Complexity estimate (drives review level cap downstream)

### Step 4 — Write Task File (P1 internal parallelism · P3 concurrent with Step 6)

Agents — `Writer` (Sonnet) ⇒ **Reviewer** (Opus).

**P3 — concurrent dispatch:** Step 4 (task file Writer) and Step 6 (memory Writer) are independent after the Planner completes. Dispatch both Writers in the same message immediately after Step 3 returns. Wait for both before advancing to Step 5. This collapses one sequential round-trip from the flow.

**P1 — internal parallelism:** when the Planner produces a task file with multiple logically independent sections (Goal, Context, Affected files, Batches, Verification plan), instruct the Writer to draft those sections in parallel internally by structuring its prompt as parallel sub-tasks. The Writer is one agent, but prompt-level parallelism reduces sequential reasoning passes over independent content. Disable with `--thorough` (Writer drafts sections in one sequential pass instead).

**Mode resolution (one-time per chain).** Before dispatching, run `python3 $PLUGIN_ROOT/scripts/resolve-mode.py $PROJECT_ROOT --from-args "$CHAIN_ARGS"` and propagate the result via chain args (`mode=<default|lean|thorough>`) to downstream skills. When `mode=lean`, the Writer renders the **artefact-format minimum template** for small tasks (`triage.complexity == low` AND projected sub-tasks ≤ 5) — status table + Goal + per-task lines + cost table only; no scope-at-a-glance, no ASCII dependency diagram. The full rich template auto-restores when the task graduates past 5 sub-tasks or any sub-task has `complexity != low`. Persona stitching, memory injection, reviewer model + template, clarification gates, and security blocklist remain unchanged regardless of mode.

1. Dispatch `Writer — emitting task file` with the Planner's output (in parallel with Step 6 Writer — P3). The Writer writes to `.hyperflow/tasks/<task-slug>.md` using the template below.
2. Dispatch `**Reviewer** — verifying task file vs design` to confirm every design requirement maps to at least one sub-task and no orphan sub-tasks exist.

Task-file template — follows [`artefact-format.md`](../hyperflow/artefact-format.md). The Writer applies the full template by default; reduces to the `fast` variant only when triage classifies `complexity=low AND sub-tasks<=2`.

```markdown
# <Name>

## Status

| Field      | Value                                                 |
|------------|-------------------------------------------------------|
| Status     | pending                                               |
| Progress   | `░░░░░░░░░░░░░░░░░░░░`  0 / <total> sub-tasks (0%)    |
| Branch     | `<feat/slug or current branch>`                       |
| Commits    | 0 since main · per-task cadence                       |
| Wall-clock | not started                                           |
| Tokens     | thinking 0k · worker 0k · total 0k                    |

## Goal

<one-line plain-English statement of what shipping this changes>

## Why

<one paragraph: what the user / system sees after this lands; the
single most important constraint the design honors>

## Scope at a glance

| Surface       | Files | Created | Modified | Risk   |
|---------------|------:|--------:|---------:|--------|
| <surface>     |     N |       N |        N | low    |
| **Total**     |  **N**|    **N**|     **N**|        |

## Affected files

**Created (N)**
- `<path>` — <one-line purpose>

**Modified (N)**
- `<path>` — <one-line change>

**Skipped (confirmed N)** *(omit section if N=0)*
- `<path>` — <reason it's not touched>

## Execution plan

```
Batch 1 — <theme>                       (<N> parallel)
  T1 · T2 · T3 · T4
       ↓
Batch 2 — <theme>                       (<N> parallel · depends on Batch 1)
  T5 · T6 · T7
       ↓
Batch 3 — <theme>                       (<N> sequential)
  T8
       ↓
Batch N — Final integration review      (1 sequential)
  T<N>
```

## Batches

### Batch 1 — <theme> (<parallel|sequential>)

- [ ] T1 — <Role> · <one-line task>
       Read: `<file>` · Modify: `<file>` · Complexity: <low|medium|high>
- [ ] T2 — <Role> · <one-line task>
       Create: `<file>` · Complexity: <low|medium|high>

### Batch 2 — <theme> (depends on Batch 1)
...

## Open questions

None. *(or numbered list if any remain)*

## Verification plan

1. <concrete test or smoke step>
2. <concrete test or smoke step>

## Estimated cost

| Tier      | Agents | Tokens   |
|-----------|-------:|---------:|
| Thinking  |      N |     ~Nk  |
| Worker    |      N |     ~Nk  |
| **Total** |  **N** | **~Nk**  |
```

The Status block is updated by dispatch after every sub-task PASS — see dispatch/SKILL.md Step 2. Progress bar uses 20 cells: `█` for completed, `░` for pending; percentage rounded to whole number. Wall-clock starts on first worker dispatch; ETA computes once ≥ 3 sub-tasks are done (linear extrapolation from completed mean).

### Step 5 — Output

Print the task file path and batch summary table:

```
Plan ready — .hyperflow/tasks/<slug>.md (3 batches, 7 sub-tasks)
```

### Step 6 — Memory (P3 concurrent with Step 4)

Agents — `Writer` (Sonnet) ⇒ **Reviewer** (Opus).

**P3 — concurrent dispatch:** this step fires in parallel with Step 4 (see Step 4 above). Both Writers receive the Planner's output and are independent — the memory Writer does not need the task file to be written, and the task file Writer does not need memory to be updated. Both must complete before Step 5 output.

1. Dispatch `Writer — appending decisions to .hyperflow/memory/decisions.md` (in parallel with Step 4 Writer — P3). Skip trivial ones. For complex features (3+ files, multiple subsystems) the Writer also produces `.hyperflow/specs/<feature-slug>.md` referenced from the task file.
2. Dispatch `**Reviewer** — checking memory entries` to catch duplicates or contradictions with existing entries before they land in `.hyperflow/memory/`.

**P3 rationale:** the task file and memory entries both derive from the Planner's batch graph but do not depend on each other. Running them concurrently cuts one sequential Writer round-trip from the flow. See [`../spec/references/latency-patterns.md`](../spec/references/latency-patterns.md) §P3.

See [task-tracking.md](references/task-tracking.md) and [worker-prompt.md](references/worker-prompt.md).

### Step 7 — Hand off to `/hyperflow:dispatch`

This step is trivial-inline per §12.1: one Skill tool invocation, no generation, no review needed. The orchestrator invokes the dispatch skill directly without an Agent dispatch wrapper.

**If `chain-mode=auto`** — immediately invoke `Skill` with `skill: dispatch` and `args: "chain-mode=auto <task-slug>"`. Print:

```
Auto-chaining to /hyperflow:dispatch…
```

**If `chain-mode=manual`** — ask via `AskUserQuestion`: "Plan done. Continue to /hyperflow:dispatch?" → yes / no / stop. On yes, invoke `Skill` with `skill: dispatch` and `args: "chain-mode=manual <task-slug>"`.

## Anti-patterns

- Writing implementation code
- Modifying source files outside `.hyperflow/` and `.hyperflow/specs/`
- Skipping the research step
- Single-batch plans for multi-file work
- Omitting the verification plan
- Pausing for "should I execute?" when `chain-mode=auto` — that was already answered at Step 0
- Asking the chain-mode question again when a `chain-mode=<…>` arg was passed in

## Overview

`/hyperflow:scope` decomposes a clear-enough task into a batched worker plan and writes it to `.hyperflow/tasks/<slug>.md`. Parallel Sonnet searchers map the affected surface, an Opus Planner produces the batch graph, and a Sonnet Writer emits the task file. Read-only with respect to source code — only `.hyperflow/tasks/`, `.hyperflow/memory/`, and `.hyperflow/specs/` are written. On completion, auto-chains into `/hyperflow:dispatch` (or asks first if `chain-mode=manual`).

## Prerequisites

- A clear-enough description of what to build. If ambiguous, scope will redirect to `/hyperflow:spec` and stop.
- `.hyperflow/` cache (recommended — improves planning context). Run `/hyperflow:scaffold` first if missing.
- Optional: prior `/hyperflow:spec` output passed via `chain-mode` arg propagates triage classification and recommended flow profile.

## Instructions

The numbered steps live in [Step 0 — Choose chain mode](#step-0--choose-chain-mode-first-tool-call--structural-gate) through [Step 7 — Hand off to /hyperflow:dispatch](#step-7--hand-off-to-hyperflowdispatch) above. Summary:

1. Ask `chain-mode` (auto / manual) if not propagated from a prior chain-starter.
2. Confirm the task is buildable, not a design question (else hand off to `/hyperflow:spec`).
3. Parallel Sonnet searchers map affected files + tests + conventions.
4. Opus Planner produces batch graph (parallel vs sequential dependencies, role assignment, complexity estimate).
5. Sonnet Writer emits `.hyperflow/tasks/<slug>.md`; Opus Reviewer verifies plan vs design.
6. Append decisions to `.hyperflow/memory/decisions.md`.
7. Hand off to `/hyperflow:dispatch` (auto or via confirmation gate).

## Output

Single output line plus the task file path:

```
Plan ready — .hyperflow/tasks/<slug>.md (N batches, M sub-tasks)
Auto-chaining to /hyperflow:dispatch...
```

The written task file follows the template in [Step 4](#step-4--write-task-file) — Goal, Context, Affected files, Batches (with `[ ]` checkboxes), Open questions, Verification plan, Estimated cost, Status block.

## Error Handling

| Failure | Behavior |
|---|---|
| Ambiguous request (would need design exploration) | Stop and suggest `/hyperflow:spec`. Print: `This needs design exploration first. Try /hyperflow:spec` and exit. |
| Searcher returns empty (no affected files found) | Reviewer flags missing scope; redispatch with broader query. Max 2 retries. |
| Planner produces single-batch plan for multi-file work | Reviewer rejects; redispatch Planner with feedback to split into parallel + sequential batches. |
| Task file write fails (path locked, disk full) | Abort with explicit error; do not auto-chain. User retries after fix. |
| `chain-mode` arg malformed | Refuse and re-ask via `AskUserQuestion`. Never silently default. |
| `AskUserQuestion` unavailable (headless) | Print error stating chain-mode gate cannot fire; exit. |

## Examples

### Direct invocation (asks chain-mode first)

```
/hyperflow:scope add a rate-limit middleware: token bucket, per-IP, env-configurable

?  How should I advance through the chain after this phase?
   Auto (Recommended)  — chain forward through scope → dispatch with no gate.
   Manual              — pause between phases and ask before advancing.

[user picks Auto]

Searcher — mapping affected files and existing patterns
Searcher — finding related tests and conventions
**Reviewer** — verifying research coverage
**Planner** — producing batch graph
Writer — emitting task file
**Reviewer** — verifying task file vs design
Writer — appending decisions to .hyperflow/memory/decisions.md
**Reviewer** — checking memory entries

Plan ready — .hyperflow/tasks/rate-limit-middleware.md (3 batches, 7 sub-tasks)
Auto-chaining to /hyperflow:dispatch...
```

### Propagated from spec (no chain-mode prompt)

```
[Invoked from /hyperflow:spec with args: chain-mode=auto triage=<base64>]

Searcher — mapping affected files
...
Plan ready — .hyperflow/tasks/<slug>.md (2 batches, 4 sub-tasks)
Auto-chaining to /hyperflow:dispatch...
```

### Bounce back to spec on ambiguity

```
/hyperflow:scope should we switch to event sourcing?

This needs design exploration first. Try /hyperflow:spec — it'll ask the
right questions before any decomposition happens.
```

## Resources

- [DOCTRINE.md](references/DOCTRINE.md) — orchestration rules (Layer 7 task templates, rule 8 structural gates).
- [task-templates.md](references/task-templates.md) — CRUD, API, UI, migration, refactor, bug-fix templates.
- [task-tracking.md](references/task-tracking.md) — task file format and lifecycle.
- [worker-prompt.md](references/worker-prompt.md) — what dispatch will inject into each Sonnet worker.
- [output-style.md](references/output-style.md) — agent label format.
- [../spec/references/latency-patterns.md](../spec/references/latency-patterns.md) — P1–P5 latency pattern definitions, wall-clock impact table, and `--thorough` disable rules.
