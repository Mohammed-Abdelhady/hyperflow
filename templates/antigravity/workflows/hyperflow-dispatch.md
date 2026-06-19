---
description: Hyperflow execution phase — work the task file batch-by-batch with self-review and per-task commits, then a final integration review
---

Run the **hyperflow execution phase** on the task file in `.hyperflow/tasks/`. Follow the **hyperflow-dispatch** skill. Single agent — no sub-agent fan-out, no model tiers.

**Handoff pickup:** if `$ARGS` names a `.hyperflow-handoff/<slug>/` package (second-session build), first `git pull`, copy its `artefact/` into `.hyperflow/` (scaffold if the cache is missing), read chain args + `on_complete` from `HANDOFF.md`, then build. On completion write `COMPLETION.md` (+ `STATUS=built`), commit + push, and either run `/hyperflow-deploy` (`on_complete=deploy`) or stop and tell the user to review in session 1 (`on_complete=review`).

**Multi-phase features:** for a `.hyperflow/features/<slug>/` artefact, ask whether to build **all phases** straight through or **phase by phase** (stop after each phase). Build phases in dependency order; tasks within a phase run as batches.

Per batch:
1. Implement every sub-task in the batch.
2. Self-review the diff: L1 syntax/format → L2 spec/naming/edges → L3 integration + security (secrets, injection, validation). Fix before committing.
3. Run lint + typecheck + tests on affected files; fix failures (never `--no-verify`).
4. Commit per sub-task — one conventional commit, only that sub-task's files (respect commitlint; never stage files you didn't change).
5. Tick the task-file status block; append durable learnings to `.hyperflow/memory/`.

After all batches: final integration self-review over the cumulative diff; then an end gate (AskUserQuestion) offering `/hyperflow-audit` and/or `/hyperflow-deploy`. Never auto-push. `SECURITY_VIOLATION` halts immediately.

Request / arguments: $ARGS
