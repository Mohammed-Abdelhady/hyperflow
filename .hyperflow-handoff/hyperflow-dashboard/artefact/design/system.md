# hyperflow-dashboard — design system

## Status

| Field       | Value                                        |
|-------------|----------------------------------------------|
| Status      | living                                       |
| Scope       | hyperflow-dashboard v1 (all screens)         |
| Pole        | dark-first mission control, locked           |
| Specialists | `designer · motion`                          |
| Date        | 2026-07-12                                   |

## TL;DR

Dark-first mission-control system for a local web cockpit that renders `.hyperflow/` artefacts: near-black blue-cast layered surfaces, one teal accent, IBM Plex Sans + IBM Plex Mono, hairline separators, zero glow/gradient/neon. The signature element is the **Chainline** — one monospace stage-strip component that is simultaneously the live progress indicator, the replay scrubber, and the artefact provenance header. Instruments settle; they never perform.

## Domain + audience

Developer-tool observability: engineers running hyperflow chains who open the dashboard *while agents work* (live monitoring), *after a run* (replay, audits, analytics), or *between runs* (memory, specs, config). They read dense state at a glance, in long sessions, usually on a second monitor. Every reference choice comes from pipeline/agent-observability products, not consumer dashboards.

## Color tokens

Branding baseline is `config/features.json → branding`. Echo/divergence is recorded per token — divergences are deliberate, not drift.

### Surfaces (elevation by tone step + hairline — never shadow)

| Token | Value | Role | Branding call |
|---|---|---|---|
| `surface-0` | `#0A0C10` | app canvas | diverges: brand `bg_start→bg_end` gradient dropped (anti-goal: no gradient wash); the blue-cast hue of `#0B0F1A` is kept, flattened |
| `surface-1` | `#0F1217` | panels, rails, stat cards | derived from `surface-0` |
| `surface-2` | `#14181E` | cards, graph nodes, rows-hover | derived |
| `surface-3` | `#1A1F26` | popovers, active row, inspector header | derived |
| `hairline` | `#232932` | default 1px separators | diverges from brand `border #334155` (too loud at 1px on `surface-0`) |
| `hairline-strong` | `#2F3742` | interactive borders, table header rule | derived |
| `shadow-pop` | `0 8px 24px rgb(0 0 0 / 0.5)` | floating layers ONLY (popover, command palette) | the single permitted shadow |

### Text

| Token | Value | Contrast on `surface-0` | Role |
|---|---|---|---|
| `text-hi` | `#E9EDF2` | 16.7:1 | primary content, numerals — diverges from brand `#F8FAFC` (stark white shimmers at data density) |
| `text-mid` | `#94A3B8` | 7.6:1 | secondary, labels — echoes brand `text_secondary` |
| `text-dim` | `#7A8694` | 5.3:1 | micro-labels, timestamps — AA floor for 11px type |
| `text-faint` | `#4C5560` | — | disabled/placeholder only (exempt as disabled state) |

### Accent (exactly one)

| Token | Value | Contrast | Rule |
|---|---|---|---|
| `accent` | `#14B8A6` | 7.8:1 | echoes brand `worker` teal — the dashboard watches workers work. Interactive emphasis, selection, focus ring, live/in-flight state, chart primary hue |
| `accent-dim` | `rgb(20 184 166 / 0.14)` | — | selected-row fill, chip fill, chart area fill |

Deliberate divergence: brand `thinking #7C3AED` violet is NOT the accent — 3.4:1 on `surface-0` fails AA for text, and violet-as-accent is the anti-slop floor's named default. Violet appears nowhere in the dashboard.

### Semantic state colors (state indicators ONLY — never buttons, links, decoration)

| Token | Value | Contrast | State |
|---|---|---|---|
| `state-pass` | `#3FB950` | 7.7:1 | PASS, success, completed |
| `state-fix` | `#F59E0B` | 9.1:1 | NEEDS_FIX, warning — echoes brand `memory` amber |
| `state-blocked` | `#EF4444` | 5.2:1 | blocked, failed, SECURITY_VIOLATION — echoes brand `security` red |
| `state-live` | `= accent` | 7.8:1 | in-flight, running, streaming |
| `state-queued` | `= text-dim` | 5.3:1 | queued, pending, skipped |

Each state has a `-dim` fill at 14% alpha for chip/cell backgrounds; the label always renders in the full-strength color on that fill. **Color never carries state alone** — every state pairs with its text label (PASS, NEEDS_FIX, …).

## Type scale + pairing

**IBM Plex Sans** (UI/display) + **IBM Plex Mono** (data) — a matched family with engineering heritage; self-hosted (npx-local app, no CDN reach). Rules: numbers are always mono and tabular by nature; mono never sets prose; uppercase exists only at `type-micro`.

| Token | Face | Size/Line | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `type-micro` | Mono | 11/16 | 500 | +0.08em, uppercase | micro-labels, stat-card captions, sidebar sections |
| `type-data` | Mono | 12/18 | 400 | 0 | tables, event stream, costs, timestamps, JSON |
| `type-body` | Sans | 13/20 | 400 | 0 | prose, descriptions, empty states |
| `type-ui` | Sans | 13/20 | 500 | 0 | buttons, nav, chip labels |
| `type-title` | Sans | 15/22 | 600 | −0.01em | panel titles |
| `type-section` | Sans | 18/26 | 600 | −0.01em | screen titles |
| `type-numeral` | Mono | 26/32 | 500 | −0.01em | stat-card values, delta numerals |
| `type-hero` | Mono | 44/48 | 300 | −0.02em | Flow Health score, leaderboard rank numerals |

## Spacing, radius, border, density

| Token set | Values | Rule |
|---|---|---|
| Spacing | `sp-1 4 · sp-2 8 · sp-3 12 · sp-4 16 · sp-5 24 · sp-6 32 · sp-7 48` px | the only spacing values allowed downstream |
| Radius | `r-1 4` (chips, badges, inputs) · `r-2 6` (cards, nodes) · `r-3 10` (panels, popovers) · `r-full` (pills, playhead) | locked scale, no other values |
| Border | 1px hairline everywhere; 2px reserved for focus ring | elevation = surface step + hairline, never shadow (except `shadow-pop`) |
| Density | dense row 28px · default row 36px · cell padding `sp-2/sp-3` · panel padding `sp-4` · page gutter `sp-5` | dense-but-calm: density comes from tight rows + mono data, calm from hairlines + whitespace at `sp-5` between instrument groups |

## Signature element — the Chainline

One component, the product's spine: a horizontal monospace stage-strip — hairline rail, stage ticks, `type-micro` stage labels, per-stage token-cost sub-line in `type-data`, one `accent` fill advancing along the rail. It renders the hyperflow chain (plan → dispatch batches → review → integrate) and appears in three modes:

| Mode | Where | Behavior |
|---|---|---|
| live | Mission Control header | current stage advances (`scaleX` fill), per-stage cost accumulates beneath |
| scrub | Chain Replay | the same strip becomes the draggable timeline: event ticks on the rail, `r-full` playhead, 1:1 drag |
| record | audit/spec/feature headers | frozen strip showing which stage produced the artefact; click a stage to jump the inspector |

Functional, not decorative: it is the navigation and scrub instrument. Grounded in Replit's stage-chip progress and n8n's executions rail (see References); the divergence is unifying indicator + scrubber + provenance into a single reusable instrument.

## Motion language

Authored with the motion specialist; governing principle: **instruments settle, they never perform.** Full engineering rules bind `skills/hyperflow/motion.md`.

### Libraries

| Layer | Tool |
|---|---|
| State flips, hovers, heatmap cells, hairlines | CSS transitions (cheapest; no JS on the hot SSE path) |
| Panel slide-in, node enter/exit, scrub-settle, FLIP | Motion for React (`motion/react` v12, MIT; hybrid WAAPI engine, `AnimatePresence`) |
| Graph viewport | React Flow built-in (`fitView`/`setCenter` take `duration` — never wrap in another animator) |
| Numerals | NumberFlow (MIT, ~6.8kB, respects reduced-motion natively; Motion's `AnimateNumber` rejected — Motion+ paid) |

GSAP rejected: imperative timelines fight React reconciliation on SSE re-renders; no SVG-morph/scroll need here.

### Tokens

| Token | Value | Use |
|---|---|---|
| `motion-flip` | 120ms | status-chip flip, heatmap cell, hover, focus |
| `motion-enter` | 200ms | row entry, node enter, diff-content fade |
| `motion-panel` | 280ms | inspector slide, expand/collapse reveal |
| `motion-sweep` | 450ms | dial/meter sweep, `fitView`/`setCenter` |
| `ease-out` | `cubic-bezier(0.25, 1, 0.5, 1)` | all enters, flips, sweeps |
| `ease-exit-in` | `cubic-bezier(0.55, 0, 1, 0.45)` | exits/dismissals |
| `spring-settle` | stiffness 300 · damping 30 · mass 1 | released playhead snapping to event boundary (the one velocity-driven, mildly bouncy surface) |
| `spring-instrument` | stiffness 260 · damping 34 · mass 1 | panel settle, node re-position, numeral roll — critically damped, zero overshoot: data instruments do not bounce |

### Compositor budget (hard rules)

- `transform`/`opacity` only. Banned: animating event-row `height`, meter/Chainline `width` (use `scaleX`, origin at leading edge), playhead `top/left`, any `margin/padding`.
- Event-log rows are fixed-height; entry is `translateY(-4px→0)` + fade on the new row only; `content-visibility: auto` on off-screen rows.
- Expand/collapse: layout snaps, revealed content gets `clip-path: inset()` + fade; siblings FLIP if shift must read.
- Score dial: `rotate()` on a masked arc; `stroke-dashoffset` only as a profiled exception on one ≤120px element.
- `will-change: transform` on exactly one element (inspector panel, applied on start, removed on settle).
- No `requestAnimationFrame` polling; verify with DevTools frame stats + Percent Dropped Frames (p95/1s) on a recorded 10-events/s burst.

### Live-data patterns

| Pattern | Rule |
|---|---|
| SSE chip flip | fixed `min-width` in `ch` (zero layout shift); 120ms opacity cross-fade between stacked state layers; in-flight = 1px determinate `scaleX` hairline, or a 24px hairline segment translating at 1.6s period when indeterminate |
| Stream entry | coalesce per 100ms window; one shared 200ms entry, stagger cap 3 × 25ms; >5 rows/s trips a circuit breaker — snap-append + 400ms one-shot "new" marker fade; auto-follow pins instantly, never smooth-scrolls per row |
| Numerals | tween only user-salient low-frequency values (Flow Health, batch-complete token totals) via NumberFlow + `spring-instrument`; **if update interval < animation duration, snap**; live counters snap; while scrubbing everything snaps |
| Graph | React Flow animates the viewport (`motion-sweep`); the app interpolates elkjs node positions old→new over 280ms; Motion animates node-local enter (fade + `scale(0.97→1)`) / exit; never two animators on one element |
| Scrubber | dragging = zero animation, 1:1 pointer tracking; a global `scrubbing` flag zeroes all transition durations so board state **snaps** — chips never cross-fade through intermediate states; on release the playhead settles to the nearest event boundary with `spring-settle`, inheriting pointer velocity |
| Dial/meter | single 450ms sweep previous→new, no overshoot; numeral rolls in sync; heatmap cell = 120ms cross-fade, no stagger wave across the grid |

### Reduced motion (hard floor, WCAG 2.3.3)

Chip flip → instant swap (state feedback kept); shimmer/indeterminate hairline removed (label carries it); rows snap-append with ≤80ms marker fade retained; NumberFlow disables roll natively; graph durations 0; scrubber 1:1 drag **stays** (direct manipulation, not animation) but release-spring becomes instant snap; dials/meters snap. Runtime `matchMedia('(prefers-reduced-motion: reduce)')` change listener via `MotionConfig reducedMotion="user"` + a shared hook zeroing CSS duration tokens and React Flow durations — mid-session OS toggle takes effect immediately.

## Voice / tone

Instrument labels: terse, technical, no exclamation, no anthropomorphic first person. Verbs for actions ("Replay run", "Prune markers"), nouns for readouts. Numbers always carry units (`tok`, `ms`, `%`, `agents`). Verdict vocabulary matches hyperflow exactly and stays uppercase: `PASS · NEEDS_FIX · BLOCKED · SECURITY_VIOLATION`. Empty states state the fact then the action ("No chains recorded. Run /hyperflow:plan in this project to populate."), never apologize.

## Component inventory

| Component | Treatment (all values are tokens above) |
|---|---|
| Stat card | `surface-1`, `hairline`, `r-2`, `type-micro` caption over `type-numeral` value + `type-data` delta in state color — Posh true-black stat cards |
| Stage chip | `r-1`, state `-dim` fill + full-strength label, `type-ui`; fixed `min-width` in `ch` — Replit stage chips |
| Status badge | `r-1`, `type-micro`, state color pair; always label + color, never color-only |
| Roster row | 36px (28px dense), checkbox + `type-body` title + `type-data` meta right-aligned; hover `surface-2`, selected `accent-dim` + 2px `accent` left inset |
| Node card (graph) | `surface-2`, `hairline-strong`, `r-2`, `type-ui` title + `type-micro` type tag + port dots; footer **cost chip** `type-data` "12.4k tok" — Clay cost chips, WRITER typed nodes |
| Inspector panel | 360px right rail, `surface-1`, hairline-left, `type-title` header on `surface-3`; slides `translateX` + `spring-instrument` — Databricks inspector |
| Event stream row | fixed-height 28px, `type-data`, severity dot + timestamp `text-dim` + message `text-mid`; severity filter chips above — Databricks event log |
| Scrubber | Chainline in scrub mode: hairline rail, event ticks, `r-full` playhead knob, elapsed fill in `accent` `scaleX` |
| Heatmap cell | square, `r-1`, 5-step `accent` alpha ramp (audit-trend); value on hover via popover, never printed in-cell |
| Score dial | 120px masked arc, `hairline` track + `accent` sweep, `type-hero` numeral centered; thresholds re-color sweep via state tokens |
| Empty state | `type-body` `text-mid`, centered in the instrument's own frame, one `type-ui` action; no illustration |
| Sidebar section | 220px rail, `type-micro` `text-dim` section labels (OBSERVE / ARTEFACTS / GRAPHS / MANAGE), `type-ui` items, active = `accent-dim` fill — Vapi taxonomy; text-only, zero icons |
| Count-bar table row | `type-data` label + right count + proportional `accent-dim` bar behind — Vercel count-bar tables (replaces every donut-chart urge) |
| Diff pane | `type-data`, add/remove tinted `state-pass`/`state-blocked` at 10% fill + full-strength gutter markers |

## Layout grammar

Every screen has ONE primary instrument; supporting panels attach to it. No equal-weight widget grids.

| Grammar | Composition | Screens |
|---|---|---|
| Cockpit trio | primary board/canvas + right inspector (360px) + collapsible bottom stream (240px) — Databricks, WRITER | Mission Control, dependency mind-map, memory graph |
| Analytics stack | stat-tile row (4-up) over chart-card grid, single-hue charts — Vercel, Posh, LangSmith | Token analytics, Flow Health, leaderboard, audit heatmap |
| Browser split | left artefact rail (280px, timestamped list) + document pane — n8n executions rail | plan/spec/feature/audit browsers, spec-diff, memory/config/markers |
| Replay | Chainline scrub header + cockpit trio beneath, history rail left — n8n + Databricks | Chain Replay |
| App frame | sectioned 220px sidebar + full-bleed content, page gutter `sp-5` — Vapi | all |

## References (combined)

| Reference | Load-bearing idea taken | URL |
|---|---|---|
| Replit publishing pipeline | stage-chip progress strip with state coloring + inline collapsible log → Chainline live mode | https://mobbin.com/screens/f9e16652-d7c3-4902-a9b7-a50a90c67aee |
| Databricks pipeline | cockpit trio: DAG canvas + right inspector + bottom severity-filtered event log | https://mobbin.com/screens/2a53f9eb-b8e1-4958-afb7-f441acbdf414 · https://mobbin.com/screens/d55b9b90-0c32-4400-86e8-68b000134f5a |
| Adaline traces | histogram strip above trace list; inspector with duration/spans/cost; syntax-colored raw JSON | https://mobbin.com/screens/67794230-da90-4eff-8233-51adf67771c1 |
| WRITER agent blueprint | typed compact nodes with port dots, minimap, collapsible bottom bar | https://mobbin.com/screens/4c627134-f152-4b5f-ae55-d8fb8c4e0833 |
| n8n | executions history rail beside canvas → replay + browser-split grammar | https://mobbin.com/screens/d3af4413-04f9-4534-8aa4-01916d2b4910 |
| Clay | cost chips on nodes, auto-run state, graph↔table toggle → token-cost overlays | https://mobbin.com/screens/f6ad7c2b-ed52-4c37-ad29-5534b9efb07f |
| Runway | floating bottom canvas toolbar (select/pan/zoom/fit) | https://mobbin.com/screens/16aa61e3-22ee-4ce3-be85-054705981f11 |
| Posh | true-black stat cards, hairline borders, uppercase micro-labels, big numerals, zero glow | https://mobbin.com/screens/9d020f17-17d3-4671-a200-d76a7711592f |
| Vercel analytics | restraint benchmark: near-black, delta badges, single-hue charts, count-bar tables | https://mobbin.com/screens/900542f7-c157-4445-8f88-d79dca719c7a |
| LangSmith monitoring | metric-group tabs incl. Cost & Tokens | https://mobbin.com/screens/b7b317f3-20b0-4cf6-86af-c10ae16d0681 |
| Vapi | sectioned sidebar taxonomy | https://mobbin.com/screens/37b72241-caf3-45a1-817c-40945bfa1214 |

Combination rationale: Databricks/WRITER supply the structural grammar (cockpit trio), Replit/n8n supply the temporal grammar (stages + history → Chainline), Posh/Vercel supply the visual restraint (true-black, hairlines, mono numerals, single hue), Clay/Adaline/LangSmith supply the cost-observability layer (cost chips, trace inspectors, token tabs), Vapi organizes the taxonomy. Divergence: the Chainline unifies Replit's indicator and n8n's history rail into one scrub-navigable instrument.

Anti-reference: GitLab pipelines table — the templated admin look this system must never resemble. https://mobbin.com/screens/5c384c13-e9f9-45be-8cef-f08bc517ff7f

## Anti-patterns (specialized slop floor)

- No glow, no neon, no gradient wash — including the brand `bg_start→bg_end` gradient (deliberately flattened) and shimmer-gradient skeletons (static two-tone skeleton + single ≤200ms fade instead).
- No violet accent; `accent` teal is the only interactive hue.
- No donut/pie charts — count-bar tables and single-hue line/area charts only.
- No icon noise: sidebar and labels are text-only; icons appear only where they carry state (severity dots, port dots, checkboxes).
- No templated admin-panel layout — every screen names its one primary instrument; no equal-weight card grids.
- No pulsing glow on in-flight — the 1px determinate hairline or translating hairline segment is the compliant tell.
- No color-only state, no box-drawing characters in UI text, no stagger waves across a board, no spring overshoot on any data instrument.

## Accessibility floor (AA+, non-negotiable)

- Contrast: every text token ≥4.5:1 on its darkest legal surface (values recorded per token above); `type-micro` renders only in `text-dim` or brighter; UI graphics/hairline-adjacent glyphs ≥3:1.
- Focus: 2px `accent` outline, 2px offset, on every interactive element — never removed, never replaced by color change alone.
- State is always label + color; heatmap and dial values reachable via popover/text, not hue alone.
- Keyboard: scrubber supports arrow-key event stepping (Shift = stage stepping); graph canvases expose a table-view toggle (Clay pattern) as the keyboard/screen-reader path; roving tabindex in streams and rosters.
- Reduced motion per Motion language §Reduced motion, with the runtime listener.
- On any aesthetic/a11y conflict, a11y wins (defer to `accessibility-reviewer`).
