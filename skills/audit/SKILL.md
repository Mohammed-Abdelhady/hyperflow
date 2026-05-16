---
name: audit
description: |
  Use when the user wants a code review on recent changes — quality, spec, security, or performance feedback. Triggers a multi-level (L1-L5) review with a thinking-tier reviewer; on NEEDS_FIX, offers to apply findings via /hyperflow:scope.
  Trigger with /hyperflow:audit, "review this change", "review my PR", "audit the diff", "code review".
allowed-tools: Read, Bash(git:*), Glob, Grep, Agent
argument-hint: "[target] [--level 1-5]"
version: 3.1.2
license: MIT
compatibility: Designed for Claude Code
tags: [code-review, quality, multi-level, multi-agent]
---

# Audit

Multi-level code review. Dispatcher — Opus 4.7 (thinking-tier). Workers — Sonnet 4.6.

This skill exercises **Layer 3 (Orchestrator)** and **Layer 9 (Security)**. After the review prints, a **fix gate** asks the user whether to apply the findings — on `Yes`, audit auto-invokes `/hyperflow:scope` with the findings as the spec, which then chains to `/hyperflow:dispatch`.

## Per-Step Agent Map (DOCTRINE rule 12)

| Step | Worker tier | Thinking tier | Notes |
|---|---|---|---|
| 1 — Resolve scope | — | — | Read-only git diff (exempt) |
| 2 — Gather context | Searcher (Sonnet) | **Reviewer** (Opus) verifies coverage | Both tiers |
| 3 — Review | — | **Reviewer** (Opus) at L1–L<n> | Pure thinking |
| 4 — Memory append | Writer (Sonnet) | **Reviewer** (Opus) dedup check | Both tiers |
| 5 — Output | — | — | Print only (exempt) |
| 6 — Fix gate | — | — | `AskUserQuestion` only (exempt — structural gate) |

## Approval Gates

| Gate | When | Format |
|---|---|---|
| Fix gate | Step 6, after NEEDS_FIX or PASS-with-suggestions | `AskUserQuestion` — fix all / criticals only / no |
| Hard halt | Any `SECURITY_VIOLATION` from the reviewer | Stop, surface the finding; no fix gate |

## Inputs

- **Target** — file path, line range, commit SHA, branch, or PR number provided by the user
- **Default (no target)** — `git diff HEAD` + `git diff --staged`
- **Level flag** — `--level 1` through `--level 5` (default — L2)

## Review Levels

Adapted from [review-levels.md](references/review-levels.md):

| L | Name | Checks |
|---|------|--------|
| 1 | Quick | Syntax, obvious bugs, formatting |
| 2 | Standard | L1 + spec compliance, naming, edge cases |
| 3 | Thorough | L2 + cross-file consistency, integration risks, security |
| 4 | Deep | L3 + architecture, scalability, accessibility |
| 5 | Exhaustive | L4 + adversarial probing, perf profiling, alternatives |

Security scan (hardcoded secrets, injection, path traversal, XSS, missing validation) is mandatory at L3+. See [security.md](references/security.md).

## Flow

### Step 1 — Resolve scope

Use the provided target or run `git diff HEAD` + `git diff --staged`. No agent dispatched (read-only git).

### Step 2 — Gather context

Agents — `Searcher` (Sonnet) ⇒ **Reviewer** (Opus).

1. Dispatch `Searcher — gathering context for review` to map referenced files and load relevant project context.
2. Dispatch `**Reviewer** — verifying context coverage` to confirm the Searcher hit the relevant subsystems.

### Step 3 — Review

Agents — **Reviewer** (Opus, thinking-tier).

Dispatch `**Reviewer** — reviewing <scope> at level L<n>`. The Reviewer uses the [reviewer-prompt.md](references/reviewer-prompt.md) template with the diff, level definition, and any applicable spec. Produces structured `[Critical] / [Important] / [Suggestions] / [Praise]` findings.

If any security issue is found at L3+ → emit `SECURITY_VIOLATION:` halt marker immediately. Skip the fix gate; user decides remediation.

### Step 4 — Memory append

Agents — `Writer` (Sonnet) ⇒ **Reviewer** (Opus).

1. Dispatch `Writer — appending durable patterns to .hyperflow/memory/learnings.md` per [memory-system.md](references/memory-system.md).
2. Dispatch `**Reviewer** — memory dedup check` to ensure no duplicate entries land.

### Step 5 — Output (file-first · DOCTRINE rule 8 file-first clause)

The Reviewer's full structured review is **written to a file**, not pasted into chat. Inline review blocks longer than ~10 lines are a doctrine violation — they bury the conversation in unscrollable noise and the user has no editable artefact to point at when planning fixes.

1. Write the review to `.hyperflow/audits/<YYYY-MM-DD-HHmm>-<scope-slug>.md` using the structured format below (see Output Format). The Reviewer agent does this directly via `Write` — the orchestrator does NOT print the review and then save a copy.
2. After the file is written, the orchestrator prints a **short one-block summary** containing only: scope, level, verdict, counts per severity, file path. Example:

```
── Audit Result ──────────────────────
Scope:    main..HEAD (13 files)
Level:    L3
Verdict:  NEEDS_FIX
Findings: 0 Critical · 4 Important · 4 Suggestions · 5 Praise
Written:  .hyperflow/audits/2026-05-16-1730-memory-compaction.md
─────────────────────────────────────
```

No `[Critical]` / `[Important]` body lines in chat. The user opens the file (or the chat host previews it). For `PASS`-clean runs (no Critical/Important), print just the one-line `Audit clean — no fixes needed.` and still write the file with the praise + suggestions list (so the audit history is preserved). Skip the file write only on `SECURITY_VIOLATION` — those need immediate eye-level surfacing; print the finding inline and halt.

### Step 6 — Fix gate (STRUCTURAL GATE · DOCTRINE rule 8)

After the summary prints, the audit skill **MUST** ask the user via `AskUserQuestion` whether to apply the findings. Per DOCTRINE rule 8, this gate always fires when findings exist — autonomy directives do NOT skip it. Defaulting silently is a doctrine violation.

**Skip the gate only when:** verdict is `PASS` with no `[Critical]` or `[Important]` entries (Suggestions-only or Praise-only). Stop after the one-line `Audit clean — no fixes needed.` summary.

**Skip the gate also when:** verdict is `SECURITY_VIOLATION`. Halt and let the user decide.

**Otherwise**, ask:

```
?  Audit findings written to .hyperflow/audits/<timestamp>-<slug>.md — apply fixes?

   Fix all (Recommended)   — Critical + Important + Suggestions via /hyperflow:scope → /hyperflow:dispatch
   Critical + Important    — skip Suggestions, fix the rest
   Critical only           — fix the must-haves, defer the nice-to-haves
   No, leave as-is         — stop; you'll handle manually
```

Recommended option scales with finding mix:
- Any `[Critical]` present → `Fix all (Recommended)` — Critical items can't be deferred
- Only `[Important]` + `[Suggestions]` → `Critical + Important (Recommended)`
- Only `[Suggestions]` → `No, leave as-is (Recommended)` — Suggestions are optional by definition; the gate fires but recommends skipping

**On any "Fix …" choice:**

1. Build a spec file from the chosen findings at `.hyperflow/specs/audit-<YYYY-MM-DD>-<scope-slug>.md`. Each finding becomes a numbered fix section with: file:line, the issue, the reviewer's suggested fix (or "design needed" if no Fix: was provided), and the commit message stub. The spec file is the chain-driving artefact; do NOT paste fix bullets into chat.
2. Invoke `Skill` with `skill: scope` and `args: "chain-mode=auto spec=.hyperflow/specs/audit-<YYYY-MM-DD>-<scope-slug>.md"`.
3. `/hyperflow:scope` will decompose into batches; `/hyperflow:dispatch` will execute them — same per-sub-task commit cadence and per-batch L1–L<n> review as any other chain run.

**On "No":**

Print one line and stop:

```
Audit complete — N findings recorded, no fixes applied. Re-run /hyperflow:audit later or invoke /hyperflow:scope manually if you change your mind.
```

If `AskUserQuestion` cannot be presented (headless mode), print the findings and an error line — never silently auto-fix or silently exit.

## Output Format

```
── Review Result ──────────────────────
Scope: <files / range / commit>
Level: L<n>
Verdict: PASS | NEEDS_FIX | SECURITY_VIOLATION

[Critical]
- file:line — issue + required fix

[Important]
- file:line — issue + recommended fix

[Suggestions]
- file:line — optional improvement

[Praise]
- file:line — what's done well
───────────────────────────────────────
Agents: 1 searcher (sonnet) · 1 reviewer (opus)
```

## Hand-off

- **PASS** (no findings worth fixing) — print `Audit clean`. Suggest `/hyperflow:deploy` if the user is ready to release. Do not auto-ship.
- **NEEDS_FIX** — fix gate fires (Step 6). On `Yes …` → auto-chain to `/hyperflow:scope`. On `No` → stop with findings printed.
- **SECURITY_VIOLATION** — halt. Skip the fix gate. User decides remediation path.

## Doctrine

Full rules in [DOCTRINE.md](references/DOCTRINE.md). Output style in [output-style.md](references/output-style.md). Per-step agent dispatching follows rule 12.

## Overview

`/hyperflow:audit` runs a multi-level code review against uncommitted changes, a specific commit, branch, or PR. A Sonnet searcher gathers context; an Opus reviewer produces verdicts at the chosen level (L1 quick scan to L5 exhaustive). On `NEEDS_FIX`, a structural gate asks the user whether to apply findings — `Yes` auto-chains to `/hyperflow:scope` → `/hyperflow:dispatch`; `No` leaves the diff alone.

## Prerequisites

- Git repository with the change(s) to review present in the working tree, staged, or in history.
- `.hyperflow/` cache optional but recommended (Layer 0 analysis improves reviewer context). Run `/hyperflow:scaffold` first if missing.
- Model routing config supports a thinking tier (default: Opus 4.7). Without it, the reviewer downgrades to the worker tier and emits a warning.

## Instructions

See [Flow](#flow) above — Steps 1-6 are the operational instructions. Summary:

1. Resolve scope (target arg or `git diff HEAD`).
2. Searcher gathers context; Reviewer verifies coverage.
3. Reviewer produces L1-L<n> findings.
4. Writer appends learnings to `.hyperflow/memory/`; Reviewer dedup-checks.
5. Print structured output.
6. Fix gate fires on `NEEDS_FIX` with critical/important findings.

## Output

See [Output Format](#output-format) above for the exact block. Single review block per invocation; agent count line at the bottom shows the model/role split.

## Error Handling

| Failure | Behavior |
|---|---|
| No diff to review (clean working tree, no target) | Print `Nothing to review — clean working tree. Pass an explicit target.` and stop. |
| Searcher returns no context (file gone, bad path) | Reviewer flags `[Critical] — target unreachable` and halts at Step 3. |
| Reviewer emits `SECURITY_VIOLATION` (L3+ only) | Skip Step 4 onward. Print finding. Do not fire fix gate. User decides remediation. |
| `AskUserQuestion` unavailable (headless / non-interactive) | Print findings + an error line stating the fix gate could not fire. Never silently auto-fix or silently exit. |
| Reviewer disagrees with worker context (NEEDS_FIX on Step 2 coverage check) | Re-dispatch Searcher with the reviewer's gap list. Max 2 retries before surfacing the gap to user. |

## Examples

### Default — review uncommitted changes at L2

```
/hyperflow:audit

── Review Result ──────────────────────
Scope: git diff HEAD + git diff --staged (3 files)
Level: L2
Verdict: NEEDS_FIX

[Critical]
- src/auth/middleware.ts:42 — token compared with == instead of timingSafeEqual; switch to crypto.timingSafeEqual.

[Important]
- src/auth/middleware.ts:18 — missing rate-limit on /login. Wire token-bucket from src/lib/limiter.ts.

[Suggestions]
- src/auth/types.ts:5 — TokenClaims interface could be a discriminated union for refresh vs access tokens.
───────────────────────────────────────
Agents: 1 searcher (sonnet) · 1 reviewer (opus)

?  Audit found 3 issues — apply fixes?
   Fix all (Recommended)   — Critical + Important + Suggestions
   Critical + Important    — skip Suggestions
   Critical only           — fix the must-haves
   No, leave as-is         — stop; handle manually
```

### Explicit target + deep review

```
/hyperflow:audit src/payments --level 4

── Review Result ──────────────────────
Scope: src/payments/** (12 files)
Level: L4
Verdict: PASS
[Praise]
- src/payments/processor.ts:120 — idempotency key handling is correct under retries.
───────────────────────────────────────
Audit clean — no fixes needed.
```

### PR review

```
/hyperflow:audit --pr 145 --level 3

(reviews the diff between the PR's base and head; same output format)
```

## Resources

- [DOCTRINE.md](references/DOCTRINE.md) — orchestration rules (especially #8 structural gates, #12 per-step agents).
- [review-levels.md](references/review-levels.md) — full checklist for L1-L5.
- [reviewer-prompt.md](references/reviewer-prompt.md) — Opus reviewer template.
- [security.md](references/security.md) — security scan policy (mandatory at L3+).
- [memory-system.md](references/memory-system.md) — how patterns are persisted.
- [output-style.md](references/output-style.md) — label and table conventions.
