# Getting started

Hyperflow offers four public skills: `/hyperflow-plan`, `/hyperflow-smash`, `/hyperflow-crash`, and `/hyperflow-agents-skill`.

## Plan first

Use `/hyperflow-plan` to inspect the repository, identify consequential decisions, and record actual answers. The planner writes a readable plan and a static workflow declaration under `.hyperflow/workflows/<slug>/`, then stops. An unresolved blocking question prevents compilation.

Plans use a decision-frontier method: ask settled consequential questions together, with evidence, a recommendation, practical options, and a blocking flag. If inspection finds no material ambiguity, present the concrete plan and request confirmation instead of inventing questions.

## Execute explicitly

Use `/hyperflow-smash [workflow]` to start a selected reviewed workflow. It schedules ready tasks by dependencies and write scopes, uses isolated worktrees, creates fresh independent reviews, routes validated findings to scoped repairs, and runs real checks. A worker cannot review its own work. Status, graph, stop, resume, sessions, rename, and messages remain smash subcommands.

## Review and model roles

Use `/hyperflow-crash [PR-or-range]` for a read-only review of a pinned diff. Use `/hyperflow-agents-skill` to inspect or update `primary`, `general`, and `lightweight` role preferences. Preferences must resolve against installed provider configuration and catalog data.

## Runtime

Skills invoke the local runner with `node <plugin-root>/runtime/cli.mjs`. No global binary is required. Markdown plans and decisions are distinct from the runtime's local SQLite execution state. Installation does not run a workflow or modify provider credentials.

## Limits

Host command discovery is separate from runtime compatibility. Provider, browser, simulator, and device availability can lower admission. Unsupported checks must be reported as unavailable; docs and static contracts do not certify a host.
