# T22 — Static primitives

## Status

| Field      | Value                 |
|------------|-----------------------|
| Task       | T22                   |
| Role       | Implementer           |
| Complexity | l                     |
| Batch      | B1                    |
| Depends on | T4 (design tokens)    |
| Reviewers  | designer              |

## Task

Build the five static design-system primitives — StatCard, StatusBadge, RosterRow, EmptyState, HeatmapCell — exactly to the system.md component inventory, one component per file, tokens only.

## Why

These are the highest-reuse leaf components in the product: stat tiles carry every analytics surface (tokens, health, leaderboard), badges and roster rows carry every browser split (plans, audits, memory, config), empty states carry all nine zero-data cases in spec §4.7, and heatmap cells carry the audit trend. Getting their token binding and restraint right here is what keeps the 11 feature surfaces from ever reinventing a tile — and what keeps the product off the anti-slop floor.

## Scope

**IN:**
- `StatCard.tsx` — headline metric tile per system.md: `surface-1` ground, `hairline` border, `r-2` radius, `type-micro` caption over `type-numeral` value, optional `type-data` delta in a state color; caption uppercase comes from the `type-micro` token itself. Value/delta slots accept pre-formatted strings (formatting is T24's `utils/format.ts` — this component renders, never formats).
- `StatusBadge.tsx` — `r-1`, `type-micro`, state color pair: `-dim` fill at 14% alpha with the full-strength state color label; verdict vocabulary rendered verbatim and uppercase (`PASS · NEEDS_FIX · BLOCKED · SECURITY_VIOLATION`); state → token mapping via a mapping object, never conditionals per call site.
- `RosterRow.tsx` — 36px default / 28px dense variant via prop; optional checkbox + `type-body` title + `type-data` meta right-aligned (logical end-aligned); hover `surface-2`; selected = `accent-dim` fill + 2px `accent` inset on the inline-start edge; keyboard focus ring 2px `accent`, 2px offset.
- `EmptyState.tsx` — `type-body` in `text-mid`, centered in the parent instrument's own frame, at most one `type-ui` action; copy passed in (voice rules enforced by callers), no illustration slot at all.
- `HeatmapCell.tsx` — square, `r-1`, 5-step `accent` alpha ramp mapped from a 0–4 intensity prop via a constant ramp table; value never printed in-cell; exposes hover/focus popover trigger semantics (accessible name carries the value) — the popover surface itself is shared chrome, the cell owns trigger + `aria` wiring; cell value change cross-fades at `motion-flip`.

**OUT:**
- Animated/instrument primitives: Chainline, StageChip, ScoreMeter, Scrubber (T23).
- Container primitives: NodeCard, InspectorPanel, EventRow (T24).
- Formatters (T24) and any data fetching/store subscription — all five are pure presentational components taking typed props.
- Feature-specific composition (stat-tile rows, heatmap grids — feature phases).

## Files in scope

- `dashboard/src/client/components/StatCard.tsx` — create.
- `dashboard/src/client/components/StatusBadge.tsx` — create.
- `dashboard/src/client/components/RosterRow.tsx` — create.
- `dashboard/src/client/components/EmptyState.tsx` — create.
- `dashboard/src/client/components/HeatmapCell.tsx` — create.
- Shared state→token and intensity→ramp mapping objects go to `dashboard/src/client/constants/` if used by more than one component (StatusBadge and future StageChip share the state map — export it once).

## Acceptance criteria

- [ ] Every visual value binds to a named token: `surface-1`/`surface-2`, `hairline`, `r-1`/`r-2`, `type-micro`/`type-data`/`type-body`/`type-ui`/`type-numeral`, `text-mid`, `accent`/`accent-dim`, `state-pass`/`state-fix`/`state-blocked`/`state-live`/`state-queued` (+ `-dim` fills), `sp-2`/`sp-3`/`sp-4` padding, `motion-flip` — zero hardcoded hex, px-size, alpha, or duration literals in any component file.
- [ ] Anti-slop constraints hold: no glow, no gradient, no shadow (these components never float — `shadow-pop` is not theirs to use), separators and borders are 1px hairline tokens, every number/metric renders in the mono data face (`type-data`/`type-numeral`), no icons.
- [ ] State is never color-only: StatusBadge always renders its label; HeatmapCell exposes its value through the popover trigger's accessible name, not hue.
- [ ] `data-testid` on every interactive element: RosterRow root + checkbox, EmptyState action, HeatmapCell trigger; non-interactive components accept an optional testid pass-through.
- [ ] Reduced-motion fallback per component: HeatmapCell's `motion-flip` cross-fade and RosterRow's hover transition collapse to instant swaps under `prefers-reduced-motion` (CSS-level — these are CSS-transition components on the hot path, no JS animation).
- [ ] RTL-safe: RosterRow's selection inset and meta alignment use logical properties (`border-inline-start`, `text-align: end`, `margin-inline`) — mirrors correctly under `dir="rtl"`.
- [ ] Contrast floor: `type-micro` renders only in `text-dim` or brighter; state labels on `-dim` fills use the full-strength state tokens (values already validated in system.md).
- [ ] Focus: 2px `accent` outline with 2px offset on every focusable element; never removed, never color-swap-only.
- [ ] Each component is a pure function of its typed props (no store imports, no fetch); one component per file; no file over 300 lines.

## Test cases

- Unit (RTL/jsdom, per component): renders each variant from typed props; StatusBadge maps all five states to the correct token classes via the shared mapping object and always renders the label text; RosterRow dense variant is 28px and default 36px (token class assertion), selected state applies `accent-dim` + inline-start inset; HeatmapCell maps intensities 0–4 to the five ramp steps and exposes the value in the trigger's accessible name; EmptyState renders fact + at most one action.
- Unit (a11y): axe pass per component; keyboard — RosterRow reachable and selectable, HeatmapCell trigger opens its popover content on focus/Enter.
- Unit (reduced motion): with `prefers-reduced-motion: reduce` emulated, HeatmapCell value change applies without a transition (computed transition-duration 0).
- Integration/E2E (Playwright against a primitives gallery route or the earliest consuming surface): screenshot both LTR and RTL renders of all five primitives on `surface-0`; assert by `data-testid`; verify zero computed `box-shadow`/`background-image: gradient` on any of them (anti-slop probe).

## Related context

- system.md §Component inventory rows: Stat card, Status badge, Roster row, Empty state, Heatmap cell — the normative treatments, restated above only where binding.
- system.md §Anti-patterns (no glow/gradient/donut/icon-noise/color-only state) and §Accessibility floor (contrast, focus, popover as the heatmap a11y path).
- Spec §3A: Posh true-black stat cards + Vercel analytics restraint are the grounded references for StatCard (Mobbin URLs in system.md §References); the audit-trend heatmap decision (hover popover, never in-cell, `motion-flip` cross-fade, no stagger wave); empty-state decision (fact + action, no illustrations); voice rules for verdict vocabulary.
- Spec §4.7 zero-data states — every one of them renders through EmptyState; design its props (fact, action label, action handler) to carry all nine without variants.

## Gotchas

- 300-line cap per component file; RosterRow (variants + selection + checkbox + a11y) is the likeliest to swell — extract sub-parts before it does.
- No inline business logic in JSX — state→token and intensity→ramp maps are module-level mapping objects.
- These components sit inside virtualized lists downstream (RosterRow especially): keep them memo-friendly — stable prop shapes, no object/array literals derived inside render, no context subscriptions. UI-state changes elsewhere must not re-render a list of 500 rows.
- Do not add a shadow, glow, or "hover lift" for polish — elevation in this system is surface step + hairline, full stop.
- StatCard takes formatted strings; resist importing `Intl` here — locale formatting is centralized in T24's `utils/format.ts`.
