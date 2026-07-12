# T1 — Package scaffold + tooling configs

## Task

Scaffold the `dashboard/` npm subpackage inside the hyperflow repo: package manifest, TypeScript project-references root, flat ESLint config carrying the four mechanical guards, Vite client-build config, and Vitest config. The guards (300-line cap, no-any, fs-write ban outside the write door, cross-layer import ban) must be enforced by tooling from commit one — not by convention.

## Why

Spec §3B.1 makes `dashboard/` a self-contained subpackage publishing the npm bin `hyperflow-dashboard`, and §5 Boundaries declares the layer rules lint-enforced. Neither holds unless the tooling lands before any source does.

## Scope

**IN:**
- `dashboard/package.json`, `tsconfig.json`, `eslint.config.js`, `vite.config.ts`, `vitest.config.ts`
- Minimal placeholder entry files per layer (cli/server/shared/client) so lint/typecheck/build/test can run green end-to-end

**OUT:**
- `playwright.config.ts` and the e2e fixture project (later phase)
- Any real cli/server/shared/client implementation
- hyperflow-core release integration (`scripts/bump-version.sh`, `scripts/validate-plugin.py`, `.gitignore` — separate later task per spec §5 core-files table)
- `npm publish` or any registry action

## Files in scope

**Read:**
- `.hyperflow/specs/hyperflow-dashboard.md` §5 lines 446-454 — the per-config contracts, verbatim
- `.hyperflow/specs/hyperflow-dashboard.md` lines 601-606 — Boundaries the lint rules must encode
- Repo root `CLAUDE.md` — conventions, commit cadence

**Create:**
- `dashboard/package.json` — name `hyperflow-dashboard`; a single `bin` entry `hyperflow-dashboard` pointing at the built CLI entry under `dist/cli/`; `engines.node >=20`; `files` whitelist shipping `dist/` INCLUDING the prebuilt client bundle (`dist/client/`); scripts for `lint`, `typecheck`, `build`, `test`; toolchain devDependencies only (typescript, vite, vitest, eslint stack, zod) — feature deps arrive with their tasks.
- `dashboard/tsconfig.json` — project-references root wiring four sub-graphs (cli, server, shared, client) so shared compiles into BOTH the server and client graphs; strict mode, no implicit any.
- `dashboard/eslint.config.js` — flat config with four guards: `no-explicit-any` as error; `max-lines` 300 as error; import-restriction rules banning `src/client` ↔ `src/server` imports in both directions and banning any `src/` → `tests/` import; a restriction banning direct `node:fs` write APIs (writeFile, writeFileSync, appendFile, rename, and friends) everywhere except `src/server/services/write.ts` — the single write door per the module-boundary table (spec line 138).
- `dashboard/vite.config.ts` — client build rooted at `src/client`, output `dist/client`; pins the graph engine (`@xyflow/react` + elkjs) and the Mermaid renderer as lazy chunks per spec line 451.
- `dashboard/vitest.config.ts` — unit runner over `dashboard/tests/unit`; path aliases for `tests/fixtures/golden` per spec line 452.

## Acceptance criteria

- [ ] `npm run lint && npm run typecheck && npm run build && npm test` all exit 0 on the fresh scaffold
- [ ] `package.json` declares name `hyperflow-dashboard`, the bin entry, `engines.node >=20`, and `files` including `dist/client`
- [ ] `tsconfig.json` resolves four project references; shared is a dependency of both the server and client graphs
- [ ] Each of the four lint guards demonstrably fires (probe files, deleted after verification): an `any`, a 301-line file, a client→server import, an fs write outside `services/write.ts`
- [ ] Build emits `dist/client/`; no scaffold file exceeds 300 lines

## Test cases

- ESLint: probe `src/client/probe.ts` importing from `../server/index` → lint exits non-zero citing the restricted-import rule; same for the reverse direction
- ESLint: probe containing `const a: any = 1` → `no-explicit-any` error; 301-line probe → `max-lines` error
- ESLint: `writeFileSync` imported from `node:fs` in a probe at `src/server/services/config.ts` → restricted; identical import in `src/server/services/write.ts` → allowed
- Vitest: `npx vitest run` with one placeholder spec → 1 passed
- Integration: full gate chain `lint → typecheck → build → test` on a clean checkout → all green, `dist/client/` present
- E2E: N/A — tooling-only task with no runtime surface yet; the full gate chain above is the integration scenario.

## Related context

- Spec §3B.1 subpackage + bin decision — `.hyperflow/specs/hyperflow-dashboard.md:289-293`
- Spec §5 config-file contracts — `.hyperflow/specs/hyperflow-dashboard.md:446-454`
- Spec §5 Boundaries (lint-enforced) — `.hyperflow/specs/hyperflow-dashboard.md:601-606`
- Module-boundary table, write-door row — `.hyperflow/specs/hyperflow-dashboard.md:138`
- Prebuilt-tarball trade-off (no build at npx time) — `.hyperflow/specs/hyperflow-dashboard.md:367`

## Gotchas

- The fs-write allowlist is exactly ONE file (`src/server/services/write.ts`) — never a directory glob; a directory allowlist reopens the hole the rule exists to close.
- `eslint.config.js` is itself subject to the 300-line cap — group rule objects tightly; do not dodge the cap by compressing lines.
- No postinstall/build step at `npx` time — the client ships prebuilt inside the tarball; `files` must reflect that.
- Placeholder sources must be obviously temporary (e.g. `placeholder.ts`) so T2/T3/T4 replace them rather than accrete around them.
- Never `--no-verify`, never publish; version-sync with `scripts/bump-version.sh` is a later core-files task, out of scope here.
