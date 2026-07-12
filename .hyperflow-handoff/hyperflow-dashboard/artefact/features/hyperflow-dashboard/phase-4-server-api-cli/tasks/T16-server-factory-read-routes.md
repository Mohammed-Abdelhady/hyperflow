# T16 — Server factory + error mapper + read routes

## Task

Assemble the running HTTP surface: the server factory (`server/index.ts` — Hono on `node:http`, bound to 127.0.0.1 only, security middleware mounted ahead of everything, `/api/v1` routes, static SPA with history-mode index fallback), the central error mapper producing the `{code, message, details?}` envelope from typed domain errors, and the read routes: snapshot, events range fetch, SSE stream, and the token-authenticated identity ping (`GET /api/v1/instance`) that second launches probe. Snapshot meta carries the observe-mode flag from the startup read-only-filesystem probe.

## Why

This is where the module contracts of §1 become a reachable product: everything phases 2–3 and batch B1 built is only observable through these routes. The central error mapper is decision 15's enforcement point — routes throw typed errors and can never hand-build an off-contract body — and the loopback bind + middleware-first mounting is the outermost wall of the decision-8 security model.

## Scope

**IN:**
- `server/index.ts`: factory taking the CLI's typed `{rootDir, port, token, openBrowser}` options (never re-discovering, spec §1 CLI → server contract); `node:http` via Hono adapter listening on 127.0.0.1 only; mount order: Host/Origin allowlist (T9a) → token gate (T9b) → error mapper → `/api/v1` routers → static `dist/client` with history fallback (unknown non-API GET → index.html); startup observe-mode probe (writability check on the jail root) feeding snapshot meta; wires watcher deltas (T13) and tailer events (T14) into the SSE hub (T12).
- `routes/error-mapper.ts`: Hono middleware catching thrown typed domain errors, mapping 1:1 to stable codes and deterministic statuses — 400 `VALIDATION_FAILED` · 401 `TOKEN_INVALID` · 403 `ORIGIN_DENIED`/`PATH_BLOCKED` · 404 `NOT_FOUND` · 409 `WRITE_CONFLICT` · 500 `INTERNAL`; unknown thrown values → 500 `INTERNAL` with no internals leaked.
- `routes/snapshot.ts`: `GET /api/v1/snapshot` — full normalized snapshot + current epoch + last event id + observe-mode flag, serialized through the shared schema.
- `routes/events.ts`: `GET /api/v1/events` — validated range params → T14 service range read.
- `routes/stream.ts`: `GET /api/v1/stream` — SSE endpoint delegating entirely to the phase-3 hub; token accepted via query param on this route only (EventSource header limitation, spec decision 14); the stream route never logs its URL.
- `routes/instance.ts`: `GET /api/v1/instance` — token-authenticated identity ping returning enough for T18's second-instance detection (instance identity, jail root, version); behind the token gate like everything else.
- Route-level tests + the first passing E2E boots.

**OUT:**
- Write routes (T17) — the factory leaves a clear mount point for them.
- Security middleware internals (T9a/T9b), SSE hub/ring buffer (T12), watcher (phase 3) — mounted/wired, not built.
- Domain services logic (T13/T14/T15) — routes call services, transport only.
- CLI (T18) — consumes the factory options contract and the instance endpoint.
- SPA build output — the factory serves `dist/client` when present; a missing bundle must not crash API-only operation (dev/test mode).

## Files in scope

- `dashboard/src/server/index.ts` — create. Factory function options-in, running-server handle out (address, close). Explicit host `127.0.0.1` on listen — never `0.0.0.0`, never unspecified. Middleware mount order exactly as scoped above. History fallback serves index.html for non-`/api` GET paths only; `/api/v1/*` misses fall through to 404 `NOT_FOUND` envelope, never HTML. Observe-mode probe at startup + flip-on-first-write-failure hook (spec §4.4). Keep assembly thin — under 300 lines; extract static-serving or wiring helpers if it grows.
- `dashboard/src/server/routes/error-mapper.ts` — create. The ONLY place envelopes are built. Carries the typed-error-class → code → status table; serializes `details` (Zod issue list, conflicting mtime, denied path class) when the error provides it. 401 bodies stay generic — no distinction between absent/malformed/near-miss token (spec §4.6). Path-jail denials map to 404 with no path echo (spec §4.6); denylist/blocklist write denials map to 403 `PATH_BLOCKED`.
- `dashboard/src/server/routes/snapshot.ts` — create. Transport only: no params, call snapshot service cached read, compose meta (epoch + last event id from hub, observe-mode from factory state), Zod-serialize out.
- `dashboard/src/server/routes/events.ts` — create. Zod-validate range query params (invalid → thrown validation error → 400), call T14 range read, Zod-serialize the page out.
- `dashboard/src/server/routes/stream.ts` — create. Validate the query-param token (same secret as the header gate), hand the connection to the hub (which owns ids, replay, heartbeats); no logging of request URL on this route.
- `dashboard/src/server/routes/instance.ts` — create. `GET /api/v1/instance` returning the identity payload; responds only with a valid token so a foreign service squatting the port can never be mistaken for a dashboard instance.
- `dashboard/tests/unit/routes/error-mapper.test.ts` — create. Full error-class → envelope/status table, unknown-error fallback.
- `dashboard/tests/e2e/snapshot.spec.ts` (or extend the suite skeleton) — first real-server E2E against `tests/e2e/fixture-project/`.

## Acceptance criteria

- [ ] Every `/api/v1` error response is the `{code, message, details?}` envelope with the correct 400/401/403/404/409/500 mapping — including 404s for unknown API paths and 500s for unexpected throws; no route hand-builds an error body (spec decision 15).
- [ ] Routes never touch `fs` directly — all data comes from services; lint passes with the direct-fs ban.
- [ ] Server listens on 127.0.0.1 only; a connection attempt on any other interface fails.
- [ ] Requests without a valid token → 401 generic body; disallowed Host/Origin → 403 before any route logic (middleware mounted ahead of routes — verified by ordering test).
- [ ] `GET /api/v1/snapshot` meta includes epoch, last event id, and the observe-mode flag; observe mode is true when the jail root is not writable.
- [ ] SSE stream authenticates via query-param token (this route only) and never logs its URL; unknown-path GETs serve index.html (history fallback) while `/api/v1` misses return the JSON envelope.
- [ ] `GET /api/v1/instance` answers with identity payload under a valid token and 401 without one.
- [ ] All files under 300 lines; no `any`; envelope + code registry imported from `shared/`, not redefined.

## Test cases

- Error mapper table test: each typed domain error class in → exact `{code, message, details?}` + status out; a thrown plain `Error` → 500 `INTERNAL` with no stack/message internals in the body.
- Boot factory against the fixture project: `GET /api/v1/snapshot` with token header → 200, body validates against the shared snapshot schema, every artefact surface present (the T13 E2E lands here).
- Same request without token → 401 generic envelope; with `Host: evil.example` → 403 `ORIGIN_DENIED` (DNS-rebinding defense, spec §4.6).
- `GET /api/v1/events?from=…&limit=…` valid → 200 page; malformed params → 400 `VALIDATION_FAILED` with Zod issues in `details`.
- `GET /api/v1/nonexistent` → 404 JSON envelope; `GET /replay` (no token needed for static) → index.html via history fallback.
- Read-only fixture root (chmod in test setup) → snapshot meta `observeMode: true`.
- E2E: connect EventSource to `/api/v1/stream?token=…`, scripted edit to a fixture task file → `snapshot-delta` frame arrives; scripted append to `events.ndjson` → `hf-event` frame within 2s; reconnect with stale `Last-Event-ID` from a wrong epoch → `resync-required` frame (hub behavior, exercised through this route).
- E2E: `GET /api/v1/instance` with the minted token → identity payload matching the booted instance.

## Related context

- Spec §1 — CLI → server contract (typed options, no re-discovery), routes → services boundary, C4 SRV subgraph.
- Spec §2a startup variant (snapshot + epoch + last event id hydration), §2b (middleware order on the write path applies identically here).
- Spec §3B decision 13 (SSE vocabulary + `epoch-seq` + resync — the stream route's contract), decision 14 (token transport: `X-Hyperflow-Token` header everywhere, query-param exception for SSE only, no logging), decision 15 (envelope, code registry, central mapper, client branches on `code`).
- Spec §4.1 (second-instance probe → the instance endpoint; no-`.hyperflow` boot), §4.4 (observe mode), §4.6 (401 generic, 403 pre-route, 404 no-path-echo).
- Spec §5 — `server/index.ts`, `routes/` roster (this task builds the read half + mapper).
- Shared schemas consumed (T2): `shared/schemas/api.ts` (request/response envelopes, error shape, code registry constants), `shared/schemas/snapshot.ts` (snapshot response), `shared/schemas/event-line.ts` (events range page items), `shared/schemas/delta.ts` (stream payloads — via hub).

## Gotchas

- Routes own transport, services own logic — if a route grows an `if` about domain state, it belongs in a service.
- Mount order is a security property: allowlist and token gate MUST run before any route logic, and the error mapper must wrap the routers so middleware rejections also come out as envelopes.
- The observe-mode flag propagates through snapshot meta only — do not invent a separate endpoint; the client reads it from hydration (T13 left the meta slot for it).
- History fallback must exclude `/api` — an API 404 that returns index.html poisons every client error path.
- EventSource cannot set headers: the stream route is the one sanctioned query-param token consumer; keep that exception out of the shared token middleware and never log the URL.
- The instance endpoint must require the token — an unauthenticated identity ping would let any local process fingerprint the dashboard and its jail root.
- 404 for path-jail denials, 403 for write-denylist hits — two different codes for two different guards; do not collapse them.
