# T17 — Write routes + restore route

## Task

Implement the five mutation route modules — memory, config, markers, handoff, restore — as pure transport over the T15 domain services: Zod-validated request bodies in, Zod-serialized acceptance responses out, typed errors thrown to the T16 central mapper. This completes the closed `/api/v1` write surface.

## Why

The write routes are the network face of the five-surface write enumeration — the exact place past localhost-tool CVEs lived (drive-by POSTs, spec §3B decision 8). Keeping them transport-only means every guarantee (state machine, conflict check, denylist, write door) is enforced in exactly one lower layer and cannot be forked or forgotten per-route; the routes' only job is contract fidelity: valid body in, envelope-or-acceptance out, `writeId` correlation for the SSE echo.

## Scope

**IN:**
- `routes/memory.ts`: memory entry list/detail reads + create/update/delete mutations.
- `routes/config.ts`: config read (recognized + unrecognized keys as the service returns them) + schema-validated write.
- `routes/markers.ts`: `.mode`/`.sticky` read + toggle.
- `routes/handoff.ts`: handoff package reads + STATUS transition endpoint.
- `routes/restore.ts`: backup listing for a target + restore action.
- Every mutation response carries the `writeId` the client correlates against the `write-echo` SSE delta (spec §2b); the response acknowledges acceptance only — it is not the confirmed state.
- Zod validation of every request body and every response payload against shared `api.ts` schemas; conflict preconditions (mtime/content-hash captured at read time) travel inside the validated body.
- Mounting the five routers into the T16 factory's `/api/v1` mount point.
- Route-level unit tests + write-path E2E.

**OUT:**
- All domain logic — state machine, conflict checks, denylist refusals, key preservation live in T15; the write door lives in T10.
- Error envelope construction — routes throw; T16's mapper builds bodies.
- SSE echo emission — the watcher-through-hub path emits `write-echo`; routes only return the `writeId`.
- Client-side mutations, optimistic updates, rollback (client phase).
- Any new security middleware — the T9a/T9b gates already cover these routes by mount order.

## Files in scope

- `dashboard/src/server/routes/memory.ts` — create. REST resource: list entries, read one, create, update, delete. Each mutation validates the body (entry payload + conflict precondition) against the shared schema, calls the T15 memory service, returns the acceptance envelope with `writeId`. No path handling — entry identity is category + entry id; the service resolves paths.
- `dashboard/src/server/routes/config.ts` — create. GET returns the service's read result (recognized + unrecognized partition); PUT/POST validates the recognized-keys payload against the shared config mirror schema plus precondition, delegates, returns acceptance + `writeId`.
- `dashboard/src/server/routes/markers.ts` — create. GET marker states; POST toggle with validated target marker + desired state.
- `dashboard/src/server/routes/handoff.ts` — create. GET package list/detail; POST transition with validated `{slug, requested}` body — the service's illegal-transition error surfaces through the mapper as 409, this route adds nothing.
- `dashboard/src/server/routes/restore.ts` — create. GET backups for a validated target descriptor; POST restore with backup id + precondition, returning acceptance + `writeId`.
- `dashboard/tests/unit/routes/write-routes.test.ts` — create (split per resource if the file nears the cap). Validation rejects, delegation calls, acceptance shape, error passthrough.
- `dashboard/tests/e2e/memory-crud.spec.ts`, `dashboard/tests/e2e/handoff-transition.spec.ts`, extend `config-edit` flow — the spec §5 E2E roster's write flows land here.

## Acceptance criteria

- [ ] No route module imports `fs` or any path/security module — services only (lint direct-fs ban passes; import assertions in tests).
- [ ] Every request body is Zod-validated before any service call; a malformed body yields 400 `VALIDATION_FAILED` with the Zod issue list in `details` and provably no service invocation.
- [ ] Every mutation response validates against the shared acceptance schema and carries a `writeId`.
- [ ] Illegal handoff STATUS transition surfaces as 409 with current/requested states in `details`; on-disk STATUS unchanged (end-to-end through route → service → no write).
- [ ] Stale precondition (target changed on disk since read) surfaces as 409 `WRITE_CONFLICT`; write refused.
- [ ] Memory mutation targeting `index.md`/`.checksums` (crafted request) is refused — surfaced as 403 `PATH_BLOCKED` via the mapper, file untouched.
- [ ] All five routers are mounted under `/api/v1` behind the token + origin gates (a tokenless POST to any of them → 401 before validation runs).
- [ ] Responses never hand-build error bodies — every error path exits via a thrown typed error (code-review assertion + mapper passthrough tests).
- [ ] All files under 300 lines; no `any`.

## Test cases

- POST memory create with valid body → 200/201 acceptance with `writeId`; service called once with the parsed payload (spy).
- POST memory create missing a required field → 400 envelope with Zod issues; service never called.
- PUT config with unrecognized-keys-preserving payload → acceptance; follow-up GET shows recognized edit applied and unrecognized keys intact (round-trip through route + service).
- POST marker toggle for `.mode` → acceptance; GET reflects the new state.
- POST handoff transition planned → built → 200; immediate second POST built → planned → 409 envelope `{code:"WRITE_CONFLICT"}`-class with transition details; fixture STATUS file still `built`.
- POST restore with a stale precondition (file touched after backup listing) → 409; with fresh precondition → acceptance and the file content equals the backup.
- Tokenless POST to every write route → 401 generic envelope (gate ordering).
- E2E (Playwright, fixture project, data-testid-free API-level where UI not yet built): memory CRUD flow — create via POST, observe `write-echo` SSE delta carrying the returned `writeId` within 2s, GET snapshot shows the entry; config edit flow with unrecognized-key preservation asserted on disk; illegal STATUS jump returns 409 and the UI-visible state refreshes to on-disk truth.

## Related context

- Spec §2b — the write path diagram IS this task's contract: mutation → token/origin → Zod validate → jail → denylist → backup → temp+fsync → rename → watcher echo with `writeId`; denied → 4xx typed error → client rollback.
- Spec §1 — routes → services boundary ("routes do transport only"), client → server writes boundary (token header, `/api/v1`).
- Spec §3B decision 15 (envelope + central mapper — routes throw, never build), decision 8 layer e (write allowlist these five routes exhaust), decision 9 (config write conformance).
- Spec §4.4 — conflict semantics, restore-through-the-write-door, dispatch-concurrent writes.
- Spec §5 — `routes/memory.ts, config.ts, markers.ts, handoff.ts` roster (restore route completes the write surface alongside the T15 restore service).
- Shared schemas consumed (T2): `shared/schemas/api.ts` (every request body, acceptance response, error envelope), `shared/schemas/config.ts` (config write payload mirror), `shared/schemas/snapshot.ts` (memory entry + handoff shapes echoed in reads).

## Gotchas

- Transport-only is the whole task: any business rule appearing in a route (a state check, a path decision, a merge) is a defect — push it into T15 and call it.
- The POST response is an acknowledgment, not truth — resist returning the "new state" optimistically from the route; the watcher echo carries confirmed state (spec §2b). Return acceptance + `writeId` only.
- Conflict preconditions come from the client (captured at read time) — they are input, so they are inside the Zod-validated body, not headers or ad-hoc params.
- `writeId` must flow into the write door so the echo delta can carry it — plumb it as part of the service call, not as route-local bookkeeping.
- Restore POST is a mutation like any other: same precondition, same acceptance shape, same echo — no special-casing.
- security-reviewer co-signs: crafted-payload tests (denylisted targets, traversal-shaped entry ids, oversized bodies) belong in this task's suite even though the guards live lower — the route layer is where the attack arrives.
