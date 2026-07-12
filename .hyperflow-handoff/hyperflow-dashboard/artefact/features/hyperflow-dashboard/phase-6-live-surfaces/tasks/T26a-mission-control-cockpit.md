# T26a — Mission Control cockpit: trio layout, dispatch board, Chainline live wiring

## Task

Build the standing structure of `src/client/features/missionControl/`: the cockpit-trio layout (dispatch board as the one primary instrument + 360px right inspector shell + collapsible 240px bottom-stream slot), the dispatch board's agent-roster rows with selection behavior, and the Chainline wired in live mode as the Mission Control header. This task delivers the surface's skeleton and static-data rendering; T26b lands the live event behavior on top.

## Why

Mission Control is the product's landing surface and the design pole's proof: spec §3A demands it "feels like a flight deck holding steady, not a feed scrolling past". The cockpit trio is the layout grammar the design system assigns this screen (Databricks precedent), and the Chainline in live mode is the signature element's primary home. Splitting structure (T26a) from live behavior (T26b) keeps each diff reviewable and respects the 300-line cap — the trio layout, roster rows, and Chainline wiring are already a full task before any SSE choreography arrives.

## Scope

**IN**

- Trio layout component for the `/mission` route: primary dispatch board region, 360px right inspector shell (`InspectorPanel` primitive hosted, slide-in via `motion-panel` + `spring-instrument`), collapsible bottom-stream slot (240px, collapse/expand snaps layout with `clip-path` + fade reveal) — the slot only; the stream's rows and live behavior are T26b.
- Dispatch board: one agent-roster row per worker (`type-ui` agent name + stage chip + live cost in `type-data`, right-aligned), reading agents/stages/costs from the mission Zustand slice via memoized selectors; selection = `accent-dim` fill + 2px `accent` left inset; selection drives which entity the inspector shell shows.
- Chainline live-mode wiring in the Mission Control header: stage ticks from the current chain's parsed stages, `accent` `scaleX` fill advancing with the live stage, per-stage token-cost sub-line from `shared/derived/tokens` selectors.
- The board's chain-graph view slot consuming T25's `GraphCanvas` behind `React.lazy` (task DAG of the running chain), including the graph↔table toggle inherited from T25.
- Mission Control zero state per spec §4.7: no run ever recorded → hero pane explaining what a run is with the exact terminal command (`/hyperflow:plan`), rendered inside the same layout skeleton as the live version so the first run animates in place.
- Feature-internal split into `components/` and `hooks/` per the frontend structure standard.

**OUT**

- Event stream rows, virtualization, coalescing, circuit breaker (T26b).
- Inspector *data* wiring beyond the selection contract — populating panels from live deltas is T26b.
- Chip-flip animation discipline and in-flight hairline (T26b — chips render statically correct here).
- The Chainline component itself and other primitives (`StageChip`, `RosterRow`, `InspectorPanel`, `EventRow` — phase-5).
- Replay mode and record mode of the Chainline (T27 and browser surfaces respectively).

## Files in scope

- `dashboard/src/client/features/missionControl/` — create the feature folder with `components/` and `hooks/` inside. Expected shape (final naming to the implementer, one responsibility per file, all under 300 lines): a route-level layout component composing the trio; a dispatch-board component rendering roster rows from the mission slice; a board-header component wiring the `Chainline` primitive in live mode; an inspector-shell component hosting `InspectorPanel` and following selection; a collapsible bottom-slot component; hooks for mission-slice selection (memoized selectors over the mission slice + `shared/derived` functions) and for board selection state (its own UI slice — selection changes must not re-render the roster list).
- No modifications outside `features/missionControl/` other than registering the route's lazy component in the phase-5 router if a registration point is designated there.

## Acceptance criteria

- [ ] `/mission` renders the cockpit trio per system.md layout grammar: one primary board, 360px inspector, collapsible 240px bottom slot; page gutter `sp-5`; every value a design token — no inline magic numbers.
- [ ] Roster rows render per system.md Roster row spec: 36px (28px dense), hover `surface-2`, selected `accent-dim` fill + 2px `accent` left inset; agent name `type-ui`, stage chip, cost right-aligned in `type-data` with `tok` unit.
- [ ] Selection is fully keyboard-operable: roving tabindex across roster rows, Enter/Space selects, the inspector shell follows selection; selecting a row updates only the row + inspector — the roster list itself does not re-render (selection lives in a UI slice, verified via React profiler or render-count assertion).
- [ ] Inspector slides in with `translateX` under `motion-panel` + `spring-instrument` (critically damped — zero overshoot); `will-change: transform` applied on animation start and removed on settle, and on no other element.
- [ ] Bottom-slot collapse/expand: layout snaps, revealed content fades via `clip-path: inset()` + `motion-enter` — no height animation; toggle is keyboard-operable.
- [ ] Chainline renders in live mode: stage ticks, `type-micro` labels, `type-data` per-stage cost sub-line, single `accent` `scaleX` fill — fill advances when the mission slice's stage changes (static correctness; flip choreography is T26b).
- [ ] The chain graph loads via `React.lazy` from T25's chunk; the mission route's own chunk contains no React Flow/elkjs/Mermaid code; graph nodes show token-cost chips (Clay precedent) from fixture-derived selector values.
- [ ] Zero state per §4.7 renders the real layout skeleton (trio regions present) with fact-then-action copy naming the exact command — no illustration, no lorem, and the structure is the real parsed-data shape so the first run animates in place.
- [ ] 60fps compositor-only budget on inspector slide, bottom-slot reveal, and Chainline fill (`transform`/`opacity` only; fill is `scaleX` origin-left, never width).
- [ ] Every interactive and testable element carries `data-testid`; all files under 300 lines; no `any`.

## Test cases

- Unit: mission selection hook — given a fixture mission slice, selectors return roster rows with agent/stage/cost; selecting an agent id updates only the selection slice.
- Component: trio layout renders all three regions with correct testids; roster row selection applies inset+fill classes and swaps inspector content; keyboard Enter on a focused row selects it.
- Component: zero-state fixture (empty mission slice) renders hero copy containing `/hyperflow:plan` inside the trio skeleton — asserted by testid, not text position.
- Component: Chainline live mode given a 4-stage fixture with stage 2 active renders 4 ticks, fill scaled to the active stage, and per-stage cost lines.
- E2E (Playwright, fixture project, `data-testid` selectors from `tests/e2e/utils/selectors.ts`): load `/mission` → trio regions present; click a roster row → inspector shows that agent; Tab + Enter selects the next row (keyboard path); toggle the board's graph↔table view via keyboard; assert the React Flow chunk was fetched lazily after route paint.
- E2E: `/mission` on an empty fixture tree → zero-state hero visible by testid with the terminal command rendered, nav still functional.

## Related context

- Spec §3A → Mission Control row (flight-deck decision, trio, tokens), Dispatch board rows row (instrument roster, selection, inspector follow), Signature — the Chainline (live mode), and §4.7 first bullet (zero state with matching skeleton).
- system.md → §Signature element (Chainline live mode behavior), §Layout grammar (Cockpit trio: Databricks/WRITER), §Component inventory (Roster row, Inspector panel, Stage chip), §Motion language (motion-panel, spring-instrument, will-change rule, expand/collapse rule).
- Spec §3B decision 10 — mission slice + UI slices split so selection never re-renders data lists; derived costs come from `shared/derived/tokens` via memoized selectors — never recomputed in components.

## Gotchas

- The graph is a lazy chunk: importing `GraphCanvas` statically from any missionControl file defeats T25's code-split boundary — only `React.lazy`/dynamic import.
- `spring-instrument` is critically damped by design — do not substitute `spring-settle` (which bounces) for the inspector; data instruments never overshoot.
- Collapse/expand must not animate height — layout snaps and content reveals via `clip-path`; animating the slot's height is on the banned list.
- Selection state belongs in its own UI slice: wiring it into the mission data slice makes every SSE delta re-render the roster — the exact anti-pattern §3B decision 10 forbids.
- 300-line cap: the trio layout plus board plus header will not fit one file — split by component/hook responsibility from the start, never compress to dodge the cap.
- Chip static rendering here must already use fixed `min-width` in `ch` (system.md Stage chip spec) so T26b's flip choreography lands without retrofitting layout.
