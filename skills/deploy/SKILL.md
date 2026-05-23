---
name: deploy
description: |
  Use when ready to ship — runs pre-push gates (lint, typecheck, build, tests, security sweep), commits, releases, and pushes. Standalone, never auto-invoked. Push always requires explicit confirmation.
  Trigger with /hyperflow:deploy, "ship it", "ready to push", "release", "cut a release", "deploy".
allowed-tools: Read, Write, Edit, Bash(git:*), Bash(npm:*), Bash(pnpm:*), Bash(./scripts/*:*), Glob, Grep
argument-hint: ""
version: 3.1.2
license: MIT
compatibility: Designed for Claude Code
tags: [release, ci, automation, push-gates]
---

# Deploy

No gate skipped, no failure ignored. If any gate fails, halt and report. Never `--no-verify`. Never bypass.

## Per-Step Agent Map

| Step | Sub-phase | Worker tier | Thinking tier | Notes |
|---|---|---|---|---|
| 1a | Repo-state scan | Worker A (git status), Worker B (git log) | Sonnet | — |
| 1b | Tool detection | Worker A (profile.md + lockfiles), Worker B (testing.md + devDeps) | Sonnet | — |
| 2a | Lint gate | Worker A (linter), Worker B (formatter) | Sonnet | — |
| 2b | Typecheck gate | Worker A (root tsc), Worker B (per-package tsc) | Sonnet | — |
| 2c | Build gate | Worker A (prod build), Worker B (dev build) | Sonnet | — |
| 2d | Test gate | Worker A (unit), Worker B (integration/E2E) | Sonnet | — |
| 3a | Secrets scan | Worker A (diff pattern), Worker B (file pattern) | **Opus** | — |
| 3b | Dependency audit | Worker A (CVE audit), Worker B (license check) | Sonnet | — |
| 4 | Commit | single Worker | Sonnet | atomic-exempt (DOCTRINE 12.2) |
| 5a | Release execution | single Worker | Sonnet | atomic-exempt (DOCTRINE 12.2) |
| 5b | Version sync | Worker A (manifests), Worker B (changelog) | Sonnet | — |
| 6 | Push gate | AskUserQuestion | — | structural gate; atomic-exempt |
| 7 | Output | single print | — | atomic-exempt (§12.1) |

## Step 1 — Survey State

Sub-phases run in parallel (P1).

### Step 1a — Repo-state scan

Two Workers in parallel:

- Worker A — `git status --short` — uncommitted changes, staged files
- Worker B — `git log origin/<branch>..HEAD --oneline` — commits ahead of remote; detect branch name

Sonnet Reviewer — verdict on repo state (clean / has uncommitted / ahead by N). If detached HEAD or no remote configured → halt with reason.

### Step 1b — Tool detection

Two Workers in parallel:

- Worker A — Read `.hyperflow/profile.md` for package manager and project type; fallback: inspect `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`
- Worker B — Check `.hyperflow/testing.md` for test runner; fallback: detect from `package.json` devDependencies (`vitest`, `jest`, `playwright`, `pytest`, etc.)

Sonnet Reviewer — produce a single tool manifest (package manager, test runner, typed-project flag, build script presence). Used by Step 2 gates.

## Step 2 — Quality Gates (halt on first sub-phase failure)

Each sub-phase is a named gate. Sub-phases run sequentially — halt at the first `NEEDS_REVISION` verdict to avoid compounding failures. Print `Gate <letter> — <name>` before each.

### Step 2a — Lint gate

Two Workers in parallel:

- Worker A — Detect and run primary linter: `npm run lint` / `pnpm lint` / `bun run lint` / `eslint .`. On failure: auto-fix via `--fix`, re-run once; report final error count.
- Worker B — Detect and run formatter check: `prettier --check .` / `biome check .` / equivalent. Report diff count.

Sonnet Reviewer — verdict:
- `PASS` — both clean or both absent
- `NEEDS_REVISION` — lint auto-fix still failing or formatter drift found → halt
- `ESCALATE` — config errors preventing execution

### Step 2b — Typecheck gate

Two Workers in parallel:

- Worker A — Root typecheck: `tsc --noEmit` / `npm run typecheck`. Skip if not a typed project (per Step 1b tool manifest).
- Worker B — Per-package typecheck if workspace detected (pnpm/yarn workspaces): iterate packages with `tsc --noEmit` in each. Skip if single-package repo.

Sonnet Reviewer — verdict:
- `PASS` — no type errors or project is untyped
- `NEEDS_REVISION` — type errors found (no auto-fix; halt for human review)
- `ESCALATE` — tsconfig missing or malformed

### Step 2c — Build gate

Two Workers in parallel:

- Worker A — Production build: `npm run build` / `pnpm build` / `bun run build`. Capture output; report size or artifact path if printed.
- Worker B — Dev/preview build if a separate script exists (`npm run build:dev`, `vite build --mode development`, etc.). Skip if no separate dev-build script.

Sonnet Reviewer — verdict:
- `PASS` — production build succeeds
- `NEEDS_REVISION` — production build fails → halt with output
- `ESCALATE` — build tool absent or script missing (skip silently, not failure)

### Step 2d — Test gate

Two Workers in parallel:

- Worker A — Unit tests: run full unit suite per runner from Step 1b (vitest, jest, pytest, cargo test, etc.). Full suite — not just affected. Report count.
- Worker B — Integration / E2E tests if runner detected separately (playwright, cypress, etc.). Skip if no integration runner found.

Sonnet Reviewer — verdict:
- `PASS` — all tests pass (or integration absent)
- `NEEDS_REVISION` — failing tests → halt with failing test names. Do NOT skip. Do NOT increase timeout.
- `ESCALATE` — runner misconfigured or no tests found and test runner is declared

See [quality-gates.md](references/quality-gates.md) for gate details.

## Step 3 — Security Sweep

Sub-phases run in parallel (P1).

### Step 3a — Secrets and keys scan

Two Workers in parallel:

- Worker A — Pattern scan staged + recent diff for hardcoded secrets: API keys, private keys, connection strings, tokens. Use `git diff HEAD~1..HEAD` as scan surface.
- Worker B — File-level scan of files modified in this changeset for common secret patterns (SG., sk-, ghp_, AKIA, BEGIN RSA PRIVATE KEY, etc.).

**Reviewer** — Opus security sweep — aggregate findings from 3a Workers. If any secret found → halt immediately with `SECURITY_VIOLATION: <file>:<line> — <pattern>`. No auto-remediation — user must rotate + remove.

### Step 3b — Dependency audit

Two Workers in parallel:

- Worker A — `npm audit --audit-level=high` / `pnpm audit` / `pip-audit` / `cargo audit`. Report critical and high CVEs only.
- Worker B — License check: scan new dependencies added in this changeset for prohibited licenses (GPL in a proprietary project, etc.) if `.hyperflow/profile.md` declares a license policy.

Sonnet Reviewer — verdict:
- `PASS` — no critical/high CVEs; no license violations
- `NEEDS_REVISION` — critical CVE found → halt and surface CVE IDs
- `ESCALATE` — audit tool absent → skip silently (not a failure); missing license policy → skip

## Step 4 — Commit

Atomic — single Worker → Reviewer pair with no parallel angles. Exempt from sub-phase decomposition per DOCTRINE 12.2 atomic exemption.

- Worker-introduced fixes from Step 2 → commit automatically with a conventional commit message.
- Pre-existing user-owned uncommitted changes → use `AskUserQuestion` to confirm inclusion. Per DOCTRINE rule 8, this is a binary action gate — no recommendation marker:

  ```
  Include uncommitted user changes in this commit?
    Include — your local work + the pre-push fixes ship together
    Exclude — commit only the worker fixes; user changes stay local
  ```

- **Never** add `Co-Authored-By: Claude` in commit messages — see [git-workflow.md](references/git-workflow.md).

## Step 5 — Release

Sub-phases run sequentially (5b depends on 5a output).

### Step 5a — Release script execution

Single Worker (no parallel angle — single mechanical action):

- Worker — `scripts/release.sh` exists → run it. `release-please` / `changesets` detected → use it. "Nothing to release" or no releasable commits → skip and record `Release: skipped`.

Sonnet Reviewer — capture output: new version string (if bumped) or skip reason. Feed version to Step 5b.

### Step 5b — Version sync verification

Two Workers in parallel (only runs if 5a produced a new version):

- Worker A — Verify version appears consistently across all manifests: `package.json`, `plugin.json`, `marketplace.json`, any other version-bearing files identified in Step 1b.
- Worker B — Verify CHANGELOG was updated by the release script: check that the new version header exists in `CHANGELOG.md` (or equivalent). Skip if no changelog file.

Sonnet Reviewer — verdict:
- `PASS` — all manifests in sync; changelog updated
- `NEEDS_REVISION` — version mismatch or changelog missing entry → halt
- (Skip entirely if Step 5a returned `Release: skipped`)

## Step 6 — Push (honors `push` pre-election from Scope Step 2.6 · STRUCTURAL GATE when `push=ask`)

Read the `push` arg from chain args (propagated from Scope Step 2.6 when `chain-mode=auto`). Three paths:

**`push=auto`** — push immediately without asking. Print `Push: pre-elected (auto) — pushing branch + tags…`. Run `git push`, then `git push --tags` if release created tags. Skip the `AskUserQuestion` call. Per DOCTRINE rule 8, this is NOT an invented skip — the user already gave consent at Scope Step 2.6.

**`push=never`** — skip the push step entirely. Print `Push: pre-elected (never) — branch held local. Run \`git push\` manually when ready.` Do not call `git push`.

**`push=ask`** (default; also fires when no operational pre-election was made — e.g. deploy invoked standalone) — fire the structural-gate `AskUserQuestion`. Per DOCTRINE rule 8, this is a binary action gate — no recommendation marker on either option.

```
Push to origin/<branch>?
  Push — all gates pass · safe to ship
  Hold — keep local; you can push later
```

- **Never force-push to main or master**, regardless of `push` value. `push=auto` is a plain `git push`; if the remote rejects it (non-fast-forward), surface the error and stop — do NOT add `--force`.
- On yes (or `push=auto`) — `git push`, then `git push --tags` if release created tags.

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

1. Survey state — two sub-phases in parallel: 1a repo-state scan (git status + ahead count), 1b tool detection (package manager, test runner, typed-project flag).
2. Quality gates — four sequential sub-phases, each with 2 parallel Workers + Sonnet Reviewer: 2a lint, 2b typecheck, 2c build, 2d tests. Halt at first `NEEDS_REVISION`.
3. Security sweep — two sub-phases in parallel: 3a secrets/keys scan (Opus Reviewer), 3b dependency audit. Halt on `SECURITY_VIOLATION` or critical CVE.
4. Commit — atomic. Worker fixes auto-committed; `AskUserQuestion` for pre-existing uncommitted user changes.
5. Release — two sequential sub-phases: 5a run release script, 5b verify version sync across manifests.
6. Push gate — atomic structural gate. Honors `push` pre-election (auto/never/ask). `push=ask` fires `AskUserQuestion`. Never force-push to main.
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
   Push — all gates pass · safe to ship
   Hold — keep local; you can push later

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
