# T32 — Audits surface: virtualized findings browser + audit-trend heatmap

## Task

Build the `/audits` feature surface at `dashboard/src/client/features/audits/`: a browser-split findings browser (280px timestamped audit rail + virtualized findings list with severity rollup) and the audit-trend heatmap — 5-step `accent` alpha ramp cells whose values are reachable only via an accessible hover/focus popover, with an honest single-column state when exactly one audit exists.

## Why

Audits are the doctrine's quality record (`.hyperflow/audits/<timestamp>-<scope>.md`); browsing findings and reading the trend across audits is the after-run workflow spec §3A designs for. Findings lists grow unbounded (L5 exhaustive reviews produce hundreds of rows), so virtualization is a §3B decision-10 requirement, not an optimization. The heatmap's popover-not-in-cell rule is the a11y path — hue alone never carries a value (system.md accessibility floor).

## Scope

**IN**
- `features/audits/` folder (components/ hooks/ utils/) implementing the `/audits` route surface on the browser-split grammar, `?slug=` deep links.
- Audit rail: timestamped audit list with scope + verdict badge per entry.
- Findings pane: virtualized findings list (windowed rendering via the T24 list hooks) — severity dot + finding text + file/line references, severity filter chips above, per-audit severity rollup header.
- Audit-trend heatmap: cells on `r-1`, 5-step `accent` alpha ramp keyed to finding counts; value + breakdown exposed via popover on hover AND keyboard focus (the popover is the a11y path); cell change is a `motion-flip` cross-fade, no stagger wave across the grid.
- Single-audit state: single-column heatmap rendered honestly (no fake trend axis) with the note that trends appear from the second audit onward (spec §4.7).
- Degraded rendering (raw + badge) for `parseError` audit files; audits zero state.

**OUT**
- Any write affordance — audits are read-only.
- The heatmap trend derivation (aggregation over parsed audits comes from the shared derived/selector layer over the T20 slice — this task renders it; if a rollup selector is missing, add it as a memoized selector in this feature's hooks over snapshot data, not as a fork of `shared/derived/`).
- `HeatmapCell` primitive internals (T22 shipped it; this task composes cells into the grid + popover behavior).
- Flow Health / leaderboard surfaces (phase-6), audit creation or fix-gate actions.

## Files in scope

- `dashboard/src/client/features/audits/components/AuditsSurface.tsx` — route composition: browser-split + heatmap panel placement.
- `dashboard/src/client/features/audits/components/AuditRail.tsx` — timestamped audit list with verdict badges.
- `dashboard/src/client/features/audits/components/FindingsList.tsx` — virtualized findings list + severity rollup header (windowing via T24 list hooks; row component kept separate).
- `dashboard/src/client/features/audits/components/FindingRow.tsx` — one finding line: severity dot, text, file/line refs (fixed-height virtualization item).
- `dashboard/src/client/features/audits/components/SeverityFilters.tsx` — filter chips over the list (filter state in the UI slice, never re-rendering the rail).
- `dashboard/src/client/features/audits/components/TrendHeatmap.tsx` — heatmap grid composing T22 `HeatmapCell`, popover wiring, single-column honest state.
- `dashboard/src/client/features/audits/hooks/useAuditsSlice.ts` — memoized selectors: audit list, selected audit findings, severity rollups.
- `dashboard/src/client/features/audits/hooks/useHeatmapModel.ts` — memoized trend-grid model (audit × severity/count buckets → 5-step ramp indices), single-audit detection (pure logic).
- `dashboard/src/client/features/audits/utils/severity.ts` — severity ordering/labels/state-token mapping (enum + mapping object, no conditional chains).
- Route registration touch: `/audits` route entry in `dashboard/src/client/app/router.tsx` points at the lazy `AuditsSurface`.

## Acceptance criteria

- [ ] `/audits` renders the fixture tree: rail lists audits with timestamps + verdict badges; selecting one renders its findings with severity rollup; `?slug=` deep links work.
- [ ] Findings list is virtualized beyond 100 findings: with a 500-finding fixture, DOM row count stays bounded (windowed) while scroll reaches every finding; severity filters narrow the window without re-rendering the rail.
- [ ] Heatmap cells never print values in-cell and never rely on hue alone: value + breakdown are reachable via hover popover AND keyboard focus popover (focusable cells, popover dismissible, focus ring per system.md).
- [ ] Exactly one audit renders a single-column heatmap with no fake trend axis and the trends-from-second-audit note (spec §4.7 verbatim behavior).
- [ ] Cell updates cross-fade at `motion-flip` (120ms) with no stagger wave; reduced-motion snaps.
- [ ] Verdict vocabulary renders uppercase and exact (`PASS · NEEDS_FIX · BLOCKED · SECURITY_VIOLATION`), always label + color, never color-only.
- [ ] `parseError` audit files render raw with a degraded badge; empty tree renders the `EmptyState` copy.
- [ ] Every interactive element (rail rows, filter chips, heatmap cells, popovers) carries `data-testid`; design-system tokens only; RTL-safe logical properties; no file over 300 lines; no `any`; no inline business logic in JSX.

## Test cases

- Unit: `useHeatmapModel` maps fixture audits to correct 5-step ramp indices, flags the single-audit case, and returns stable references when unrelated slices update.
- Unit: `severity.ts` maps every severity to its state token and ordering; unknown severity degrades to a safe default (never throws).
- Component: `FindingsList` with a 500-finding fixture renders a bounded DOM row count and correct rollup totals; filter chips reduce visible rows.
- Component: `TrendHeatmap` single-audit fixture renders one column + note; two-audit fixture renders the trend grid.
- E2E (Playwright): navigate `/audits` on the fixture project → select an audit → scroll the virtualized list to the last finding of a >100-finding fixture → apply a severity filter → assert filtered rows.
- E2E (heatmap keyboard popover): Tab/arrow to a heatmap cell → assert the popover opens on focus with the cell's value text → Escape dismisses → hover the same cell → assert the same value; zero console errors.

## Related context

- Spec §3A "Audit-trend heatmap" row (5-step ramp, popover-only values, `motion-flip`, no stagger) and "Plan/spec/audit browsers" row (browser-split).
- Spec §3B decision 10 (audit findings are a named virtualized list) and decision 12 (`data-testid`-only selection).
- Spec §4.2 (degrade-to-raw) and §4.7 "Audit heatmap with exactly one audit".
- Spec §5 tree — `features/audits/`, `parser/audits.ts` ("audit findings + severity rollup per file" — the parsed shape consumed here).
- `.hyperflow/design/system.md` — Component inventory (Heatmap cell, Status badge, Roster row, Event stream row for severity-dot treatment), Motion language §Live-data patterns (dial/heatmap row) + §Reduced motion, Accessibility floor (popover as the value path, focus ring, roving tabindex).
- Consumes: T20 audits slice/selectors + UI slice for filters, T22 primitives (`HeatmapCell`, `StatusBadge`, `RosterRow`, `EmptyState`), T24 list hooks + Intl formatters, `shared/schemas/snapshot.ts` audit types.

## Gotchas

- Virtualized rows must be fixed-height (`FindingRow`) — variable-height rows break windowing math; long finding text truncates with full text in the row's detail affordance, not by growing the row.
- Filter state lives in the UI slice per §3B decision 10 — wiring it into the data selector chain re-renders the rail and heatmap on every chip toggle.
- The popover is the accessibility contract: `HeatmapCell` gets focus + popover behavior here, but keep the primitive presentational — the grid owns popover state (one open at a time), or 50 cells each own a portal.
- No stagger wave: when an SSE delta updates multiple cells, each cross-fades independently at 120ms — a coordinated wave is explicitly banned by system.md anti-patterns.
- 5-step ramp is alpha steps of the single `accent` — introducing a second hue for "severity" violates the one-accent rule; severity color belongs only to the state-token severity dots in the list.
- 300-line cap: `TrendHeatmap` + popover wiring is the bloat risk — extract the popover into its own component early. No inline business logic in JSX — ramp math and bucket logic live in `useHeatmapModel`.
