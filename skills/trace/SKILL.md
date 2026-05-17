---
name: trace
description: |
  Use when encountering bugs, test failures, runtime errors, broken builds, or "this doesn't work" reports. Systematic root-cause analysis before any patch — never blind-patches symptoms. Standalone, ends with thinking-tier review of the fix.
  Trigger with /hyperflow:trace, "debug this", "find the root cause", "why is this failing", "this test is broken".
allowed-tools: Read, Bash(git:*), Bash(npm:*), Bash(pnpm:*), Glob, Grep, Agent
argument-hint: "<bug description or failing test name>"
version: 3.1.2
license: MIT
compatibility: Designed for Claude Code
tags: [debugging, root-cause, systematic, multi-agent]
---

# Trace

Root cause, not symptom. Never patch over a bug without understanding why it happened.

Dispatcher and reviewer — Opus 4.7 (thinking-tier). Implementer/Searcher/Writer — Sonnet 4.6.

## Per-Step Agent Map (DOCTRINE rule 12)

Every substantive step dispatches at least one Agent.

| Step | Worker tier | Thinking tier | Notes |
|---|---|---|---|
| 1 — Reproduce | Searcher (Sonnet) if repro missing | **Reviewer** (Opus) confirms repro is valid | Both tiers if dispatched |
| 2 — Gather evidence | Searcher × 3 (Sonnet) parallel | **Reviewer** (Opus) verifies evidence coverage | Both tiers |
| 3 — Hypothesize | — | **Debugger** (Opus) produces ranked hypotheses | Pure thinking |
| 4 — Verify | Implementer (Sonnet) minimal change | **Debugger** (Opus) re-evaluates against evidence | Both tiers · loop |
| 5 — Fix at root | Implementer (Sonnet) | **Reviewer** (Opus) checks no error-swallow / no symptom-patch | Both tiers |
| 6 — Regression test | Writer (Sonnet) | **Reviewer** (Opus) confirms test fails-without / passes-with | Both tiers |
| 7 — Memory + final | Writer (Sonnet) appends pitfall | **Reviewer** (Opus) final validation | Both tiers |

## Step 1 — Reproduce

Agents — `Searcher` (Sonnet, if needed) ⇒ **Reviewer** (Opus).

1. Confirm the bug is reproducible.
2. If repro steps missing — dispatch `Searcher — locating bug reproduction in recent changes/tests`.
3. Dispatch `**Reviewer** — confirming reproduction is valid` to validate the repro actually fails for the stated reason (not a flake).
4. If environmental (CI-only, intermittent, time-dependent) — flag explicitly before proceeding.

## Step 2 — Gather Evidence (parallel)

Agents — `Searcher` × 3 (Sonnet) parallel ⇒ **Reviewer** (Opus).

1. Dispatch simultaneously in a single message:
   - `Searcher — reading error stack traces and logs`
   - `Searcher — mapping the code paths involved`
   - `Searcher — finding related tests (passing and failing)`
2. Dispatch `**Reviewer** — verifying evidence coverage` to confirm the three Searchers actually triangulate the failure surface. If gaps remain, redispatch.

## Step 3 — Hypothesize

Agents — **Debugger** (Opus, thinking-tier).

Dispatch `**Debugger** — root cause analysis: <bug-summary>` — model: opus.

Apply **5 Whys** + **hypothesis testing** + **bisect mindset**:
- Why does this fail? → because X → why X? → because Y → continue to root
- Output 1–3 hypotheses ranked by likelihood, each with:
  - **What** — suspected root cause
  - **Evidence** — what supports it
  - **Counter-evidence** — what would falsify it
  - **Test** — minimal change to verify

## Step 4 — Verify

Agents — `Implementer` (Sonnet) ⇒ **Debugger** (Opus).

1. Pick highest-ranked hypothesis.
2. Dispatch `Implementer — verifying hypothesis: <hypothesis>` — make the minimal change needed to confirm/falsify.
3. Dispatch `**Debugger** — re-evaluating hypothesis against test result` to re-check against the evidence from Step 2.
4. Confirmed → proceed to Step 5. Falsified → return to Step 3 with next hypothesis.

## Step 5 — Fix at Root

Agents — `Implementer` (Sonnet) ⇒ **Reviewer** (Opus).

1. Dispatch `Implementer — fixing root cause: <root-cause>` with full context: the bug, the verified root cause, the minimal fix.
2. Dispatch `**Reviewer** — checking fix is at root` to verify the fix actually addresses the cause and doesn't patch the symptom.

Constraints (non-negotiable):
- No error swallowing
- No defensive try/catch around the symptom
- No flags or feature gates to hide the bug

## Step 6 — Regression Test

Agents — `Writer` (Sonnet) ⇒ **Reviewer** (Opus).

1. Dispatch `Writer — adding regression test for <bug>`.
2. Dispatch `**Reviewer** — confirming regression test fails-without and passes-with the fix`.
3. If existing suite had gaps that allowed this bug → note in `.hyperflow/memory/pitfalls.md`.

## Step 7 — Memory + Final Review

Agents — `Writer` (Sonnet) ⇒ **Reviewer** (Opus).

1. Dispatch `Writer — appending pitfall to .hyperflow/memory/pitfalls.md` per [memory-system.md](references/memory-system.md): the bug pattern, why tests missed it, prevention strategy. Tags — `pitfall` plus domain tags.
2. Dispatch `**Reviewer** — final validation of fix + test + memory entry`. This is the integration review for the trace flow.

## Anti-Patterns (refuse these)

| Symptom patch | Why it's wrong |
|---|---|
| "Just catch the exception" | Find why it threw |
| "Add a null check" | Find why it was null |
| "Increase the timeout" | Find why it's slow |
| "Retry on failure" | Understand the failure mode first |

## Output Format

```
── Debug Result ─────────────────────
Bug: <one-line>
Reproducible: yes / no / intermittent
Root cause: <one-line>
Fix: <one-line summary>
Files changed: <list>
Regression test: <path>
─────────────────────────────────────
```

End with usage summary (model names, agent count, token totals) per [output-style.md](references/output-style.md).

## Hand-off

Debug is **off the auto-chain** — it's standalone. After Step 7 reviewer passes, stop and suggest `/hyperflow:deploy` to run pre-push gates and commit the fix + regression test together. Do **not** auto-invoke ship — push requires explicit user opt-in.

## Doctrine

Full rules in [DOCTRINE.md](references/DOCTRINE.md). See also [worker-prompt.md](references/worker-prompt.md) and [reviewer-prompt.md](references/reviewer-prompt.md).

## Overview

`/hyperflow:trace` is the systematic-debugging skill. It refuses to symptom-patch — every fix starts with reproduction, evidence gathering, hypothesis ranking via Opus Debugger, and verification before any code changes. Three parallel Sonnet searchers triangulate the failure surface; an Opus Debugger applies 5-Whys + hypothesis testing; an Opus Reviewer confirms the fix lands at the root and a regression test fails-without / passes-with. Off the auto-chain — standalone.

## Prerequisites

- A reproducible bug (or enough symptom info to reproduce). If unclear, Step 1 dispatches a Searcher to locate the failure.
- Git repository — for diffing recent changes and committing the fix + regression test together.
- Test runner detected in `.hyperflow/testing.md` (vitest/jest/playwright/pytest/etc.) — required for Step 6 regression test.
- `.hyperflow/memory/pitfalls.md` writable — Step 7 appends the learned pattern.

## Instructions

The 7 numbered steps live in [Step 1 — Reproduce](#step-1--reproduce) through [Step 7 — Memory + Final Review](#step-7--memory--final-review) above. Summary:

1. **Reproduce** — confirm the bug fails consistently; flag intermittent.
2. **Gather evidence** — 3 parallel Searchers (logs, code paths, related tests) + Opus Reviewer verifies coverage.
3. **Hypothesize** — Opus Debugger applies 5-Whys; emits 1-3 ranked hypotheses with evidence + counter-evidence + test.
4. **Verify** — Implementer makes minimal change; Debugger re-evaluates. Loop until confirmed.
5. **Fix at root** — Implementer applies the real fix; Reviewer checks it's not a symptom-patch.
6. **Regression test** — Writer adds a test that fails-without / passes-with; Reviewer confirms both states.
7. **Memory + final review** — append pitfall pattern to `.hyperflow/memory/pitfalls.md`; Reviewer signs off.

## Output

See [Output Format](#output-format) above for the structured block (Bug, Reproducible, Root cause, Fix, Files changed, Regression test). Ends with usage summary showing the thinking/worker tier split (typically 4-6 Opus + 3-5 Sonnet for a normal trace).

## Error Handling

| Failure | Behavior |
|---|---|
| Cannot reproduce | Step 1 prints `Cannot reproduce — needs more info`; ask user via `AskUserQuestion` for additional repro context. Do NOT proceed to Step 2 with unreliable repro. |
| Intermittent / flaky | Flag explicitly in Step 1 output; ask whether user wants to proceed treating as flake vs investigate root cause. |
| All hypotheses falsified | Loop back to Step 2 with broader evidence collection scope. After 2 full cycles, surface to user: `Cannot localize root cause — need additional traces`. |
| Reviewer says fix is a symptom-patch | Reject and loop back to Step 5 with the Reviewer's feedback. Do NOT commit a symptom-patch. |
| Regression test passes both with and without fix | Reject; Writer rewrites the test. The test must demonstrably distinguish the buggy and fixed states. |
| Test runner missing | Skip Step 6 with explicit warning: `No test runner detected — fix committed without regression test`. Suggest user add one. |

## Examples

### Standard trace — failing test

```
/hyperflow:trace one of my auth tests is failing — find the root cause and fix it

Searcher — locating bug reproduction in recent changes/tests
**Reviewer** — confirming reproduction is valid
Searcher — reading error stack traces and logs
Searcher — mapping the code paths involved
Searcher — finding related tests (passing and failing)
**Reviewer** — verifying evidence coverage
**Debugger** — root cause analysis: auth.test.ts:42 "refresh token rejected"

Hypothesis 1 (likely): refresh token TTL changed in PR #189 but test fixture wasn't updated
Hypothesis 2 (possible): clock skew between test env and JWT issuer

Implementer — verifying hypothesis 1: refresh token TTL
**Debugger** — re-evaluating hypothesis against test result
[hypothesis 1 confirmed]

Implementer — fixing root cause: align test fixture TTL with new TOKEN_REFRESH_TTL constant
**Reviewer** — checking fix is at root
Writer — adding regression test for TTL drift
**Reviewer** — confirming regression test fails-without and passes-with the fix
Writer — appending pitfall to .hyperflow/memory/pitfalls.md
**Reviewer** — final validation of fix + test + memory entry

── Debug Result ─────────────────────
Bug: auth.test.ts:42 "refresh token rejected"
Reproducible: yes
Root cause: test fixture TTL hardcoded to old value; not synced with TOKEN_REFRESH_TTL constant
Fix: import TOKEN_REFRESH_TTL into test fixture; remove magic number
Files changed: src/auth/test-fixtures.ts, test/auth/refresh.test.ts
Regression test: test/auth/refresh.test.ts::"TTL constant drift catches stale fixtures"
─────────────────────────────────────
Agents: 4 searcher + 1 implementer + 1 writer (sonnet) · 5 reviewer + 1 debugger (opus)
```

### Refuses symptom-patch request

```
/hyperflow:trace just catch the exception in src/payments/processor.ts

Refusing — trace never patches symptoms. The exception is a signal. Let me find why it throws.

Searcher — reading error stack traces and logs
... (proceeds with full root-cause flow)
```

### Intermittent bug

```
/hyperflow:trace tests pass locally but fail in CI ~30% of the time

Flagged — intermittent. Possible causes: ordering dependency, race condition,
environmental difference, flaky external. Proceeding with extra evidence gathering.

Searcher — reading CI logs vs local logs
Searcher — looking for shared state between test files
...
```

## Resources

- [DOCTRINE.md](references/DOCTRINE.md) — orchestration rules (especially #12 per-step agents).
- [worker-prompt.md](references/worker-prompt.md) — Sonnet implementer prompt template.
- [reviewer-prompt.md](references/reviewer-prompt.md) — Opus reviewer prompt template.
- [memory-system.md](references/memory-system.md) — pitfall entry format.
- [output-style.md](references/output-style.md) — agent label format + usage summary spec.
