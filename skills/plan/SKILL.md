---
name: plan
description: Use when the user says "plan this", "decompose this task", "break this down", or wants to see the implementation plan before any code changes. Outputs a task file in `.hyperflow/tasks/` and stops — does not dispatch workers to implement.
---

# Plan

## Core rule

**Plan, don't build.** Read-only with respect to the codebase. Only writes: `.hyperflow/tasks/`, `.hyperflow/memory/`, `docs/specs/`.

## Flow

### Step 1: Understand
- Ambiguous → `AskUserQuestion` (max 3)
- Pure design question → suggest `/hyperflow:brainstorm` instead

### Step 2: Research (parallel)
- `⚡ [Searcher] Mapping affected files and existing patterns`
- `⚡ [Searcher] Finding related tests and conventions`
- Read `.hyperflow/profile.md`, `architecture.md`, `conventions.md`
- Read `.hyperflow/memory/index.md` — surface relevant past learnings

### Step 3: Decompose
Apply [task-templates.md](../hyperflow/task-templates.md) patterns where they fit (CRUD Feature, API Endpoint, UI Component, Database Migration, Refactor, Bug Fix), else bespoke.

For each sub-task identify:
- Worker role: Implementer / Searcher / Writer
- Files to read / modify / create
- Dependencies — parallel vs sequential
- Complexity estimate

### Step 4: Write task file
Path: `.hyperflow/tasks/<task-slug>.md`

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

### Step 5: Output
1. Print task file path
2. Print batch structure as a table
3. Print: `Plan ready. To execute: /hyperflow:hyperflow or /hyperflow:plan execute <task-slug>`

### Step 6: Memory
Append non-trivial decisions to `.hyperflow/memory/decisions.md`. Skip trivial ones.

For complex features (3+ files, multiple subsystems) also write `docs/specs/<feature-slug>.md` and reference it from the task file. See [task-tracking.md](../hyperflow/task-tracking.md) and [worker-prompt.md](../hyperflow/worker-prompt.md).

## Anti-patterns
- Writing implementation code
- Modifying source files outside `.hyperflow/` and `docs/specs/`
- Skipping the research step
- Single-batch plans for multi-file work
- Omitting the verification plan
