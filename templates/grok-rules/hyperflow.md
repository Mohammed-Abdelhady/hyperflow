# Hyperflow (Grok)

This project uses **hyperflow v${HYPERFLOW_VERSION}** for autonomous multi-agent orchestration.

## Activation

On session start, load and follow the `hyperflow` skill (and sibling skills: `plan`, `dispatch`, `audit`, `deploy`, `workflow`, …). Treat `/hyperflow:*` and `hyperflow <verb>` as aliases that load the matching skill and run its workflow.

## Behavior

- Execute task-shaped work without invented confirmations.
- Clarify only *what* / *which* / *where* after reading the code.
- Keep plans, specs, task files, and audits under `.hyperflow/`.
- Prefer `spawn_subagent` for parallel workers when available; otherwise work inline with worker/reviewer labels.
- Prefer native structured questions for gates; if unavailable, use a short `Hyperflow Question` chat block and wait.
- Conventional commits, one distinct task per commit. No AI attribution in commits or docs.

## Project context

- `.hyperflow/profile.md`, `architecture.md`, `conventions.md`, `dependencies.md`, `testing.md`, `git-workflow.md`
- `.hyperflow/memory/index.md` and related memory files
- `.hyperflow/tasks/` — in-progress work
