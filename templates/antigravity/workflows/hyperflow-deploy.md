---
description: Hyperflow ship phase — run pre-push gates (lint + typecheck + build + tests + security sweep), then ask before pushing; never --no-verify or force-push to main
---

Run the **hyperflow ship phase**. Follow the **hyperflow-deploy** skill.

1. Pre-push gates, in order, fix or halt on failure: lint · typecheck · build · tests · security sweep (no secrets / blocked files in the diff).
2. Report gate results in one short block.
3. Push gate (AskUserQuestion, binary `Push / Hold`, no recommended marker): state branch, ahead/behind vs remote, and any caveat.
4. On Push: `git push` (never `--force` to main/master). On Hold: leave commits local.

Hard rules: never `--no-verify`; never force-push to main. If a pre-push hook fails on files you don't own (concurrent work), hold and report — do not bypass.

Request / arguments: $ARGS
