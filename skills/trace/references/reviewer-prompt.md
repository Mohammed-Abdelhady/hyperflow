# Reviewer Prompt Template (trace)

Use this template when dispatching independent root-cause reviewers via the `spawn` op (or a **labelled inline reviewer** phase when `spawn` is unavailable). Reviewers never coordinate the chain, never dispatch siblings, and never self-approve worker work they produced.

Host adapters map `spawn` to live tools. Missing subagents: run worker phases first, then a **separate** reviewer phase with a distinct label — role separation is non-negotiable.

Review depth scales by diagnosis step and complexity. Every trace step that produces worker output gets its own review before the chain advances.

## Complexity classification

The orchestrator classifies BEFORE dispatching the reviewer:

- **Simple** (levels 1–2): single-file fixture tweak, one-line constant, docs-only pitfall
- **Medium** (levels 1–3): multi-file evidence triangulation, hypothesis verify set, shared module fix
- **Complex** (levels 1–5): security-sensitive root, multi-service regression, UI/a11y surfaces in the fix

## Template

First line is a literal routing marker — emit **verbatim**.

```
hyperflow-role: reviewer

## Review scope
[Step id · files changed · task · complexity · which worker outputs]

## Worker output
[Paste worker summaries — evidence lists, 5-Whys, hypothesis results, fix diff, regression test, pitfall entry]

## Diagnosis checks (always for trace)

- Reproduction consistent / intermittent flagged?
- 5-Whys chain reaches a structural root (not a symptom)?
- Competing hypotheses each have What / Evidence / Counter-evidence / Test?
- All ranked hypotheses tested before synthesis (or justified single-hypothesis path)?
- Fix addresses confirmed root — not catch-only, null-guard-only, timeout bump, or feature-flag hide?
- Regression test fails-without and passes-with the fix (when Step 6 applies)?
- Gaps from aborted Searchers / INCONCLUSIVE verifies are explicit in synthesis?

## Level 1: Requirements
- Output matches the step brief exactly?
- Nothing missing / nothing extra beyond the angle?

## Level 2: Code Quality
- Project naming conventions (`CLAUDE.md` / `AGENTS.md` / `.hyperflow/conventions.md`)?
- No TypeScript `any`, no dead code?
- Reuses existing utils/hooks?
- Proper error handling, SRP, early returns?

## Level 3: Integration (medium + complex only)
- Imports resolve? No circular dependencies?
- Shared state/context intact?
- API contracts preserved?
- Existing tests still pass (except intentional failing repros during verify)?

## Level 4: Performance & Security (complex only)
- No N+1 / unmemoized hot paths introduced?
- No hardcoded secrets (sk-*, AKIA*, ghp_*, private keys)?
- Input validation at boundaries? No injection vectors?

## Level 5: UX & Accessibility (complex UI tasks only)
- Aria labels, keyboard paths, loading/error/empty states?
- Responsive + RTL considered?

## Security Review (always)
- Blocked files accessed? (.env, *.pem, *.key, ~/.ssh/*)
- Dangerous commands? (rm -rf, force push, sudo)
- Data exfiltration? (contents piped to external URLs)
- On any hit: verdict `SECURITY_VIOLATION` and hard-halt — no auto-continue

## Token economy
Return ONLY the Output format block — no preamble, no restating the worker dump, no postamble.

## Output format
```
── Review ──────────────────────────────
L1 Requirements    pass     — [summary]
L2 Code Quality    pass     — [summary]
L3 Integration     pass     — [summary]
L4 Performance     fail     — [issue found]
L5 UX/A11y         skipped  — not applicable
Diagnosis          pass     — [root vs symptom · hypotheses · regression]
────────────────────────────────────────
VERDICT: APPROVED | NEEDS_FIX | SECURITY_VIOLATION
[Issues per failed level — one line each]
[Notes for future tasks — omit if none]
```
```

If a finding needs a peer domain's judgment, hold the verdict and emit  
`CONSULT: <peer> — <question>` (Team Lead brokers; see consultation protocol).  
Do not invent metrics, evidence, or citations the workers did not produce.

## Dispatch example (root-fix review)

Label before spawn / inline phase:

```
**Reviewer** — checking fix is at root
```

Brief:

```
hyperflow-role: reviewer

## Review scope
Step 5 · files: src/auth/test-fixtures.ts, test/auth/refresh.test.ts
Task: align fixture TTL with TOKEN_REFRESH_TTL (confirmed root from Step 4b)
Complexity: Medium

## Worker output
1. Imported TOKEN_REFRESH_TTL into fixture; removed magic number
2. Existing refresh tests pass; no try/catch wrapper added

## Diagnosis checks
- Addresses confirmed hypothesis 1 (TTL drift)?
- No symptom-only null guard or catch-all?
- Scope limited to root files?

## Level 1–3
[as applicable]

## Security Review
Blocked files? Secrets? Dangerous commands?

## Output format
── Review ──
pass / fail / skipped per level + Diagnosis row + VERDICT
```

## Step-specific reviewer focus

| Step | Reviewer confirms |
|---|---|
| 1 Reproduce | Failure deterministic or intermittent flagged; matches symptom |
| 2 Evidence | Searchers triangulate; gaps named for re-run |
| 3 Hypothesize | 5-Whys structural; hypotheses independently testable |
| 4a Verify | Each test deterministic; maps to confirm/falsify/inconclusive |
| 4b Re-eval | Verdict sound given all hypothesis results |
| 5 Fix | Root not symptom; no constraint violations; multi-file consistency |
| 6 Regression | Fails without fix, passes with fix |
| 7 Final | Cumulative: fix + test + memory generalize; sole integration review |

See parent skill steps for loop/failure recovery. Canonical checklist depth: `skills/hyperflow/review-levels.md` when present; trace keeps diagnosis checks mandatory regardless of host.
