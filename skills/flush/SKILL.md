---
name: flush
description: |
  Use when the user wants to manually flush a deferred-commit queue from a prior or interrupted chain. Reads .hyperflow/commits-queue/manifest.json, fast-forwards the staging branch onto the user's branch, deletes staging, clears the queue. Recovery interface when a chain crashed before its Step 4 auto-flush ran.
  Trigger with /hyperflow:flush, hyperflow flush, "flush pending commits", "flush queue", "apply staged commits", "where are my commits".
allowed-tools: Read, Bash(git:*), Bash(ls:*), Bash(cat:*), Bash(rm:*), Bash(bash:*), Bash(python3:*), Bash(scripts/*:*)
argument-hint: "[--dry-run | status]"
version: 5.14.0
license: MIT
compatibility: Claude Code · Codex · OpenCode · Grok · Antigravity (git + project-local queue)
tags: [git, deferred-commits, recovery, lifecycle]
---

# Flush

Manually flush the deferred-commit queue from a chain that ran with `commit-when=end`. Normally `/hyperflow:dispatch` calls `scripts/flush-commits.sh` at its Step 4 wrap-up; this skill exists for the case where the chain was interrupted (crash, kill, context loss) before the auto-flush ran.

Portable hosts accept `/hyperflow:flush` and `hyperflow flush` equally. Semantic ops: [runtime-contract.md](../hyperflow/runtime-contract.md) (`shell`, `edit` — no provider-specific commit APIs).

## Subcommands

| Subcommand | Description |
|---|---|
| (no arg) | Flush the queue — fast-forward staging onto the user's branch, delete staging, clear queue |
| `--dry-run` | Show what would be flushed without mutating git or the queue |
| `status` | Report queue presence, branch names, commit count, and whether staging still exists — read-only |

## What gets flushed

`.hyperflow/commits-queue/manifest.json` tracks the chain's `user_branch`, `staging_branch` (always `hyperflow/staging-<chain-id>`), and the list of queued commits with SHAs and messages. Flush replays them via `git merge --ff-only` so:

- All N commits land on the user's branch with original SHAs preserved
- Order is chronological (queue-time order)
- Original commit messages are preserved
- Original file-to-message mapping is preserved (each commit touched exactly the files its sub-task touched)

Hooks: queue-time commits already ran hooks on the staging branch (no `--no-verify`, ever). Fast-forward merge does not re-run hooks; quality gates already ran per sub-task in dispatch.

## Script resolution (provider-neutral)

Resolve `flush-commits.sh` with the first existing path:

1. `$CODEX_PLUGIN_ROOT/scripts/flush-commits.sh`
2. `$CLAUDE_PLUGIN_ROOT/scripts/flush-commits.sh`
3. `$OPENCODE_PLUGIN_ROOT/scripts/flush-commits.sh`
4. `$GROK_PLUGIN_ROOT/scripts/flush-commits.sh`
5. `$ANTIGRAVITY_PLUGIN_ROOT/scripts/flush-commits.sh`
6. `$CURSOR_PLUGIN_ROOT/scripts/flush-commits.sh`
7. Plugin root derived from this skill file: `../../scripts/flush-commits.sh` relative to `skills/flush/`
8. `$PROJECT_ROOT/scripts/flush-commits.sh` if the project vendors the script

When the script is found and the host exposes a **shell** op: run  
`bash <resolved-script> <project-root> [--dry-run]`  
and print the script's stdout/stderr verbatim (plus a one-line skill status footer).

When the script is **missing** but `shell` + `git` are available: run the **portable recovery procedure** below (same semantics as the script). Do not claim Claude-only plugin paths are required.

When `shell` / `git` is unavailable: print the queue `status` block and exact manual commands for the user; do not invent a successful flush.

## Portable recovery procedure (inline, matches the script)

Use when the script cannot be resolved. All steps are ordinary git + filesystem ops:

1. **Status / dry-run path:** if `manifest.json` is absent → print `No queue to flush.` and stop (exit success).
2. Read `user_branch`, `staging_branch`, and `commits` from `.hyperflow/commits-queue/manifest.json` (host read / `python3 -c` JSON — no proprietary APIs).
3. If `commits` is empty → delete staging branch if present, remove `.hyperflow/commits-queue/`, print empty-queue notice, stop.
4. If staging branch is missing → print warning, clear stale queue dir, stop (exit success). Leave no half-deleted user branch.
5. `--dry-run` / `status` only: list `git log --oneline <user_branch>..<staging_branch>` (or commit messages from the manifest if git log fails); **do not** merge, delete, or clear.
6. Flush path:
   - `git checkout <user_branch>` if HEAD is elsewhere (if checkout fails → surface error; leave queue intact).
   - `git merge --ff-only <staging_branch>`.
   - On success: `git branch -D <staging_branch>`, remove `.hyperflow/commits-queue/`, print flushed commit list.
   - On **fast-forward failure** (user branch diverged): **preserve** staging branch and the entire queue/manifest. Do **not** reset, force-merge, rebase automatically, or delete the queue. Print recovery options and exit non-zero.

### Divergence recovery (user acts; skill does not destroy state)

```
flush: fast-forward failed — user branch diverged from staging.
  staging:  hyperflow/staging-<chain-id>  (preserved)
  manifest: .hyperflow/commits-queue/manifest.json  (preserved)
Recovery options (pick one manually):
  1. git rebase hyperflow/staging-<chain-id>
  2. git cherry-pick <user_branch>..<staging_branch>
Then re-run /hyperflow:flush (or hyperflow flush) if the queue should clear after a successful manual apply —
or delete the staging branch + queue only after commits are safely on the user branch.
```

Never force-push. Never `--no-verify`. Never `git reset --hard` as part of flush recovery.

## Flow

1. Parse args: bare flush · `--dry-run` · `status`.
2. Confirm `.hyperflow/commits-queue/manifest.json` exists. If not → `No queue to flush.` and stop.
3. Resolve flush script (provider-neutral list above). Prefer script; else portable procedure.
4. Run via host `shell` when available; print script or procedure output.
5. Print a compact **Flush status** footer:

```
── Flush ─────────────────────────────
Queue:     present | absent
User:      <user_branch>
Staging:   <staging_branch> (exists | missing)
Commits:   N
Result:    flushed | dry-run | diverged (preserved) | empty | no-queue | error
──────────────────────────────────────
```

## Overview

`/hyperflow:flush` is the user-facing handle for deferred-commit recovery. Most users never call it — dispatch Step 4 wrap-up runs the same mechanism automatically when hooks and the chain complete. This skill exists for crash recovery and for hosts where the operator re-enters after an interrupted `commit-when=end` chain.

## Prerequisites

- `.hyperflow/commits-queue/manifest.json` from a prior chain with `commit-when=end` (or report no-queue).
- Git repository; ability to check out the manifest's `user_branch`.
- Shell/git ops available for the actual merge (otherwise status-only + manual command list).

## Error Handling

| Failure | Behavior |
|---|---|
| No manifest file present | Print `No queue to flush.` Exit success. |
| Staging branch missing | Warning; clear stale manifest/queue. Exit success. |
| Fast-forward not possible (divergence) | Surface git error + recovery suggestions. **Leave staging branch + manifest intact.** Exit non-zero. No destructive reset. |
| User on a different branch | Check out manifest `user_branch`; if checkout fails, surface error and leave queue intact. |
| Flush script not found | Run portable recovery procedure when git/shell available; else print status + manual commands. |
| Shell op unavailable | Read-only `status` from the manifest; print manual git commands. Do not claim flush succeeded. |
| `git merge` / checkout fails for other reasons | Preserve queue + staging; print stderr; exit non-zero. |

## Examples

### Dry-run before flushing

```
/hyperflow:flush --dry-run

flush-commits (DRY RUN): would fast-forward 7 commits from hyperflow/staging-2026-05-17-1430 onto feat/auth-refactor
abc1234 feat(auth): T7 wire login handler
def5678 feat(auth): T6 add session middleware
…
── Flush ─────────────────────────────
Queue:     present
User:      feat/auth-refactor
Staging:   hyperflow/staging-2026-05-17-1430 (exists)
Commits:   7
Result:    dry-run
──────────────────────────────────────
```

### Recovery after crash

```
You: hyperflow flush

flush-commits: flushed 7 commits onto feat/auth-refactor
abc1234 feat(auth): T7 wire login handler
…
── Flush ─────────────────────────────
Queue:     cleared
User:      feat/auth-refactor
Staging:   deleted
Commits:   7
Result:    flushed
──────────────────────────────────────
```

### Divergence (state preserved)

```
You: /hyperflow:flush

flush-commits: fast-forward failed — user branch diverged from staging.
flush-commits: staging branch hyperflow/staging-2026-05-17-1430 preserved for manual resolution.
── Flush ─────────────────────────────
Queue:     present (preserved)
User:      feat/auth-refactor
Staging:   hyperflow/staging-2026-05-17-1430 (exists)
Commits:   7
Result:    diverged (preserved)
──────────────────────────────────────
```

### Status only

```
/hyperflow:flush status

── Flush ─────────────────────────────
Queue:     present
User:      feat/auth-refactor
Staging:   hyperflow/staging-2026-05-17-1430 (exists)
Commits:   7
Result:    status
──────────────────────────────────────
```

## Resources

- [`scripts/flush-commits.sh`](../../scripts/flush-commits.sh) — flush mechanism (when packaged with the plugin).
- [`scripts/queue-commit.sh`](../../scripts/queue-commit.sh) — queue-write side called by dispatch during the chain.
- [runtime-contract.md](../hyperflow/runtime-contract.md) — portable `shell` / honest failure reporting.
- [DOCTRINE.md Layer 8](../hyperflow/DOCTRINE.md#layer-8-git-workflow) — `commit-when` timing rules.
- [chain-router.md](../hyperflow/chain-router.md) — dispatch owns deferred commits; this skill is recovery only.
