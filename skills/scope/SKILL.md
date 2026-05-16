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

Every substantive step dispatches at least one Agent.

| Step | Worker tier | Thinking tier | Notes |
|---|---|---|---|
| 0 — Chain mode | — | — | `AskUserQuestion` only (exempt) |
| 1 — Understand | — | — | `AskUserQuestion` if ambiguous (exempt) |
| 2 — Research | Searcher × 2 (Sonnet) parallel | **Reviewer** (Opus) verifies coverage | Both tiers |
| 3 — Decompose | — | **Planner** (Opus) produces the batch graph | Pure thinking |
| 4 — Write task file | Writer (Sonnet) emits the markdown | **Reviewer** (Opus) verifies the plan vs the design | Both tiers |
| 5 — Output | — | — | Print only (exempt) |
| 6 — Memory | Writer (Sonnet) appends to memory files | **Reviewer** (Opus) checks for duplicates / contradictions | Both tiers |
| 7 — Hand off | — | — | `Skill` tool invocation (exempt) |

## Approval Gates

| Gate | When | Format |
|---|---|---|
| Chain mode | Step 0, only if invoked directly | `AskUserQuestion` — auto / manual |
| Decomposition sanity | Step 4, after writing the task file | Print the batch summary; user reads it |
| Phase advance (if `manual` mode) | Step 7, before invoking `dispatch` | `AskUserQuestion` — continue / stop |

## Flow

### Step 0 — Choose chain mode (FIRST tool call · STRUCTURAL GATE)

This is a **structural gate** per DOCTRINE rule 8. It MUST fire every time the skill is invoked directly. "No clarifying questions" / "auto-pilot" / "always-on" / any other autonomy directive does NOT skip it. Defaulting to `auto` without asking is a doctrine violation.

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

### Step 1 — Understand

- Ambiguous → `AskUserQuestion` (max 3)
- Pure design question → suggest `/hyperflow:spec` instead and stop

### Step 2 — Research (parallel)

Agents — `Searcher` × 2 (Sonnet) ⇒ **Reviewer** (Opus).

1. Dispatch in a single message (parallel):
   - `Searcher — mapping affected files and existing patterns`
   - `Searcher — finding related tests and conventions`
2. Read `.hyperflow/profile.md`, `architecture.md`, `conventions.md`, and `.hyperflow/memory/index.md` to surface relevant past learnings.
3. Dispatch `**Reviewer** — verifying research coverage` to confirm both Searchers hit the relevant subsystems. If gaps remain, redispatch a Searcher targeting the gap before moving on.

### Step 3 — Decompose

Agents — **Planner** (Opus, thinking-tier).

Dispatch `**Planner** — producing batch graph` with the research findings, triage classification, and applicable templates from [task-templates.md](references/task-templates.md) (CRUD Feature, API Endpoint, UI Component, Database Migration, Refactor, Bug Fix — else bespoke).

The Planner produces, for each sub-task:
- Worker role — Implementer / Searcher / Writer
- Files to read / modify / create
- Dependencies — parallel vs sequential
- Complexity estimate (drives review level cap downstream)

### Step 4 — Write Task File

Agents — `Writer` (Sonnet) ⇒ **Reviewer** (Opus).

1. Dispatch `Writer — emitting task file` with the Planner's output. The Writer writes to `.hyperflow/tasks/<task-slug>.md` using the template below.
2. Dispatch `**Reviewer** — verifying task file vs design` to confirm every design requirement maps to at least one sub-task and no orphan sub-tasks exist.

Task-file template —

```markdown
# Task: <Name>

## Goal
<one-line>

## Context
<background, why this matters, research findings>

## Affected files
- Read: <list>
- Modify: <list>
- Create: <list>

## Batches

### Batch 1 (parallel)
- [ ] T1: [Role] <description>
- [ ] T2: [Role] <description>

### Batch 2 (sequential — depends on Batch 1)
- [ ] T3: [Role] <description>

### Batch 3
- [ ] T4: Final integration review

## Open questions
<anything needing user input before execution>

## Verification plan
<how to test end-to-end>

## Estimated cost
- Thinking: ~N agents, ~Xk tokens
- Worker: ~N agents, ~Yk tokens

## Status
Created:        <ISO-8601 timestamp · written by scope>
Started:        <ISO-8601 timestamp · written by dispatch at first batch>
Last update:    <ISO-8601 timestamp · written by dispatch after each sub-task>
Sub-tasks:      <done> / <total>   (e.g. "5 / 14")
Tokens used:    thinking <Xk> · worker <Yk> · total <Zk>
Wall-clock:     <Hm Ms> elapsed
ETA:            <Hm Ms> remaining   (or "computing" before 3 sub-tasks done)
```

### Step 5 — Output

Print the task file path and batch summary table:

```
Plan ready — .hyperflow/tasks/<slug>.md (3 batches, 7 sub-tasks)
```

### Step 6 — Memory

Agents — `Writer` (Sonnet) ⇒ **Reviewer** (Opus).

1. Dispatch `Writer — appending decisions to .hyperflow/memory/decisions.md`. Skip trivial ones. For complex features (3+ files, multiple subsystems) the Writer also produces `.hyperflow/specs/<feature-slug>.md` referenced from the task file.
2. Dispatch `**Reviewer** — checking memory entries` to catch duplicates or contradictions with existing entries before they land in `.hyperflow/memory/`.

See [task-tracking.md](references/task-tracking.md) and [worker-prompt.md](references/worker-prompt.md).

### Step 7 — Hand off to `/hyperflow:dispatch`

**If `chain-mode=auto`** — immediately invoke `Skill` with `skill: execute` and `args: "chain-mode=auto <task-slug>"`. Print:

```
Auto-chaining to /hyperflow:dispatch…
```

**If `chain-mode=manual`** — ask via `AskUserQuestion`: "Plan done. Continue to /hyperflow:dispatch?" → yes / no / stop. On yes, invoke `Skill` with `skill: execute` and `args: "chain-mode=manual <task-slug>"`.

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
