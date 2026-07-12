# T13 — Snapshot + delta services

## Task

Implement the snapshot assembly service and the snapshot-diff service: `snapshot.ts` fans out to every phase-2 parser surface (tasks, features, memory, audits, specs, handoff, background, config, events meta) over in-jail absolute paths, assembles the shared-schema normalized snapshot, and caches it; `delta.ts` diffs the previous cached snapshot against the new one and produces the typed delta objects the SSE hub broadcasts as `snapshot-delta` events.

## Why

The snapshot is the single state document every client consumes (spec §2a read path) — `GET /api/v1/snapshot` hydrates the store, and every subsequent live update is a diff of it. Getting the cache + minimal-diff contract right here is what keeps SSE deltas small (spec §1 key structural decisions: "server stays a thin normalizer so SSE deltas stay small") and keeps re-renders scoped client-side.

## Scope

**IN:**
- `snapshot.ts`: full-tree assembly (fan-out across all parser surfaces), per-path incremental refresh (re-parse only the changed paths handed over by the watcher), in-memory snapshot cache, raw-fallback nodes with `parseError` flags folded into the snapshot (never dropped), snapshot meta scaffold (fields for epoch / last event id / observe-mode populated by the server factory in T16).
- `delta.ts`: structural diff previous-vs-next snapshot → typed delta list (add/update/remove per surface entity), empty-diff suppression (no delta emitted when content is checksum-identical).
- Unit tests for both against golden fixtures.

**OUT:**
- Parsers themselves (phase 2, T6–T8) — this task only calls them.
- SSE hub, id assignment, ring buffer (phase 3, T12) — delta objects are handed over; the hub is the sole id assigner and sole SSE writer (spec §1 boundary table).
- Watcher/settle/integrity (phase 3) — this task consumes settled change sets, it does not watch.
- HTTP route exposure (T16).
- Derived metrics (health, leaderboard, tokens) — those are `shared/derived/` pure functions computed client-side.

## Files in scope

- `dashboard/src/server/services/snapshot.ts` — create. Exports a snapshot service factory taking the jail-resolved root paths (`.hyperflow/`, `.hyperflow-handoff/`, global config path). Provides: full assembly (walk each artefact surface directory, hand absolute in-jail paths to the matching parser, collect `Parsed<T> | RawFallback` results into the shared snapshot shape), incremental refresh (given a settled change set from the watcher, re-parse only affected files and patch the cached snapshot), and cached-snapshot read access for the route layer. Parse failures become raw-markdown fallback nodes carrying `parseError` — the snapshot never omits a file because it failed to parse (spec §4.2). Keep under 300 lines — extract directory-walk helpers if needed.
- `dashboard/src/server/services/delta.ts` — create. Pure diff module: previous snapshot + next snapshot in, typed delta array out, conforming to the shared delta schema. Diff granularity is per surface entity (one task file, one memory entry, one audit) — never "whole surface replaced" when a single file changed. Identical input snapshots produce an empty delta.
- `dashboard/tests/unit/services/snapshot.test.ts` — create. Fixture-tree assembly, incremental refresh, parse-failure degradation cases.
- `dashboard/tests/unit/services/delta.test.ts` — create. Table-driven diff cases: add, update, remove, no-op, mixed burst.

## Acceptance criteria

- [ ] Full assembly over the golden fixture tree produces a snapshot that validates against the shared Zod snapshot schema with every artefact surface populated.
- [ ] Snapshot diff produces minimal deltas: a change to one task file yields exactly one delta entry for that entity, nothing else.
- [ ] Diffing a snapshot against itself yields an empty delta (no-op suppression).
- [ ] A malformed artefact yields a raw-fallback node with `parseError: true` inside the snapshot — no throw, no missing entry (parse-or-degrade, spec §3B decision 4).
- [ ] Incremental refresh re-parses only the paths in the change set; unchanged surfaces are returned by reference from the cache (verifiable via identity check in tests).
- [ ] Services receive absolute in-jail paths only and never resolve user-supplied paths themselves (spec §1 services → parser boundary).
- [ ] No direct `fs` writes anywhere in either module (read-only services; lint rule from `eslint.config.js` must pass).
- [ ] Both files stay under 300 lines; no `any`.

## Test cases

- Assemble from `tests/fixtures/golden/` tree → snapshot parses under the shared schema; counts of tasks/memory/audits/specs entries match fixture contents.
- Assemble a tree containing one deliberately malformed task file → snapshot contains a fallback node with `parseError` and raw markdown body; all sibling files parse normally.
- Incremental refresh with a change set naming one memory file → only the memory parser is invoked (spy/mock assertion); resulting snapshot differs only in that entry.
- Diff: entry added → single `add` delta; entry field changed → single `update` delta; file deleted → single `remove` delta; no change → `[]`.
- Diff of a burst change set (3 task checkboxes + status block in one settle window) → one coalesced delta batch, not four independent emissions.
- Empty `.hyperflow/` tree → snapshot with all surfaces present but empty (feeds §4.7 zero states); no throw.
- E2E (lands with T16 in place, spec `tests/e2e/*.spec.ts`): boot the real server against `tests/e2e/fixture-project/`, `GET /api/v1/snapshot` → 200, body validates against the shared schema, and every surface (tasks, features, specs, audits, memory, handoff, background) renders in the SPA.

## Related context

- Spec §1 — module boundary table rows: services → parser (`Parsed<T> | RawFallback`, never throw), watcher → SSE hub (settled change sets in), parser → shared schemas (`z.infer` only).
- Spec §2a — read path diagram: settle → integrity → parse → normalized snapshot patch → snapshot diff → typed delta → hub.
- Spec §5 — `services/snapshot.ts` and `services/delta.ts` one-liners; parser file roster this service fans out to.
- Shared schemas consumed (T2): `shared/schemas/snapshot.ts` (the assembled shape) and `shared/schemas/delta.ts` (the diff output shape). No parser-private or service-private shapes may cross out of this layer.

## Gotchas

- Services own logic, routes own transport — do not put HTTP concerns (status codes, serialization) in these modules; T16 handles that.
- The snapshot meta carries the observe-mode flag (spec §4.4 read-only filesystem) — design the meta shape so T16 can set it without this service knowing about fs write probing.
- The hub (T12) assigns event ids — delta objects leave this layer id-less. Do not mint ids here.
- Diff must be structural, not reference-based: the watcher path re-parses files, so object identity is not a change signal — use content comparison per entity.
- Cache invalidation keys off the watcher's integrity-checked change sets; do not add a second checksum layer here that fights the phase-3 integrity heuristic.
- BOM/CRLF normalization happens inside parsers (spec §4.2) — do not re-normalize in the service.
