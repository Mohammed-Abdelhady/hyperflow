# phase-7-browse-manage-surfaces

## Status

| Field       | Value                                                        |
|-------------|--------------------------------------------------------------|
| Status      | pending                                                      |
| Progress    | `░░░░░░░░░░` 0 / 7 tasks (0%)                                |
| Depends on  | `phase-6-live-surfaces`                                      |
| Specialists | `frontend-reviewer`                                          |

## TL;DR

Ships the six browse/manage feature surfaces — plans, specs (+ the Mermaid lazy chunk), features, audits, memory, and the management panels (config editor, markers, handoff, restore) — all composed from the phase-5 primitive inventory and the browser-split layout grammar. Every management mutation goes through TanStack Query mutations against `/api/v1` and treats the SSE `write-echo` as the source of confirmed truth, never the POST response.

## Goal

Every artefact class in a `.hyperflow/` tree becomes browsable through the browser-split grammar (280px timestamped artefact rail + document pane), and every allowlisted write surface (memory CRUD, config, `.mode`/`.sticky` markers, handoff STATUS) becomes operable from the SPA with optimistic updates that reconcile against the watcher's `write-echo` delta. Parse-degraded artefacts render raw with a degraded badge; observe mode disables all write affordances with an explanatory tooltip; each surface renders its own honest zero state from spec §4.7.

## Exit criteria

- [ ] All 6 browse/manage surfaces (`/plans`, `/specs`, `/features`, `/audits`, `/memory`, `/config`) render the e2e fixture tree end-to-end — including parse-degraded artefacts (raw view + badge), mixed-format trees, and deep links via `?slug=`.
- [ ] Every management write (memory CRUD, config save, marker toggle, handoff transition) round-trips through the server's single write door and reconciles the optimistic entry against the `writeId`-correlated `write-echo` SSE delta; conflict (409) and denial (403) responses roll the optimistic patch back and surface a typed error inline.
- [ ] Zero-data states per spec §4.7 render on an empty fixture tree: pending-only conclusions list, single-revision spec ("one revision — nothing to diff yet"), single-audit single-column heatmap, unlinked-memory grid fallback — fact + action copy, no blank panes.
- [ ] Derived files (`memory/index.md`, `memory/.checksums`) are unwritable from every UI path; audits list stays virtualized beyond 100 findings; every interactive element carries `data-testid`; all layouts are RTL-safe via logical CSS properties.

## Tasks

| ID | Task | Brief | Deps | Complexity | Specialist review |
|----|------|-------|------|------------|-------------------|
| T29 | Plans surface — browser-split, rosters, Plan Conclusions with evidence | [tasks/T29-plans-surface.md](tasks/T29-plans-surface.md) | T22, T24, T20, T3 | m | frontend-reviewer |
| T30 | Specs surface + Mermaid chunk — viewer, section diff, sandboxed MermaidBlock | [tasks/T30-specs-surface-mermaid.md](tasks/T30-specs-surface-mermaid.md) | T22, T24, T20 | m | frontend-reviewer |
| T31 | Features surface — feature.md → phase → tasks drill-down | [tasks/T31-features-surface.md](tasks/T31-features-surface.md) | T29 | m | frontend-reviewer |
| T32 | Audits surface — virtualized findings browser + audit-trend heatmap | [tasks/T32-audits-surface.md](tasks/T32-audits-surface.md) | T22, T24, T20 | m | frontend-reviewer |
| T33 | Memory surface — entry browser + CRUD + knowledge-graph view | [tasks/T33-memory-surface.md](tasks/T33-memory-surface.md) | T25, T21, T20 | m | frontend-reviewer |
| T34a | Config editor — schema-driven form, drift tolerance, raw-JSON toggle | [tasks/T34a-config-editor.md](tasks/T34a-config-editor.md) | T21, T2, T20, T22 | m | frontend-reviewer |
| T34b | Management panels — markers, handoff STATUS, observe mode, restore | [tasks/T34b-management-panels.md](tasks/T34b-management-panels.md) | T21, T20, T22 | m | frontend-reviewer |

## Batch order

| Batch | Tasks | Rationale |
|-------|-------|-----------|
| B1 | T29 · T30 · T32 · T33 · T34a · T34b | Mutually independent — six disjoint `features/` folders (T34a/T34b split `features/management/` into disjoint component sets defined in their briefs); all depend only on phase-5/phase-6 outputs (T20 store, T21 clients, T22/T24 primitives, T25 graph chunk, T2/T3 shared) |
| B2 | T31 | Reuses the browser-split shell T29 extracts — must land after the plans surface exists so the drill-down composes instead of duplicating |
