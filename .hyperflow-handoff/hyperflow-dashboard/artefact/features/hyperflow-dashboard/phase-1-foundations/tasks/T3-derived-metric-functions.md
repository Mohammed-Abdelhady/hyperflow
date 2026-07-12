# T3 — Derived-metric pure functions + table-driven tests

## Task

Implement `dashboard/src/shared/derived/` — four deterministic pure-function modules computing all product intelligence over the parsed snapshot: Flow Health scoring, agent leaderboard, plan conclusions, and token analytics. Ship table-driven Vitest suites alongside. Same tree in → same numbers out, always; no I/O, no DOM, no server.

## Why

Spec §3B.7: intelligence is pure derivation — deterministic, offline, auditable (every conclusion cites its evidence), and unit-testable against fixture snapshots with zero infrastructure.

## Scope

**IN:** `health.ts`, `leaderboard.ts`, `conclusions.ts`, `tokens.ts`, their weight/threshold constants, and the table-driven test suites

**OUT:** memoized selector wiring into Zustand (client phase); server-side consumption; the parsers that produce snapshots; any UI (score dial, count-bar table); NumberFlow or any animation concern.

## Files in scope

**Read:**
- `.hyperflow/specs/hyperflow-dashboard.md` §3B.7 (lines 320-323), §3A rows for Flow Health / Leaderboard / Token analytics (268-270), derived-intelligence placement (152), zero-data states §4.7 (431-440)
- `skills/hyperflow/artefact-format.md:146-156` — `## Estimated cost` / `## Actual cost` table shape to aggregate

**Create:**
- `dashboard/src/shared/derived/health.ts` — Flow Health 0-100 composite: weighted sum of (parse success rate, gate pass rate, 1 − failure ratio, staleness decay) with weights fixed as named exported constants in `shared/`; returns the score, a per-factor breakdown, and the threshold band that downstream re-colors the dial with (`state-*` mapping stays in the client).
- `dashboard/src/shared/derived/leaderboard.ts` — per-agent / per-skill activity counts and rankings aggregated from snapshot dispatch/task data and the `Tokens used:` lines dispatch/status skills emit; stable descending sort with deterministic tie-breaking.
- `dashboard/src/shared/derived/conclusions.ts` — Plan Conclusions extraction and rollup, state-plus-evidence: every rendered claim carries citations (artefact file + line range it derives from); pending plans yield pending-status entries with progress-so-far, never an empty dead end (§4.7).
- `dashboard/src/shared/derived/tokens.ts` — token-spend rollups over `Tokens used:` lines plus the `Estimated cost` / `Actual cost` tables: totals per chain/batch/agent/role and estimated-vs-actual deltas.
- `dashboard/tests/unit/shared/derived/health.test.ts`, `leaderboard.test.ts`, `conclusions.test.ts`, `tokens.test.ts` — table-driven cases over fixture snapshots.

## Acceptance criteria

- [ ] All four functions are pure: no fs/network, no `Date.now()` (staleness decay takes "now" as an explicit parameter), no randomness
- [ ] Determinism proven in tests: repeated invocation on the same fixture returns deeply-equal results
- [ ] Health weights are named exported constants — no inline magic numbers in the formula
- [ ] Every conclusions claim carries evidence citations (file + lines)
- [ ] Empty and degraded snapshots produce well-defined outputs — no NaN, no division-by-zero, scores stay in [0,100] (§4.7)
- [ ] `npx vitest run` green; every source file ≤300 lines; input types imported from `shared/schemas` only

## Test cases

(Vitest, table-driven, `dashboard/tests/unit/shared/derived/`)
- health: fixture with 3/4 files parsed, all gates PASS, zero failures, fresh timestamps → exact expected composite score; fully-unparseable fixture → degraded score, still a number in [0,100] (§4.7 "health never fails to render")
- health: identical input invoked twice → deep-equal outputs (determinism gate)
- leaderboard: fixture with `Tokens used:` lines for 3 agents → rankings ordered by count desc, ties broken deterministically by name; empty fixture → zero rows in a header-safe shape (§4.7)
- tokens: fixture containing the artefact-format cost table (Reviewer 16 / ~80k, Worker 14 / ~140k, Total 30 / ~220k) → rollup totals match; fixture with both Estimated and Actual tables → delta computed
- conclusions: fixture plan in pending state → pending entry with progress-so-far, not omitted; completed plan → claims each carrying file+line citations
- Integration: one suite runs all four functions over a single committed multi-surface snapshot fixture and snapshot-asserts the combined result — guards cross-function drift
- E2E: N/A — pure functions with no DOM or server by design (§3B.7); the combined-fixture suite is the integration scenario, and Playwright coverage arrives with the client phases.

## Related context

- Formula + inputs — `.hyperflow/specs/hyperflow-dashboard.md:320-323`
- Flow Health dial thresholds / leaderboard count-bar / token grouping — `.hyperflow/specs/hyperflow-dashboard.md:268-270`
- Derived intelligence lives in shared/, memoized selectors — `.hyperflow/specs/hyperflow-dashboard.md:152`
- Zero-data states — `.hyperflow/specs/hyperflow-dashboard.md:431-440`
- Cost-table wire shape — `skills/hyperflow/artefact-format.md:146-156`
- Input types — T2's `dashboard/src/shared/schemas/snapshot.ts`

## Gotchas

- Depends on T2: import snapshot/delta types from `shared/schemas` — any local re-declaration of shapes recreates the drift §3B.5 exists to kill.
- Injectable time is non-negotiable: a hidden clock read makes staleness decay nondeterministic and the determinism test flaky.
- Keep the memo layer separable from the raw functions so tests exercise the pure core directly; memoization must never change observable output.
- No `any` anywhere, including test tables — type the case rows.
- 300-line pressure point: health's constants + factor breakdown — move constants to a sibling module inside `shared/derived/` rather than compressing.
