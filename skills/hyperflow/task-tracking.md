# Task Tracking

Persist active task state across sessions as individual files in `.hyperflow/tasks/`. One file per task. Deleted on completion.

## Task File Format

```markdown
---
id: implement-user-auth
status: in-progress | blocked | in-review | completed
created: 2026-05-15T14:30:00Z
updated: 2026-05-15T15:00:00Z
---

## Objective
[One sentence — what this task achieves]

## Files
- `src/components/Auth.tsx` — creating
- `src/hooks/useAuth.ts` — modifying

## Sub-tasks
- [x] Create auth types
- [ ] Build Auth component

## Progress
- Created auth types with JWT payload interface

## Learnings
- Project uses httpOnly cookies for tokens, not localStorage
- Auth context exists at src/context/AuthContext — extend it, don't replace

## Blocked
[What's blocking and why — only present if status=blocked]
```

## Naming Convention

Pattern: `<verb>-<short-description>.md` in kebab-case.

- `implement-user-auth.md`
- `fix-login-redirect-loop.md`
- `refactor-extract-validation.md`
- `add-search-to-dashboard.md`

## Lifecycle

```
Opus decomposes task
    |
Create .hyperflow/tasks/<task-name>.md  (status: in-progress)
    |
Worker executes → update Progress, check off Sub-tasks
    |
Worker done → set status: in-review
    |
Reviewer approves → status: completed → DELETE the file
    |
Reviewer rejects → status: in-progress, add notes to Progress
```

**Key rules:**
- Create the task file BEFORE dispatching the worker
- Update progress after each worker batch completes
- Delete immediately on completion — don't accumulate completed tasks
- Tasks spanning multiple sessions persist with full context for the next session

## Session Resume

On session start, check `.hyperflow/tasks/` for existing files:

- If `status: in-progress` or `status: blocked` files exist:
  - Read all active task files
  - Present summary: "Found N incomplete tasks from previous session"
  - Ask: "Continue these tasks or start fresh?"
  - **Continue** → resume using Progress + Sub-tasks to determine next step
  - **Start fresh** → delete all task files

## Integration with Orchestrator (Layer 3)

1. Create one task file per top-level sub-task — not one per worker dispatch
2. Sub-tasks within each file track finer-grained progress
3. When dispatching a worker, include the task file's Learnings in the worker prompt
4. After worker returns, update Progress and check off completed sub-tasks
5. After reviewer approves, delete the task file

## Directory Structure

```
.hyperflow/
├── tasks/            # Active task tracking (auto-cleaned)
│   ├── implement-auth.md
│   └── fix-redirect.md
├── profile.md
├── architecture.md
├── conventions.md
├── dependencies.md
├── testing.md
├── git-workflow.md
└── .checksums
```

## Constraints

- Maximum 10 active task files — if more, decompose differently
- Task files are gitignored (`.hyperflow/` is already gitignored)
- Don't track trivial tasks (single-file renames, one-line fixes) — only tasks with real sub-steps
- Reusable learnings from `Learnings` section feed into session-memory when the insight applies beyond this task
