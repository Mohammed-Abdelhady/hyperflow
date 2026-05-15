---
name: scope
description: Use when the user says "plan this", "decompose this task", "break this down", or wants the task file before any code changes. Writes `.hyperflow/tasks/<slug>.md` with batched sub-tasks, then **auto-chains into `/hyperflow:dispatch`** — no manual gate.
---

# Scope

Decompose, don't build. Read-only with respect to source code. The only writes are to `.hyperflow/tasks/`, `.hyperflow/memory/`, and `docs/specs/`. When the task file is ready, hand off to execute (auto or with a gate, depending on chain mode).

## Flow

### Step 0 — Choose chain mode (FIRST tool call)

If invoked with a `chain-mode=<auto|manual>` arg (from `/hyperflow:spec` or a prior skill), skip this step.

Otherwise, **before research**, ask via `AskUserQuestion`:

```
How should I advance through the chain after this phase?

  Auto     — chain forward through scope → dispatch with no gate.
             Fewer interruptions, faster end-to-end.

  Manual   — pause between phases and ask before advancing.
             More control, more confirmations.
```

Save the chosen mode and propagate via `args: "chain-mode=<mode>"` when invoking execute. Default to `auto` if the user gives no clear answer.

### Step 1 — Understand

- Ambiguous → `AskUserQuestion` (max 3)
- Pure design question → suggest `/hyperflow:spec` instead and stop

### Step 2 — Research (parallel)

Dispatch both in a single message:
- `Searcher — mapping affected files and existing patterns`
- `Searcher — finding related tests and conventions`

Also read `.hyperflow/profile.md`, `architecture.md`, `conventions.md`, and `.hyperflow/memory/index.md` to surface relevant past learnings.

### Step 3 — Decompose

Apply [task-templates.md](../hyperflow/task-templates.md) patterns where they fit (CRUD Feature, API Endpoint, UI Component, Database Migration, Refactor, Bug Fix), else bespoke.

For each sub-task identify:
- Worker role — Implementer / Searcher / Writer
- Files to read / modify / create
- Dependencies — parallel vs sequential
- Complexity estimate

### Step 4 — Write Task File

Path — `.hyperflow/tasks/<task-slug>.md`

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
Created: <date>
```

### Step 5 — Output

Print the task file path and batch summary table:

```
Plan ready — .hyperflow/tasks/<slug>.md (3 batches, 7 sub-tasks)
```

### Step 6 — Memory

Append non-trivial decisions to `.hyperflow/memory/decisions.md`. Skip trivial ones.

For complex features (3+ files, multiple subsystems) also write `docs/specs/<feature-slug>.md` and reference it from the task file. See [task-tracking.md](../hyperflow/task-tracking.md) and [worker-prompt.md](../hyperflow/worker-prompt.md).

### Step 7 — Hand off to `/hyperflow:dispatch`

**If `chain-mode=auto`** — immediately invoke `Skill` with `skill: execute` and `args: "chain-mode=auto <task-slug>"`. Print:

```
Auto-chaining to /hyperflow:dispatch…
```

**If `chain-mode=manual`** — ask via `AskUserQuestion`: "Plan done. Continue to /hyperflow:dispatch?" → yes / no / stop. On yes, invoke `Skill` with `skill: execute` and `args: "chain-mode=manual <task-slug>"`.

## Anti-patterns

- Writing implementation code
- Modifying source files outside `.hyperflow/` and `docs/specs/`
- Skipping the research step
- Single-batch plans for multi-file work
- Omitting the verification plan
- Pausing for "should I execute?" when `chain-mode=auto` — that was already answered at Step 0
- Asking the chain-mode question again when a `chain-mode=<…>` arg was passed in

## References

- [DOCTRINE.md](../hyperflow/DOCTRINE.md) — shared rules
- [output-style.md](../hyperflow/output-style.md) — elegant label format
