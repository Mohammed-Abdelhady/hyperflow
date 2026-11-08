# Orchestration contract

Hyperflow uses a local runner to validate workflow declarations, coordinate bounded task execution, and persist recovery state. Four public skills are the only public command surface: plan, smash, crash, and agents-skill.

## Planning

Planning is read only. Inspect source, tests, Git state, reuse opportunities, and existing project knowledge. Ask consequential questions from the current decision frontier and record actual answers. A static workflow declaration is compiled only when required answers and explicit participation are present. Planning never starts execution.

Schema 2 tasks require nonblank details, an explicit `low`/`medium`/`high` effort, and a difficulty of `routine`, `complex`, or `security`. Difficulty fixes the implementation role: routine uses lightweight, complex and security use general; conflicting declarations are rejected. Correctness review uses the primary role and defaults to high effort, and workflow-level `securityReviewEffort` and `securityFixEffort` default to high with the general role fixed for both.

## Workflows and authority

A workflow is a versioned JSON-compatible declaration in `workflow.mjs`. The runner parses a limited syntax without importing or evaluating JavaScript. It binds authorization to a content digest and rejects cycles, missing dependencies, invalid ownership, unknown roles, arbitrary checks, and unavailable model bindings.

Tasks declare dependencies, read/write scopes, acceptance criteria, registered check IDs, role, and resource needs. Schedule by dependency readiness. Overlapping writes serialize. Every writing task uses an isolated worktree; a single coordinator integrates validated changes serially.

## Phase records and approval

Task creation and answers write phase records under `.hyperflow/workflows/<slug>/`: a workflow-wide planning file, per-task task, implementation, and correctness-review files, a workflow-wide security-review file, and a conditional security-fix file for every workflow. Each phase file records its agent role, planned effort, scope, acceptance criteria, and checks. Model bindings are marked unresolved until compilation validates and records them. These files describe the plan; execution uses the compiled declaration and approval receipt. The approval receipt stores the workflow digest, the model-binding digest, and a deterministic digest of every phase file; missing, edited, or symlinked phase files block execution, and schema-1 plans stay readable but cannot execute until they are replanned on schema 2.

## Delegation and evidence

Provider adapters receive a bounded source-linked context, including the task's details, and return structured results. Planned effort is preserved across the delegate boundary — including Pi's native `--thinking low|medium|high` control in a fresh JSON-mode process — and unsupported effort is rejected rather than silently substituted. Independent review runs in a fresh session against the exact candidate and acceptance criteria. Fresh means a new delegate lane with its own context and an isolated checkout, not another call in the same lane. Every task is reviewed by the primary role in such a lane. One consolidated security review by the general role runs once, after all ordinary phases complete, on the full integrated candidate; either a failure or blocked verdict, a contradiction, a stop, or a candidate mutation prevents applying the workflow. Security findings are implemented in a new general fix lane, and fixes rerun the affected checks, the primary correctness review, and security revalidation. Validated correctness findings go to the responsible worker for scoped repair, followed by affected checks and review. Limit automatic correction to two rounds per unchanged contract and failure signature.

Completion requires integrated changes, independent review, applicable real checks, and evidence references. Model summaries, empty diffs, and exit codes do not substitute for verification. Missing tools, authentication, providers, browsers, or devices are reported as unavailable.

## Persistence and recovery

Human plans and decisions remain in Markdown under `.hyperflow/`. The local SQLite runtime store records runs, task claims, attempts, stop generations, messages, and evidence references. It is not a hosted database service. Resume reconciles persisted state, worktrees, branches, and provider status before retrying; late results after stop or lease replacement cannot integrate.

## Capacity and safety

Admission uses actual host, provider, browser, and simulator capacity. The documented ceiling is five browser spaces and three simulators; use two simultaneous simulators by default. Existing user resources and lower host limits take precedence. Installation remains inert: no workflow execution, provider credential mutation, or relay download.

## Unattended smash

Invoking smash authorizes implementation of the selected workflow without further questions. It runs checks, fresh reviews, and bounded fixes automatically. Writing delegates use Codex's `danger-full-access`, Claude Code and Antigravity's explicit permission bypass, Cursor's disabled sandbox with the relay's force mode, OpenCode's automatic build mode, or Pi's noninteractive writing default. Review delegates remain read only.

The coordinator retains its host's actual permissions. An unavailable capability or decision outside the approved plan blocks the affected task. Other independent tasks continue, and the final report lists unresolved blockers without waiting for a reply.
