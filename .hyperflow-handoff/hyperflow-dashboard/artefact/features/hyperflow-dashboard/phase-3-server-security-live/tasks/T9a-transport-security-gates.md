# T9a — Transport security gates: Host/Origin allowlist + session-token gate

## Task

Implement the two transport-level security middlewares that every request crosses before any route logic runs: the Host/Origin allowlist (`dashboard/src/server/security/origin-allowlist.ts`) and the session-token gate (`dashboard/src/server/security/token.ts`), plus their adversarial unit test suites under `dashboard/tests/unit/security/`.

## Why

A loopback web server with filesystem read/write is exactly the shape of past localhost-tool CVEs (spec §3B.8): DNS rebinding turns "localhost-only" into remotely reachable, and drive-by POSTs from any web page the user has open can hit 127.0.0.1 without auth. These two gates are layers (a) and (b) of the five-layer model — the token defeats cross-origin requests, the Host/Origin allowlist defeats rebinding. They are independent layers on purpose: either one failing still leaves the other standing.

## Scope

**IN:**
- Host/Origin allowlist middleware: strict Host-header check against `127.0.0.1` / `localhost` (with the bound port); Origin header, when present, must also match the allowlist — mounted before all `/api/v1` routes and the SSE stream route.
- Session-token gate middleware: every `/api/v1/*` request must present the CLI-minted token via the `X-Hyperflow-Token` header; the SSE stream route alone accepts the token as a query parameter (spec §3B.14 — `EventSource` cannot set headers).
- Constant-time token comparison (no timing side channel on near-miss tokens).
- Failure responses through the shared error envelope (spec §3B.15): `401 {code: TOKEN_INVALID}` with a generic body, `403 {code: ORIGIN_DENIED}` emitted pre-route.
- Adversarial unit tests for both middlewares.

**OUT:**
- Token minting (lives in `src/cli/token.ts`, phase 1) — this task only verifies a token it is handed.
- Path jail / denylist / secret blocklist (T9b).
- The client-side fragment→sessionStorage handshake (SPA phase).
- Route handlers, static-SPA serving, and the SSE hub internals (T12).

## Files in scope

- `dashboard/src/server/security/origin-allowlist.ts` — CREATE. Hono middleware taking the bound port at construction. Validates the `Host` header equals `127.0.0.1:<port>` or `localhost:<port>` exactly (no suffix/prefix tricks, no userinfo, no attacker subdomains like `localhost.evil.com`); validates the `Origin` header — when present — parses to an allowlisted host on the bound port; a missing Origin passes (non-browser clients such as curl send none). Any failure short-circuits with 403 `ORIGIN_DENIED` before any downstream middleware or route executes. No request internals or echo of the offending header value in the body.
- `dashboard/src/server/security/token.ts` — CREATE. Hono middleware constructed with the minted session token. Extracts the presented token from the `X-Hyperflow-Token` header on all `/api/v1` routes, and from the designated query parameter only on the stream route. Compares in constant time. Missing, malformed, and wrong tokens all produce the identical 401 `TOKEN_INVALID` envelope — the body must not disclose which case occurred. Never logs the expected or presented token; the stream route never logs its URL.
- `dashboard/tests/unit/security/origin-allowlist.test.ts` — CREATE. Attack-case suite (see Test cases).
- `dashboard/tests/unit/security/token.test.ts` — CREATE. Attack-case suite (see Test cases).

One concern per file (spec §1 security layout) — do not merge the two gates into one middleware module.

## Acceptance criteria

- [ ] DNS rebinding via Host header defeated: a request arriving with `Host: attacker.example` (attacker domain resolving to 127.0.0.1) gets 403 before any route logic runs (spec §4.6).
- [ ] CSRF-to-localhost via Origin defeated: a browser-initiated request carrying `Origin: https://evil.example` gets 403 even when it presents a valid token.
- [ ] Missing token → 401 with a generic body; wrong token → 401 with the byte-identical body; near-miss token (one char off) → 401, same body, and comparison is constant-time (spec §4.6 — no hint whether the token was absent, malformed, or near-miss).
- [ ] `Host: localhost.evil.com`, `Host: 127.0.0.1.evil.com`, `Host: 127.0.0.1:<other-port>`, and IPv6-literal tricks are all rejected — allowlist matching is exact, never substring.
- [ ] Valid token via query parameter is accepted ONLY on the stream route; the same query-parameter token on any other `/api/v1` route is rejected 401.
- [ ] Both middlewares emit only the shared `{code, message, details?}` envelope; no ad-hoc error bodies; no header value echoed back.
- [ ] Neither middleware logs tokens or full stream URLs.
- [ ] Both gates run in the documented order (allowlist first, token second) and both run before every route, including static-SPA and 404 paths under `/api`.

## Test cases

Unit (Vitest, middleware invoked against an in-memory Hono app):
- `rejects host header of attacker domain resolving to loopback (dns rebinding)` — `Host: rebind.evil.example` → 403.
- `rejects origin from foreign site with valid token (csrf to localhost)` — `Origin: https://evil.example` + correct `X-Hyperflow-Token` → 403.
- `rejects localhost-prefixed attacker hosts` — `localhost.evil.com:PORT`, `127.0.0.1.evil.com:PORT` → 403.
- `rejects allowlisted host on wrong port` — `127.0.0.1:9999` when bound to 7331 → 403.
- `accepts absent origin with valid host and token` (curl-shaped request) → passes to next.
- `missing, empty, wrong, and near-miss tokens return byte-identical 401 bodies`.
- `query-param token accepted on stream route only; header required everywhere else`.
- `constant-time comparison used for token equality` (assert via the comparison primitive, not wall-clock timing).
- `403 fires before downstream middleware` — a spy next-handler must never be invoked on a denied request.

E2E (raw HTTP against the running server; extends into T41's Playwright harness):
- Boot the real server on a free port with a known token; issue raw `fetch`/http requests: (1) no token → assert status 401 and generic JSON body; (2) `Host: evil.example` with valid token → assert 403; (3) foreign `Origin` with valid token → assert 403; (4) valid Host + token → 200 on a health/snapshot probe.

## Related context

- Spec §2(b) write path — security middleware (Host/Origin allowlist + token check) is the first server-side box after POST.
- Spec §3B.8 — five-layer security model; this task is layers (a) and (b).
- Spec §3B.14 — token travels `X-Hyperflow-Token` header; fragment delivery; sessionStorage on the client; SSE query-param exception; stream route never logs its URL.
- Spec §3B.15 — error envelope `{code, message, details?}`; `TOKEN_INVALID` → 401, `ORIGIN_DENIED` → 403; codes registered in `shared/`.
- Spec §4.6 — 401 generic body; 403 pre-route on Host/Origin failure.
- Depends on T2 (shared schemas — error envelope + code registry).

## Gotchas

- `EventSource` cannot set request headers — the SSE stream route is the single, deliberate query-param exception. Do not "helpfully" accept the query-param token on other routes; that reintroduces token-in-history/log leakage the header transport exists to prevent.
- One concern per file: allowlist logic and token logic never share a module, and neither imports the other.
- The 401 body must be indistinguishable across failure modes — resist adding `details` to the token error even though the envelope allows it.
- Origin absence is legal (non-browser clients); Origin presence with a non-allowlisted value is not. Do not treat `Origin: null` as absent — reject it.
- The allowlist must compare against the actual bound port, passed in at construction — never a hardcoded default, since the CLI auto-increments ports (spec §4.1).
