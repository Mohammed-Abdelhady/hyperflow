# T18 — CLI launcher

## Task

Implement the `hyperflow-dashboard` bin entry: flag parsing into the typed `{rootDir, port, token, openBrowser}` options object, `.hyperflow/` root discovery by walking up from cwd, free-port probing, crypto-random session-token minting, best-effort browser open with the tokenized URL ALWAYS printed to stdout, a Node >= 20 runtime check that exits with an actionable message before any server code loads, and second-instance detection — probing candidate ports with the token-authenticated identity ping and reusing (open + exit) an already-running instance instead of spawning a double-watcher.

## Why

The CLI is the product's entire cold-start story (`npx hyperflow-dashboard` → cockpit open) and the security model's first actor: it mints the token that everything downstream depends on and delivers it over the one channel that never leaves the browser (URL fragment, spec §3B decision 14). It is also the sole owner of environment resolution — the server never re-discovers (spec §1 CLI → server contract) — so every launch edge case in §4.1 is this task's to close.

## Scope

**IN:**
- `index.ts`: bin entry — Node version gate first, then flag parse (`--port`, `--root`, `--no-open`, `--token`), resolution via the four helper modules into the typed options object, second-instance probe, server start via the T16 factory, URL print, browser open.
- `discovery.ts`: walk up from cwd toward the filesystem root until a directory containing `.hyperflow/` is found; explicit `--root` overrides the walk; not-found is a supported outcome (server still boots with a guided empty state, spec §4.1) — surfaced as a typed discovery result, never a crash.
- `port.ts`: preferred port first, then bounded next-free scan; final port reported for the printed URL.
- `token.ts`: crypto-random session-token mint (Node `crypto`, adequate entropy); honors an explicit `--token` override.
- `open.ts`: cross-platform best-effort browser open of `http://127.0.0.1:<port>/#token=<token>`; failure is logged as a hint, never fatal.
- Second-instance detection: before binding, probe candidate ports with `GET /api/v1/instance` carrying the token; a matching running dashboard for the same jail root → print its URL, open it, exit 0 without starting a server.
- Unit tests per module + a cold-start integration test.

**OUT:**
- The server factory and everything behind it (T16) — started, not built.
- The identity endpoint implementation (T16) — consumed.
- The SPA token-fragment handshake (`sessionStorage`, `history.replaceState`) — client phase; the CLI only formats the fragment URL.
- npm packaging concerns (`bin` field, `files`, prebuilt `dist/client`) — release/packaging task.
- Windows/macOS/Linux open-command edge refinement beyond best-effort + always-print (the print IS the fallback).

## Files in scope

- `dashboard/src/cli/index.ts` — create. Order matters: (1) runtime version check — read `process.versions.node`, compare against the >= 20 floor, on failure print detected version, required minimum, and an upgrade hint, exit non-zero BEFORE importing any server module (use dynamic import of the factory after the gate so a syntax-incompatible server bundle never parses on old Node); (2) parse flags into typed options — no untyped argv leakage past this module; (3) discovery; (4) second-instance probe; (5) port select; (6) token mint; (7) start server; (8) print the tokenized URL to stdout unconditionally; (9) attempt browser open unless `--no-open`.
- `dashboard/src/cli/discovery.ts` — create. Pure walk-up function cwd → root; returns found-root or not-found result object; symlinked cwd resolved via realpath once so the jail root is canonical from the start (spec §4.4 symlinked-root edge).
- `dashboard/src/cli/port.ts` — create. Probe preferred port; on EADDRINUSE step through a bounded range; return the selected free port plus the list of occupied candidates (input to the second-instance probe); no interactive prompt (spec §4.1).
- `dashboard/src/cli/token.ts` — create. `crypto.randomBytes`-derived URL-safe token; length/alphabet documented as constants.
- `dashboard/src/cli/open.ts` — create. Platform-appropriate open command (darwin/win32/linux) spawned detached; resolves success/failure; never throws to the caller.
- `dashboard/tests/unit/cli/discovery.test.ts`, `port.test.ts`, `token.test.ts`, `open.test.ts` — create. Per-module units (temp dir trees for discovery, occupied sockets for port, entropy/format for token, spawn stub for open).
- `dashboard/tests/unit/cli/index.test.ts` — create. Flag parsing, ordering (version gate before server import), second-instance short-circuit, URL-always-printed invariant.

## Acceptance criteria

- [ ] Cold start against a fixture project resolves root, picks a port, mints a token, boots the server, prints `http://127.0.0.1:<port>/#token=<token>` to stdout, and attempts browser open — the printed URL appears even when the open attempt fails (spec §4.1 headless/SSH edge).
- [ ] Node < 20 exits non-zero with detected version + required minimum + upgrade hint, before any server code is loaded (spec §4.1).
- [ ] A second launch for the same project detects the running instance via the token-authenticated identity ping, prints/opens the existing instance's URL, and exits without spawning a second server or watcher (spec §4.1).
- [ ] A port squatted by a non-dashboard process (probe fails or returns non-matching identity) is skipped — scan continues to the next free port; no reuse of a foreign service.
- [ ] Default port busy → bounded auto-increment with the final URL printed; no interactive prompt.
- [ ] No `.hyperflow/` found up to the filesystem root → launch proceeds with the not-found result (server boots; SPA shows the guided empty state); no directory picker, jail root fixed at launch (spec §4.1).
- [ ] Token is minted with `node:crypto` randomness and appears only in the fragment URL — never as a query param in printed output (decision 14), never in any log line besides the single stdout URL print.
- [ ] Server receives the fully resolved typed options object and performs zero re-discovery (spec §1 contract); all files under 300 lines; no `any`.

## Test cases

- Discovery: nested cwd three levels under a fixture project root → finds the root; cwd inside a tree with no `.hyperflow/` anywhere → not-found result, no throw; `--root` flag → walk skipped; symlinked project root → returned root is the realpath.
- Port: preferred port free → chosen; occupied by a dummy listener → next free port chosen within the bound; entire bound range occupied → clean typed failure with actionable message.
- Token: two mints differ; token is URL-safe; length matches the documented constant; `--token abc` override respected.
- Open: darwin/win32/linux each map to the right command (spawn stub); spawn failure resolves as non-fatal failure result.
- Entry ordering: with a stubbed `process.versions.node = "18.x"`, the process exits before the server module import executes (import spy/loader assertion).
- Second instance: boot a real server on the preferred port (T16 factory), run the CLI again with the same root and token source → CLI hits `GET /api/v1/instance`, matches, prints the existing URL, exits 0, and no second server binds; identity mismatch (different jail root on that port) → CLI treats the port as occupied and scans on.
- URL-always-printed: run with open.ts stubbed to fail → stdout still contains the full fragment URL exactly once.
- E2E (cold-start): spawn the built CLI as a child process against `tests/e2e/fixture-project/` with `--no-open`, parse the printed URL, fetch `/api/v1/snapshot` with the token from the fragment → 200 schema-valid snapshot (proves the printed URL is sufficient to reach a working UI — the phase exit criterion).

## Related context

- Spec §1 — C4 CLI subgraph (ARG/DISC/PSEL/MINT/OPEN, one module each) and the CLI → server boundary row (typed options object; server never re-discovers).
- Spec §3B decision 8 layer a (token mint + fragment delivery), decision 14 (fragment URL format, why fragment: never leaves the browser, no logs; sessionStorage handshake is client-side).
- Spec §4.1 — every bullet is a test in this task: no-root boot, busy port, Node < 20, failed browser open, second instance, offline npx.
- Spec §5 — `src/cli/` file roster with per-module one-liners.
- Shared schemas consumed (T2): `shared/schemas/api.ts` — the identity-ping response shape used to validate `GET /api/v1/instance` replies during the second-instance probe (a probe that does not validate the response can be spoofed by any local HTTP service).

## Gotchas

- The CLI prints the URL even when the browser open fails — print FIRST, then attempt open, so no failure path can skip the print.
- The version gate must run before server code parses: top-level static imports of the server would defeat it on runtimes that choke on newer syntax — gate, then dynamic-import.
- The identity probe must be token-authenticated and schema-validated in BOTH directions: without the token the endpoint 401s by design (T16), and without response validation any local process answering on the port could hijack the "reuse and open" path — treat non-matching or invalid answers as "foreign service, keep scanning".
- Reuse-and-open needs a token the running instance accepts — document the resolution order (explicit `--token`, then the probe outcome); a mismatched token means the probe 401s and the CLI must fall through to a fresh port, not crash.
- Discovery realpaths once at launch; passing a non-canonical root to the server would make every subsequent jail comparison drift (spec §4.4).
- Fragment (`#token=`), not query (`?token=`): §4.1's prose shows a query form, but decision 14 is the ADR — the fragment form wins; the only query-param token in the product is the SSE route's.
- `open.ts` spawns detached and never inherits stdio — a browser that logs to stderr must not pollute the CLI's own output contract.
- security-reviewer owns this task's review: token entropy, fragment-only delivery, no-token-in-logs, and the spoofable-probe surface are the checklist.
