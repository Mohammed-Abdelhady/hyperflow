---
name: workflow
description: |
  Use when a task is too large for turn-by-turn orchestration and should run through the big-task workflow lane: system-wide changes, large migrations, repo-wide audits, high-confidence verification, or tasks explicitly asking to run a workflow. Claude Code uses native dynamic workflows; Codex, OpenCode, and Grok use the portable workflow adapter.
  Trigger with /hyperflow:workflow, "run a workflow", "dynamic workflow", "big task", "large migration", "repo-wide audit".
allowed-tools: Read, Glob, Grep, AskUserQuestion, Skill
argument-hint: "<big task description>"
version: 1.1.0
license: MIT
compatibility: Claude Code native workflows; Codex/OpenCode/Grok portable adapter via runtime-contract
tags: [workflow, claude-code, codex, opencode, grok, large-task, orchestration, verification]
---

# Workflow

Big-task path for work that is too large for normal turn-by-turn orchestration: system-wide changes, large migrations, repo-wide audits, high-confidence verification, and task prompts that explicitly ask for a workflow.

Executable ops follow [runtime-contract.md](../hyperflow/runtime-contract.md). Never route to retired `spec` / `scope` ([chain-router.md](../hyperflow/chain-router.md)).

- In Claude Code, use the host dynamic workflow runtime when available.
- On portable hosts (Codex, OpenCode, Grok, …), run the **portable workflow adapter**: prefer inventory-mapped `spawn` for independent units; otherwise run the same phases with labelled **inline worker** and **inline reviewer** phases.
- In Antigravity, Desktop/web bridge mode, or any host that cannot preserve the adapter phases, say so in one line and continue via `skill_continuation` to `/hyperflow:plan` (never fall through to retired `scope`).

Claude Code dynamic workflows require Claude Code v2.1.154 or later and can be disabled by `/config`, managed settings, `~/.claude/settings.json`, or `CLAUDE_CODE_DISABLE_WORKFLOWS=1`. When disabled, use the portable adapter if the host supports it; otherwise route to `/hyperflow:plan`.

## Routing Rules

- Run this skill in Claude Code, Codex, OpenCode, and Grok.
- Auto-route here when triage returns `flow=deep` or `flow=scientific`, `scope=system-wide`, or the user says `big task`, `large migration`, `repo-wide audit`, `run a workflow`, or `dynamic workflow`.
- Do not route here for moderate multi-file work, routine bug fixes, or a task that needs user sign-off between implementation stages. Big-task workflow runs should not depend on arbitrary mid-run user input; split sign-off-heavy work into separate workflows or use `plan` (decomposition) then `dispatch` — **never** the retired `spec -> scope -> dispatch` chain as a live path.
- Do not set `/effort ultracode` or `xhigh` automatically. The user can enable `/effort ultracode` manually for session-wide workflow selection.
- Every agent runs on the **current session model** — no model-tier routing.

## Runtime ops (portable adapter)

| Phase need | Semantic op | Present | Absent |
|---|---|---|---|
| Research / implement / write units | `spawn` | Parallel sibling children when host allows | Labelled inline worker phases |
| Adversarial verification | `spawn` (separate) | Independent verification children | Labelled inline reviewer phases after workers |
| Ambiguity at structural points | `structured_question` | Host structured UI | Hyperflow Question + **end the turn** |
| Hand off to plan/dispatch/audit | `skill_continuation` | Native Skill when callable | Full target `SKILL.md` load + inline continuation |

Spawn candidates come from live inventory + `config/providers.json` (Claude `Agent`; Codex `collaboration.spawn_agent` then legacy candidates; OpenCode Task / subagent; Grok `spawn_subagent`; other inventory matches). Do **not** hardcode only `multi_agent_v1.spawn_agent` or require sole `worker`/`explorer` agent types — embed Hyperflow role + charter in the brief; map legacy enums only when the session actually exposes them ([provider-codex.md](../hyperflow/provider-codex.md)).

Worker and reviewer roles remain **independent** under both subagent and inline profiles.

## Provider Contracts

### Claude Code Native Workflow

When this skill runs on Claude Code with dynamic workflows enabled, ask the Claude Code workflow runtime to create a dynamic workflow for `$ARGUMENTS`. The generated workflow must preserve Hyperflow's doctrine inside the worker prompts and must include these phases:

1. Research and planning
   - Map affected files, dependency edges, tests, docs, and risk boundaries.
   - Read `.hyperflow/profile.md`, `.hyperflow/architecture.md`, `.hyperflow/conventions.md`, `.hyperflow/testing.md`, and `.hyperflow/memory/index.md` when present.
   - Produce a concise execution graph with parallelizable units and dependencies.

2. Parallel implementation or investigation
   - Fan out independent agents by subsystem or file family via host `spawn` / workflow agents.
   - Keep each agent brief specific: objective, files in scope, constraints, acceptance criteria, and test expectations.
   - Every child uses the current session model; never invent per-role model routing.

3. Adversarial verification
   - Run independent verification agents against each implementation or finding (separate from implementers).
   - For audits, verify each finding before reporting it.
   - For implementation, check cross-file integration, regression risk, security-sensitive paths, and missed tests.

4. Quality gates and repair loop
   - Run the project lint, typecheck, build, and relevant tests from `.hyperflow/testing.md` or detected package scripts.
   - Retry focused fixes only for verified failures.
   - Never use `--no-verify`; never force-push to main or master.

5. Final synthesis
   - Return one coordinated result with completed work, verification evidence, unresolved risks, changed files, and next actions.
   - For durable project learnings, identify what should be appended to `.hyperflow/memory/`, but do not invent memory entries unrelated to the run.

### Codex Portable Workflow Adapter

Codex does not provide Claude Code's dynamic workflow runtime. Treat `/hyperflow:workflow` as a custom Hyperflow workflow envelope around Codex multi-agent tools (prefer `collaboration.*` candidates, then legacy inventory matches) and inline fallback:

1. Research and planning
   - Read the same `.hyperflow/` cache files listed above when present.
   - Write or update `.hyperflow/tasks/<slug>.md` for implementation or audit work that needs durable progress tracking.
   - Build an execution graph with parallelizable units, dependencies, expected commits, and verification commands.

2. Parallel implementation or investigation
   - If Codex `spawn` tools are exposed in inventory, dispatch independent searcher/worker/writer units together and collect their results before review.
   - Embed Hyperflow roles in task briefs; do not require fictional agent-type enums.
   - If subagents are unavailable, run each unit inline with explicit worker and reviewer labels.

3. Adversarial verification
   - Run a separate verification pass for each completed unit before reporting it (separate spawn or labelled inline reviewer).
   - Use session-model reasoning effort appropriate to verification — never default to `xhigh`.

4. Quality gates and commits
   - Run the detected lint, typecheck, build, and relevant tests.
   - Commit each accepted unit separately using conventional commits.
   - Never use `--no-verify`; never request `xhigh`.

5. Final synthesis
   - Return changed files, verification evidence, unresolved risks, and next actions.
   - Report usage via `usage_metrics` honesty rules (observed or `estimated=true` only).

### OpenCode Portable Workflow Adapter

OpenCode does not provide Claude Code's dynamic workflow runtime. Treat `/hyperflow:workflow` as a custom Hyperflow workflow envelope around OpenCode's Task/subagent facilities and inline fallback:

1. Research and planning
   - Read the same `.hyperflow/` cache files listed above when present.
   - Write or update `.hyperflow/tasks/<slug>.md` for implementation or audit work that needs durable progress tracking.
   - Build an execution graph with parallelizable units, dependencies, expected commits, and verification commands.

2. Parallel implementation or investigation
   - If OpenCode exposes Task/subagent dispatch, send independent implementation or investigation units through that path.
   - Keep each subtask bounded by objective, files in scope, constraints, acceptance criteria, and tests.
   - If task dispatch is unavailable, run each unit inline with explicit worker and reviewer labels.

3. Adversarial verification
   - Run a separate verification pass for each completed unit before reporting it.
   - Run verification and the final integration review as decision-agent passes on the current session model.

4. Quality gates and commits
   - Run the detected lint, typecheck, build, and relevant tests.
   - Commit each accepted unit separately using conventional commits.
   - Never use `--no-verify`.

5. Final synthesis
   - Return changed files, verification evidence, unresolved risks, and next actions.

### Grok Portable Workflow Adapter

Grok does not provide Claude Code's dynamic workflow runtime. Treat `/hyperflow:workflow` as a custom Hyperflow workflow envelope around inventory-mapped `spawn` (e.g. `spawn_subagent` when enabled) and inline fallback:

1. Research and planning
   - Read the same `.hyperflow/` cache files listed above when present.
   - Write or update `.hyperflow/tasks/<slug>.md` for implementation or audit work that needs durable progress tracking.
   - Build an execution graph with parallelizable units, dependencies, expected commits, and verification commands.

2. Parallel implementation or investigation
   - If spawn is available and subagents are not disabled, dispatch independent units together with role charters in the brief.
   - Collect results before review; spawn independent siblings in parallel when the runtime allows.
   - If subagents are unavailable, run each unit inline with explicit worker and reviewer labels.

3. Adversarial verification
   - Run a separate verification pass for each completed unit before reporting it.
   - Run verification and the final integration review as decision-agent passes on the current session model.

4. Quality gates and commits
   - Run the detected lint, typecheck, build, and relevant tests.
   - Commit each accepted unit separately using conventional commits.
   - Never use `--no-verify`.

5. Final synthesis
   - Return changed files, verification evidence, unresolved risks, and next actions.

## Claude Code Prompt Skeleton

Use this shape when handing the task to the workflow runtime:

```text
Create a dynamic workflow for this Hyperflow big-task run.

Task:
<user task>

Doctrine:
- Preserve Hyperflow autonomy: execute reversible work without invented confirmations.
- Ask only for genuine ambiguity after codebase research.
- Keep plans, task decompositions, audits, and memory under .hyperflow/ when files are needed.
- Use conventional commits, one distinct task per commit.
- Never use --no-verify and never force-push to main/master.
- Respect the Hyperflow security blocklist in skills/hyperflow/security.md.
- Workers never review; reviewers never coordinate; session model only.

Required phases:
1. Research and planning.
2. Parallel implementation or investigation.
3. Adversarial verification.
4. Quality gates and focused repair loop.
5. Final synthesis.

Acceptance:
- Every substantive result is independently checked before being reported.
- Quality gates run or are explicitly marked unavailable with the command attempted.
- The final answer includes evidence, changed files, unresolved risks, and next actions.
```

## Save For Reuse

When a run succeeds and the user will repeat it, mention that Claude Code can save the generated workflow from `/workflows` with `s`. Project workflows save under `.claude/workflows/`; personal workflows save under `~/.claude/workflows/`. Do not create those files directly from this skill because plugin packaging does not currently ship `.claude/workflows/` as a first-class component.

Codex, OpenCode, and Grok adapters are not saved through `/workflows`; repeatable behavior comes from this skill, `.hyperflow/tasks/`, project memory, and provider-specific subagent/task configuration.

## Related

- [runtime-contract.md](../hyperflow/runtime-contract.md) · [chain-router.md](../hyperflow/chain-router.md)
- [provider-claude.md](../hyperflow/provider-claude.md) · [provider-codex.md](../hyperflow/provider-codex.md) · [provider-opencode.md](../hyperflow/provider-opencode.md)
