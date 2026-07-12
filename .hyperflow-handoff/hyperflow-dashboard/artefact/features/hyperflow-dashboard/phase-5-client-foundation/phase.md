# phase-5-client-foundation

## Status

| Field       | Value                                                        |
|-------------|--------------------------------------------------------------|
| Status      | pending                                                      |
| Progress    | `░░░░░░░░░░` 0 / 6 tasks (0%)                                |
| Depends on  | `phase-1-foundations`                                        |
| Specialists | `frontend-reviewer, security-reviewer, designer, motion`     |

## TL;DR

Builds the SPA's load-bearing floor: bootstrap + shell + router with the token-fragment handshake, the Zustand slice store with deterministic SSE-delta reducers, the typed api/SSE/leader-election service clients, and the full design-system primitive set (static, instrument, container). Everything downstream — the 11 feature surfaces — composes exclusively from what this phase ships. All visual values bind to `.hyperflow/design/system.md` tokens; no inline values are legal.

## Goal

A bootable app shell at `dashboard/src/client/` that completes the fragment auth handshake, resolves all 11 history-mode routes, renders connection/resync/reduced-fidelity/observe-mode chrome, holds a live snapshot in per-feature Zustand slices fed by one shared reducer path, talks to `/api/v1` through a single typed client with leader-tab SSE fan-out, and exposes the complete primitive inventory (StatCard through Chainline through InspectorPanel) that feature phases consume without writing new base components.

## Exit criteria

- Shell boots end-to-end with the handshake: CLI-style `#token=` fragment is consumed into `sessionStorage`, stripped via `history.replaceState`, and every subsequent `/api/v1` request carries `X-Hyperflow-Token`.
- All primitives render in both LTR and RTL using design-system tokens only — zero hardcoded colors, sizes, durations, or easings anywhere in `components/`.
- SSE-delta reducers are deterministic across tabs: the same recorded fixture delta stream applied in leader and follower paths yields byte-identical store state.
- Every interactive element carries `data-testid`; every animated component has a verified reduced-motion fallback.

## Tasks

| ID | Task | Brief | Complexity | Specialist review |
|----|------|-------|------------|-------------------|
| T19 | SPA bootstrap + shell (handshake, router, chrome/banners) | [tasks/T19-spa-bootstrap-shell.md](tasks/T19-spa-bootstrap-shell.md) | m | frontend-reviewer, security-reviewer |
| T20 | Zustand slices + SSE-delta reducers + selector hooks | [tasks/T20-store-slices-sse-reducers.md](tasks/T20-store-slices-sse-reducers.md) | m | frontend-reviewer |
| T21 | api + SSE + leader clients (Query client, EventSource lifecycle, tab election) | [tasks/T21-api-sse-leader-clients.md](tasks/T21-api-sse-leader-clients.md) | m | frontend-reviewer, security-reviewer |
| T22 | Static primitives (StatCard, StatusBadge, RosterRow, EmptyState, HeatmapCell) | [tasks/T22-static-primitives.md](tasks/T22-static-primitives.md) | l | designer |
| T23 | Instrument primitives (Chainline, StageChip, ScoreMeter, Scrubber) | [tasks/T23-instrument-primitives.md](tasks/T23-instrument-primitives.md) | m | motion, designer |
| T24 | Container primitives + list hooks + Intl formatters (NodeCard, InspectorPanel, EventRow) | [tasks/T24-container-primitives.md](tasks/T24-container-primitives.md) | m | frontend-reviewer, motion |

## Batch order

| Batch | Tasks | Rationale |
|-------|-------|-----------|
| B1 | T19 · T20 · T22 · T23 · T24 | Mutually independent — shell, store, and the three primitive groups touch disjoint files; all depend only on phase-1 outputs (T2 shared schemas, T4 design tokens) |
| B2 | T21 | Consumes T20's store surface (hydration, delta dispatch, connection slice) — must land after the reducers exist |
