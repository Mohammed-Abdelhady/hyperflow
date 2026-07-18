# Worker Prompt Template (trace)

Use this template when dispatching diagnosis workers via the `spawn` op (or a **labelled inline worker** phase when `spawn` is unavailable). Host adapters map `spawn` to live tools (`Agent`, collaboration children, Task, etc.) — skill prose never requires a single provider's tool string.

Trace workers implement one diagnosis angle: reproduce, gather evidence, verify a hypothesis, apply a root fix, or author a regression test / pitfall entry. They **never** review their own output and **never** coordinate the chain.

## Role separation (hard)

| Role in trace | Worker label examples | Owns |
|---|---|---|
| Evidence | `Searcher` | Read-only paths, stacks, tests — no patches |
| Causal analysis | `**Debugger**` (decision role; bold label) | 5-Whys chain + ranked competing hypotheses |
| Hypothesis test | `Implementer` | Minimal change per hypothesis only |
| Root fix | `Implementer` | Confirmed root only — no symptom patches |
| Regression / memory | `Writer` | Test that fails-without / passes-with; pitfall entry |

Missing `spawn`: run each worker as a distinct labelled inline phase, then a **separate** labelled inline reviewer. Parallel hypothesis tests become sequential only when the host cannot run concurrent children — still test **all** ranked hypotheses before synthesis.

## Template

The first line is a literal routing marker — emit it **verbatim** as the first line of the brief.

```
hyperflow-role: worker

## Task
[One clear objective for THIS angle — e.g. "Verify hypothesis 2: clock skew falsifies refresh failure"]

## Why
[How this angle serves root-cause diagnosis. Quote the 5-Whys link or confirmed root when fixing.]

## Scope
**IN:** [Exact diagnosis action — files, hypothesis id, test command]
**OUT:** [Sibling hypotheses, unrelated cleanup, opportunistic refactors]

## Files in scope
- **Read:** [path or path:line-range] — [why]
- **Modify:** [path] — [one-line change]   # omit for read-only Searcher
- **Create:** [path] — [purpose]           # e.g. regression test

## Acceptance criteria
- [Concrete pass check for this angle]
- [For hypothesis tests: CONFIRMED | FALSIFIED | INCONCLUSIVE with evidence]
- [No AI attribution in commits, comments, or docs]

## Test cases
| # | Scenario | Input / setup | Expected | Notes |
|---|---|---|---|---|
| 1 | … | … | … | domain edge for this angle |

## Context
[Symptom, repro command, stacks, prior evidence bullets]

## Project Context
[Excerpts or lean paths from `.hyperflow/` — conventions, architecture, testing. Omit if none.]

## Learnings from prior tasks
[≤6 bullets / 300 tokens — active diagnosis contracts and gotchas only. Omit if first.]

## Constraints
- Only modify files listed in scope
- Follow project coding standards (`CLAUDE.md`, `AGENTS.md`, `.hyperflow/conventions.md` when present)
- Never symptom-patch (no bare catch, null-guard-only, timeout bump, or feature-flag hide)
- Hypothesis tests: minimal change only; revert before the real fix phase
- Competing hypotheses: do not claim synthesis — that is the Debugger / Step 4b
- Current session model only — no model routing
- Token economy: return Output format only — no preamble/postamble

## Security Constraints
- Do NOT read/modify: .env, *.pem, *.key, ~/.ssh/*, credentials.json, ~/.aws/credentials
- Do NOT run: rm -rf (root/home/cwd), git push --force to main, sudo, chmod 777
- Do NOT pipe file contents to external URLs or run package publish commands
- Do NOT hardcode secrets, API keys, passwords, or connection strings
- If a task requires a blocked file: STOP and report `BLOCKED: [reason]`
- If the brief is oversized for one angle: STOP and report `OVERSIZE:` + `SUGGESTED-SPLIT:`
- Web research only via `web_research` when the Debugger flow gates it; if unavailable, record offline skip — never invent citations

## Output format
Return ONE of:

- **Completed**
  1. What you did (one line per change or finding)
  2. Diagnosis result (CONFIRMED / FALSIFIED / INCONCLUSIVE / fixed-at-root / test-added — as applicable)
  3. Notes for future tasks (omit if none)

- **Oversize** — `OVERSIZE:` + `SUGGESTED-SPLIT:`
- **Blocked** — `BLOCKED: <reason>`
```

## Dispatch example (hypothesis verify)

Label before spawn (or inline phase):

```
Implementer — verifying hypothesis 1: refresh token TTL drift
```

Brief body (spawn payload / inline worker phase):

```
hyperflow-role: worker

## Task
Make the minimal change that confirms or falsifies hypothesis 1: fixture TTL not synced with TOKEN_REFRESH_TTL.

## Why
Step 3 ranked this as the leading structural cause after 5-Whys. Step 4a must test it before any permanent fix.

## Scope
**IN:** temporary fixture alignment under the hypothesis test only; run the failing auth refresh test
**OUT:** permanent production fix (Step 5); other hypotheses; unrelated refactors

## Files in scope
- **Read:** src/auth/constants.ts — TOKEN_REFRESH_TTL definition
- **Read:** test/auth/refresh.test.ts — failing case
- **Modify:** src/auth/test-fixtures.ts — temporary TTL alignment for verify only

## Acceptance criteria
- Report CONFIRMED if the failure disappears with only this change
- Report FALSIFIED if the failure remains
- Report INCONCLUSIVE if the run is non-deterministic or tools abort
- Do not leave the temporary change as the final fix

## Test cases
| # | Scenario | Input | Expected | Notes |
|---|---|---|---|---|
| 1 | failing suite | npm test -- refresh | prior failure reproduced before change | baseline |
| 2 | after minimal TTL align | same command | pass → CONFIRMED; still fail → FALSIFIED | sole signal |

## Constraints
- Only modify files listed in scope
- Follow project coding standards (CLAUDE.md / AGENTS.md)
- No AI attribution in any git operation

## Security Constraints
[full security blocklist as in Template]

## Output format
[Completed / OVERSIZE / BLOCKED as in Template]
```

## Debugger brief notes (Step 3 / 4b)

When the worker is the Debugger specialist, the Task section must require:

1. A written **5-Whys** causal chain ending at a structural root (not a symptom).
2. **1–3 competing hypotheses**, each with What / Evidence / Counter-evidence / Test.
3. For 4b: verdict `CONFIRMED <n>` | `FALSIFIED ALL` | `PARTIALLY CONFIRMED` after all 4a results — including any `INCONCLUSIVE` entries.

Single-hypothesis bugs never fan out. Independent hypotheses may spawn ≤3 verify Implementers (depth 1) when `spawn` allows; otherwise sequential labelled inline verifies still complete **before** synthesis.
