---
name: audit
description: Use when the user asks for a code review, "review this change", "review my PR", "review the diff", or wants quality/spec/security/perf feedback on recent changes. Triggers a multi-level review with a thinking-tier reviewer agent. On NEEDS_FIX, asks the user whether to apply the findings via /hyperflow:scope → /hyperflow:dispatch.
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

Adapted from [review-levels.md](../hyperflow/review-levels.md):

| L | Name | Checks |
|---|------|--------|
| 1 | Quick | Syntax, obvious bugs, formatting |
| 2 | Standard | L1 + spec compliance, naming, edge cases |
| 3 | Thorough | L2 + cross-file consistency, integration risks, security |
| 4 | Deep | L3 + architecture, scalability, accessibility |
| 5 | Exhaustive | L4 + adversarial probing, perf profiling, alternatives |

Security scan (hardcoded secrets, injection, path traversal, XSS, missing validation) is mandatory at L3+. See [security.md](../hyperflow/security.md).

## Flow

### Step 1 — Resolve scope

Use the provided target or run `git diff HEAD` + `git diff --staged`. No agent dispatched (read-only git).

### Step 2 — Gather context

Agents — `Searcher` (Sonnet) ⇒ **Reviewer** (Opus).

1. Dispatch `Searcher — gathering context for review` to map referenced files and load relevant project context.
2. Dispatch `**Reviewer** — verifying context coverage` to confirm the Searcher hit the relevant subsystems.

### Step 3 — Review

Agents — **Reviewer** (Opus, thinking-tier).

Dispatch `**Reviewer** — reviewing <scope> at level L<n>`. The Reviewer uses the [reviewer-prompt.md](../hyperflow/reviewer-prompt.md) template with the diff, level definition, and any applicable spec. Produces structured `[Critical] / [Important] / [Suggestions] / [Praise]` findings.

If any security issue is found at L3+ → emit `SECURITY_VIOLATION:` halt marker immediately. Skip the fix gate; user decides remediation.

### Step 4 — Memory append

Agents — `Writer` (Sonnet) ⇒ **Reviewer** (Opus).

1. Dispatch `Writer — appending durable patterns to .hyperflow/memory/learnings.md` per [memory-system.md](../hyperflow/memory-system.md).
2. Dispatch `**Reviewer** — memory dedup check` to ensure no duplicate entries land.

### Step 5 — Output

Print the structured review (see Output Format below).

### Step 6 — Fix gate (STRUCTURAL GATE · DOCTRINE rule 8)

After the output prints, the audit skill **MUST** ask the user via `AskUserQuestion` whether to apply the findings. Per DOCTRINE rule 8, this gate always fires when findings exist — autonomy directives do NOT skip it. Defaulting silently is a doctrine violation.

**Skip the gate only when:** verdict is `PASS` with no `[Critical]` or `[Important]` entries (Suggestions-only or Praise-only). In that case print one-line: `Audit clean — no fixes needed.` and stop.

**Skip the gate also when:** verdict is `SECURITY_VIOLATION`. Halt and let the user decide.

**Otherwise**, ask:

```
?  Audit found N issues — apply fixes?

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

1. Build a spec block from the chosen findings. Each finding becomes a line with: file:line, the issue, and the reviewer's suggested fix (or "design needed" if no Fix: was provided).
2. Save the spec to `.hyperflow/specs/audit-<timestamp>.md` for traceability.
3. Invoke `Skill` with `skill: scope` and `args: "chain-mode=auto spec=.hyperflow/specs/audit-<timestamp>.md"`.
4. `/hyperflow:scope` will decompose into batches; `/hyperflow:dispatch` will execute them — same per-sub-task commit cadence and per-batch L1–L<n> review as any other chain run.

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

Full rules in [DOCTRINE.md](../hyperflow/DOCTRINE.md). Output style in [output-style.md](../hyperflow/output-style.md). Per-step agent dispatching follows rule 12.
