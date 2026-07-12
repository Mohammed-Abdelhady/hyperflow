# T26b — Mission Control live behavior: stream, inspector data, chip flips, coalescing

## Task

Land the live choreography on T26a's standing cockpit: the virtualized event stream with 28px fixed rows in the bottom slot, inspector data wiring from live deltas, zero-layout-shift stage-chip flips, and the stream's ingestion discipline — 100 ms coalescing window, capped stagger, and the >5 rows/s snap-append circuit breaker.

## Why

This is where "instruments settle, they never perform" is proven or broken. Spec §3A commits Mission Control to chips that flip in place with zero layout shift, fixed-height stream rows, and in-flight shown by a 1px determinate hairline — never a pulse or glow. system.md §Live-data patterns defines the exact SSE-path physics (coalescing, stagger cap, circuit breaker, auto-follow pinning) because an uncontrolled event burst is the single biggest 60fps risk in the product: a dispatch batch can tick many files per second, and each must become at most one calm, compositor-only frame of change.

## Scope

**IN**

- Event stream in the bottom slot: fixed-height 28px `type-data` rows (`EventRow` primitive), severity dot + `text-dim` timestamp + `text-mid` message, severity filter chips above, windowed/virtualized rendering over the events slice, auto-follow that pins to the newest row instantly (never smooth-scrolls per row) and suspends when the user scrolls up.
- Stream ingestion discipline: coalesce incoming rows per 100 ms window; one shared 200 ms `motion-enter` entry (`translateY(-4px→0)` + fade on the new row only), stagger cap 3 × 25 ms; sustained rate >5 rows/s trips the circuit breaker — snap-append with a 400 ms one-shot "new" marker fade until the rate falls back under threshold.
- Stage-chip flips across board, roster rows, and Chainline: fixed `min-width` in `ch`, 120 ms `motion-flip` opacity cross-fade between stacked state layers; in-flight = 1px determinate `scaleX` hairline in `state-live` (24px translating hairline segment at 1.6 s period only when indeterminate); zero layout shift on any flip.
- Inspector data wiring: selected entity's panels populate from live deltas via memoized selectors (agent detail, current task, cost rollup); panel content updates settle via `spring-instrument`; `will-change: transform` stays scoped to the inspector per the one-element rule.
- `content-visibility: auto` on off-screen stream rows.
- Reduced-motion variants: chip flip → instant swap; indeterminate hairline removed (label carries state); rows snap-append with ≤80 ms marker fade; wired through the shared reduced-motion hook so a mid-session OS toggle applies immediately.

**OUT**

- Trio layout, roster structure, Chainline wiring, zero states (T26a — this task modifies, never restructures).
- SSE client, leader election, slice reducers (phase-5 — this task consumes the events/mission slices as given).
- Replay scrubbing (T27) — including the global `scrubbing` flag's origin; this task only respects it (all durations zero while scrubbing).
- Event-feed retention/range-fetch policy (store-level, phase-5).

## Files in scope

- `dashboard/src/client/features/missionControl/` — modify. Add stream components under `components/` (stream container wiring the virtualized window + filter chips; row rendering delegates to the `EventRow` primitive) and hooks under `hooks/` (a coalescing/circuit-breaker hook that buffers events-slice updates into 100 ms batches, tracks rows/s, and yields batches tagged animate-or-snap; a selector hook for inspector detail data). Extend T26a's board/roster/Chainline chip usage with the flip-layer treatment and in-flight hairline. Keep every file under 300 lines — the coalescing math lives in its own hook/util with unit tests, not inline in a component.
- No new routes, no store changes, no primitive changes — if a primitive gap surfaces (e.g. `EventRow` lacks a marker-fade affordance), extend the primitive in its own file via props, never fork a local copy.

## Acceptance criteria

- [ ] Stream rows are fixed-height 28px, virtualized, `type-data`; entry animation is `translateY(-4px→0)` + fade on the new row only; no row height, margin, or top/left is ever animated (compositor-only, 60fps under a recorded 10-events/s burst, verified with DevTools frame stats / Percent Dropped Frames p95).
- [ ] Coalescing: N events landing within one 100 ms window render as one batch; ≤3 rows of a batch stagger at 25 ms each, the rest appear with the batch; >5 rows/s sustained trips snap-append (no entry animation) with a 400 ms one-shot marker fade — and animation resumes when the rate drops.
- [ ] Auto-follow pins instantly to the newest row, never smooth-scrolls per row; user scroll-up suspends follow; a follow-resume affordance exists and is keyboard-reachable.
- [ ] Chip flips are zero-layout-shift: fixed `ch` min-width, 120 ms opacity cross-fade between stacked layers; measured layout of neighboring elements is unchanged across a flip (asserted in E2E via bounding-box comparison).
- [ ] In-flight state renders as the 1px determinate `scaleX` hairline in `state-live` (translating segment only when indeterminate) — no pulse, no glow, and every state chip pairs color with its text label.
- [ ] Inspector data updates arrive via memoized selectors over mission/events slices + `shared/derived` functions — no derivation recomputed in component bodies; an SSE delta re-renders only subscribed panels (render-count assertion), and `will-change` remains on the inspector alone.
- [ ] Stream and filter chips are keyboard-navigable: roving tabindex in the stream, filter chips focusable/toggleable, focus ring 2px `accent`.
- [ ] Reduced motion per system.md: instant chip swap, hairline shimmer removed, snap-append with ≤80 ms marker fade — flipped live by the OS-level toggle without reload.
- [ ] While the global `scrubbing` flag is set, every duration in this surface is zero (chips swap, rows snap) — no ghost transitions during replay scrubs.
- [ ] Every row, chip, filter, and affordance carries `data-testid`; all touched files stay under 300 lines; no `any`.

## Test cases

- Unit: coalescing hook — a scripted burst of 12 events across 350 ms yields batches on 100 ms boundaries; 4 events in one window → 3 staggered + 1 immediate; a sustained 8 rows/s stream flips the hook's output to snap mode and back below threshold. Boundary case: exactly 5 rows/s does not trip the breaker; the first window above it does.
- Unit: inspector selector hook returns fixture-derived agent detail and cost rollup; referential stability across unrelated slice updates (memoization proof).
- Component: chip flip between `queued → live → pass` fixture states cross-fades layers without the chip's box size changing; in-flight renders the determinate hairline element.
- Component: reduced-motion context renders instant chip swap and no translating hairline.
- E2E (Playwright, real server + fixture project): scripted fixture write to the watched tree (dispatch status flip in a task file + appended `events.ndjson` line) → within 2 s the roster stage chip flips with zero layout shift (bounding boxes of adjacent roster cells compared before/after) AND one new stream row appends with correct severity/timestamp/message testids.
- E2E: append a scripted >5 rows/s burst to `events.ndjson` → stream snap-appends (no per-row entry animation observable), auto-follow keeps the newest row visible, and scrolling up suspends follow.

## Related context

- Spec §3A → Mission Control row (zero layout shift, `ch` min-width, `motion-flip`, determinate hairline) and Dispatch board rows row (inspector follows selection via `motion-panel` + `spring-instrument`).
- system.md §Live-data patterns → SSE chip flip, Stream entry (the coalescing/stagger/circuit-breaker law), Numerals ("while scrubbing everything snaps"); §Compositor budget (fixed-height rows, `content-visibility: auto`, `will-change` one-element rule, frame-stats verification recipe); §Reduced motion.
- system.md §Component inventory → Event stream row, Stage chip.
- Spec §3B decision 10 — events slice is windowed with capped retention; decision 7 — all derived numbers come from `shared/derived` pure functions through memoized selectors, never recomputed in components.

## Gotchas

- Circuit-breaker math: rate measurement is over the coalesced output, not raw SSE frames — 6 events coalesced into one 100 ms batch is 1 append, not 6 rows/s. Get this wrong and the breaker either never trips or always trips.
- The stagger cap is 3 × 25 ms per batch — a "stagger wave" across the board is a named anti-pattern; anything beyond the cap lands with the batch.
- Fixed-height rows are load-bearing for virtualization AND for the compositor budget — a variable-height message row breaks both; long messages truncate within 28px (full text via the inspector), they never wrap the row taller.
- Auto-follow via smooth-scroll per row is explicitly banned — pin instantly (`scrollTop` set, no behavior:smooth).
- The `scrubbing` flag arrives globally from the replay slice — read it through the shared hook; a locally cached copy will miss the zero-duration contract mid-scrub.
- 300-line cap: the coalescing hook, stream container, and filter chips are separate files from day one; the hook's math must be unit-testable without a DOM.
