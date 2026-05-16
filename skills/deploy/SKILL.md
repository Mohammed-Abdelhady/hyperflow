---
name: deploy
description: |
  Use when ready to ship — runs pre-push gates (lint, typecheck, build, tests, security sweep), commits, releases, and pushes. Standalone, never auto-invoked. Push always requires explicit confirmation.
  Trigger with /hyperflow:deploy, "ship it", "ready to push", "release", "cut a release", "deploy".
allowed-tools: Read, Write, Edit, Bash(git:*), Bash(npm:*), Bash(pnpm:*), Bash(./scripts/*:*), Glob, Grep
argument-hint: ""
version: 3.1.2
author: Mohammed Abdelhady <abdelhadycongar@gmail.com>
license: MIT
compatibility: Designed for Claude Code
tags: [release, ci, automation, push-gates]
---

# Deploy

No gate skipped, no failure ignored. If any gate fails, halt and report. Never `--no-verify`. Never bypass.

## Step 1 — Survey State

- `git status` — track uncommitted changes for the commit step
- `git log origin/<branch>..HEAD --oneline` — what's ahead
- Detect package manager and project type from `.hyperflow/profile.md` and root files

## Step 2 — Quality Gates (halt on first failure)

Run gates in order. Print `Gate <n> — <name>` before each.

**Gate A — Lint**

Dispatch `Implementer — running lint`.
- Detect — `npm run lint` / `pnpm lint` / `bun run lint` / `yarn lint` / `eslint .`
- On failure — auto-fix via `--fix`, re-run once. Still failing → halt.
- Skip silently if no lint script.

**Gate B — Typecheck**

- Detect — `tsc --noEmit` / `npm run typecheck` / project-specific
- Skip silently if not a typed project. Halt on failure (no auto-fix).

**Gate C — Build**

- Detect — `npm run build` / `pnpm build` / `bun run build`
- Skip silently if no build script. Halt on failure.

**Gate D — Tests**

- Detect runner from `.hyperflow/testing.md` (vitest, jest, playwright, pytest, etc.)
- Run full suite — not just affected. Halt on failure.

See [quality-gates.md](references/quality-gates.md) for gate details.

## Step 3 — Security Sweep

Dispatch `**Reviewer** — security sweep on staged + recent changes` with model: opus.

Per [security.md](references/security.md), scan for hardcoded secrets, API keys, private keys, connection strings. If any found → halt with `SECURITY_VIOLATION:` marker.

## Step 4 — Commit

- Worker-introduced fixes from Step 2 → commit automatically with a conventional commit message.
- Pre-existing user-owned uncommitted changes → use `AskUserQuestion` to confirm inclusion. Per DOCTRINE rule 8, mark a recommended option:

  ```
  Include uncommitted user changes in this commit?
    Include (Recommended) — your local work + the pre-push fixes ship together
    Exclude               — commit only the worker fixes; user changes stay local
  ```

- **Never** add `Co-Authored-By: Claude` in commit messages — see [git-workflow.md](references/git-workflow.md).

## Step 5 — Release

- `scripts/release.sh` exists → run it.
- `release-please` / `changesets` / similar detected → use it.
- "Nothing to release" or no releasable commits → skip.
- Otherwise → skip (user releases manually).

## Step 6 — Push (confirmation required · STRUCTURAL GATE)

Use `AskUserQuestion`. Per DOCTRINE rule 8, mark a recommended option — but the recommendation depends on gate state. If all gates passed and the diff looks clean, recommend `Push`; if anything was marginal (test flakiness, large diff, etc.), recommend `Hold`.

```
Push to origin/<branch>?
  Push (Recommended)  — all gates pass · safe to ship
  Hold                — keep local; you can push later
```

- **Never force-push to main or master.**
- On yes — `git push`, then `git push --tags` if release created tags.

## Step 7 — Output

```
── Ship Result ───────────────────
Branch: <name>
Gates: lint pass · typecheck pass · build pass · tests pass (<n> passed)
Security: pass
Commit: <sha> <message>
Release: v<x.y.z> (or skipped)
Push: confirmed (or held)
──────────────────────────────────
```

On gate failure:

```
── Ship Result ───────────────────
Branch: <name>
Gates: lint pass · typecheck fail · tests skipped · build skipped
  typecheck: 3 errors in src/auth/middleware.ts
Halted at Gate B
──────────────────────────────────
```

Use `pass` / `fail` / `skipped` as plain words — no `✓` / `✗` / `—` symbols.

## Anti-patterns

- `--no-verify`, `--no-gpg-sign`, bypassing hooks
- Ignoring failing tests
- Force-pushing to main
- Auto-pushing without explicit confirmation
- Committing `Co-Authored-By: Claude`

## Memory

After successful ship, append to `.hyperflow/memory/patterns.md` if any new pattern was confirmed during gates. Skip if nothing new.

## Doctrine

Full rules in [DOCTRINE.md](references/DOCTRINE.md). Output style in [output-style.md](references/output-style.md).

## Overview

`/hyperflow:deploy` runs the pre-push gates (lint → typecheck → build → tests → security sweep), composes any worker-introduced fixes into a clean commit, runs the release script if present, and asks before pushing. Standalone — never auto-invoked from the chain. Push always requires an explicit `AskUserQuestion` confirmation. Never bypasses hooks, never force-pushes to main, never adds AI attribution to commits.

## Prerequisites

- Git repository with a remote configured (for the push step).
- Lint / typecheck / build / test scripts detectable in `package.json` or via `.hyperflow/testing.md`. Missing scripts are skipped silently (not failed).
- `scripts/release.sh` (or `release-please` / `changesets`) optional — if present, runs at Step 5; otherwise release is user-managed.
- For security sweep: a thinking-tier model (Opus 4.7) available. Sweep is mandatory; missing model = halt.

## Instructions

The 7 numbered steps live in [Step 1 — Survey State](#step-1--survey-state) through [Step 7 — Output](#step-7--output) above. Summary:

1. Survey state (`git status`, ahead-of-remote count, project type from `.hyperflow/profile.md`).
2. Run quality gates A-D (lint, typecheck, build, tests) — halt on first failure.
3. Opus security sweep on staged + recent changes — halt on `SECURITY_VIOLATION`.
4. Commit (auto for worker fixes; `AskUserQuestion` for pre-existing uncommitted user changes).
5. Release (`scripts/release.sh` or detected tool; skip if no releasable commits).
6. Ask `AskUserQuestion` for push confirmation — never auto-push, never force-push to main.
7. Print structured ship result.

## Output

See the ship result block in [Step 7 — Output](#step-7--output) above. Two formats: success (all gates pass, listed inline) and failure (halt at first failing gate, listed in order). Always uses plain words (`pass` / `fail` / `skipped`) — no decorative symbols.

## Error Handling

| Failure | Behavior |
|---|---|
| Gate A (lint) fails | Auto-retry once with `--fix`. Still failing → halt with error count. |
| Gate B (typecheck) fails | Halt immediately. No auto-fix — typecheck errors require human eyes. |
| Gate C (build) fails | Halt with build output. Pre-existing build issues likely pre-date the change set. |
| Gate D (tests) fail | Halt with failing test names. Do NOT skip failing tests. Do NOT increase timeout. |
| Security sweep finds secrets | Halt with `SECURITY_VIOLATION:` marker and the file:line. User decides remediation (revert the secret + rotate the credential). |
| `scripts/release.sh` says "nothing to release" | Skip release; print `Release: skipped (nothing to release)`. Push step still fires for non-release commits. |
| Push rejected (non-fast-forward) | Refuse to force-push. Print: `Push rejected — branch is behind origin. Pull/rebase first.` |
| Headless / non-interactive | Refuse push step entirely. Print structured result with `Push: held — interactive confirmation required`. |
| Pre-existing uncommitted user changes | Use `AskUserQuestion` to ask whether to include or exclude from the commit. Default: include. |

## Examples

### Clean release path

```
/hyperflow:deploy

Gate A — Lint
Implementer — running lint
Gate B — Typecheck
Gate C — Build
Gate D — Tests
**Reviewer** — security sweep on staged + recent changes

? Push to origin/main?
   Push (Recommended) — all gates pass · safe to ship
   Hold               — keep local; you can push later

[user picks Push]

── Ship Result ───────────────────
Branch: main
Gates: lint pass · typecheck pass · build pass · tests pass (147 passed)
Security: pass
Commit: dc38564 fix(skills): marketplace validator compliance
Release: v3.1.2
Push: confirmed
──────────────────────────────────
```

### Gate failure halts the pipeline

```
/hyperflow:deploy

Gate A — Lint
Implementer — running lint
Lint failed: 3 errors in src/auth/middleware.ts
Auto-fix attempted... still failing.
Halted at Gate A.

── Ship Result ───────────────────
Branch: main
Gates: lint fail · typecheck skipped · build skipped · tests skipped
  lint: 3 errors in src/auth/middleware.ts (unused vars, missing return type)
Halted at Gate A
──────────────────────────────────
```

### Security violation

```
/hyperflow:deploy

Gates pass: lint · typecheck · build · tests
**Reviewer** — security sweep
SECURITY_VIOLATION: src/config/email.ts:12 — hardcoded SendGrid API key (SG.xxx...)

Halted before commit. Rotate the credential and remove the literal from source before retrying.
```

## Resources

- [DOCTRINE.md](references/DOCTRINE.md) — orchestration rules (especially #8 push confirmation gate).
- [quality-gates.md](references/quality-gates.md) — full lint/typecheck/build/test policy.
- [security.md](references/security.md) — security sweep policy and blocklists.
- [git-workflow.md](references/git-workflow.md) — branch/commit conventions, no AI attribution rule.
- [output-style.md](references/output-style.md) — ship result formatting.
