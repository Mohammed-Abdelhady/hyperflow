# T25 — Graph lazy chunk: React Flow wrapper, elkjs layout adapter, node registry

## Task

Build `src/client/graph/` — the lazy route-level chunk that renders every dashboard graph (mission chain/batch/task DAG now, memory knowledge-graph later): a React Flow (`@xyflow/react`) wrapper with fully custom DOM nodes, an elkjs layout adapter running `layered` (pipeline flows) and `mrtree` (decomposition trees) off the render path, and a node-type → renderer registry that maps typed graph nodes onto the shared `NodeCard` primitive.

## Why

Spec §3B decision 11 commits the graph stack: React Flow DOM nodes because dashboard nodes are small information-dense components (status, gate results, cost chips, artefact links) that need real text rendering, hover/focus semantics, keyboard navigation, and `data-testid` hooks — capabilities canvas engines forfeit. elkjs produces the layered rank-ordered layouts pipeline semantics demand where force layouts produce hairballs. Spec §1 and §3B decision 10 make this a code-split boundary: React Flow + elkjs is a sizable chunk that must only load with graph views, never in the Mission Control landing chunk. Every downstream graph surface (T26a's board canvas, the memory knowledge-graph) composes this chunk instead of touching React Flow directly.

## Scope

**IN**

- `GraphCanvas.tsx`: typed nodes/edges in, DOM rendering out — pan/zoom, selection, minimap, Runway-style floating bottom toolbar (select/pan/zoom/fit), viewport animation via React Flow's built-in `fitView`/`setCenter` fed `motion-sweep` (450 ms).
- `elk-layout.ts`: async elkjs adapter — accepts typed nodes/edges plus an algorithm flag (`layered` | `mrtree`), returns positioned nodes; layout never runs during a React render pass.
- `node-registry.ts`: mapping object from node type (chain stage, batch, task, memory entry, …) to its `NodeCard`-based renderer; unknown types get a labelled fallback renderer, never a crash.
- The graph↔table toggle contract: `GraphCanvas` accepts and renders a table-view alternative of the same typed nodes (Clay pattern) as the keyboard/screen-reader path — the toggle and table shell live here so every consumer inherits them.
- Node position interpolation old→new over 280 ms when elkjs re-lays-out; Motion-driven node-local enter (fade + `scale(0.97→1)`) / exit.
- Token-cost chip slot on node cards, fed by consumers from `shared/derived/tokens` output (Clay precedent — `type-data` footer chip, e.g. "12.4k tok").

**OUT**

- Any feature surface (Mission Control board wiring is T26a; memory knowledge-graph is a later phase task).
- The `NodeCard` primitive itself (phase-5 design-system component — consumed, not created).
- The Mermaid chunk (separate lazy chunk, separate task).
- elkjs option tuning beyond the two named algorithms; graph persistence; export.

## Files in scope

- `dashboard/src/client/graph/GraphCanvas.tsx` — create. React Flow wrapper owning viewport, selection, minimap, floating bottom toolbar, and the graph↔table toggle; exposes a typed props contract (nodes, edges, algorithm, selection callback, table renderer) and forwards `data-testid` per node/edge. Keeps under the 300-line cap by delegating toolbar and table view to sibling component files inside `graph/` if it approaches ~250 lines.
- `dashboard/src/client/graph/elk-layout.ts` — create. Async adapter around elkjs: builds the ELK graph, invokes layout with `layered` or `mrtree`, maps results back to React Flow positions. Runs in a Web Worker or as an awaited async pass scheduled outside render — documented in the module header either way.
- `dashboard/src/client/graph/node-registry.ts` — create. Enum-keyed mapping of node type → renderer component (each renderer composes `NodeCard` with type tag, port dots, cost-chip footer); exports the registry plus a lookup that falls back to a raw labelled node for unknown types.

## Acceptance criteria

- [ ] `graph/` is a lazy chunk: no static import of `graph/`, `@xyflow/react`, or `elkjs` exists in `app/router.tsx`, `app/shell.tsx`, or any route shell — consumers load it via `React.lazy`/dynamic import, verified against the built chunk map (`vite.config.ts` pins the chunk).
- [ ] elkjs layout is off the render path: layout runs async (worker or scheduled task), first paint of the route never waits on it, and a layout pass in flight never blocks pointer input.
- [ ] Pan/zoom and node enter/exit stay compositor-only at 60fps: `transform`/`opacity` only, no height/width/top/left/margin animation, verified with a DevTools performance trace over a pan+zoom+relayout interaction.
- [ ] Viewport animation uses React Flow's built-in duration fed `motion-sweep` — no second animator wraps the viewport; node position changes interpolate over 280 ms; node enter/exit is fade + `scale(0.97→1)` via Motion. Never two animators on one element.
- [ ] Node cards render per system.md: `surface-2`, `hairline-strong`, `r-2`, `type-ui` title, `type-micro` type tag, port dots, and a `type-data` token-cost chip footer (Clay precedent); edges are 1px `hairline-strong` with weight steps, never color-coded rainbow.
- [ ] The graph↔table toggle exists and works: keyboard users reach every node's data through the table view; the toggle itself is keyboard-operable with a visible 2px `accent` focus ring; graph nodes are focusable with visible focus.
- [ ] Reduced motion honored: graph durations drop to 0 (viewport, interpolation, enter/exit) via the shared reduced-motion hook.
- [ ] Every interactive element (canvas, nodes, toolbar buttons, toggle, table rows) carries a `data-testid`.
- [ ] All three files stay under 300 lines; no `any`; exported APIs fully typed from shared/graph prop types.

## Test cases

- Unit (`tests/unit/`): `elk-layout` given a fixture node/edge set returns deterministic positions for `layered` and distinct tree-shaped positions for `mrtree`; malformed edge (dangling target) is dropped with a diagnostic, not thrown.
- Unit: `node-registry` lookup returns the mapped renderer for every known type and the labelled fallback for an unknown type string.
- Component: `GraphCanvas` renders fixture nodes as DOM elements with expected `data-testid`s; selecting a node fires the selection callback; toggle switches to table view exposing the same node titles/costs as rows.
- Component: with `prefers-reduced-motion: reduce`, node enter renders at final position/opacity with zero-duration transitions.
- E2E (Playwright, `data-testid` only): open a graph-bearing route against the fixture project → assert graph chunk loads lazily (route HTML paints before graph network chunk resolves), nodes render with token-cost chips showing fixture-derived values, keyboard: Tab reaches the graph↔table toggle, Enter switches to table view, arrow/Tab traverses rows exposing every node's title and cost.

## Related context

- Spec §3A "Mind-maps" row — schematic-not-bubble-chart treatment, elkjs auto-layout, minimap, floating toolbar, graph↔table toggle as the a11y path.
- Spec §3B decision 11 — graph stack rationale and rejected alternatives; decision 10 — code-split boundaries.
- system.md §Motion language → Libraries ("Graph viewport — React Flow built-in… never wrap in another animator") and §Live-data patterns → Graph row (viewport `motion-sweep`, 280 ms position interpolation, Motion node enter/exit).
- system.md §Component inventory → Node card; §Accessibility floor → table-view toggle, focus ring, roving tabindex.
- Cost chips consume `shared/derived/tokens` rollups passed in by consumers via memoized selectors — the graph chunk never recomputes analytics in components.

## Gotchas

- `graph/` is a lazy chunk — one accidental static import from a route shell or from `features/missionControl/` drags React Flow + elkjs into the landing bundle and violates §3B decision 10. Import it only behind `React.lazy`.
- elkjs runs in a worker or as an async pass — invoking it synchronously inside a component body or effect that blocks paint is the exact failure mode the "layout off the render path" decision exists to prevent.
- React Flow already animates its viewport; wrapping `fitView` in Motion or CSS transitions double-animates one element — feed durations into React Flow's own API instead.
- 300-line cap: `GraphCanvas.tsx` with toolbar + minimap + toggle + table shell will approach the cap fast — split toolbar and table view into sibling files inside `graph/` proactively, never compress.
- `shared/` types only: node/edge shapes come from `src/shared/` schemas; no import from `src/server/`, no client-private wire shapes.
