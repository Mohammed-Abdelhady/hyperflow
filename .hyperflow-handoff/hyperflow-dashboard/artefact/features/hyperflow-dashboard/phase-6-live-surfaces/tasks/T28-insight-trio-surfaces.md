# T28 — Insight trio: Flow Health dial, Leaderboard count-bars, Token analytics tiles

## Task

Build the three analytics-stack surfaces as sibling feature folders: `features/health/` (Flow Health score dial + factor breakdown), `features/leaderboard/` (ranked count-bar table of agent/skill activity), and `features/tokens/` (token analytics stat tiles + single-hue chart cards with LangSmith-style Cost & Tokens grouping). All three are pure presentations of `shared/derived` pure-function output — no analytics logic lives in the client features.

## Why

These surfaces are the product's trust layer: spec §3B decision 7 makes every insight a deterministic pure function over the parsed snapshot (same tree in → same numbers out), and these screens are where that determinism becomes visible readings. The design decisions are equally binding: the health score is "a reading, not a reward" (one sweep, zero overshoot), the leaderboard is explicitly not a podium and not donuts (Vercel count-bar precedent), and token numerals are instrument readings where NumberFlow tweens only user-salient low-frequency values — everything faster snaps. Shipping all three in one task keeps the analytics-stack grammar (stat-tile row over chart cards) consistent across them under one reviewer pass.

## Scope

**IN**

- `features/health/`: 120px masked-arc score dial (`ScoreMeter` primitive) — `hairline` track, `accent` sweep re-colored via `state-*` thresholds, `type-hero` numeral centered; a single `motion-sweep` (450 ms) pass on load or score change, zero overshoot; factor breakdown listing the decision-7 composite inputs (parse success rate, gate pass rate, 1 − failure ratio, staleness decay) with per-factor values; degraded-project state per §4.7 — degraded score plus a per-file parse-failure list linking each file to its raw view.
- `features/leaderboard/`: ranked count-bar table — `type-data` label + right-aligned mono value + proportional `accent-dim` bar behind (count-bar row primitive), `type-hero` rank numerals where the design system's leaderboard treatment calls for them; ranking and counts from `shared/derived/leaderboard`; zero state per §4.7 — header with no rows, copy explaining agent stats come from dispatch telemetry, plus the fidelity note in markdown-only mode.
- `features/tokens/`: analytics stack per system.md grammar — 4-up stat-tile row (`StatCard` primitive: `type-micro` caption, `type-numeral` value with `tok` unit suffix, `type-data` delta badge in `state-pass`/`state-blocked`) over single-hue chart cards; LangSmith-style tab grouping for Cost & Tokens views; NumberFlow on low-frequency user-salient values only (batch totals; live counters snap); zero state per §4.7 — panel stating no token/cost data was found and which sources it looks for, no zeroed fake chart.
- Each feature folder split into `components/` and `hooks/` internally; all values via memoized selectors over the store snapshot calling `shared/derived/{health,leaderboard,tokens}`.
- Locale-correct numerals: counts, costs, and percentages through the shared `Intl.NumberFormat` formatters (spec §4.5).

**OUT**

- The derived functions themselves (`shared/derived/` — T3) and their weights/constants.
- The `StatCard`, `ScoreMeter`, count-bar row, and badge primitives (phase-5) — consumed; gaps extended via props in the primitive's file, never forked.
- The audit-trend heatmap (audits surface, different phase task) despite sharing the analytics grammar.
- Historical/time-series charting beyond the single-hue chart cards the tokens grammar names; CSV export.

## Files in scope

- `dashboard/src/client/features/health/` — create: route-level component composing dial + factor breakdown; a factor-list component; a parse-failure list component (degraded state, links to raw artefact views via the phase-5 route map); a selector hook over `shared/derived/health` output.
- `dashboard/src/client/features/leaderboard/` — create: route-level component; count-bar table component (header + rows, honest empty rendering); a selector hook over `shared/derived/leaderboard` output including markdown-only-mode detection for the fidelity note.
- `dashboard/src/client/features/tokens/` — create: route-level component with tab grouping; stat-tile row component; chart-card grid component (single-hue, `accent`-based, no second hue); a selector hook over `shared/derived/tokens` output plus a NumberFlow eligibility helper (value classed tween-or-snap by update frequency vs animation duration).
- One responsibility per file, all under 300 lines; no modifications outside the three folders except designated lazy route registrations.

## Acceptance criteria

- [ ] All rendered numbers are fixture-reproducible: every value on all three surfaces equals the corresponding `shared/derived` function's output for the fixture tree, consumed via memoized selectors — no aggregation, weighting, ranking, or rounding logic in components or feature hooks beyond formatting.
- [ ] Health dial per spec §3A: 120px masked arc, `hairline` track, `accent` sweep re-colored by `state-*` thresholds, centered `type-hero` numeral; exactly one `motion-sweep` pass previous→new on load/change with zero overshoot; sweep animates via `rotate()` on the masked arc (`stroke-dashoffset` only as a profiled exception on this one ≤120px element); numeral rolls in sync via NumberFlow + `spring-instrument`.
- [ ] Factor breakdown lists the four decision-7 factors with values and labels — score provenance is auditable on-screen, matching the "cites its evidence" contract.
- [ ] Leaderboard renders as a count-bar table — no podium, no donut, no pie; bars are proportional `accent-dim` fills behind right-aligned mono values (bar length via `scaleX`/width set statically per render, animated only as `scaleX` if animated at all); rank order matches the derived ranking exactly.
- [ ] Token tiles: `type-numeral` mono values with `tok` unit suffix, delta badges in `state-pass`/`state-blocked` paired with sign/label (never color-only); NumberFlow applies only to low-frequency user-salient values — any value whose update interval < animation duration snaps, and everything snaps while the global `scrubbing` flag is set.
- [ ] Charts are single-hue (`accent` family) with `accent-dim` area fills; no donut/pie anywhere; heatmap-style or hue-only encodings absent.
- [ ] Zero states per §4.7 for all three surfaces render the real structural frame (dial frame, table header, tile row) with feature-specific factual copy — never lorem, never a blank pane, no zeroed fake chart; health renders a real score even on a fully unparseable fixture, with the per-file parse-failure list linking to raw views.
- [ ] Keyboard + a11y floor: tabs, factor rows, table rows, and parse-failure links reachable and operable by keyboard with visible 2px `accent` focus rings; dial value and bar values exposed as text (numeral + labels), never hue alone; reduced motion snaps the dial sweep and disables NumberFlow rolls natively.
- [ ] Chip/tile/dial updates driven by SSE deltas stay compositor-only (`transform`/`opacity`; the dial exception as profiled) at 60fps under a live fixture update.
- [ ] Every tile, dial, factor row, table row, bar, tab, and link carries `data-testid`; all files under 300 lines; no `any`.

## Test cases

- Unit: health selector hook returns exactly `shared/derived/health` output for a fixture snapshot (identity, not re-derivation); NumberFlow eligibility helper classes a value updating every 200 ms as snap and a batch-total updating once per batch as tween.
- Unit: leaderboard selector preserves derived rank order and flags markdown-only mode from a fixture snapshot lacking event telemetry.
- Component: dial at fixture score 82 renders the numeral "82", sweep angle proportional, threshold color per `state-*` mapping; score change 82→41 triggers one sweep and one numeral roll; reduced-motion renders the new state instantly.
- Component: leaderboard zero-state fixture renders the table header, zero rows, telemetry-source copy, and the fidelity note when markdown-only.
- Component: tokens zero-state fixture renders the sources-searched panel with no chart element present.
- E2E (Playwright, real server + fixture project): load `/health`, `/leaderboard`, `/tokens` → assert by `data-testid` that the health score numeral, top-3 leaderboard labels + counts, and all four stat-tile values equal the values independently computed from the fixture tree (golden expected constants in the spec file); tab to the Cost & Tokens tab groups via keyboard; open a parse-failure link from the degraded-health fixture and land on the raw artefact view.
- E2E (live): scripted fixture write that changes token totals → affected stat tile updates (tween or snap per eligibility) and the health dial re-sweeps once, with no layout shift in the tile row.

## Related context

- Spec §3A → Flow Health score row, Agent Leaderboard row, Token analytics row (+ Trade-offs: donut/pie ban); §3B decision 7 (composite formula, evidence-citing, `Tokens used:` / cost-table sources); §4.7 zero states for health, leaderboard, and tokens.
- system.md → §Component inventory (Stat card, Score dial, Count-bar table row, Status badge), §Layout grammar → Analytics stack (Vercel/Posh/LangSmith), §Motion language → Tokens (`motion-sweep`, `spring-instrument`) + §Live-data patterns → Numerals + Dial/meter rows, §Compositor budget (dial `rotate()` rule), §Type scale (`type-hero`, `type-numeral`, `type-micro`), §Anti-patterns (no donuts, no color-only state).
- All three consume `shared/derived/{health,leaderboard,tokens}` (T3) through memoized selectors over the store snapshot — never recomputed in components; formatting through shared `Intl` utils.

## Gotchas

- The temptation this task exists to resist: re-deriving anything client-side. If a number needs adjusting, the fix belongs in `shared/derived` (T3's domain) with a fixture — never a component-side patch.
- NumberFlow on the wrong values is the named failure: live counters and anything updating faster than its animation duration must snap; tween only batch totals and the health score. The eligibility decision is code, not judgement per call site.
- One sweep per change on the dial — re-triggering the sweep on every SSE delta that leaves the score unchanged is a memoization bug, not a motion bug; the selector must be referentially stable.
- These are three separate lazy route surfaces sharing zero feature-internal code — shared pieces (count-bar row, tile arrangements) live in `components/` primitives or `utils/`, not cross-imported between the three folders.
- No chart library that drags in a second hue or its own animation runtime — chart cards stay within the design system's single-hue + CSS/Motion budget; no static import of the graph or Mermaid chunks anywhere in the trio.
- 300-line cap: each surface splits route component / presentational components / selector hook from the start; the tokens tab grouping and tile row are separate files, never one mega-dashboard file.
