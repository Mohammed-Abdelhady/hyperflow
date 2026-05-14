# Git Workflow

Automated git operations integrated into the orchestrator cycle. Auto-commit is on by default.

## Flow

```
Session starts
    |
[Opus] On a feature branch? 
    |-- Yes -> continue
    |-- No -> create branch (feat/task-description)
    |
... workers execute tasks ...
    |
[Opus] Task approved by reviewer + quality gates pass
    |
[Opus] Auto-commit? 
    |-- On (default) -> commit with descriptive message
    |-- Off -> stage changes, skip commit
    |
... all tasks done ...
    |
[Opus] Final review passes
    |
[Opus] Ask: squash into one commit or keep individual?
```

## Rules

1. **Never commit to main/master directly.** Create a feature branch first. Branch naming: `feat/<short-description>`, `fix/<short-description>`, `refactor/<short-description>`.
2. **Commit after each approved task.** Small, focused commits — not one giant commit at the end.
3. **Follow project commit conventions.** Read CLAUDE.md / commitlint config for message format. Default to conventional commits (`feat:`, `fix:`, `refactor:`, etc.).
4. **No Claude attribution.** Never add "Co-Authored-By: Claude" or any Claude reference.
5. **Stage only relevant files.** Use `git add <specific-files>` — never `git add -A` or `git add .`.
6. **Don't push automatically.** Commit locally. Only push when the user explicitly asks.

## Auto-Commit Toggle

**On (default):** After each approved task, Opus commits with a descriptive message.

**Off:** Opus stages changes but does not commit. User commits manually.

### How to disable

Any of these work:

- In CLAUDE.md: `hyperflow: auto-commit off`
- In conversation: "don't auto-commit" or "hyperflow: auto-commit off"
- Per-task: "do this but don't commit"

### How to re-enable

- In conversation: "hyperflow: auto-commit on"
- Removing the CLAUDE.md line

## Commit Message Format

Opus generates commit messages based on:
1. Project conventions (CLAUDE.md, commitlint config)
2. What the worker actually changed
3. The task description from the decomposition

```
feat(auth): add JWT middleware with RS256 verification

Implements auth middleware that validates JWT tokens using RS256.
Includes rate limiting and session refresh logic.
```

## Branch Strategy

| Task type | Branch prefix | Example |
|-----------|--------------|---------|
| New feature | `feat/` | `feat/user-auth` |
| Bug fix | `fix/` | `fix/login-redirect` |
| Refactor | `refactor/` | `refactor/extract-validation` |
| Chore | `chore/` | `chore/update-deps` |

## End of Session

When all tasks are complete:

1. Opus asks: "Keep individual commits or squash?"
2. If squash: combines all commits into one with a summary message
3. If keep: leaves commits as-is
4. Opus does NOT push — waits for user instruction

## Push Flow (Auto-Release)

When the user asks to push, **always run the release script first**:

```
User: "push" / "push changes"
    |
[Opus] Run ./scripts/release.sh (auto-detect bump type from commits)
    |   → Generates CHANGELOG entries from conventional commits
    |   → Bumps version in all manifests (package.json, plugin.json, marketplace.json, README)
    |   → Commits "chore(release): vX.Y.Z"
    |   → Creates annotated git tag vX.Y.Z
    |
[Opus] git push && git push --tags
```

**Rules:**
1. Always release before push — never push without version bump + changelog
2. If release.sh says "Nothing to release" (no new commits since last tag), skip and push directly
3. The release commit is automatic — don't ask for confirmation
4. Push both commits and tags in one go

## Conflict Handling

If a commit fails due to conflicts:
1. Opus identifies the conflicting files
2. Dispatches a Sonnet worker to resolve conflicts
3. Opus reviews the resolution
4. Commits the merge resolution
