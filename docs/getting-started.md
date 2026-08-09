# Getting started

Hyperflow routes an outcome through the smallest safe workflow. You do not need to choose a lane or command for ordinary requests.

## 1. Install

Claude Code is the primary host:

```bash
claude plugin marketplace add Mohammed-Abdelhady/hyperflow
claude plugin install hyperflow@hyperflow-marketplace
```

See [installation](installation.md) for upgrade and compatibility notes.

## 2. State the outcome

```text
plan the billing migration
implement the approved billing plan
trace why checkout tests fail
audit this diff
deploy this release
resume the billing handoff
```

Natural language routes to one of seven surfaces: `hyperflow`, `plan`, `dispatch`, `trace`, `audit`, `deploy`, or `handoff`.

## 3. Let scope select the lane

- **Direct:** one clear, reversible subsystem; no child agents.
- **Focused:** one compact task file, independent workers only, one batch reviewer.
- **Deep:** high-risk or cross-boundary work, bounded investigation and specialist integration review.

An explicit build or fix request continues after inspection. An explicit plan or design request writes `.hyperflow/tasks/<slug>.md` and stops.

## Files you may see

Current persistence is Markdown only:

```text
.hyperflow/tasks/<slug>.md
.hyperflow/specs/<slug>.md
.hyperflow/audits/<timestamp>-<scope>.md
.hyperflow/memory/<category>.md
.hyperflow-handoff/<slug>/{task.md,handoff.md}
```

Hyperflow performs no automatic startup work.

## Safety boundaries

Hyperflow preserves unrelated changes, blocks common secret files and destructive commands, keeps worker and reviewer judgment separate, verifies before release, and asks separately before push.

Next: [orchestration](orchestration.md), [privacy](../PRIVACY.md), or [Codex preview](codex.md).
