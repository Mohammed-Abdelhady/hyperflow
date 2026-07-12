# T42 — Accessibility + RTL + reduced-motion verification pass (real browser)

## Task

Run a structured accessibility, RTL, and reduced-motion verification pass over the whole SPA in a real browser against T40's fixture project — keyboard navigation across all 11 surfaces, the graph table-toggle screen-reader path, the heatmap popover path, `prefers-reduced-motion` emulation, and both LTR and RTL locale rendering (Intl number/date formatting, logical CSS properties) — and fix every finding in place in the client source. This is a verify-and-fix task: the deliverable is the surfaces passing the checklist, not a findings report.

## Why

The spec makes accessibility structural, not decorative: the graph↔table toggle exists as "the non-negotiable keyboard/screen-reader path" (§3A trade-offs), heatmap values are popover-only because in-cell hue is not an a11y path (§3A), reduced motion has a defined degradation contract (§3A motion language), and §4.5 commits to RTL locales mirroring correctly with all numerals/dates through `Intl`. None of these are provable by lint, unit tests, or even Playwright assertions alone — they need a human-driven pass in a real browser with emulation, per the repo's own real-browser verification mandate. Phase-9 is the last gate before ship; unverified claims here become shipped regressions.

## Scope

**IN:**
- Keyboard navigation audit across all 11 surfaces (`/mission /replay /health /leaderboard /plans /features /audits /memory /specs /tokens /config`): reachable interactive elements, visible focus, logical tab order, no keyboard traps, Escape/arrow conventions on composite widgets (scrubber arrows/Shift-arrows, roster rows, inspector, graph table view).
- Screen-reader semantics on the two designated alternative paths: the graph table-toggle (mission graph AND memory knowledge-graph — table view reachable, announced, and content-equivalent) and the heatmap hover popover (keyboard-openable, value announced, never hue-only).
- WCAG AA contrast verification on the dark theme, per design token (text tiers, `state-*` on their `-dim` fills, `accent` on surfaces, hairlines where informational).
- `prefers-reduced-motion` emulation: decorative motion off, functional feedback instant (chips swap, numerals snap, graph durations zero), 1:1 scrubber drag retained, runtime `matchMedia` flip honored without reload (spec §3A motion language).
- RTL + LTR passes in the browser: an RTL locale rendering with correct mirroring via logical properties, `Intl.NumberFormat`/`Intl.DateTimeFormat` output for numbers/dates/durations, direction-stable Chainline/scrubber/graph semantics; both directions checked before any fix is called done.
- Console-clean check on every surface in every mode (LTR, RTL, reduced-motion): zero errors, zero React warnings.
- Fixing all findings in place across `dashboard/src/client/**` (components, features, styles/tokens.css, hooks) — semantics, focus handling, aria attributes, logical-property conversions, contrast token adjustments routed through the token layer.

**OUT:**
- New features or visual redesign — fixes restore conformance to the existing design system, nothing more.
- Server-side changes of any kind.
- The e2e spec suite (T41) — where a fix warrants a regression spec, note it for T41's file rather than restructuring the suite here.
- WCAG AAA targets — the gate here is AA on the dark theme per the spec's design-system floor.
- Translation/localization content work — RTL here is layout/formatting correctness, not translated strings.

## Files in scope

- `dashboard/src/client/**` — READ (the full client surface is the audit target).
- Surfaces as findings require — MODIFY. Expected fix classes, by locus: `components/` primitives (focus rings, aria roles/labels on StageChip/RosterRow/Scrubber/HeatmapCell/InspectorPanel, keyboard handlers), `features/*/` composites (tab order, table-toggle wiring, popover keyboard path, focus return on inspector close), `styles/tokens.css` (contrast-failing token values corrected at the token layer — never inline overrides), `hooks/` (the shared reduced-motion hook zeroing duration tokens, if the runtime flip is found broken), and any physical `left/right/margin-left/margin-right` properties converted to logical equivalents found during the RTL pass.
- Every fix stays within the design system's tokens and the frontend standards (no `any`, files under 300 lines, RTL via logical properties/`rtl:`-qualified styles, no unrelated component touched).

## Acceptance criteria

- [ ] Keyboard-only traversal completes on all 11 surfaces: every interactive element reachable and operable, focus always visible, no traps — verified in a real browser, not by static analysis.
- [ ] Graph table-toggle path verified with screen-reader semantics: table view keyboard-reachable on both graph surfaces, announced as a table, content-equivalent to the graph (nodes, statuses, costs, relationships).
- [ ] Heatmap popover path verified: cell values retrievable by keyboard and announced — never available only on pointer hover, never encoded only in hue.
- [ ] WCAG AA contrast on dark verified per token: each text-bearing and state-bearing token combination measured and passing 4.5:1 (normal text) / 3:1 (large text and UI components); failures fixed at the token layer and re-measured.
- [ ] Both directions rendered in a real browser: LTR and RTL passes completed on all 11 surfaces, mirroring correct via logical properties, all numerals/dates/durations through `Intl` with the emulated locale — RTL check means BOTH directions verified before done.
- [ ] `prefers-reduced-motion` emulation verified: no decorative animation plays, functional updates are instant, scrubber 1:1 drag retained, and toggling the OS-level preference at runtime takes effect without reload.
- [ ] Console clean on every surface in every audited mode — zero errors and zero warnings across the 11 routes in LTR, RTL, and reduced-motion states.
- [ ] All findings fixed in place and the failing checklist rows re-verified green in the browser; no finding downgraded to "known issue" without an explicit spec-grounded reason recorded in the task notes.

## Test cases

Automated sweep (run first, findings feed the manual pass):
- Axe-based scan (or equivalent) on each of the 11 routes against the fixture project → zero critical/serious violations after fixes.
- Console-message collection per route in LTR, RTL, and reduced-motion emulation → empty error/warning sets.
- Contrast measurement per design-token pair on the dark theme → recorded ratio table, all pairs at/above AA thresholds.

Manual checklist (real browser, fixture project, per surface where applicable):
- Tab from the address bar through the full surface → order logical, focus visible on every stop, Shift-Tab symmetric.
- Mission: select a roster row by keyboard → inspector opens, focus moves in, Escape closes and returns focus to the row.
- Mission/memory graphs: activate the table toggle by keyboard → table renders, arrow-key navigation works, screen reader announces headers and cells; toggle back retains selection.
- Replay: focus the scrubber → arrow steps one event, Shift-arrow steps one stage, announced value updates; pointer drag still tracks 1:1 under reduced motion.
- Audits heatmap: move to a cell by keyboard → popover opens with the value announced; close does not strand focus.
- Memory: full CRUD by keyboard only, including the inline destructive confirm.
- Config: form completable and submittable by keyboard; validation errors announced and associated with their fields.
- Reduced-motion emulation on: flip a fixture file to trigger a live chip change → chip swaps instantly, no cross-fade; health dial renders final value without sweep.
- RTL emulation on: all 11 surfaces render mirrored (nav, browser-split rails, inspector side, stream alignment); Chainline/scrubber direction semantics remain coherent; numerals/dates format per locale via `Intl`.
- LTR re-verify after every RTL-motivated fix: both directions green before the finding closes.

## Related context

- Spec §3A trade-offs — "Graph canvases accept an extra build cost (table-view toggle) as the non-negotiable keyboard/screen-reader path".
- Spec §3A heatmap decision — values via popover, "never printed in-cell, never hue-only — popover is the a11y path".
- Spec §3A motion language — reduced-motion contract: decorative off, functional instant, scrubber drag retained, runtime `matchMedia` listener + shared duration-zeroing hook.
- Spec §4.5 — RTL locale: `Intl.NumberFormat`/`Intl.DateTimeFormat` for all counts/durations/timestamps, logical CSS properties for mirroring.
- Spec §3A pole execution — token-based dark theme; contrast fixes route through tokens (`.hyperflow/design/system.md` is the source; `styles/tokens.css` the generated artifact).
- Frontend standards (repo-level) — real-browser verification is mandatory for UI work; RTL changes verified in both directions; `data-testid` retained on interactive elements touched.
- Deps: T40 (harness + fixture project provide the running app and deterministic data for the pass).

## Gotchas

- RTL check = BOTH directions before done: an RTL fix that regresses LTR (or vice versa) is the single most common failure mode — every directional fix re-verifies the other direction before the finding closes.
- Fix contrast at the token layer, never per-component: an inline color override "fixing" one badge forks the design system and leaves every other consumer failing.
- The scrubber is the deliberate reduced-motion exception (1:1 user-driven drag stays) — do not "fix" it to be motionless; conversely the settle-spring on release IS decorative-adjacent and must respect the preference per the motion spec.
- The table toggle must be content-EQUIVALENT, not a stub: if node cost chips or edge relationships are missing from the table view, that is a finding, not an acceptable simplification.
- Console-clean includes React warnings (keys, act, hydration) — warnings are findings here, not noise, because this is the last gate before ship.
- Direction and locale are separate axes: test an RTL locale with its native numeral/date expectations through `Intl`, not just `dir="rtl"` flipped on an English page.
- Scope discipline: fix what the checklist surfaces on the surfaces it names — this pass does not become a general refactor of `src/client/`.
