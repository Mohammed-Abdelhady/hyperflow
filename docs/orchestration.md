# Orchestration contract

Hyperflow uses a local runner to validate workflow declarations, coordinate bounded task execution, and persist recovery state. Four public skills are the only public command surface: plan, smash, crash, and agents-skill.

## Planning

Planning is read only. Inspect source, tests, Git state, reuse opportunities, and existing project knowledge. Ask consequential questions from the current decision frontier and record actual answers. A static workflow declaration is compiled only when required answers and explicit participation are present. Planning never starts execution.

Schema 2 tasks require nonblank details, an explicit `low`/`medium`/`high` effort, and a difficulty of `routine`, `complex`, or `security`. Difficulty fixes the implementation role: routine uses lightweight, complex and security use general; conflicting declarations are rejected. Correctness review uses the primary role and defaults to high effort, and workflow-level `securityReviewEffort` and `securityFixEffort` default to high with the general role fixed for both.

## Workflows and authority

A workflow is a versioned JSON-compatible declaration in `workflow.mjs`. The runner parses a limited syntax without importing or evaluating JavaScript. It binds authorization to a content digest and rejects cycles, missing dependencies, invalid ownership, unknown roles, arbitrary checks, and unavailable model bindings.

Tasks declare dependencies, read/write scopes, acceptance criteria, registered check IDs, role, and resource needs. Schedule by dependency readiness. Overlapping writes serialize. Every writing task uses an isolated worktree; a single coordinator integrates validated changes serially.

## Phase records and approval

Task creation and answers write `.hyperflow/workflows/<slug>/planning.md`, per-task task, implementation and correctness-review files, and workflow-wide security-review and conditional security-fix files. Every phase names its agent and effort; task records include scope, acceptance and checks. Compilation resolves model bindings and stores the workflow, model-binding and exact phase-file digests in the approval receipt. Missing, edited or linked files block execution. Schema-1 workflows remain readable history and require replanning on schema 2 to execute.

## Delegation and evidence

Adapters receive bounded source-linked task details and return structured results. Planned effort must be supported, including Pi's native `--thinking low|medium|high` control. Fresh means a new delegate context and isolated checkout pinned to the candidate. Primary reviews each task. General reviews the complete integrated diff once after all ordinary phases. Failure, blocked or contradictory verdicts, stops and candidate mutations prevent application. Security fixes use a new general lane, affected checks, primary review and security revalidation. Ordinary correctness findings return to their responsible worker. Automatic repairs are capped at two rounds per execution. Approved model bindings stay fixed during each run.

Completion requires integrated changes, independent review, applicable real checks, and evidence references. Model summaries, empty diffs, and exit codes do not substitute for verification. Missing tools, authentication, providers, browsers, or devices are reported as unavailable.

## Persistence and recovery

Human plans and decisions remain in Markdown under `.hyperflow/`. The local SQLite runtime store records runs, task claims, attempts, stop generations, messages, and evidence references. It is not a hosted database service. Resume reconciles persisted state, worktrees, branches, and provider status before retrying; late results after stop or lease replacement cannot integrate.

## Capacity and safety

Admission uses actual host, provider, browser, and simulator capacity. The documented ceiling is five browser spaces and three simulators; use two simultaneous simulators by default. Existing user resources and lower host limits take precedence. Installation remains inert: no workflow execution, provider credential mutation, or relay download.

## Unattended smash

Invoking smash authorizes implementation of the selected workflow without further questions. It runs checks, fresh reviews, and bounded fixes automatically. Writing delegates use Codex's `danger-full-access`, Claude Code and Antigravity's explicit permission bypass, Cursor's disabled sandbox with the relay's force mode, OpenCode's automatic build mode, or Pi's noninteractive writing default. Review delegates remain read only.

The coordinator retains its host's actual permissions. An unavailable capability or decision outside the approved plan blocks the affected task. Other independent tasks continue, and the final report lists unresolved blockers without waiting for a reply.
