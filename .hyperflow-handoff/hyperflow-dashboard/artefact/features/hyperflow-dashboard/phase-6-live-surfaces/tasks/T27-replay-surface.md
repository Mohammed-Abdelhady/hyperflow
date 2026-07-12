# T27 — Replay surface: timeline index, 1:1 scrubber, stepping, history rail

## Task

Build `src/client/features/replay/` — the Chain Replay surface: a timeline index over recorded events, the Chainline in scrub mode as a 1:1 direct-manipulation scrubber with the global `scrubbing` snap flag, `spring-settle` release to the nearest event boundary, arrow/Shift-arrow keyboard stepping, a left history rail of prior runs, and on-demand range fetch from `GET /api/v1/events` so scrubbing never depends on full in-store event retention.

## Why

Replay is the temporal half of the product's promise: markdown captures state, `events.ndjson` captures sequence, and replay is where sequence becomes inspectable. Spec §3A commits scrubbing to direct manipulation — the playhead tracks the pointer 1:1 with zero smoothing, and a global `scrubbing` flag zeroes every duration so the whole board snaps to the scrubbed instant, because replay fidelity beats visual continuity (an accepted trade-off: the board must never animate through intermediate states that never co-existed). The release settle via `spring-settle` is deliberately the product's one velocity-driven, mildly bouncy moment — the playhead is a physical object; the data it reveals is not.

## Scope

**IN**

- Replay route layout per system.md grammar: Chainline scrub header + cockpit trio beneath + left history rail listing prior runs (timestamped, selectable).
- Timeline index: runs and event boundaries derived from the replay slice (fed by phase-5 stores + the events route); stage boundaries derived for Shift-stepping.
- Scrubber (Chainline scrub mode via the phase-5 `Scrubber`/`Chainline` primitives): hairline rail, event ticks, `r-full` playhead, elapsed `accent` `scaleX` fill; pointer drag tracks 1:1 with zero smoothing; while dragging, the global `scrubbing` flag is set and every duration on the board is zero.
- Release behavior: playhead settles to the nearest event boundary via `spring-settle` (stiffness 300 / damping 30 / mass 1), inheriting pointer velocity; under reduced motion the settle is an instant snap while 1:1 drag stays.
- Keyboard stepping: Left/Right arrow steps one event, Shift+arrow steps one stage; Home/End jump to run start/end; the playhead is focusable with a visible focus ring and the scrubbed position is announced accessibly (e.g. `aria-valuenow`/`aria-valuetext` slider semantics).
- Scrubbed-instant board state: the trio beneath renders the chain state at the scrubbed event (stage chips, roster, stream window) — snapping, never tweening, between instants.
- On-demand range fetch: scrubbing to a region outside in-store retention triggers a TanStack Query range fetch of `/api/v1/events`; in-flight fetch shows the last-good state with a stale affordance, never a blank board.
- Zero states per spec §4.7: single-event run → timeline renders that one event with the scrubber disabled and a note that replay becomes meaningful with more events (no division-by-zero on duration scaling); `events.ndjson` absent → the surface's degraded markdown-only variant with the reduced-fidelity banner contract from phase-5.

**OUT**

- The `Chainline`/`Scrubber` primitives themselves (phase-5) — consumed and driven, not created.
- The events route, tailer, and replay slice reducers (phase-4/5).
- Mission Control's live surface (T26a/b) — replay renders its own board from replay state; shared visual components come from primitives, not from importing missionControl internals.
- Export/share of replays; playback-at-speed (auto-play) — v1 is scrub + step only.

## Files in scope

- `dashboard/src/client/features/replay/` — create the feature folder with `components/` and `hooks/` inside. Expected shape (one responsibility per file, all under 300 lines): a route-level layout component (scrub header + trio + history rail); a history-rail component (timestamped run list, selection); a scrub-header component driving the Chainline scrub mode; a board component rendering the scrubbed instant; hooks for the timeline index (memoized event/stage boundary derivation from the replay slice), for scrub interaction (pointer capture, 1:1 position math, global `scrubbing` flag set/clear, release settle trigger, keyboard stepping), and for range fetching (TanStack Query over `/api/v1/events` keyed by run + range).
- No modifications outside `features/replay/` other than the designated lazy route registration point.

## Acceptance criteria

- [ ] Dragging tracks the pointer 1:1 — no easing, no smoothing, no lag-behind interpolation; playhead motion during drag is direct position mapping (transform-based, compositor-only, 60fps in a DevTools trace across a full-rail drag).
- [ ] While scrubbing, the global `scrubbing` flag zeroes every duration board-wide: chips swap without cross-fade, numerals snap, no ghost transitions through intermediate states — asserted by scrubbing across a multi-state fixture and confirming no intermediate state renders.
- [ ] On release the playhead settles to the nearest event boundary with `spring-settle`, inheriting pointer velocity; this is the only bouncy motion on the surface; board state corresponds to the settled boundary, not the raw release position.
- [ ] Keyboard path is complete: focusable playhead with 2px `accent` focus ring, arrow = event step, Shift+arrow = stage step, Home/End = run bounds; each step updates the board identically to a pointer scrub to that boundary; slider ARIA semantics expose position and current-event text.
- [ ] History rail lists prior runs from fixture data with timestamps; selecting a run (pointer AND keyboard) loads its timeline; rows follow the roster-row selection treatment.
- [ ] Scrubbing beyond in-store retention issues exactly one deduplicated range fetch per uncovered range (TanStack Query dedup), renders last-good state with a stale affordance meanwhile, and never blanks the board.
- [ ] Zero states per §4.7: one-event run renders the real timeline structure with the disabled scrubber and factual note (no lorem, no division-by-zero — duration-scaling guard unit-tested); absent `events.ndjson` renders the degraded variant with the reduced-fidelity banner.
- [ ] Reduced motion: 1:1 drag stays (direct manipulation, not animation); release settle becomes an instant snap; honored live on OS toggle.
- [ ] Playhead motion, fill, and every animated property stay on `transform`/`opacity` (fill = `scaleX`, playhead = `translateX` — never `left`); every interactive element (playhead, ticks, history rows, step targets) carries `data-testid`; all files under 300 lines; no `any`.

## Test cases

- Unit: timeline-index hook — fixture event list in, event boundaries + stage boundaries out; single-event run yields a disabled-scrubber index with defined (non-NaN, non-Infinity) scale; empty list yields the degraded variant state.
- Unit: scrub-interaction hook — position math maps rail fraction ↔ nearest boundary correctly at run start, run end, and between dense/sparse tick regions; release at a mid-gap position selects the nearer boundary; Shift-step from mid-stage lands on the next stage boundary.
- Component: while a simulated drag is active the `scrubbing` flag is set in the store and cleared on release; board chip renders without transition classes during the drag.
- E2E (Playwright, real server over a canned fixture `events.ndjson`): drag the playhead across the rail → board state changes track the pointer (sampled positions match expected fixture states) with no intermediate cross-fades; release mid-gap → playhead settles onto the nearest event tick and the board shows that boundary's state.
- E2E: focus the playhead → ArrowRight steps to the next event (board + `aria-valuetext` assert), Shift+ArrowRight steps to the next stage, End jumps to the final event; all asserted by `data-testid` + ARIA, no text/class selectors.
- E2E: select an older run in the history rail, scrub to its start → range fetch fires (network assertion), board renders fixture-derived early-run state, no blank frame.

## Related context

- Spec §3A → Chain Replay row (1:1 direct manipulation, global `scrubbing` flag, `spring-settle` release, arrow/Shift-arrow stepping, history rail; n8n executions-rail grounding) and Trade-offs accepted ("scrubbed replay never animates through intermediate states").
- system.md → §Signature element (Chainline scrub mode: event ticks, `r-full` playhead), §Motion language → Tokens (`spring-settle` — the one velocity-driven bounce) and §Live-data patterns → Scrubber row + Numerals row ("while scrubbing everything snaps"), §Reduced motion (drag stays, settle snaps), §Layout grammar → Replay row.
- Spec §2c + §3B decision 10 — event feed caps in-store retention with on-demand range fetch from `/api/v1/events` for the scrubber; §4.7 replay zero state; §4.3 `events.ndjson`-absent fallback.
- Scrubbed-instant state and boundary derivation use `shared/derived` functions and memoized selectors — never recomputed in component bodies.

## Gotchas

- The `scrubbing` flag is global by design — T26b and every live surface read it. Scoping it locally to replay breaks the "everything snaps while scrubbing" contract on any surface visible alongside replay.
- `spring-settle` applies to the playhead ONLY — the board content at settle must snap to the boundary state; springing board data violates the data-never-bounces rule.
- Never animate the playhead with `left`/`top` — `translateX` only; the elapsed fill is `scaleX` with leading-edge origin, never `width`.
- Division-by-zero on duration scaling with 0 or 1 events is the named §4.7 hazard — guard the scale math before any render, not in the render.
- Range-fetch responses can arrive after the user has scrubbed elsewhere — apply only if the range still covers the current position; stale responses must not yank the board backwards.
- Replay is its own lazy route chunk — no static import of the graph chunk or Mermaid, and no imports from `features/missionControl/` internals (shared visuals live in `components/` primitives).
- 300-line cap: interaction math (pointer capture, boundary snapping, velocity handoff) lives in hooks/utils with DOM-free unit tests — components stay declarative.
