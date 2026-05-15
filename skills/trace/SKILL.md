---
name: trace
description: Use when encountering bugs, test failures, runtime errors, unexpected behavior, broken builds, or "this doesn't work" reports. Systematic root-cause analysis before any patch — never blind-patches symptoms. Standalone (off the spec → scope → dispatch chain). Ends with a thinking-tier review of the fix.
---

# Trace

Root cause, not symptom. Never patch over a bug without understanding why it happened.

Dispatcher and reviewer — Opus 4.7 (thinking-tier). Implementer/Searcher/Writer — Sonnet 4.6.

## Step 1 — Reproduce

- Confirm the bug is reproducible.
- If repro steps missing — dispatch `Searcher — locating bug reproduction in recent changes/tests`.
- If environmental (CI-only, intermittent, time-dependent) — flag explicitly before proceeding.

## Step 2 — Gather Evidence (parallel)

Dispatch simultaneously in a single message:

- `Searcher — reading error stack traces and logs`
- `Searcher — mapping the code paths involved`
- `Searcher — finding related tests (passing and failing)`

## Step 3 — Hypothesize

Dispatch `**Debugger** — root cause analysis: <bug-summary>` — model: opus.

Apply **5 Whys** + **hypothesis testing** + **bisect mindset**:
- Why does this fail? → because X → why X? → because Y → continue to root
- Output 1–3 hypotheses ranked by likelihood, each with:
  - **What** — suspected root cause
  - **Evidence** — what supports it
  - **Counter-evidence** — what would falsify it
  - **Test** — minimal change to verify

## Step 4 — Verify

Pick highest-ranked hypothesis.

Dispatch `Implementer — verifying hypothesis: <hypothesis>` — model: sonnet.

- Make the minimal change needed to confirm/falsify
- Confirmed → proceed to Step 5
- Falsified → return to Step 3 with next hypothesis

## Step 5 — Fix at Root

Dispatch `Implementer — fixing root cause: <root-cause>` — model: sonnet.

Pass full context: the bug, the verified root cause, the minimal fix.

Constraints (non-negotiable):
- No error swallowing
- No defensive try/catch around the symptom
- No flags or feature gates to hide the bug

## Step 6 — Regression Test

Dispatch `Writer — adding regression test for <bug>` — model: sonnet.

- Test must **fail** without the fix, **pass** with it.
- If existing suite had gaps that allowed this bug → note in `.hyperflow/memory/pitfalls.md`.

## Step 7 — Review + Memory

Dispatch `**Reviewer** — validating fix and regression test` — model: opus.

- Thinking-tier reviewer validates fix correctness and test quality.
- Append to `.hyperflow/memory/pitfalls.md` per [memory-system.md](../hyperflow/memory-system.md): the bug pattern, why tests missed it, prevention strategy.
- Tags — `pitfall` plus domain tags.

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

End with usage summary (model names, agent count, token totals) per [output-style.md](../hyperflow/output-style.md).

## Hand-off

Debug is **off the auto-chain** — it's standalone. After Step 7 reviewer passes, stop and suggest `/hyperflow:deploy` to run pre-push gates and commit the fix + regression test together. Do **not** auto-invoke ship — push requires explicit user opt-in.

## Doctrine

Full rules in [DOCTRINE.md](../hyperflow/DOCTRINE.md). See also [worker-prompt.md](../hyperflow/worker-prompt.md) and [reviewer-prompt.md](../hyperflow/reviewer-prompt.md).
