# Orchestration contract

Hyperflow uses a local runner to validate workflow declarations, coordinate bounded task execution, and persist recovery state. Four public skills are the only public command surface: plan, smash, crash, and agents-skill.

## Planning

Planning is read only. Inspect source, tests, Git state, reuse opportunities, and existing project knowledge. Ask consequential questions from the current decision frontier and record actual answers. A static workflow declaration is compiled only when required answers and explicit participation are present. Planning never starts execution.

## Workflows and authority

A workflow is a versioned JSON-compatible declaration in `workflow.mjs`. The runner parses a limited syntax without importing or evaluating JavaScript. It binds authorization to a content digest and rejects cycles, missing dependencies, invalid ownership, unknown roles, arbitrary checks, and unavailable model bindings.

Tasks declare dependencies, read/write scopes, acceptance criteria, registered check IDs, role, and resource needs. Schedule by dependency readiness. Overlapping writes serialize. Every writing task uses an isolated worktree; a single coordinator integrates validated changes serially.

## Delegation and evidence

Provider adapters receive a bounded source-linked context and return structured results. Independent review runs in a fresh session against the exact candidate and acceptance criteria. Validated findings go to the responsible worker for scoped repair, followed by affected checks and review. Limit automatic correction to two rounds per unchanged contract and failure signature.

Completion requires integrated changes, independent review, applicable real checks, and evidence references. Model summaries, empty diffs, and exit codes do not substitute for verification. Missing tools, authentication, providers, browsers, or devices are reported as unavailable.

## Persistence and recovery

Human plans and decisions remain in Markdown under `.hyperflow/`. The local SQLite runtime store records runs, task claims, attempts, stop generations, messages, and evidence references. It is not a hosted database service. Resume reconciles persisted state, worktrees, branches, and provider status before retrying; late results after stop or lease replacement cannot integrate.

## Capacity and safety

Admission uses actual host, provider, browser, and simulator capacity. The documented ceiling is five browser spaces and three simulators; use two simultaneous simulators by default. Existing user resources and lower host limits take precedence. Installation remains inert: no workflow execution, provider credential mutation, or relay download.

## Unattended smash

Invoking smash authorizes implementation of the selected workflow without further questions. It runs checks, fresh reviews, and bounded fixes automatically. Writing delegates use Codex's `danger-full-access`, Claude Code and Antigravity's explicit permission bypass, Cursor's disabled sandbox with the relay's force mode, OpenCode's automatic build mode, or Pi's noninteractive writing default. Review delegates remain read only.

The coordinator retains its host's actual permissions. An unavailable capability or decision outside the approved plan blocks the affected task. Other independent tasks continue, and the final report lists unresolved blockers without waiting for a reply.
