---
name: ship
description: Use when the user says "ship it", "ready to push", "release", "deploy", or wants to run pre-push gates (lint, typecheck, build, tests) and then commit/release/push in one flow.
---

# Ship

No gate skipped, no failure ignored. If any gate fails, halt and report — never `--no-verify`, never bypass.

## Step 1: Survey State

- `git status` — track uncommitted changes for the commit step
- `git log origin/<branch>..HEAD --oneline` — what's ahead
- Detect package manager and project type from `.hyperflow/profile.md` and root files

## Step 2: Quality Gates (halt on first failure)

Run gates in order. Print `⚡ [Gate-X: Name]` label before each.

**Gate A — Lint** `⚡ [Gate-A: Lint]`
Dispatch `⚡ [Implementer] Running lint`
- Detect: `npm run lint` / `pnpm lint` / `bun run lint` / `yarn lint` / `eslint .`
- On failure: auto-fix via `--fix`, re-run once. Still failing → halt
- Skip silently if no lint script

**Gate B — Typecheck** `⚡ [Gate-B: Typecheck]`
- Detect: `tsc --noEmit` / `npm run typecheck` / project-specific
- Skip silently if not a typed project. Halt on failure (no auto-fix)

**Gate C — Build** `⚡ [Gate-C: Build]`
- Detect: `npm run build` / `pnpm build` / `bun run build`
- Skip silently if no build script. Halt on failure

**Gate D — Tests** `⚡ [Gate-D: Tests]`
- Detect runner from `.hyperflow/testing.md` (vitest, jest, playwright, pytest, etc.)
- Run full suite — not just affected. Halt on failure

See [quality-gates.md](../hyperflow/quality-gates.md) for gate details.

## Step 3: Security Sweep

Dispatch `⚡ [Reviewer] Security sweep on staged + recent changes` with model: opus.
Per [security.md](../hyperflow/security.md): scan for hardcoded secrets, API keys, private keys, connection strings.
If any found → halt with `SECURITY_VIOLATION:` marker.

## Step 4: Commit

- Worker-introduced fixes from Step 2 → commit automatically with a conventional commit message
- Pre-existing user-owned uncommitted changes → use `AskUserQuestion` to confirm inclusion
- **Never** add `Co-Authored-By: Claude` in commit messages — see [git-workflow.md](../hyperflow/git-workflow.md)

## Step 5: Release

- `scripts/release.sh` exists → run it
- `release-please` / `changesets` / similar detected → use it
- "Nothing to release" or no releasable commits → skip
- Otherwise → skip (user releases manually)

## Step 6: Push (confirmation required)

Use `AskUserQuestion`: "Push to origin/<branch>?" → yes/no.
- **Never force-push to main or master**
- On yes: `git push` then `git push --tags` if release created tags

## Step 7: Output

```
── Ship Result ──
Branch: <name>
Gates: Lint ✓  Typecheck ✓  Build ✓  Tests ✓ (<n> passed)
Security: ✓
Commit: <sha> <message>
Release: v<x.y.z> (or skipped)
Push: ✓ (or held)
─────────────────
```

## Anti-patterns

- `--no-verify`, `--no-gpg-sign`, bypassing hooks
- Ignoring failing tests
- Force-pushing to main
- Auto-pushing without explicit confirmation
- Committing `Co-Authored-By: Claude`

## Memory

After successful ship, append to `.hyperflow/memory/patterns.md` if any new pattern was confirmed during gates. Skip if nothing new.
