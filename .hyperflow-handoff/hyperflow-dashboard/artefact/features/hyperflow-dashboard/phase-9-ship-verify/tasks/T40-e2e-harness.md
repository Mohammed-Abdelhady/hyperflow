# T40 — e2e harness: Playwright config, committed fixture project, selector registry

## Task

Build the Playwright e2e foundation everything in T41/T42 runs on: `dashboard/playwright.config.ts` booting the REAL server (the packaged bin from T39, not a dev server) jailed to a committed fixture project, the fixture project itself — a full `.hyperflow/` tree plus a `.hyperflow-handoff/` sibling plus a canned `events.ndjson` — under `dashboard/tests/e2e/fixture-project/`, and the shared selector registry `dashboard/tests/e2e/utils/selectors.ts` that every spec must select through.

## Why

Spec §3B.12 rejects mocked-fs e2e explicitly: "tests the mock, not the watcher/settle behavior". Determinism comes from a committed fixture tree the real server is jailed to — the same watcher, parser, security gates, and SSE hub that run in production run in every test. The shared selector registry is the enforcement point for the data-testid-only rule (spec §3B.12, §5): when selectors live in one file, "no text/class queries" is reviewable in one place instead of policed across every spec. The fixture tree is also where the §4.2 format-drift guarantees get their standing witness: both status-block styles, frontmatter tasks, and a torn NDJSON tail live permanently in the repo.

## Scope

**IN:**
- `dashboard/playwright.config.ts`: `webServer` block that launches the real server bin with an explicit root pointing at the fixture project, a fixed test port, and a known test token; base URL + token plumbing so specs authenticate the way the SPA does; `test.describe`-friendly project layout; built-in wait on the server's readiness (URL probe), no arbitrary sleeps.
- The committed fixture project: `.hyperflow/` tree with representative artefacts for every surface (tasks, features/<slug>/ tree, specs, audits, memory, background registry, commits-queue markers, `.mode`/`.sticky`), a `.hyperflow-handoff/<slug>/` sibling (HANDOFF.md, STATUS, COMPLETION.md), and a canned `events.ndjson` with a deliberately torn final line.
- Format-variant coverage inside the fixture tree: at least one artefact per status-block style (`| Field | Value |` table AND plain `Key:` lines), at least one frontmatter-shaped task file, tagged AND legacy-untagged memory headings.
- `dashboard/tests/e2e/utils/selectors.ts`: the single exported registry of every `data-testid` the e2e suite touches, organized per surface, typed as constants.
- Fixture reset discipline: mutation specs (memory CRUD, config edit, handoff transition, live-update file writes) run against a per-run temp copy of the fixture project so the committed tree stays pristine and runs stay deterministic.

**OUT:**
- The spec files themselves (T41) and the a11y/RTL pass (T42).
- Golden unit fixtures under `tests/fixtures/golden/` (phase-2 parser territory — a separate tree with a separate purpose).
- Any server/client source changes — the harness consumes the shipped product as-is.
- CI pipeline wiring beyond the config being CI-runnable.

## Files in scope

- `dashboard/playwright.config.ts` — CREATE. Playwright config whose `webServer` command runs the real `hyperflow-dashboard` bin (built output, matching what T39 packs) with flags for root (the per-run fixture copy), port, no-open, and a fixed test token; readiness via URL probe against the snapshot or health endpoint with the token; `use` block carrying baseURL and a storage-state or init-script route that seeds the token into `sessionStorage` the same way the fragment handshake would; retries/trace settings for CI; single worker or per-worker fixture copies so parallel workers never share a mutable tree.
- `dashboard/tests/e2e/fixture-project/` — CREATE (committed tree). A realistic `.hyperflow/` containing: `tasks/` with one table-status-block file and one frontmatter file; `features/<slug>/` with feature.md + one phase folder + nested tasks; `specs/` with a two-revision spec (feeds the diff surface); `audits/` with at least two timestamped audit files (feeds the heatmap trend); `memory/` with tagged and legacy-untagged entries plus the derived `index.md`/`.checksums` (read-only targets for denial specs); `background/registry.json`; `.mode`/`.sticky` markers; `events.ndjson` whose last line is torn (no trailing newline, truncated JSON object). Sibling `.hyperflow-handoff/<slug>/` with HANDOFF.md, a STATUS at `planned` (so the legal planned→built transition is testable), and COMPLETION.md. Every file deterministic — fixed timestamps, no generation at test time.
- `dashboard/tests/e2e/utils/selectors.ts` — CREATE. One exported constant registry mapping semantic names to `data-testid` values for every element the suite drives: nav per surface, mission board rows/chips/stream, replay scrubber and playhead, memory roster/inspector/CRUD controls, config form fields and save, handoff status control, banners (resync, reduced-fidelity, observe-mode), empty states, graph table-toggle, heatmap cells/popover. No selector string appears in a spec file except through this module.

## Acceptance criteria

- [ ] `npx playwright test` (with zero specs or a trivial probe spec) boots the real server bin against the fixture copy, waits on readiness without any fixed sleep, and tears down cleanly.
- [ ] The `webServer` command runs the same built entry T39's tarball ships — not `vite dev`, not a source-mode `tsx` shortcut.
- [ ] Fixture tree covers BOTH status-block styles (table AND `Key:` lines), at least one frontmatter-shaped task file, AND a torn `events.ndjson` last line — verified present in the committed tree, and the booted server serves a snapshot over that tree without any hard failure (torn line held, not crashed — spec §4.3).
- [ ] Fixture tree includes the `.hyperflow-handoff/` sibling with STATUS `planned`, and legacy-untagged memory entries alongside tagged ones (spec §4.2).
- [ ] Mutation isolation proven: two consecutive full runs produce identical results because specs mutate a per-run copy, never the committed tree; `git status` is clean after a run.
- [ ] `selectors.ts` exists, is the only module exporting selector strings, and contains only `data-testid`-based entries — no text, class, or CSS-structure queries.
- [ ] Auth plumbing works: specs land on a surface authenticated (token seeded the way the SPA handshake stores it), and an unauthenticated raw request in a probe test still gets 401 — the harness must not globally disable the security layers to make testing easier.

## Test cases

Harness verification (a smoke spec committed with the harness):
- `boots real server against fixture project` — navigate to `/mission` → assert the app shell renders and the connection status indicator reports live (via registry selectors).
- `fixture snapshot parses all format variants` — navigate to `/plans` → assert both the table-status-block task and the frontmatter task render as parsed (not raw-fallback) entries.
- `torn ndjson tail held not crashed` — navigate to `/replay` → assert the timeline renders the complete canned events and no error state is shown for the torn tail.
- `handoff fixture visible` — navigate to the management surface → assert the handoff package shows STATUS `planned`.
- `mutations hit the copy` — a probe write (memory entry create) → assert success in-app, then assert the committed `fixture-project/` tree is byte-identical after teardown.

## Related context

- Spec §3B.12 — Playwright E2E over the real server against a committed fixture `.hyperflow/` tree; testid selectors only; mocked-fs explicitly rejected.
- Spec §5 — `playwright.config.ts` ("boots the real server jailed to tests/e2e/fixture-project"), `tests/e2e/utils/selectors.ts` ("shared selector registry (no class/text queries)"), `tests/e2e/fixture-project/` ("full .hyperflow/ tree (+ handoff sibling)").
- Spec §4.2 — dual status-block styles, frontmatter tasks, legacy memory headings: the fixture tree is their permanent witness.
- Spec §4.3 — torn NDJSON last line held by the tailer; the canned `events.ndjson` pins this.
- Spec §3B.14 — token handshake shape the harness must reproduce (sessionStorage, header transport, SSE query-param exception).
- Spec §5 Boundaries — nothing under `src/` may import from `tests/` (fixture-project included).
- Repo Playwright conventions (frontend standards): `test.describe` grouping, built-in waits and assertions, never `waitForTimeout()`, selectors via `utils/selectors.ts`.
- Deps: T39 (the packaged bin contract this harness boots).

## Gotchas

- Playwright's `webServer` spawns the REAL bin — not a dev server. If the config quietly points at `vite dev`, every security, watcher, and SSE behavior under test becomes fiction; the whole value of the harness is production-path fidelity.
- The fixture project must be committed and deterministic — no timestamps minted at test time, no generated files, no `Date.now()` anywhere in fixture content; flaky trees make every downstream spec flaky.
- The torn `events.ndjson` last line is easy to destroy accidentally: editors and formatters love appending trailing newlines. Guard it (e.g. `.gitattributes`/editor exclusion) and assert its torn-ness in the harness smoke spec.
- Do not bypass auth globally to simplify specs — T41's auth-failure specs need the gates fully live; seed the token the way the SPA stores it instead.
- The per-run fixture copy must be the jail root handed to the server at launch — copying after boot means the watcher and jail point at the wrong tree.
- Keep `tests/e2e/fixture-project/` strictly out of the npm tarball (`files` from T39) and out of any production import graph (spec §5 Boundaries).
