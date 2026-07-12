# T23 — Instrument primitives (Chainline signature)

## Status

| Field      | Value                 |
|------------|-----------------------|
| Task       | T23                   |
| Role       | Implementer           |
| Complexity | m                     |
| Batch      | B1                    |
| Depends on | T4 (design tokens)    |
| Reviewers  | motion, designer      |

## Task

Build the product's signature instrument set: the Chainline stage-strip (one component, three modes — live, scrub, record), the StageChip, the ScoreMeter dial, the Scrubber (Chainline's scrub mode made concrete), and the shared `use-reduced-motion` hook that every animated component in the app binds to.

## Why

The Chainline is the product's spine and recognizability (spec §3A Signature): one monospace stage-strip that is simultaneously the live progress indicator on Mission Control, the draggable replay timeline, and the frozen provenance header on artefact views. Its motion behavior — settle, never perform — is the design system's thesis rendered in code, and the `use-reduced-motion` hook built here is the WCAG 2.3.3 floor for the whole client.

## Scope

**IN:**
- `Chainline.tsx` — one component, mode prop `live | scrub | record` per system.md §Signature: hairline rail, stage ticks, `type-micro` stage labels, per-stage token-cost sub-line in `type-data`, single `accent` fill advancing via `scaleX` with transform-origin at the leading edge (logical: origin flips under RTL). Live mode: fill advances as the stage prop changes, cost accumulates beneath. Record mode: frozen strip; each stage is a focusable click target emitting a stage-selected callback (the "jump the inspector" affordance — spec §3A). Scrub mode: delegates interaction to Scrubber.
- `StageChip.tsx` — `r-1`, state `-dim` fill + full-strength label, `type-ui`, fixed `min-width` in `ch` so state flips cause zero layout shift; state change is a 120ms (`motion-flip`) opacity cross-fade between stacked state layers; in-flight tell is the 1px determinate `scaleX` hairline in `state-live` — or the 24px translating hairline segment at 1.6s period when indeterminate — never a pulse or glow (system.md §Live-data patterns).
- `ScoreMeter.tsx` — the score dial: 120px masked arc, `hairline` track, `accent` sweep re-colored by `state-*` thresholds, `type-hero` numeral centered; a single `motion-sweep` (450ms) pass previous→new with zero overshoot, numeral rolls in sync; sweep uses `rotate()` on the masked arc (`stroke-dashoffset` allowed only as the profiled exception on this one ≤120px element).
- `Scrubber.tsx` — Chainline scrub mode: hairline rail, event ticks, `r-full` playhead knob, elapsed `accent` `scaleX` fill. Dragging is direct manipulation — playhead tracks the pointer 1:1 with zero smoothing, and the component raises/lowers the global `scrubbing` flag (T20's replay slice) that zeroes durations app-wide so board state snaps through scrubbed instants. On release the playhead settles to the nearest event boundary via `spring-settle` (stiffness 300, damping 30, mass 1), inheriting pointer velocity — the one permitted bounce. Keyboard: arrow keys step events, Shift+arrow steps stages (roving focus on the playhead).
- `hooks/use-reduced-motion.ts` — shared runtime hook: `matchMedia('(prefers-reduced-motion: reduce)')` with a change listener so a mid-session OS toggle takes effect immediately; zeroes the CSS duration custom properties and feeds `MotionConfig reducedMotion="user"`; exposes the flag for components that must branch (spring → instant snap).

**OUT:**
- The replay feature surface, timeline data fetching, playback logic (replay phase) — Scrubber is a controlled component over typed props.
- Mission Control composition and SSE wiring (feature phase); NodeCard/InspectorPanel/EventRow (T24).
- React Flow viewport animation (graph chunk phase).

## Files in scope

- `dashboard/src/client/components/Chainline.tsx` — create. Mode switching, rail/ticks/labels/cost sub-line, `scaleX` fill; keep interaction thin — scrub interaction lives in Scrubber, record-mode click targets are plain buttons.
- `dashboard/src/client/components/StageChip.tsx` — create. Stacked-layer cross-fade, `ch`-based `min-width`, determinate/indeterminate in-flight hairline. Reuses the shared state→token mapping object (see T22).
- `dashboard/src/client/components/ScoreMeter.tsx` — create. Masked-arc SVG, threshold re-coloring via state tokens, NumberFlow-synced numeral (snap when update interval < animation duration).
- `dashboard/src/client/components/Scrubber.tsx` — create. Pointer capture, 1:1 tracking, `scrubbing` flag contract (callback props — no direct store import), `spring-settle` release via Motion for React, keyboard stepping.
- `dashboard/src/client/hooks/use-reduced-motion.ts` — create. The single reduced-motion source of truth; T22/T24 CSS fallbacks stay CSS-level, but every JS-driven animation branches on this hook.

## Acceptance criteria

- [ ] Every visual and motion value binds to a named token: `hairline`, `accent`, `accent-dim`, `state-live` (+ all `state-*` for chip states and meter thresholds), `type-micro`/`type-data`/`type-ui`/`type-hero`, `r-1`/`r-full`, `motion-flip`/`motion-sweep`, `ease-out`, `spring-settle` (300/30/1), `spring-instrument` (260/34/1) — zero hardcoded durations, bezier values, spring constants, colors, or sizes.
- [ ] Anti-slop constraints hold: no glow, no pulse on in-flight (the 1px determinate hairline or translating segment is the only tell), hairline separators only, all numerals and cost sub-lines in the mono data face, no spring overshoot on any data instrument (`spring-instrument` is critically damped; `spring-settle` is legal on the playhead alone).
- [ ] Compositor budget: `transform`/`opacity` only — fills via `scaleX` with leading-edge origin, playhead motion via `translate`, never `width`/`left`/`top`; StageChip's `ch` `min-width` guarantees zero layout shift on state flips (asserted by layout-shift probe in tests).
- [ ] Chainline is genuinely one component: live/scrub/record are modes of the same rail/tick/label structure, not three implementations; record-mode stages are keyboard-focusable and fire the jump callback.
- [ ] Scrubber drag is 1:1 (pointer delta = playhead delta, no easing during drag) and raises/clears the `scrubbing` flag via its callback contract on drag start/end.
- [ ] ScoreMeter runs exactly one `motion-sweep` pass per value change with zero overshoot, and its numeral snaps (no roll) when changes arrive faster than the animation duration.
- [ ] `data-testid` on every interactive element: record-mode stage buttons, scrubber playhead and rail, chip root; components accept testid pass-through.
- [ ] Reduced-motion fallback per component, driven by `use-reduced-motion` at runtime (mid-session toggle honored): chip flip → instant swap with label kept, indeterminate hairline removed (label carries in-flight), meter sweep and numeral snap, `spring-settle` release → instant snap to the boundary — while the 1:1 scrubber drag itself STAYS (direct manipulation, not animation).
- [ ] RTL-safe: rail direction, fill origin, tick order, and arrow-key semantics mirror under `dir="rtl"` via logical properties and direction-aware key mapping.
- [ ] Focus: 2px `accent` outline, 2px offset on playhead, stage buttons, chips-as-buttons; keyboard stepping works without a pointer.
- [ ] One component per file, pure over typed props (no store imports), no file over 300 lines, no `any`.

## Test cases

- Unit (Chainline): all three modes render from one fixture chain (stages + per-stage costs); live-mode stage advance moves only the `scaleX` transform (style assertion); record-mode stage click/Enter fires the jump callback with the stage id.
- Unit (StageChip): flipping through all five states produces zero width change (measure before/after); indeterminate mode renders the translating hairline, not an opacity pulse; reduced-motion removes the indeterminate hairline and keeps the label.
- Unit (ScoreMeter): value 42 → 87 triggers exactly one sweep; thresholds re-color via `state-fix`/`state-blocked` token classes; two value changes 100ms apart (< `motion-sweep`) snap without tween.
- Unit (Scrubber, the headline case): synthetic pointer drag of N px moves the playhead exactly N px with zero intermediate easing (1:1 assertion at multiple sample points); drag start raises the `scrubbing` callback, release lowers it and settles the playhead to the nearest event boundary with the `spring-settle` token's spring config (spy on the Motion transition object); with reduced motion emulated, release snaps instantly (no spring invoked) while drag remains 1:1.
- Unit (use-reduced-motion): flipping the mocked `matchMedia` listener mid-test propagates to a subscribed component without remount.
- E2E (Playwright, replay fixture or primitives gallery): drag the scrubber by `data-testid` and assert the board region snaps (no transition classes active while `scrubbing`); arrow-key steps move one event tick, Shift+arrow one stage; repeat the drag under `page.emulateMedia({ reducedMotion: 'reduce' })` and assert the settle is instant; run once in RTL and assert the fill grows from the inline-start edge.

## Related context

- system.md §Signature element (the Chainline contract: one component, three modes, functional never decorative), §Motion language in full — tokens table, compositor budget, Live-data patterns (SSE chip flip, Scrubber, Dial/meter rows), §Reduced motion (the hard floor this task's hook implements).
- Spec §3A Signature + per-feature rows for Mission Control (chips flip in place, `min-width` in `ch`, 1px determinate hairline — never pulse/glow), Chain Replay (1:1 scrub, global snap, `spring-settle` with inherited velocity, arrow/Shift-arrow stepping), Flow Health (single sweep, "a reading, not a reward").
- Grounding: Replit stage-chip progress strip and n8n executions rail (Mobbin URLs in system.md §References) — the Chainline's deliberate divergence is fusing indicator, scrubber, and provenance into one navigable instrument.
- Libraries per system.md §Motion Libraries: CSS transitions for chip flips (hot SSE path), Motion for React v12 for scrub-settle, NumberFlow for the meter numeral. GSAP is rejected — do not introduce it.

## Gotchas

- 300-line cap: Chainline (three modes) and Scrubber (pointer + keyboard + spring) are both at risk — extract tick-geometry math and key-mapping helpers into small utils.
- No inline business logic in JSX — stage geometry, boundary-snap resolution, and direction-aware key maps are pure helpers.
- UI-state changes must not re-render data lists: the `scrubbing` flag flows through T20's replay slice via callbacks; Scrubber must not subscribe to the events slice itself.
- Never two animators on one element (system.md) — the playhead is Motion-driven on release and raw transform during drag; ensure the drag handler writes the same transform channel the spring animates, or the handoff jumps.
- `will-change` budget is already spent (inspector panel, T24) — do not add `will-change` here.
- `scaleX` fills need `transform-origin` at the logical leading edge; under RTL that is the right edge — derive it from direction, don't hardcode `left`.
- NumberFlow respects reduced motion natively, but the sweep and spring do not — they must branch on `use-reduced-motion` explicitly.
