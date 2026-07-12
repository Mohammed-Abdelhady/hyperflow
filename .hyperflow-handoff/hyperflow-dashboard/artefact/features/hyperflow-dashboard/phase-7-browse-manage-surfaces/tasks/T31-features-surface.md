# T31 — Features surface: feature.md → phase → tasks drill-down

## Task

Build the `/features` feature surface at `dashboard/src/client/features/features/`: a three-level drill-down over multi-phase feature trees — `feature.md` overview → `phase-<n>-<name>/phase.md` → `tasks/T*.md` briefs — reusing T29's `BrowserSplit` shell and document-pane building blocks. Phase rosters render with progress, per-task status, and specialist columns; task briefs render as full parsed documents.

## Why

Multi-phase features (`.hyperflow/features/<slug>/`) are the doctrine's largest artefact shape — a folder tree, not a file — and the only surface where hierarchy is the content: which phase is in flight, which tasks block which, where each brief lives. Spec §5 defines the surface as exactly this drill-down; reusing the T29 browser-split grammar keeps the six browse surfaces reading as one product instead of six layouts (system.md layout grammar).

## Scope

**IN**
- `features/features/` folder (components/ hooks/ utils/) implementing the `/features` route surface.
- Level 1 — feature rail + overview: `BrowserSplit` with the rail listing feature slugs (timestamped), pane rendering the selected `feature.md` (status table, TL;DR, phase roster with per-phase progress bars from parsed checkbox/progress data).
- Level 2 — phase view: selecting a phase renders `phase.md` — status table, goal, exit criteria checklist, task roster (36px `RosterRow`s with task ID, title, complexity, specialist review, dep references as plain text), batch-order table.
- Level 3 — task brief view: selecting a roster task renders the parsed brief document (same document-pane treatment as T29's plan rendering — reuse, don't fork).
- Breadcrumb/drill navigation with `?slug=` deep links encoding the full drill position (feature, phase, task); browser back/forward walks the drill levels.
- Degraded rendering for any level (`parseError` → raw + badge; missing `phase.md` in a phase folder renders what exists rather than failing the tree).
- Zero states: no features tree at all; a feature with zero phases; a phase with an empty `tasks/` folder — each with fact + action copy.

**OUT**
- Any new layout shell, rail, or document primitives — this task composes T29's exports; if a T29 component needs a new prop, extend it compatibly rather than copying it.
- Task-file editing of any kind (task files are never dashboard-written — write-pipeline denylist, spec §3B.8).
- Parsing (`parser/features.ts` shipped the tree shape; this task renders the snapshot slice).
- Mission-control live graph or Chainline live mode (phase-6 territory); Mermaid internals (mount T30's `MermaidBlock` only).

## Files in scope

- `dashboard/src/client/features/features/components/FeaturesSurface.tsx` — route composition: `BrowserSplit` + drill-level switch + breadcrumbs.
- `dashboard/src/client/features/features/components/FeatureOverview.tsx` — `feature.md` pane: status table, phase roster with progress.
- `dashboard/src/client/features/features/components/PhaseView.tsx` — `phase.md` pane: exit criteria, task roster, batch order.
- `dashboard/src/client/features/features/components/TaskBriefView.tsx` — parsed task-brief pane reusing T29 document building blocks.
- `dashboard/src/client/features/features/components/DrillBreadcrumbs.tsx` — feature → phase → task breadcrumb trail.
- `dashboard/src/client/features/features/hooks/useFeaturesSlice.ts` — memoized selectors over the features store slice (tree, per-phase progress, parse-health).
- `dashboard/src/client/features/features/hooks/useDrillState.ts` — drill position ↔ `?slug=` (+ phase/task params) sync, back/forward handling (pure logic, no JSX).
- `dashboard/src/client/features/features/utils/feature-tree.ts` — pure helpers: phase ordering, progress rollup display mapping, dep-reference formatting.
- Route registration touch: `/features` route entry in `dashboard/src/client/app/router.tsx` points at the lazy `FeaturesSurface`.

## Acceptance criteria

- [ ] `/features` renders the fixture feature tree end-to-end: feature rail → `feature.md` overview with phase roster → phase view with exit criteria + task roster + batch order → task brief document; breadcrumbs and browser back/forward walk the levels correctly.
- [ ] Deep link encoding the full drill position (feature + phase + task) restores the exact drill state on reload.
- [ ] The surface is built on T29's `BrowserSplit` and document building blocks — no duplicated rail/pane/roster implementations exist under `features/features/` (reuse verified in review).
- [ ] Per-phase progress renders from parsed data (checkbox counts / progress fields) and matches the fixture's known counts; task roster rows show status, complexity, and specialist review columns with `StatusBadge` treatment.
- [ ] A fixture tree containing a malformed `phase.md` renders that phase raw with a degraded badge while sibling phases render structured; zero-phase and empty-`tasks/` fixtures render their specific zero states.
- [ ] No write affordance of any kind appears on this surface.
- [ ] Every interactive element (rail rows, phase rows, task rows, breadcrumbs) carries `data-testid`; all values are design-system tokens; RTL-safe logical properties; no file over 300 lines; no `any`; no inline business logic in JSX.

## Test cases

- Unit: `useDrillState` round-trips every drill position through URL params, including back/forward navigation producing the previous level.
- Unit: `feature-tree.ts` orders phases by their `phase-<n>` prefix and rolls up fixture progress counts correctly, including a phase with zero tasks (no division-by-zero).
- Component: `PhaseView` renders the golden `phase.md` fixture — exit criteria checklist states, roster rows with badges, batch-order table.
- Component: malformed-`phase.md` fixture renders the raw/degraded branch; siblings structured.
- E2E (Playwright): navigate `/features` on the fixture project → select the fixture feature → assert phase roster progress → drill into a phase → assert exit criteria and task roster → drill into a task brief → assert brief content → use breadcrumb to return to feature level → reload the deepest deep link → assert full drill state restored.
- E2E: scripted checkbox flip in a fixture phase's task file → phase progress on the overview updates via SSE delta without refresh.

## Related context

- Spec §5 tree — `features/features/` ("multi-phase feature trees: feature.md → phase → tasks drill-down") and `parser/features.ts` (the parsed tree shape consumed here).
- Spec §3A "Plan/spec/audit browsers" row — the browser-split grammar this surface inherits; Chainline record mode note (frozen provenance header on feature views) applies where phase-6 exposed the record-mode Chainline — mount it in the feature header if the T23 component and provenance data are available in the slice; skip without stubbing otherwise.
- Spec §4.2 (mixed formats per file, degrade-to-raw) and §4.4 (task files never written).
- `.hyperflow/design/system.md` — Layout grammar §Browser split, Component inventory (Roster row, Status badge, Empty state), Accessibility floor.
- Consumes: T29 `BrowserSplit` + document building blocks (the reason this task is batch B2), T20 features slice/selectors, T22/T24 primitives + Intl formatters, `shared/schemas/snapshot.ts` feature-tree types.

## Gotchas

- This task lands in B2 precisely so it can import T29's shell — re-implementing rail/pane locally "to move faster" defeats the batch order and doubles the review surface.
- If `BrowserSplit` needs an extra capability (e.g., a breadcrumb slot), extend it with an optional prop in T29's file as a minimal, backward-compatible diff — coordinate through the brief contract, don't fork the component.
- Drill state is one URL, not three component states — back/forward must work, so the drill position lives in `useDrillState` (URL-derived), never in nested `useState` that the router can't see.
- Feature trees nest: a plan-like brief inside `features/<slug>/phase-*/tasks/` is NOT a `.hyperflow/tasks/` plan — don't cross-wire the plans slice; the features slice owns the whole tree.
- Mermaid fences can appear in `feature.md`/briefs — mount T30's lazy `MermaidBlock`, no second renderer, no static import.
- 300-line cap: the level-switch composition in `FeaturesSurface` plus three pane components is the sized layout — resist merging panes into one file.
