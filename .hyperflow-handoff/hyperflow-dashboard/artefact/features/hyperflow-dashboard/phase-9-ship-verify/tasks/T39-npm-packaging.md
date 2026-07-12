# T39 — npm packaging: files, bin wiring, engines, tarball npx smoke run

## Task

Finalize `dashboard/package.json` and `dashboard/vite.config.ts` so the subpackage packs into a publishable npm tarball — `files` shipping `dist/` INCLUDING the prebuilt client bundle (`dist/client/`), the `bin` entry `hyperflow-dashboard` wired to the built CLI entry, `engines.node >=20` — then prove the artifact with an `npm pack` + tarball `npx` smoke run against the e2e fixture project: cold start under 5 seconds, zero network egress during boot, tarball size within a stated budget.

## Why

The product's launch story is `npx hyperflow-dashboard` with no build step at install or run time (spec §3B.1, §5, §3B trade-offs: "prebuilt-SPA tarball weight in the npm package for instant cold start"). Everything upstream — CLI, server, client — is only shippable if the packaging contract actually delivers it: a mis-scoped `files` array silently drops the client bundle, a broken `bin` path makes `npx` a dead end, and a missing `engines` floor lets Node 18 users hit runtime crashes instead of the guided version check (spec §4.1). Packing and smoke-running the real tarball is the only test that exercises what users actually download.

## Scope

**IN:**
- `dashboard/package.json` publish surface: `name: hyperflow-dashboard`, `version`, `bin` entry mapping `hyperflow-dashboard` to the built `dist/` CLI entry, `files` including `dist/` with the prebuilt `dist/client/`, `engines.node >=20`, correct `dependencies` vs `devDependencies` split (chokidar in `dependencies` per spec §3B.3; build tooling, React toolchain, test runners all dev-only).
- `dashboard/vite.config.ts` output verification: client build emits into `dist/client` with the graph engine (React Flow + elkjs), Mermaid renderer, and replay pinned as lazy chunks (spec §5) — adjust output paths/chunking config only as packaging requires.
- Build-order wiring so one script produces the complete `dist/` (shared → server/cli → client) before `npm pack`.
- The smoke run itself: `npm pack`, install/run the tarball via `npx` in a clean directory pointed at the committed fixture project, measure cold start, verify zero external network requests during boot, record the tarball size against the stated budget.
- npm lifecycle hygiene: no `postinstall`/`prepare` script that triggers a build on the consumer's machine.

**OUT:**
- Actually publishing to the registry (`npm publish` is explicitly user-invoked only — security blocklist).
- `scripts/bump-version.sh` dashboard sync and `scripts/validate-plugin.py` ignore (phase-8 core files, spec §5 core-files table).
- The Playwright harness that reuses this bin (T40).
- Any CLI/server/client source changes beyond what packaging strictly requires.

## Files in scope

- `dashboard/package.json` — MODIFY. Set the publish fields: `bin` object mapping the `hyperflow-dashboard` command to the built CLI entry inside `dist/`; `files` array shipping `dist/` (which must contain `dist/client/` — the prebuilt SPA), plus README and license, and nothing from `src/` or `tests/`; `engines.node` at `>=20`; a `prepack`-safe build script chain that produces the full `dist/` locally without running on the consumer's install; dependency split audited so the runtime footprint is only what the server/CLI actually load (Hono adapter, chokidar fallback, zod) — everything client-side is dev-only because the client ships prebuilt.
- `dashboard/vite.config.ts` — MODIFY (verify-and-adjust). Confirm the client build output directory is `dist/client` as `files` assumes, and that the three lazy chunks (graph engine, Mermaid, replay) survive the production build as separate chunks so the tarball's landing chunk stays lean; change only output/chunking configuration, no plugin or feature additions.

The smoke run is a verification procedure, not a committed script — its evidence (cold-start timing, egress check method, tarball size) is recorded in the task completion notes.

## Acceptance criteria

- [ ] `npm pack` in `dashboard/` produces a tarball whose contents include `dist/client/index.html` and the lazy chunks; nothing under `src/`, `tests/`, or `node_modules/` is packed.
- [ ] Running the packed tarball via `npx` from a clean directory against the fixture project cold-starts to a served, token-authenticated dashboard in under 5 seconds (spec §3B trade-offs: instant cold start, no build step at npx time).
- [ ] Zero network egress verified during boot: no external requests observed (loopback traffic only) while the tarball-installed dashboard starts and serves its first snapshot — matching spec §1 "No network egress of any kind" and §4.1 offline-after-install.
- [ ] Tarball size budget stated: the packed size is measured and recorded with an explicit budget line the number sits under; if the budget is exceeded, chunking/deps are trimmed before the task closes.
- [ ] `bin` wiring proven end-to-end: the `npx`-run command performs root discovery, port selection, token mint, and prints the tokenized URL to stdout (spec §4.1 — the URL is always printed even when browser open fails).
- [ ] `engines.node >=20` declared, and the runtime version check at the CLI entry (spec §4.1) still exits cleanly before server code loads under an older Node.
- [ ] No install-time build: installing the tarball runs no compile step on the consumer machine.
- [ ] Runtime `dependencies` audited: client-only libraries (React, React Flow, elkjs, Mermaid, NumberFlow, Motion) are NOT in `dependencies` — the client is prebuilt; chokidar IS in `dependencies` (spec §3B.3 accepted trade-off).

## Test cases

- Pack-contents check: `npm pack --dry-run` (or tarball listing) → assert `dist/client/` present, `src/` and `tests/` absent, README present.
- Cold-start smoke: clean temp dir → run the tarball bin against `dashboard/tests/e2e/fixture-project` → assert process prints the `http://127.0.0.1:<port>` tokenized URL and the snapshot endpoint answers with the minted token, wall-clock under 5s.
- Egress check: run the boot under a network observer (e.g. denied-egress environment or socket monitoring) → assert no connection attempt to any non-loopback address.
- Offline re-run: with the tarball already in the local cache and network disabled → boot succeeds (spec §4.1 npx-offline case).
- Wrong-Node guard: run the bin entry under a simulated Node <20 (or assert the version-check module fires before any server import) → clean exit with detected/required versions printed.
- Size budget: record tarball byte size → assert under the stated budget figure.

## Related context

- Spec §3B.1 — subpackage identity, npm name, bin, independent publish cadence; plugin stays npm-free.
- Spec §3B trade-offs — "prebuilt-SPA tarball weight in the npm package for instant cold start — no build step at npx time".
- Spec §4.1 — launch lifecycle cluster this packaging must not break: port busy auto-increment, Node <20 guard, best-effort browser open with stdout URL, second-instance detection, offline npx runs.
- Spec §5 — `package.json` line ("files: dist/ INCLUDING the prebuilt client bundle (dist/client/)"), `vite.config.ts` line (lazy-chunk pins), `engines.node >=20`.
- Spec §1 — "No network egress of any kind" is a product identity claim; this task produces its packaged-artifact proof.
- Deps: T17, T18 (CLI + server assembly), T26a, T26b (SPA shell + handshake), T27-T34b (all client surfaces — the bundle being shipped).

## Gotchas

- The tarball must ship a PREBUILT client — if the pack script forgets to run the client build first, the tarball passes `npm pack` but serves a 404 SPA; the smoke run exists to catch exactly this.
- `npm publish` is never run by this task — the security blocklist requires explicit user invocation; the deliverable is a publishable tarball plus its smoke evidence, not a registry release.
- Dependency split is a security surface, not just weight: every runtime dependency is code that executes on the user's machine at `npx` time — keep `dependencies` to the server/CLI's actual imports.
- The fixture project used for the smoke run is T40's committed tree; if T40 has not landed yet when T39 runs (B1 before B2), smoke against a minimal committed sample and re-verify once the fixture project exists — the <5s and zero-egress criteria are against the fixture project.
- Cold-start timing must be measured from process start to served snapshot, not to browser paint — the browser-open step is best-effort and excluded (spec §4.1).
