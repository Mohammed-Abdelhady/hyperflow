# phase-4-server-api-cli

## Status

| Field       | Value                                                    |
|-------------|----------------------------------------------------------|
| Status      | pending                                                  |
| Progress    | `░░░░░░░░░░` 0 / 6 tasks (0%)                            |
| Depends on  | `phase-2-parsers, phase-3-server-security-live`          |
| Specialists | `backend-reviewer, api-reviewer, security-reviewer`      |
| Spec        | `.hyperflow/specs/hyperflow-dashboard.md`                |

## Goal

Assemble the running server: domain services over the parser and write-pipeline layers (snapshot assembly + diffing, events tailing + replay index, memory/config/markers/handoff/restore), the Hono server factory with the central error mapper and the versioned `/api/v1` read + write routes, and the CLI launcher that discovers the project root, mints the session token, and opens the browser. At phase exit the dashboard is launchable end-to-end against a fixture `.hyperflow/` tree — spec §1 (module contracts), §2 (all three data-flow paths), §3B decisions 13/14/15, §5 routes/services tree.

## Exit criteria

- [ ] Server boots against the fixture project (`tests/e2e/fixture-project/`) bound to 127.0.0.1, security middleware mounted ahead of all routes, static SPA served with history fallback.
- [ ] `GET /api/v1/snapshot` returns a schema-valid normalized snapshot covering every artefact surface, with epoch, last event id, and observe-mode flag in meta.
- [ ] SSE stream delivers `snapshot-delta` on file change and `hf-event` on `events.ndjson` append; tailer survives torn lines and file shrink (resync).
- [ ] All five write surfaces (memory CRUD, config, markers, handoff STATUS, restore) work through the write door; illegal handoff transition and mtime conflict both return 409; derived files refuse writes.
- [ ] Every `/api/v1` error is the `{code, message, details?}` envelope with deterministic 400/401/403/404/409/500 mapping from the central mapper.
- [ ] CLI cold-start opens the UI: root discovery, port probe, token mint, browser open with URL always printed; second launch reuses the running instance via the identity ping.

## Tasks

| ID  | Task | Files | Deps | Complexity | Specialist |
|-----|------|-------|------|------------|------------|
| T13 | Snapshot + delta services | `tasks/T13-snapshot-delta-services.md` | T6, T7, T8, T2 | m | backend-reviewer |
| T14 | Events tailer + events service | `tasks/T14-events-tailer-service.md` | T8, T12 | m | backend-reviewer |
| T15 | Domain services (memory, markers, config, handoff, restore) | `tasks/T15-domain-services.md` | T10, T7, T8 | m | backend-reviewer, security-reviewer |
| T16 | Server factory + error mapper + read routes | `tasks/T16-server-factory-read-routes.md` | T9a, T9b, T12, T13, T14 | m | api-reviewer |
| T17 | Write routes + restore route | `tasks/T17-write-routes.md` | T15, T16 | l | api-reviewer, security-reviewer |
| T18 | CLI launcher | `tasks/T18-cli-launcher.md` | T16 | m | security-reviewer |

## Batch order

| Batch | Tasks | Rationale |
|-------|-------|-----------|
| B1 | T13 · T14 · T15 | Independent service-layer work over already-built parsers (phase 2) and write pipeline / SSE plumbing (phase 3); no shared files. |
| B2 | T16 | Server factory + read routes need T13 (snapshot), T14 (events/stream) and the phase-3 security + hub modules in place. |
| B3 | T17 · T18 | Write routes mount onto the T16 factory and delegate to T15 services; CLI probes the T16 identity endpoint. Disjoint files — run in parallel. |
