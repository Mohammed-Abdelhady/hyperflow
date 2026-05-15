---
name: dispatch
description: Use when a task file exists in `.hyperflow/tasks/` and workers need dispatching — `/hyperflow:dispatch`, "run the plan", "execute the task", "build it". Dispatches parallel workers, runs thinking-tier batch reviews, finishes with a final integration review. Endpoint of the auto-chain (no auto-deploy — user opts in to push).
---

# Dispatch

Workhorse phase. Picks up a task file from `/hyperflow:scope` and runs it through the orchestrator pattern with parallel worker dispatch and thinking-tier reviews.

This skill exercises **Layer 3 (Orchestrator)**, **Layer 5 (Quality Gates)**, **Layer 6 (Project Memory)**, **Layer 8 (Git Workflow)**, and **Layer 9 (Security)** from the doctrine. Multi-level review (L1–L5) is applied per the triage's flow profile.

## Review Levels (scale by flow profile)

Every batch reviewer and the final integration reviewer uses the level set below. Profile comes from `/hyperflow:spec` triage and is propagated via the `chain-mode` args.

| Profile | Levels | Workers | Reviewers |
|---|---|---|---|
| `fast` | L1 | 1 | inline self-review only |
| `standard` | L1–L2 | 1–2 | 1 per-batch reviewer |
| `deep` | L1–L5 | 3+ | per-batch + final integration |
| `research` | L1–L2 + synthesis | 3+ searchers | inline synthesis |
| `creative` | L1–L3 + UX | 1–2 | 1 reviewer |
| `scientific` | L1–L5 + TDD | 2–3 | per-batch + final |

L1 syntax/format · L2 spec/naming/edges · L3 integration/security · L4 perf/scale · L5 a11y/UX. See [review-levels.md](../hyperflow/review-levels.md) for the full checklist.

## Approval Gates

| Gate | When | Format |
|---|---|---|
| Chain mode | Step 0, only if invoked directly | `AskUserQuestion` — auto / manual |
| Inter-batch (manual mode only) | After each batch's gates pass | `AskUserQuestion` — continue / stop |
| Hard halt | Any `SECURITY_VIOLATION` from a reviewer | Stop the chain, surface the finding |

## Inputs

- **Task file** — positional arg (slug or path). Default — most-recently-modified file in `.hyperflow/tasks/`.
- **`chain-mode=<auto|manual>`** — passed in by `/hyperflow:scope`. Controls whether to pause for confirmation after the final integration review. If absent, assume `auto`.
- **`--from-batch <n>`** — resume from a specific batch (skip prior batches).
- **`--final-only`** — skip batch dispatch, run only the final integration review.

## Flow

### Step 0 — Confirm mode (only if invoked directly)

If no `chain-mode` arg was passed (i.e., the user ran `/hyperflow:dispatch` directly without going through plan), ask via `AskUserQuestion`:

```
How should I handle the end of execute?

  Auto     — finish all batches + final review and stop. Print next-step suggestions.
  Manual   — pause between batches and ask before continuing.
```

Save and use the chosen mode.

### Step 1 — Load the task

Read `.hyperflow/tasks/<slug>.md`. If absent, stop and suggest `/hyperflow:scope` first.

### Step 2 — For each batch

1. Print the batch header: `Batch <n> — <one-line description>`.
2. Dispatch all sub-tasks in the batch in a **single message** with parallel `Agent` calls (one per sub-task). Use the [worker-prompt.md](../hyperflow/worker-prompt.md) template. Inject `Project Context` (from `.hyperflow/profile.md`, `architecture.md`, `conventions.md`) plus accumulated `Learnings from prior batches`.
3. As each worker returns:
   - Print `Implementer — completed <subtask>` (or relevant role).
   - Immediately dispatch a thinking-tier reviewer per [reviewer-prompt.md](../hyperflow/reviewer-prompt.md). Print `**Reviewer** — reviewing <subtask> (L1–L<n>)` where `n` is set by the flow-profile table above.
   - If verdict is `NEEDS_FIX` — re-dispatch worker with the fix list. Repeat until `PASS` (max 3 retries before escalating to a thinking-tier worker).
   - If verdict is `SECURITY_VIOLATION` — **halt the chain** immediately and surface the finding to the user (no auto-continue).
4. After the full batch — synthesize learnings, check off the batch in the task file, run **Layer 5 quality gates** (lint / typecheck / tests on affected files) per [quality-gates.md](../hyperflow/quality-gates.md). If `chain-mode=manual`, pause and ask before starting the next batch.

### Step 3 — Final Integration Review

Mandatory and **separate from batch reviews**. Dispatch a thinking-tier reviewer with the full set of changed files. Print `**Reviewer** — final integration review (L1–L<n>)` using the same level cap as the batch reviewers (per flow profile). Verdict required — `PASS` / `NEEDS_FIX` / `SECURITY_VIOLATION`.

### Step 4 — Wrap Up

- Delete the completed task file from `.hyperflow/tasks/`.
- Append durable patterns/decisions to `.hyperflow/memory/` per [memory-system.md](../hyperflow/memory-system.md).
- Auto-commit per [git-workflow.md](../hyperflow/git-workflow.md), unless `auto-commit off`.
- Print the usage summary per [output-style.md](../hyperflow/output-style.md).

### Step 5 — End of Auto-Chain

Execute is the last auto-chained phase. After Step 4 prints the usage summary, **stop**. Print one line suggesting next steps:

```
Execute complete — <n> batches, <m> agents, all reviews passed
Next: /hyperflow:deploy (gates + commit + push) or /hyperflow:audit (extra outside review)
```

Do **not** auto-invoke ship — push requires explicit user opt-in per [DOCTRINE.md](../hyperflow/DOCTRINE.md) rule 9 (git safety).

## Agent Label Style

No icons, no brackets. Em-dash separator. Bold for thinking-tier roles:

```
Implementer — creating auth middleware
Searcher — finding related test files
Writer — generating API documentation
**Reviewer** — reviewing auth middleware output
**Debugger** — investigating test failure in auth.test.ts
```

## Iron Rules

- Workers never review, never coordinate, never ask the user questions.
- Every batch produces **one** thinking-tier batch reviewer dispatch.
- Plus **one** thinking-tier final integration review at the end.
- Therefore — `thinking agents in usage summary >= batches + 1`. If less, batch reviews were skipped. The task was done wrong.

## Doctrine

Full rules in [DOCTRINE.md](../hyperflow/DOCTRINE.md). This skill is the execute phase invoked at the end of `/hyperflow:scope`.
