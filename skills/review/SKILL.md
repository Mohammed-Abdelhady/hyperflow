---
name: review
description: Use when the user asks for a code review, requests "review this change", "review my PR", "review the diff", or wants quality/spec/security/perf feedback on recent changes. Triggers a multi-level review using a thinking-tier reviewer agent.
---

# Review

Standalone multi-level code review. Dispatcher = Opus 4.7. Workers = Sonnet 4.6.

## Inputs

- **Target:** file path, line range, commit SHA, branch, or PR number provided by user
- **Default (no target):** `git diff HEAD` + `git diff --staged`
- **Level flag:** `--level 1` through `--level 5` (default: L2)

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

1. Resolve scope: use provided target or run `git diff HEAD` + `git diff --staged`
2. Print `⚡ [Searcher] Gathering context for review` — dispatch Sonnet searcher to map referenced files and load relevant project context
3. Print `⚡ [Reviewer] Reviewing <scope> at level L<n>` — dispatch **Opus 4.7** reviewer (thinking-tier, non-negotiable)
4. Reviewer uses [reviewer-prompt.md](../hyperflow/reviewer-prompt.md) template with the diff, level definition, and any applicable spec
5. Aggregate findings into structured output (see below)
6. Append durable patterns/gotchas discovered to `.hyperflow/memory/learnings.md` per [memory-system.md](../hyperflow/memory-system.md)

If any security issue found → emit `SECURITY_VIOLATION:` halt marker immediately.

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

- **PASS** → suggest `/hyperflow:ship` if the user is ready to release
- **NEEDS_FIX** → suggest `/hyperflow:debug` for root-cause bugs, or `/hyperflow:hyperflow` to dispatch fixes against the findings
- **SECURITY_VIOLATION** → halt; do not auto-transition. User decides remediation path.
