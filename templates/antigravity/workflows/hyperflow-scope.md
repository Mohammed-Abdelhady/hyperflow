---
description: Hyperflow planning phase — decompose into a batched task graph at .hyperflow/tasks/, then hand off to /hyperflow-dispatch
---

Run the **hyperflow decomposition phase**. Follow the **hyperflow-scope** skill. Read-only on source; only `.hyperflow/` is written.

1. Research the affected surface (files, conventions, tests). If it's really a design question, redirect to `/hyperflow-spec`.
2. Produce a topologically-ordered batch graph. Split any sub-task >5 files / >500 LOC / 2+ subsystems / >10-min review into smaller ones; each = one conventional-commit-sized change.
3. Write `.hyperflow/tasks/<slug>.md` (status table → Goal → Why → scope-at-a-glance → affected files → execution plan → batches with acceptance criteria → verification plan).
4. Print `Plan ready — .hyperflow/tasks/<slug>.md (N batches, M sub-tasks)`, then hand off to `/hyperflow-dispatch`.

Request / arguments: $ARGS
