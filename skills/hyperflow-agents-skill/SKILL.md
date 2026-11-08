---
name: hyperflow-agents-skill
description: Inspect or update validated Hyperflow primary, general, and lightweight model-role preferences at global, project, or session scope.
version: 6.10.1
---
# Hyperflow Agents Skill

Show the effective model role, provider adapter, scope, and configuration revision. Resolve identifiers from actual provider configuration/catalog and authentication state. Never invent model IDs, write provider credentials, or modify a shared delegate fleet file.

The host running this chat remains the coordinator. Hyperflow settings choose delegates per role; they never switch the outer host. Use only capabilities exposed by the active host. Resolve `<plugin-root>` to this installed plugin's directory and invoke `node <plugin-root>/runtime/cli.mjs`.

```text
node <plugin-root>/runtime/cli.mjs agents-config
node <plugin-root>/runtime/cli.mjs agents-config set <role> <harness> <provider/model> [global|project|session RUN_ID]
```

Available roles:

- `primary`: difficult investigation, planning, architecture, and conflict decisions. Requested default: `openai/gpt-6.1-sol`.
- `general`: ordinary implementation and suitable independent review. Requested default: `zai/glm-5.3`.
- `lightweight`: direct replies and bounded work. Requested default: `zai/glm-5.3-flash`.

Profiles are preferences, not mandatory host models or proof of availability. A profile selects a delegate harness and model only when that adapter is available; this does not certify the delegate or the active host. Validate overlays in global, project, then session order. A running task retains its captured role revision. Effort is assigned per task during planning, shown in the workflow, and validated against that delegate's actual support. Never silently change the surrounding chat model. A running task changes delegate only through checkpoint and explicit restart with a structured handoff.

Show supported effort or variant from the actual adapter. Preserve valid independent work and completed results when a role changes. Report unavailable configuration or authentication as a blocker; never silently fall back.

The pinned upstream delegate relay is optional. Install it only with the explicit `setup-delegates` command. It is not fetched during startup, planning, or ordinary installation.

## Writing

Before writing plans, questions, status updates, review findings or delivery summaries, apply the shared [unslop writing rules](../hyperflow-plan/references/unslop.md). Preserve technical meaning and evidence.
