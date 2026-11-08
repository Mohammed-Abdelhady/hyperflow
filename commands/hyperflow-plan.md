---
description: Inspect, ask consequential questions, and compile a Hyperflow plan without executing it.
---
<!-- hyperflow-owned-command v1 root=@HYPERFLOW_PLUGIN_ROOT@ -->
Read and follow `@HYPERFLOW_PLUGIN_ROOT@/skills/hyperflow-plan/SKILL.md`. Inspect the repository read only, resolve consequential questions with the user, and write the planning draft JSON in an allowed artifact directory. Persist it by invoking Node with argv `[@HYPERFLOW_PLUGIN_ROOT@/runtime/cli.mjs, plan, <draft.json>]`. Record actual answers using `answer <slug> <answers.json>`, then compile only after explicit confirmation. Do not execute the workflow.

Request: $ARGUMENTS
