# T30 — Specs surface + Mermaid chunk: viewer, section diff, sandboxed MermaidBlock

## Task

Build the `/specs` feature surface at `dashboard/src/client/features/specs/` — spec viewer with section index and a section-diff mode (add/remove tinting, gutter markers, `clip-path` expand/collapse reveal, honest single-revision empty state) — plus the shared lazy Mermaid chunk `dashboard/src/client/mermaid/MermaidBlock.tsx`: sandboxed client-side rendering of mermaid fences with an error boundary that falls back to the raw fenced source.

## Why

Specs are the design contracts chains build against; reading them and seeing how sections changed between revisions is a core between-runs workflow (spec §3A spec-diff row). Mermaid appears throughout hyperflow artefacts (this very spec ships three diagrams), so one sandboxed, lazily-loaded renderer is a cross-surface dependency — plans (T29) and features (T31) mount the same component. The degrade-to-raw contract (spec §4.2) extends to diagrams: a Writer's malformed fence must never blank a document.

## Scope

**IN**
- `features/specs/` folder (components/ hooks/ utils/) implementing the `/specs` route surface on the browser-split grammar: 280px timestamped spec rail + document pane, `?slug=` deep links.
- Spec viewer: parsed spec rendering with section index navigation (from `parser/specs.ts` section index in the snapshot), status table, Mermaid fences via `MermaidBlock`.
- Section diff: compare control between spec revisions; `type-data` panes with add/remove content at 10% `state-pass`/`state-blocked` fill plus full-strength gutter markers; expand/collapse snaps layout and reveals content via `clip-path: inset()` + `motion-enter` fade.
- Single-revision empty state: viewer in read mode, compare control disabled and labeled "one revision — nothing to diff yet" (spec §4.7 verbatim behavior).
- `dashboard/src/client/mermaid/MermaidBlock.tsx` — LAZY CHUNK: bundled client-side Mermaid renderer, sandboxed (no external fetch, strict security config), wrapped in an error boundary; on render throw the cell shows the render error plus the raw fenced source in a scrollable block while the rest of the document renders normally.
- Degraded spec rendering (raw + badge) and specs zero state.

**OUT**
- Any second diff engine or server-side diffing — the diff renders over parsed revisions already present in the snapshot.
- Mermaid theme invention: diagram frame is `surface-1` with hairline per §3A; no custom per-diagram styling API.
- Plans/features/audits surfaces (T29/T31/T32); the browser-split shell internals (T29 owns `BrowserSplit`; if batch timing forbids importing it, keep the specs rail/pane composition local and swap in review — do not modify T29's files).
- Any write affordance — specs are read-only.

## Files in scope

- `dashboard/src/client/features/specs/components/SpecsSurface.tsx` — route composition: rail + document pane + diff-mode toggle.
- `dashboard/src/client/features/specs/components/SpecRail.tsx` — timestamped spec list (`RosterRow`), selection + keyboard navigation.
- `dashboard/src/client/features/specs/components/SpecDocument.tsx` — parsed spec pane: section index, status table, prose, Mermaid fence slots, raw/degraded branch.
- `dashboard/src/client/features/specs/components/SectionDiff.tsx` — revision compare panes with tint fills, gutter markers, expand/collapse reveal; hosts the disabled-compare single-revision state.
- `dashboard/src/client/features/specs/hooks/useSpecsSlice.ts` — memoized selectors over the specs store slice (spec list, revisions, section index).
- `dashboard/src/client/features/specs/hooks/useSpecDiff.ts` — revision pair selection + computed section-level add/remove model (pure logic, no JSX).
- `dashboard/src/client/features/specs/utils/section-anchors.ts` — section-index → anchor mapping helpers.
- `dashboard/src/client/mermaid/MermaidBlock.tsx` — sandboxed Mermaid renderer + error boundary + raw-source fallback block; the module is loaded only through `React.lazy`.
- Build touch: confirm `vite.config.ts` pins the mermaid module as its own lazy chunk (spec §5 states the pin exists from phase-1 — verify the new file lands inside it, adjust the chunk pattern only if the path doesn't match).
- Route registration touch: `/specs` route entry in `dashboard/src/client/app/router.tsx` points at the lazy `SpecsSurface`.

## Acceptance criteria

- [ ] `/specs` renders the fixture tree: rail lists specs with timestamps, section index navigates the document, `?slug=` deep links work.
- [ ] Malformed Mermaid source falls back inside the error boundary to the render error + raw fenced source in a scrollable block; sibling document content renders untouched (spec §4.2 verbatim).
- [ ] Mermaid never loads in the landing bundle: the renderer is reachable only through the lazy chunk, verified by build output inspection (chunk exists, entry chunk does not contain mermaid).
- [ ] Section diff renders add/remove at 10% `state-pass`/`state-blocked` fill with full-strength gutter markers, in `type-data`; expand/collapse snaps layout and reveals via `clip-path` + `motion-enter` — no height animation anywhere (compositor budget).
- [ ] A spec with exactly one revision renders in read mode with the compare control disabled and labeled "one revision — nothing to diff yet".
- [ ] Diagrams render on `surface-1` with a hairline frame; all values are design-system tokens; reduced-motion zeroes the reveal fade.
- [ ] `parseError` specs render raw with a degraded badge; empty tree renders the `EmptyState` fact + action copy.
- [ ] Every interactive element (rail rows, section index links, compare controls, expand toggles) carries `data-testid`; RTL-safe logical properties throughout; no file over 300 lines; no `any`.

## Test cases

- Unit: `useSpecDiff` produces the correct add/remove section model for a fixture revision pair, and a stable "no comparison" model for a single revision.
- Component: `MermaidBlock` with a valid fixture fence renders an SVG container; with a malformed fence renders the error boundary fallback containing the raw source text (asserted via `getByTestId`, scrollable container present).
- Component: `SectionDiff` single-revision fixture shows the disabled compare control with the exact label; two-revision fixture shows tinted panes + gutter markers.
- Component: expand/collapse toggles apply `clip-path` reveal classes — no `height` transition style is ever present.
- E2E (Playwright): navigate `/specs` on the fixture project → select a spec → navigate via section index → toggle diff mode between two fixture revisions → assert add/remove markers → open the single-revision fixture spec → assert compare disabled with label.
- E2E: fixture spec containing a malformed mermaid fence → document renders, diagram cell shows raw-source fallback, zero uncaught console errors.

## Related context

- Spec §3A "Spec-diff viewer" row + "Plan/spec/audit browsers" row (browser-split grammar, Mermaid on `surface-1` hairline frame).
- Spec §4.2 "Malformed Mermaid source" edge; §4.7 "Spec diff with a single revision" zero state.
- Spec §3B decision 10 (lazy chunks: Mermaid is a named code-split boundary) and §5 tree (`features/specs/`, `mermaid/MermaidBlock.tsx`, `vite.config.ts` chunk pins).
- `.hyperflow/design/system.md` — Component inventory (Diff pane row), Motion language §Compositor budget (expand/collapse via `clip-path`, banned height animation) and §Reduced motion, Layout grammar §Browser split.
- Consumes: T20 specs slice/selectors, T22 primitives (`RosterRow`, `StatusBadge`, `EmptyState`), T24 list hooks + Intl formatters; spec/revision shapes are `z.infer` from `shared/schemas/snapshot.ts`.

## Gotchas

- Mermaid is heavyweight — the lazy chunk is the whole point. Any static import path from `features/` into `mermaid/` (types included — use `import type` only) collapses the code-split boundary silently.
- `MermaidBlock` is shared: T29 (plans) and T31 (features) mount it by import path. Keep its props artefact-agnostic (source string + optional test id), or two other surfaces break.
- Sandbox means sandbox: Mermaid config must disable external interaction (`securityLevel` strict-equivalent, no remote resource loading) — the product guarantee is zero external calls.
- Diff reveal: layout snaps, content fades under `clip-path` — animating pane height or width is banned by the compositor budget and will be flagged by review.
- Error boundaries don't catch async/render-timing errors outside React's render phase — Mermaid render must be invoked so failures surface inside the boundary (render-phase or guarded effect with error state), not as unhandled rejections.
- 300-line cap: `SpecDocument` and `SectionDiff` are the bloat risks; split section renderers and diff gutter subcomponents early. No inline business logic in JSX — the diff model lives in `useSpecDiff`.
