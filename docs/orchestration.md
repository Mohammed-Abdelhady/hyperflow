# Orchestration contract

Hyperflow minimizes coordination before it minimizes implementation. It loads one of seven surfaces only when the request needs it, selects the smallest safe lane, and keeps persistent state in Markdown.

## Routing

| Intent | Surface | Result |
|---|---|---|
| plan, design, brainstorm, explore, scope, decompose | `plan` | Inspect and write one compact plan; stop |
| build, implement, add, refactor | `dispatch` | Inspect and implement without a start confirmation |
| debug, fix, solve, failure | `trace` | Establish root cause, then apply the bounded fix |
| audit, review, security check | `audit` | Write prioritized findings; changes require fix scope |
| ship, release, deploy, push | `deploy` | Run gates; release and push remain separate |
| continue, resume, transfer | `handoff` | Rehydrate the task pointer and Git refs |
| mixed or unclear | `hyperflow` | Resolve the route without fan-out |

## Lanes

### Direct

Use for clear, reversible work inside one subsystem.

- Coordinator implements and checks the bounded diff.
- Zero child agents.
- No task file unless durable decisions are needed.
- Zero confirmation turns after an explicit build/fix request.

### Focused

Use for moderate work with a small number of independent parts.

- One `.hyperflow/tasks/<slug>.md`, at most 1,200 words.
- At most two child calls while planning and about 6,000 planning tokens.
- At most four child calls across plan and build, including workers, review, and retries.
- Parallel workers only where file ownership and dependencies are independent.
- One separate batch reviewer.
- Worker brief: at most 700 tokens. Reviewer brief: at most 500 tokens.

### Deep

Use only for security, migrations, cross-boundary architecture, or research.

- Two or three investigators and one planner during planning.
- At most five planning child calls and about 18,000 planning tokens.
- At most eight child calls across plan and build, including workers, review, and retries.
- Implementation workers follow dependency order.
- One specialist integration reviewer judges the cumulative diff.

These are structural ceilings, not provider-exact accounting claims.

## Context discipline

- Inspect the repository before asking a question.
- Ask only when the answer changes implementation.
- Load task-relevant skills and references on demand.
- Give each worker only its scope, dependencies, acceptance criteria, and verification command.
- Keep investigation detail inside the investigating session; return compact findings.
- Never create an agent for formatting, routing, status, memory append, or command execution.
- Workers never review their own work.

## Markdown contract

| File | Purpose |
|---|---|
| `.hyperflow/tasks/<slug>.md` | Goal, scope, dependencies, status, acceptance criteria |
| `.hyperflow/specs/<slug>.md` | Design decisions needed beyond the task file |
| `.hyperflow/audits/<timestamp>-<scope>.md` | Evidence-backed findings |
| `.hyperflow/memory/<category>.md` | Durable project learning |
| `.hyperflow-handoff/<slug>/{task.md,handoff.md}` | Task copy, base/head refs, status, continuation notes |

Current workflow state is the Markdown listed above.

## Completion and Git

Each distinct task receives its own Conventional Commit. Verification is proportional to risk. A worker's output is not accepted as its own review. Release verification may prepare a local release, but pushing commits or tags is a separate user-authorized action.

Existing user data is never deleted during installation or migration.
