# phase-6-live-surfaces

| Field | Value |
|-------------|--------------------------------------------------------------|
| Status | pending |
| Progress | `░░░░░░░░░░` 0 / 5 tasks (0%) |
| Depends on | `phase-4-server-api-cli, phase-5-client-foundation` |
| Specialists | `frontend-reviewer, accessibility-reviewer, motion, designer` |

## Goal

Build the dashboard's live experiential surfaces on top of the phase-5 client foundation: the lazy graph chunk (React Flow + elkjs), the Mission Control cockpit with its live dispatch board, inspector, and event stream, the Chain Replay scrubber, and the insight trio (Flow Health dial, Agent Leaderboard, Token analytics). These are the screens where the design system's live-data patterns (spec §3A, system.md Motion §Live-data patterns) meet real SSE deltas — chip flips with zero layout shift, coalesced stream entries with a snap-append circuit breaker, 1:1 scrubbing that snaps board state, and instrument numerals that settle without performing.

## Exit criteria

- [ ] Mission Control reflects a scripted dispatch (fixture-tree file write observed by the real watcher) within 2 s: stage chip flips in place, agent roster row updates, one stream row appends.
- [ ] Chain Replay scrubs a canned `events.ndjson`: pointer drag tracks 1:1 with board state snapping per instant, release settles the playhead to the nearest event boundary, arrow keys step events and Shift-arrow steps stages.
- [ ] The insight trio (Flow Health, Leaderboard, Token analytics) renders values derived from the committed fixture tree via `shared/derived` selectors — same fixtures in, same numbers out, asserted by `data-testid`.
- [ ] Every pointer interaction on these surfaces has a keyboard path: graph canvases expose the table-view toggle, the scrubber steps by keyboard, rosters and streams use roving tabindex.
- [ ] Graph and replay remain lazy route-level chunks — the Mission Control landing chunk carries neither React Flow/elkjs nor Mermaid (verified against the built chunk map).
- [ ] Zero-data states per spec §4.7 render real parsed structure with feature-specific copy on an empty fixture tree — never lorem, never a blank pane.

## Tasks

| ID | Task | Brief | Deps | Complexity | Specialist review |
|---|---|---|---|---|---|
| T25 | Graph lazy chunk — React Flow wrapper, elkjs layout adapter, node registry | [tasks/T25-graph-lazy-chunk.md](tasks/T25-graph-lazy-chunk.md) | T24 | m | frontend-reviewer, accessibility-reviewer |
| T26a | Mission Control cockpit — trio layout, dispatch board, Chainline live wiring | [tasks/T26a-mission-control-cockpit.md](tasks/T26a-mission-control-cockpit.md) | T25, T23, T24, T20, T21 | m | frontend-reviewer, motion |
| T26b | Mission Control live behavior — stream, inspector wiring, chip flips, coalescing | [tasks/T26b-mission-control-live-behavior.md](tasks/T26b-mission-control-live-behavior.md) | T26a | m | frontend-reviewer, motion |
| T27 | Replay surface — timeline index, 1:1 scrubber, stepping, history rail | [tasks/T27-replay-surface.md](tasks/T27-replay-surface.md) | T23, T21, T20, T16 | m | motion, frontend-reviewer |
| T28 | Insight trio — Flow Health dial, Leaderboard count-bars, Token analytics tiles | [tasks/T28-insight-trio-surfaces.md](tasks/T28-insight-trio-surfaces.md) | T22, T23, T3, T20 | m | designer, frontend-reviewer |

## Batch order

| Batch | Tasks | Rationale |
|---|---|---|
| B1 | T25 · T27 · T28 | Independent surfaces — the graph chunk, the replay feature, and the insight trio share no files; each depends only on phase-4/phase-5 outputs (stores, API client, design-system primitives, derived functions, events route) |
| B2 | T26a | The cockpit consumes T25's graph chunk for the board canvas and composes phase-5 primitives — the graph chunk must exist first |
| B3 | T26b | Live behavior modifies the files T26a creates: stream, inspector wiring, chip-flip and coalescing discipline land on top of the standing cockpit layout |
