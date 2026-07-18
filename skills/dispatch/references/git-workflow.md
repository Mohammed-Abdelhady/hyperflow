# Git Workflow

Automated git operations integrated into the orchestrator cycle. Auto-commit is on by default. Ops are provider-neutral: commits run through host `shell` inside the security blocklist; end-of-chain questions use `structured_question` (or the Hyperflow Question chat fallback per [runtime-contract.md](../../hyperflow/runtime-contract.md)).

## Flow

```
Session starts
    |
Orchestrator: On a feature branch?
    |-- Yes -> continue
    |-- No -> create branch (feat/task-description)
    |
... workers execute tasks ...
    |
Task approved by Reviewer + quality gates pass
    |
Auto-commit?
    |-- On (default) -> commit with descriptive message (hooks ON)
    |-- Off -> stage changes, skip commit
    |
... all tasks done ...
    |
Final review passes
    |
End-of-chain gates (audit / deploy / optional PR) via structured_question
```

## Rules

1. **Never commit to main/master directly.** Create a feature branch first. Branch naming: `feat/<short-description>`, `fix/<short-description>`, `refactor/<short-description>`.
2. **Commit per sub-task, not per batch.** Every sub-task that the dispatch phase reviews and approves produces its own commit. A batch of 3 parallel sub-tasks produces 3 commits, not 1. This keeps history bisectable, makes reverts surgical, and prevents an unrelated regression from being co-mingled with an unrelated change. Cadence can be overridden by chain args (`commit=per-task` default · `per-batch` · `per-task-deferred` · `single` · `none`) but the default surgical history stands.
3. **Commit immediately after the per-sub-task Reviewer returns `PASS`** (when `commit=per-task`). Order within a batch: worker writes → Reviewer approves → commit that sub-task's files only → move on. Quality gates run light at batch end over the cumulative state; if gates fail, fix-commits sit on top (don't amend earlier per-task commits).
4. **Follow project commit conventions.** Read nearest `AGENTS.md` / `CLAUDE.md` / project instruction files and commitlint config for message format. Default to conventional commits (`feat:`, `fix:`, `refactor:`, etc.) — type chosen from the sub-task's nature.
5. **No LLM attribution anywhere in the artefact.** Never add "Co-Authored-By: Claude" (or any LLM trailer). Never reference "Claude" / "AI" / "assistant" / "the LLM" as a subject performing an action in commit messages, PR descriptions, rebase notes, code comments, doc prose, or skill bodies. Describe what changed, not who made it. Product names used as named tools (`claude` CLI, `Claude Code` platform, `CLAUDE.md` filename) are fine — banned use is only as a *narrative subject*. See DOCTRINE rule 9 for the full statement.
6. **Stage only the files this sub-task touched.** Use `git add <specific-files>` — never `git add -A` or `git add .`. The Planner's per-sub-task file list (from `/hyperflow:plan`) IS the staging list.
7. **Don't push automatically.** Commit locally. Push is gated by an explicit structural question in `/hyperflow:deploy` Step 6 (`structured_question` or Hyperflow Question chat block).
8. **Hooks always run.** Never pass `--no-verify` / `--no-gpg-sign` to skip policy. Pre-commit / commit-msg / pre-push hooks execute on every commit path, including `per-task-deferred` staging (`queue-commit.sh`) and flush. If a hook rejects a commit: **stop**, surface the hook error, do not bypass, do not amend prior sub-task commits. User fixes and resume from the affected sub-task.
9. **Deferred recovery (`commit=per-task-deferred`).** Queue N per-task commits on a private staging branch via `scripts/queue-commit.sh` (hooks still on). Flush with `scripts/flush-commits.sh` at wrap-up (or `/hyperflow:flush` after crash). Manifest at `.hyperflow/commits-queue/manifest.json` is authoritative for recovery. Deferred mode is a UX/crash-safety choice — **not** a hook-avoidance path.

## Auto-Commit Toggle

**On (default):** After each approved task, the orchestrator commits with a descriptive message.

**Off:** The orchestrator stages changes but does not commit. User commits manually.

### How to disable

Any of these work:

- In `AGENTS.md` / `CLAUDE.md`: `hyperflow: auto-commit off`
- In conversation: "don't auto-commit" or "hyperflow: auto-commit off"
- Per-task: "do this but don't commit"
- Chain arg: `commit=none`

### How to re-enable

- In conversation: "hyperflow: auto-commit on"
- Removing the project-instruction line
- Chain arg: `commit=per-task` (or omit for default)

## Commit Message Format

The orchestrator generates the commit message for each sub-task immediately after its Reviewer returns `PASS`. Inputs to the message:

1. Project conventions (nearest `AGENTS.md` / `CLAUDE.md`, commitlint config)
2. What the worker actually changed (the diff)
3. The sub-task title + description from the task file (`.hyperflow/tasks/<slug>.md`)
4. The persona stitching for that sub-task (e.g. `[security + api]` ⇒ likely `feat(auth):` or `feat(api):`)

```
feat(auth): add JWT middleware with RS256 verification

Implements auth middleware that validates JWT tokens using RS256.
Includes rate limiting and session refresh logic.
```

Aim for **one logical change per commit**. If a sub-task touched more than one logical concern (rare — usually a scope/planner mistake), split into multiple commits *within* the per-sub-task slot.

## Branch Strategy

| Task type | Branch prefix | Example |
|-----------|--------------|---------|
| New feature | `feat/` | `feat/user-auth` |
| Bug fix | `fix/` | `fix/login-redirect` |
| Refactor | `refactor/` | `refactor/extract-validation` |
| Chore | `chore/` | `chore/update-deps` |

## End of Dispatch (per-task commits already on the branch)

By the time `/hyperflow:dispatch` reaches Step 5 (End of chain), every approved sub-task is already its own commit (unless `commit=single|none|per-task-deferred` altered the landing surface). There is no end-of-session "squash wrap-up commit" by default — only the per-task commits made along the way, plus any small fix-commits that landed because a quality gate caught something, plus the optional `chore(memory):` wrap-up commit.

The dispatch skill then asks the user **up to three** end-of-chain questions in one combined structural gate (`structured_question` when available; otherwise Hyperflow Question chat block + end turn):

1. **Run `/hyperflow:audit` on the changes?** — binary.
2. **Run `/hyperflow:deploy` (full gates + commit + push)?** — binary. Deploy has its own push gate.
3. **Open a pull request?** — when `pr=ask` (default on every dispatch). Frontend/mobile PRs require screenshots — see [pr-exit.md](pr-exit.md).

The orchestrator does **NOT** auto-invoke audit or deploy. PR opens only on yes / `pr=auto`. Binary action gates carry no `(Recommended)` marker.

If you want to keep working in the branch instead, questions accept `No` and dispatch stops cleanly with the per-task commits in place.

## Squashing (optional, manual)

If you prefer one commit per feature instead of per-task on the published branch, squash manually before opening the PR:

```bash
git rebase -i origin/main   # mark per-task commits as `squash` / `fixup`
```

Hyperflow does not squash automatically — surgical history is the default, not a flat blob.


## Conflict Handling

If a commit fails due to conflicts:
1. The orchestrator identifies the conflicting files
2. Dispatches a Worker (`spawn` or labelled inline worker phase) to resolve conflicts
3. A Reviewer reviews the resolution (separate spawn / labelled inline reviewer phase)
4. Commits the merge resolution with hooks enabled

If a commit fails due to **hook rejection** (lint-staged, commitlint, gpg, etc.):
1. Surface the hook output verbatim
2. Stop the chain at that sub-task — do **not** `--no-verify`
3. Leave the working tree / staging branch for the user (or a fix worker) to correct
4. Resume from the affected sub-task after the fix
