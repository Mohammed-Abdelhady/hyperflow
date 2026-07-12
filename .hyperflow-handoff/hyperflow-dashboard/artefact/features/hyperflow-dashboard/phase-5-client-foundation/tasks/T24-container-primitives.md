# T24 — Container primitives + list hooks + Intl formatters

## Status

| Field      | Value                        |
|------------|------------------------------|
| Task       | T24                          |
| Role       | Implementer                  |
| Complexity | m                            |
| Batch      | B1                           |
| Depends on | T4 (design tokens)           |
| Reviewers  | frontend-reviewer, motion    |

## Task

Build the three container primitives — NodeCard (graph node body), InspectorPanel (right-rail drawer), EventRow (virtualized stream line) — plus the shared list infrastructure (`use-virtual-list`, `use-debounced-input`) and the locale-aware Intl formatter module every surface uses for numbers, tokens, durations, and timestamps.

## Why

These are the containers the cockpit-trio grammar is built from (spec §3A: dispatch board + 360px inspector + bottom stream): every graph surface renders NodeCards, every selection flows into the InspectorPanel, and the live event feed is EventRows inside a virtual window. Centralizing virtualization, input debouncing, and `Intl` formatting here is what satisfies the code-quality scalability floor (lists virtualized, high-frequency input debounced) and the RTL/locale edge case in spec §4.5 — token counts, durations, and timestamps must format per the detected locale everywhere, from one module.

## Scope

**IN:**
- `NodeCard.tsx` — graph node body shared by the mission graph and the memory knowledge-graph (spec §5): `surface-2` ground, `hairline-strong` border, `r-2`, `type-ui` title + `type-micro` type tag, port dots (the sanctioned state-carrying icons), footer cost chip in `type-data` (e.g. "12.4k tok" — formatted by this task's formatter); selectable with `accent` focus ring; a pure DOM component — React Flow registration and elkjs layout belong to the graph chunk, which consumes this via its node-registry.
- `InspectorPanel.tsx` — 360px right rail (logical inline-end), `surface-1`, hairline on the inline-start edge, `type-title` header on `surface-3`; slides in/out via `translateX` with `spring-instrument` (critically damped — no bounce); `will-change: transform` applied on animation start and removed on settle — this is the app's single permitted `will-change` element; content is a slot; open/close state arrives via props from T20's ui slice.
- `EventRow.tsx` — fixed-height 28px stream line, `type-data` face: severity dot (state token), timestamp in `text-dim`, message in `text-mid`; entry animation is `translateY(-4px→0)` + fade at `motion-enter` on the new row only; `content-visibility: auto` for off-screen rows; row height is fixed and never animated.
- `hooks/use-virtual-list.ts` — shared windowing hook for fixed-height rows (28px dense / 36px default from the density tokens): visible-range computation, overscan, stable keys, scroll-position retention, auto-follow pin (jump instantly to bottom, never smooth-scroll per row — system.md §Live-data patterns) with pin-release on user scroll.
- `hooks/use-debounced-input.ts` — shared debounce hook for search/filter inputs (delay from a `constants/` value), with immediate-value + debounced-value pair and cleanup on unmount.
- `utils/format.ts` — locale-aware formatters over `Intl.NumberFormat`/`Intl.DateTimeFormat` with the detected browser locale: token counts (compact "12.4k tok" with unit suffix), durations (ms/s/m with unit), percentages, timestamps (time-of-day for stream rows, date+time for artefacts), delta signs; instances cached per locale/options (Intl construction is expensive); every number the UI shows routes through here — units always attached per system.md §Voice.

**OUT:**
- React Flow wrapper, elkjs adapter, node-registry (graph lazy chunk phase) — NodeCard is consumed by them, not aware of them.
- The event feed surface, severity filter chips, stream coalescing/circuit breaker (Mission Control phase) — EventRow is one line; feed policy lives with the feed.
- Popover/command-palette floating chrome (`shadow-pop` surfaces) — separate shared chrome when first needed.
- Store wiring: all three components are prop-driven; ui-slice subscription happens in feature containers.

## Files in scope

- `dashboard/src/client/components/NodeCard.tsx` — create. Title/type-tag/ports/cost-chip layout, selection + focus treatment, testid pass-through; memo-wrapped with stable prop shape documented.
- `dashboard/src/client/components/InspectorPanel.tsx` — create. Slide lifecycle (`spring-instrument`, `will-change` on/off), header structure, close affordance, focus containment on open and focus return on close.
- `dashboard/src/client/components/EventRow.tsx` — create. Fixed 28px grid, severity dot mapping from the shared state map, entry animation on mount only (not on window re-entry), `content-visibility: auto`.
- `dashboard/src/client/hooks/use-virtual-list.ts` — create. Generic over item type; parameterized row height (28/36); auto-follow contract as callbacks.
- `dashboard/src/client/hooks/use-debounced-input.ts` — create.
- `dashboard/src/client/utils/format.ts` — create. Formatter factory + cached instances; pure module, no React.

## Acceptance criteria

- [ ] Every visual value binds to named tokens: `surface-1`/`surface-2`/`surface-3`, `hairline`/`hairline-strong`, `r-2`, `type-ui`/`type-micro`/`type-data`/`type-title`, `text-mid`/`text-dim`, `accent`, `state-*` for severity dots, `sp-2`/`sp-3`/`sp-4` padding, 28px dense / 36px default density, `motion-enter`, `spring-instrument` — zero hardcoded colors, sizes, durations, or spring constants.
- [ ] Anti-slop constraints hold: no glow, no shadow on any of the three (none of them float), hairline separators only, every numeral/cost/timestamp in the mono data face; icons appear only as state carriers (severity dots, port dots).
- [ ] InspectorPanel is the app's only `will-change` element, applied on animation start and removed on settle; slide uses `translateX` only — never layout properties; `spring-instrument` means zero overshoot.
- [ ] EventRow height is fixed and never animated; entry is `translateY` + fade on the new row only; `content-visibility: auto` present.
- [ ] `data-testid` on every interactive element: NodeCard root (selectable), inspector close affordance and header, event-row root; hooks expose no DOM but virtual-list items carry stable testids via the caller.
- [ ] Reduced-motion fallback per component (via T23's `use-reduced-motion` where JS-driven): inspector slide → instant position, EventRow entry → snap-append with ≤80ms marker fade retained, NodeCard hover/selection transitions instant; auto-follow already pins instantly by design.
- [ ] RTL-safe: inspector docks at inline-end and slides from the correct edge under `dir="rtl"`; EventRow meta alignment and NodeCard cost-chip footer use logical properties; formatter output respects locale digit/date conventions (spec §4.5) — no hand-rolled number/date strings anywhere.
- [ ] `use-virtual-list` renders only the visible window + overscan for a 10k-item list; auto-follow pins to bottom instantly and releases on user scroll-up.
- [ ] Every formatter attaches its unit (`tok`, `ms`, `%`) per system.md §Voice; Intl instances are cached, not constructed per call.
- [ ] All components memo-friendly and pure over typed props; one component per file; no file over 300 lines; no `any`.

## Test cases

- Unit (format): table-driven cases across `en-US`, `ar` (RTL, Eastern Arabic numerals context), and `de-DE` — token counts ("12.4k tok"), durations, timestamps, percentages produce locale-correct output with units; instance cache returns the same formatter for repeat calls.
- Unit (use-virtual-list): 10,000 fixture items at 28px → rendered count equals window + overscan; scrolling updates the range; auto-follow pins on append while pinned and stops after a user scroll-up; scroll position retained across an unrelated re-render.
- Unit (use-debounced-input): rapid keystrokes yield one debounced emission after the delay; unmount cancels the pending emission.
- Unit (InspectorPanel): open applies `will-change: transform` and settle removes it (style assertions around the animation lifecycle); focus moves into the panel on open and returns to the trigger on close; reduced motion renders the open state without a transition.
- Unit (EventRow): severity → state-token dot mapping for all five states; mounted row animates once, re-windowed row does not re-animate.
- Integration (jsdom): a feed of EventRows inside `use-virtual-list` — appending 100 items while pinned keeps the last row visible with no smooth-scroll calls; toggling an unrelated ui prop (e.g. inspector open) re-renders zero event rows (render-count probe — the UI-state/data-list isolation contract).
- E2E (Playwright, fixture project): open a surface with the inspector + a populated stream; select an entity by `data-testid` → inspector slides in with content; scroll the stream up (pin releases), append via scripted fixture write, assert no auto-scroll; repeat inspector open under RTL emulation (docks inline-end, slides from the correct edge) and under `reducedMotion: 'reduce'` (instant).

## Related context

- system.md §Component inventory rows: Node card (Clay cost chips, WRITER typed nodes — Mobbin URLs in §References), Inspector panel (Databricks inspector), Event stream row (Databricks event log); §Layout grammar "Cockpit trio"; §Motion language — compositor budget (`will-change` single-element rule, fixed-height rows, no height animation), Live-data patterns (Stream entry, auto-follow pins instantly), §Reduced motion.
- Spec §3A per-feature rows: Mission Control (fixed-height 28px `type-data` stream rows, cockpit trio), dispatch-board rows (inspector follows selection via `motion-panel` + `spring-instrument`), mind-maps (node card with `type-data` cost chip footer "12.4k tok"); Posh/Vercel restraint carries the cost-chip and numeral treatment.
- Spec §3B decision 10 (virtualization mandate for audits/memory/event feed; UI slices never re-render data lists) and §4.5 (RTL locale — all counts/durations/timestamps through `Intl.*`, logical properties).
- Consumers to design for: graph chunk's node-registry (NodeCard), all browser-split and cockpit surfaces (InspectorPanel), Mission Control + replay feeds (EventRow + use-virtual-list).

## Gotchas

- 300-line cap: InspectorPanel (slide lifecycle + focus management + header) is the overflow risk — extract the focus-containment logic into a small hook.
- No inline business logic in JSX — severity mapping, window math, and formatter selection are helpers/hooks/mapping objects.
- UI-state changes must not re-render data lists — this task builds the very mechanism: virtual-list item props must be stable references, and NodeCard/EventRow must not subscribe to any store or context themselves.
- The `will-change` budget is exactly one element app-wide and InspectorPanel owns it — remove it on settle or it degrades compositing for the whole board.
- EventRow entry animation must key on item identity, not window index — re-virtualized rows re-entering the window must not replay the entry animation.
- `Intl.NumberFormat`/`DateTimeFormat` construction is costly — cache instances per locale+options key; never construct inside a render path.
- Do not smooth-scroll the feed programmatically anywhere — auto-follow is an instant pin by doctrine.
