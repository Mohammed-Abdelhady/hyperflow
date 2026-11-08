# Getting started

Hyperflow offers four public skills: `/hyperflow-plan`, `/hyperflow-smash`, `/hyperflow-crash`, and `/hyperflow-agents-skill`.

## Plan first

Use `/hyperflow-plan` to inspect the repository, identify consequential decisions, and record actual answers. The planner writes a readable plan and a static workflow declaration under `.hyperflow/workflows/<slug>/`, then stops. An unresolved blocking question prevents compilation.

Plans use workflow schema 2. Each task carries actual nonblank details, a difficulty of `routine`, `complex`, or `security` (defaulting to routine), and an explicit effort of `low`, `medium`, or `high`. Routine tasks route to the lightweight role; complex and security tasks route to the general role; conflicting routing is rejected. Correctness review defaults to the primary role at high effort, and the workflow-wide consolidated security review and security fix lanes use the general role with high default effort. Historic schema-1 plans remain readable but cannot execute until they are replanned on schema 2.

Plans use a decision-frontier method: ask settled consequential questions together, with evidence, a recommendation, practical options, and a blocking flag. If inspection finds no material ambiguity, present the concrete plan and request confirmation instead of inventing questions.

## Execute explicitly

Use `/hyperflow-smash [workflow]` to start a selected reviewed workflow. It schedules ready tasks by dependencies and write scopes, uses isolated worktrees, and reviews every candidate with a fresh primary correctness session before serial integration. After all implementation and correctness phases finish, one consolidated general security review runs once on the whole change before it reaches your checkout; its findings go to a new general fix lane whose output reruns affected checks, primary correctness review, and security revalidation. A worker cannot review its own work. Status, graph, stop, resume, sessions, rename, and messages remain smash subcommands.

## Review and model roles

Use `/hyperflow-crash [PR-or-range]` for a read-only review of a pinned diff. Use `/hyperflow-agents-skill` to inspect or update `primary`, `general`, and `lightweight` role preferences. Preferences must resolve against installed provider configuration and catalog data.

## Runtime

Skills invoke the local runner with `node <plugin-root>/runtime/cli.mjs`. No global binary is required. Markdown plans and decisions are distinct from the runtime's local SQLite execution state. Installation does not run a workflow or modify provider credentials.

## Limits

Host command discovery is separate from runtime compatibility. Provider, browser, simulator, and device availability can lower admission. Unsupported checks must be reported as unavailable; docs and static contracts do not certify a host.
