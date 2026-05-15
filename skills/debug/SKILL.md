---
name: debug
description: Use when encountering bugs, test failures, runtime errors, unexpected behavior, broken builds, or "this doesn't work" reports. Performs systematic root-cause analysis before proposing fixes — never blind-patches symptoms.
---

# Debug

Root cause, not symptom. Never patch over a bug without understanding why it happened.

Dispatcher = Opus 4.7. Implementer/Searcher/Writer = Sonnet 4.6.

## Step 1: Reproduce

- Confirm the bug is reproducible
- If repro steps missing → `⚡ [Searcher] Locating bug reproduction in recent changes/tests`
- If environmental (CI-only, intermittent, time-dependent) → flag explicitly before proceeding

## Step 2: Gather Evidence (parallel)

Dispatch simultaneously:
- `⚡ [Searcher] Reading error stack traces and logs`
- `⚡ [Searcher] Mapping the code paths involved`
- `⚡ [Searcher] Finding related tests (passing and failing)`

## Step 3: Hypothesize

`⚡ [Debugger] Root cause analysis: <bug-summary>` — model: opus

Apply **5 Whys** + **hypothesis testing** + **bisect mindset**:
- Why does this fail? → because X → Why X? → because Y → continue to root
- Output 1–3 hypotheses ranked by likelihood, each with:
  - **What:** suspected root cause
  - **Evidence:** what supports it
  - **Counter-evidence:** what would falsify it
  - **Test:** minimal change to verify

## Step 4: Verify

Pick highest-ranked hypothesis.

`⚡ [Implementer] Verifying hypothesis: <hypothesis>` — model: sonnet

- Make the minimal change needed to confirm/falsify
- Confirmed → proceed to Step 5
- Falsified → return to Step 3 with next hypothesis

## Step 5: Fix at Root

`⚡ [Implementer] Fixing root cause: <root-cause>` — model: sonnet

Dispatch with full context: the bug, the verified root cause, the minimal fix.

Constraints (non-negotiable):
- No error swallowing
- No defensive try/catch around the symptom
- No flags or feature gates to hide the bug

## Step 6: Regression Test

`⚡ [Writer] Adding regression test for <bug>` — model: sonnet

- Test must **fail** without the fix, **pass** with it
- If existing suite had gaps that allowed this bug → note in `.hyperflow/memory/pitfalls.md`

## Step 7: Review + Memory

`⚡ [Reviewer] Validating fix and regression test` — model: opus

- Thinking-tier reviewer validates fix correctness and test quality
- Append to `.hyperflow/memory/pitfalls.md` per [memory-system.md](../hyperflow/memory-system.md): the bug pattern, why tests missed it, prevention strategy
- Tags: `pitfall` + domain tags

## Anti-Patterns (refuse these)

| Symptom patch | Why it's wrong |
|---|---|
| "Just catch the exception" | Find why it threw |
| "Add a null check" | Find why it was null |
| "Increase the timeout" | Find why it's slow |
| "Retry on failure" | Understand the failure mode first |

## Output Format

```
── Debug Result ──────────────────────
Bug: <one-line>
Reproducible: yes / no / intermittent
Root cause: <one-line>
Fix: <one-line summary>
Files changed: <list>
Regression test: <path>
──────────────────────────────────────
```

End with usage summary (model names, agent count, token totals) per [worker-prompt.md](../hyperflow/worker-prompt.md) and [reviewer-prompt.md](../hyperflow/reviewer-prompt.md).

## Hand-off

After Step 7 passes, suggest `/hyperflow:ship` to run pre-push gates and commit the fix + regression test together. Do not auto-transition.
