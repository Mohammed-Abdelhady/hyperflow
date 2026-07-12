# T29 — Plans surface: browser-split, checkbox rosters, Plan Conclusions with evidence

## Task

Build the `/plans` feature surface at `dashboard/src/client/features/plans/`: a browser-split screen (280px timestamped artefact rail listing every parsed `.hyperflow/tasks/` file + document pane rendering the selected plan), checkbox rosters at default 36px `RosterRow` height, verdict tables rendered with `StatusBadge`, and a Plan Conclusions view where every rendered claim cites the artefact lines it was derived from. Extract the browser-split layout as a reusable shell inside this feature so T31 (features surface) can compose it without re-implementing the grammar.

## Why

Plans are the doctrine's primary artefact — the task decompositions every chain runs from. The dashboard's value proposition ("point it at any `.hyperflow/` tree") starts here: spec §3A binds plan browsing to the browser-split grammar (n8n executions-rail precedent), and spec §3B decision 7 makes Plan Conclusions the flagship deterministic-intelligence feature — state-plus-evidence, auditable, never an oracle. This task also establishes the browser-split shell the remaining browse surfaces reuse.

## Scope

**IN**
- `features/plans/` folder (components/ hooks/ utils/) implementing the full `/plans` route surface.
- Reusable browser-split shell (rail + document pane composition) exported for reuse by T31.
- Artefact rail: timestamped list of parsed task files from the plans/tasks store slice, selected state per system.md Roster row (`accent-dim` fill + 2px `accent` inset), deep-link sync with `?slug=`.
- Document pane: parsed plan rendering — status block, TL;DR, checkbox rosters (36px rows, `[ ]`/`[x]`/`[~]` states), verdict tables as `StatusBadge` rows, Mermaid fences delegated to the shared `MermaidBlock` lazy component (T30's export, consumed by import path only).
- Plan Conclusions panel: renders `shared/derived/conclusions.ts` output; each claim shows its evidence citation (artefact path + line references) linking to the cited lines in the document pane.
- Degraded rendering: `parseError`-flagged artefacts render raw markdown with a degraded badge; "derived" parse-health (checkbox-count fallback) surfaces its flag.
- Zero states per spec §4.7: no plans at all; conclusions with only pending plans (list each plan with pending status + progress-so-far).
- Huge-artefact handling: above the size threshold the pane opens in raw-virtualized mode first with structured parse on demand (spec §4.2).

**OUT**
- Any parser or server work (phase-2/3/4 own parsing; this task consumes the snapshot slice only).
- The `conclusions.ts` derivation logic itself (T3 shipped it in `shared/derived/`; this task renders its output, never re-derives).
- Mermaid rendering internals (T30 owns `MermaidBlock`; T29 only mounts it).
- Features drill-down (T31), spec diff (T30), any write affordance — plans are read-only by contract (task files are never dashboard-written).

## Files in scope

- `dashboard/src/client/features/plans/components/PlansSurface.tsx` — route-level composition: browser-split shell wiring rail + pane + conclusions panel.
- `dashboard/src/client/features/plans/components/BrowserSplit.tsx` — the reusable 280px-rail + document-pane layout shell (exported for T31); accepts rail and pane as composition slots, owns nothing artefact-specific.
- `dashboard/src/client/features/plans/components/ArtefactRail.tsx` — timestamped rail list built from `RosterRow`, selection + keyboard navigation (roving tabindex).
- `dashboard/src/client/features/plans/components/PlanDocument.tsx` — parsed-plan document pane: status table, roster sections, verdict tables, Mermaid fence slots, raw/degraded fallback branch.
- `dashboard/src/client/features/plans/components/ConclusionsPanel.tsx` — conclusions list with per-claim evidence citation links.
- `dashboard/src/client/features/plans/hooks/usePlansSlice.ts` — memoized selectors over the T20 store slice (plan list, selected plan, parse-health flags).
- `dashboard/src/client/features/plans/hooks/usePlanSelection.ts` — `?slug=` query-param ↔ selection sync.
- `dashboard/src/client/features/plans/utils/conclusion-citations.ts` — pure helpers mapping conclusion evidence references to document-pane anchor targets (no JSX).
- Route registration touch: the `/plans` route entry in `dashboard/src/client/app/router.tsx` points at the lazy `PlansSurface`.

Split further if any file approaches ~250 lines; never exceed 300.

## Acceptance criteria

- [ ] `/plans` renders the fixture tree: rail lists every task file with timestamps; selecting an entry renders its parsed document; `?slug=` deep links restore the same selection on reload.
- [ ] Checkbox rosters render at 36px default rows with `[ ]`, `[x]`, and `[~]` states all represented; verdict tables render `StatusBadge` (state `-dim` fill + full-strength uppercase label — PASS / NEEDS_FIX / BLOCKED / SECURITY_VIOLATION vocabulary exactly).
- [ ] Every Plan Conclusion claim renders an evidence citation (artefact + line refs) and activating it scrolls/highlights the cited region in the document pane — no citation-less claims ever render.
- [ ] `parseError`-flagged artefacts render raw markdown with a visible degraded badge; the surface never blanks or hard-fails on malformed fixtures.
- [ ] Conclusions zero state with only pending plans lists each plan with pending status and progress-so-far — never an empty "no conclusions" dead end; empty-tree state uses `EmptyState` with fact + action copy.
- [ ] All visual values bind to design-system tokens (no inline colors/sizes/durations); layout uses logical CSS properties and is RTL-safe.
- [ ] Every interactive element (rail rows, citation links, section toggles) carries `data-testid`; no inline business logic in JSX — extraction into hooks/utils.
- [ ] No file exceeds 300 lines; no `any` anywhere.

## Test cases

- Unit: `usePlansSlice` selectors return stable references across unrelated store updates (an audits-slice delta must not re-render the plan rail).
- Unit: `conclusion-citations.ts` maps fixture conclusion evidence to correct anchor targets, including a citation pointing at a line inside a degraded (raw) artefact.
- Component: `PlanDocument` renders the golden table-status-block fixture AND the key-line fixture identically at the roster level; a `parseError` fixture renders the raw branch with the degraded badge (queried via `getByTestId`).
- Component: single-plan-pending fixture renders the conclusions pending-progress variant, not the empty state.
- E2E (Playwright, `data-testid` selectors from `tests/e2e/utils/selectors.ts`): navigate `/plans` against the fixture project → select a plan in the rail → assert document pane content and roster checkbox counts → open Conclusions → click a citation → assert the document pane scrolled to and highlighted the cited region → reload with `?slug=` → assert the same plan is selected.
- E2E: fixture plan file rewritten on disk mid-session (scripted write) → rail timestamp and document pane update via SSE delta without a manual refresh.

## Related context

- Spec §3A "Plan/spec/audit browsers" row — browser-split grammar, 36px rosters, verdict badges, Mermaid on `surface-1`.
- Spec §3B decision 7 — conclusions as deterministic state-plus-evidence pure functions; §3B decision 10 — slice/selectors topology this surface must respect.
- Spec §4.2 (format drift → degrade-to-raw, checkbox-count fallback, huge artefacts) and §4.7 (pending-only conclusions zero state).
- Spec §5 tree — `features/plans/`, `shared/derived/conclusions.ts`, `app/router.tsx`.
- `.hyperflow/design/system.md` — Layout grammar §Browser split, Component inventory (Roster row, Status badge, Empty state), Voice/tone (verdict vocabulary uppercase), Accessibility floor (roving tabindex, focus ring).
- Consumes: T20 store slices/selectors, T22 static primitives (`RosterRow`, `StatusBadge`, `EmptyState`), T24 container primitives + list hooks + Intl formatters (timestamps through `Intl.DateTimeFormat`), T3 `shared/derived/conclusions.ts` output types (z.infer from shared schemas).

## Gotchas

- `BrowserSplit` is a layout shell, not a data component — T31 composes it next batch; any plan-specific assumption baked in becomes T31's duplication problem. Slots in, nothing artefact-aware inside.
- Mermaid is a lazy chunk: `PlanDocument` must reference `MermaidBlock` through the lazy boundary only — importing it statically drags Mermaid into the landing bundle and violates the §3B code-split decision.
- Conclusions come from `shared/derived/` — recomputing or "adjusting" them client-side breaks the same-tree-in-same-numbers-out determinism contract and its fixture tests.
- 300-line cap is hook-enforced: `PlanDocument` is the file most likely to bloat — split section renderers out early.
- No inline business logic in JSX; citation resolution, parse-health branching, and selection sync all live in hooks/utils.
- Timestamps and counts must go through the T24 Intl formatters (spec §4.5 RTL/locale edge), never raw `toLocaleString` calls scattered per component.
