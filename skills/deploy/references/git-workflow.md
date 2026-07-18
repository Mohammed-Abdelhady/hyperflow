# Git Workflow

Automated git operations integrated into the orchestrator cycle. Auto-commit is on by default.

All git invocations use semantic `shell` (never a hard-coded single-host shell tool name). Structural questions use `structured_question` with Hyperflow Question fallback per [runtime-contract.md](../../hyperflow/runtime-contract.md). Staging and commit messages use only observed diffs and task files — never fabricated SHAs.

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
    |-- On (default) -> commit with descriptive message
    |-- Off -> stage changes, skip commit
    |
... all tasks done ...
    |
Final review passes
    |
structured_question: audit / deploy / (optional) PR gates
```

## Rules

1. **Never commit to main/master directly.** Create a feature branch first. Branch naming: `feat/<short-description>`, `fix/<short-description>`, `refactor/<short-description>`.
2. **Commit per sub-task, not per batch.** Every sub-task that the dispatch phase reviews and approves produces its own commit. A batch of 3 parallel sub-tasks produces 3 commits, not 1. This keeps history bisectable, makes reverts surgical, and prevents an unrelated regression from being co-mingled with an unrelated change.
3. **Commit immediately after the per-sub-task reviewer returns `PASS`.** Order within a batch: worker writes → Reviewer approves → commit that sub-task's files only → move on. Quality gates run once at the end of the batch over the cumulative state; if gates fail, fix-commits sit on top (don't amend earlier per-task commits).
4. **Follow project commit conventions.** Read provider-appropriate project instructions (`AGENTS.md`, `CLAUDE.md`, or nearest host instruction file) plus commitlint config when present. Default to conventional commits (`feat:`, `fix:`, `refactor:`, etc.) — type chosen from the sub-task's nature.
5. **No LLM attribution anywhere in the artefact.** Never add "Co-Authored-By: Claude" (or any LLM trailer). Never reference "Claude" / "AI" / "assistant" / "the LLM" as a subject performing an action in commit messages, PR descriptions, rebase notes, code comments, doc prose, or skill bodies. Describe what changed, not who made it. Product names used as named tools (`claude` CLI, `Claude Code` platform, `CLAUDE.md` filename) are fine — banned use is only as a *narrative subject*. See DOCTRINE rule 9 for the full statement.
6. **Stage only the files this sub-task touched.** Use `git add <specific-files>` via `shell` — never `git add -A` or `git add .`. The Planner's per-sub-task file list (from `/hyperflow:plan`) IS the staging list.
7. **Don't push automatically.** Commit locally. Push authority is owned by `/hyperflow:deploy` Step 6 (see Push Authority below). Dispatch never force-pushes and never ships without deploy's gate / pre-election path.

## Push Authority (deploy-owned)

| Condition | Behavior |
|---|---|
| `push=auto` (pre-elected) | Plain `git push` (+ tags if release created them). Consent already recorded; do not re-ask |
| `push=never` | Hold local; print hold line; do not call `git push` |
| `push=ask` (default / standalone deploy) | Fire `structured_question` binary gate: `Push` / `Hold` — **no** `(Recommended)` marker |
| Structured UI unavailable | Hyperflow Question chat block + end turn; no push until answer |
| Headless / no interactive channel | `Push: held — interactive confirmation required`; no push |

**Hard bans (every host, every `push` value):**

- **Never** `git push --force` / `--force-with-lease` to `main` or `master`.
- **Never** `--no-verify`, `--no-gpg-sign`, or any hook bypass.
- Non-fast-forward remote rejection → surface error and stop; do **not** escalate to force-push.
- Provider adaptation cannot invent a push path that skips this table.

```text
Hyperflow Question
Push to origin/<branch>?

1. Push — all gates pass · safe to ship
2. Hold — keep local; you can push later
```

## Auto-Commit Toggle

**On (default):** After each approved task, the orchestrator commits with a descriptive message.

**Off:** The orchestrator stages changes but does not commit. User commits manually.

### How to disable

Any of these work:

- In project instructions (`AGENTS.md` / `CLAUDE.md`): `hyperflow: auto-commit off`
- In conversation: "don't auto-commit" or "hyperflow: auto-commit off"
- Per-task: "do this but don't commit"

### How to re-enable

- In conversation: "hyperflow: auto-commit on"
- Removing the project-instruction line

## Commit Message Format

The orchestrator generates the commit message for each sub-task immediately after its reviewer returns `PASS`. Inputs to the message:

1. Project conventions (`AGENTS.md` / `CLAUDE.md` / commitlint config)
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

By the time `/hyperflow:dispatch` reaches Step 5 (End of chain), every approved sub-task is already its own commit. There is no end-of-session "wrap-up commit" — only the per-task commits made along the way, plus any small fix-commits that landed because a quality gate caught something.

The dispatch skill then asks the user via `structured_question` (Hyperflow Question fallback) before stopping:

1. **Run `/hyperflow:audit` on the changes?** — binary. Audit gives an outside-eye L3 review on the cumulative diff.
2. **Run `/hyperflow:deploy` (full gates + commit + push)?** — binary. Deploy is independent and asks its own push-confirmation gate at Step 6.
3. **Open a pull request?** — when `pr=ask` (default on **every** dispatch). Full contract: [`../../dispatch/references/pr-exit.md`](../../dispatch/references/pr-exit.md). Frontend / ui / mobile / creative surfaces **require screenshots** in the PR body (auto-capture or user-supplied); block `gh pr create` until ≥1 image is on the branch under `docs/pr-media/<slug>/`.

The orchestrator does **NOT** auto-invoke audit or deploy. PR opens only on explicit yes / `pr=auto`. Binary gates carry **no** `(Recommended)` marker.

If you want to keep working in the branch instead, questions accept `No` and dispatch stops cleanly with the per-task commits in place.

## Squashing (optional, manual)

If you prefer one commit per feature instead of per-task on the published branch, squash manually before opening the PR:

```bash
git rebase -i origin/main   # mark per-task commits as `squash` / `fixup`
```

Hyperflow does not squash automatically — surgical history is the default, not a flat blob.

## Hook / commit failure (preserve state)

If a commit is rejected by a hook, GPG policy, or other pre-commit failure:

1. **Stop.** Do not retry with `--no-verify` or any bypass flag.
2. **Preserve** the working tree and index as the hook left them (do not hard-reset, force-clean, or invent recovery commits).
3. Surface the full stderr from `shell` and the failing hook name when known.
4. User decides remediation; the chain does not silently continue past a failed commit.

Same rule for deploy gate failures: halt and report; never skip remaining integrity checks by weakening git flags.

## Conflict Handling

If a commit fails due to conflicts:

1. The orchestrator identifies the conflicting files
2. Dispatches a Worker (`spawn` or labelled inline worker) to resolve conflicts
3. A separate Reviewer reviews the resolution (workers never self-review)
4. Commits the merge resolution only after PASS — still without `--no-verify`
