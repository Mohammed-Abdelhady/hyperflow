# T43 — User-facing docs: dashboard README + root README feature row

## Task

Write the dashboard's user-facing documentation: create `dashboard/README.md` (npx quick start, feature tour of the 11 surfaces, security posture, screenshots placeholder) and add the dashboard's feature row + link to the root `README.md` so the plugin's primary discovery surface registers the new subpackage in the same release that ships it.

## Why

The root `README.md` is the project's primary discovery surface and the repo's contributing guide mandates it stays in sync with shipped features on every push — a dashboard that ships without its README row triggers the release script's staleness warning and, worse, ships invisible. The dashboard README doubles as the npm package page (it ships in the tarball per T39), so it is the first thing every `npx` user reads: the quick start must match the real launch behavior T39 proved, and the security posture section must state the local-only guarantees (§3B.8, §1) accurately because they are the product's trust story.

## Scope

**IN:**
- `dashboard/README.md` — the full user-facing document: quick start, feature tour, security posture, degraded-mode behavior, screenshots placeholder, requirements.
- Root `README.md` — one feature row in the appropriate features/skills table linking to the dashboard (subpackage path and/or npm package), plus any strictly necessary one-line mention where the README enumerates what ships in the repo.
- Accuracy pass against shipped behavior: every command, flag, port note, and security claim in the docs is checked against the actual CLI and server as built (and T39's smoke evidence), not against the spec's intentions.

**OUT:**
- Actual screenshots (placeholder sections with stated capture list only — captures happen post-ship when the UI is final).
- Developer/contributor docs, architecture docs, ADRs (`skills/hyperflow/events.md` is phase-8's contract doc; internal structure stays in the spec).
- `CHANGELOG.md` (owned by the release flow, spec §5 core-files table).
- Any `docs/` additions — `docs/` is reserved and the dashboard's user docs live with the package.
- Marketing copy beyond the README surfaces; no separate website content.

## Files in scope

- `dashboard/README.md` — CREATE. Sections, in order: (1) one-paragraph what-it-is (local cockpit for `.hyperflow/` trees, zero network egress, zero runtime LLM); (2) Quick start — the `npx hyperflow-dashboard` one-liner, what it does (root discovery walking up from cwd, port auto-select, token-bearing URL printed to stdout and auto-opened), Node >=20 requirement, and the launch-friction note that the tokenized URL from the CLI is the way in (a bare `localhost:PORT` visit is unauthenticated by design); (3) Feature tour — one short entry per surface (mission, replay, health, leaderboard, plans, features, audits, memory, specs, tokens, config) stating what each shows and, for the write surfaces, what they can change (memory CRUD, config editing, markers, handoff transitions) and what is never writable (task files, derived files); (4) Live telemetry note — `events.ndjson` emission from hyperflow-core, and the markdown-only reduced-fidelity mode when the file is absent (older plugin versions still fully browseable); (5) Security posture — loopback-only binding, CLI-minted session token, Host/Origin allowlist against DNS rebinding, path jail, secret blocklist, allowlist-only writes with backups and atomic renames, zero network egress; (6) Screenshots — placeholder blocks with a stated capture list (mission control live, replay scrub, memory graph, health dial); (7) Requirements & troubleshooting — Node >=20, port-busy auto-increment, no-browser/SSH launch (URL on stdout), second-instance behavior, read-only filesystem observe mode.
- Root `README.md` — MODIFY. Add the dashboard row to the features table (name, one-line description, link to `dashboard/`), consistent with the table's existing column shape and tone; verify all links resolve; no restructuring of surrounding sections.

## Acceptance criteria

- [ ] `dashboard/README.md` exists with all seven sections; the quick start is copy-paste runnable and matches the behavior T39's smoke run proved (command, stdout URL, auto-open).
- [ ] Security posture section accurately reflects the five-layer model of spec §3B.8 and the zero-egress guarantee of spec §1 — no overclaim (it is not an internet-hardened service) and no underclaim (the localhost boundary is real and layered).
- [ ] Feature tour covers all 11 surfaces and states the write-surface boundary honestly: the five allowlisted write surfaces, and that task files and derived files are never dashboard-writable.
- [ ] Degraded modes documented: markdown-only mode without `events.ndjson` (reduced timeline fidelity, no replay) and observe mode on read-only filesystems.
- [ ] Screenshots placeholder present with an explicit capture list — no broken image links, no fake embedded images.
- [ ] Root `README.md` gains exactly one feature row + link for the dashboard, matching the existing table format; all internal links in the touched sections still resolve.
- [ ] No AI attribution anywhere in either document; tone and terminology consistent with the existing root README.
- [ ] Both files land in this feature's release window (same branch, committed with or immediately alongside the shipping work — per repo CLAUDE.md README maintenance policy), not as a post-tag follow-up.

## Test cases

- Quick-start walkthrough: execute the README's quick start verbatim in a scratch project containing a `.hyperflow/` tree → every described step happens as written (URL printed, dashboard opens, surfaces populated).
- No-.hyperflow walkthrough: run the quick start in a directory without a `.hyperflow/` tree → the README's description of the guided empty state matches what appears (spec §4.1).
- Claim audit: for each security-posture bullet, point to the shipped mechanism that implements it (middleware, jail, blocklist, write pipeline) — any bullet without a shipped counterpart is removed or reworded.
- Link check: every relative link in both READMEs resolves in the repo; the root-README dashboard link lands on `dashboard/README.md`.
- Table lint: the root README features table still renders correctly (column count, alignment) with the new row.
- Tarball page check: `npm pack` output from T39 includes `dashboard/README.md` so the npm package page renders it.

E2E: N/A — doc-only; the quick-start command is cross-checked against the T39 tarball smoke run.

## Related context

- Repo `CLAUDE.md` (root) — README Maintenance: the README is the primary discovery surface, updates land with the feature (same or immediately preceding commit), never as a follow-up after the tag; release.sh staleness check flags a stale README.
- Spec §3B.1 — subpackage identity and npx launch story the quick start documents.
- Spec §3B.8 / §4.6 — security model the posture section must represent faithfully.
- Spec §4.1 — launch lifecycle behaviors the troubleshooting section documents (port busy, Node <20, no browser, second instance, offline).
- Spec §2c / §3B.6 — events.ndjson emission and the markdown-only degraded mode the telemetry note explains.
- Spec §4.4 — observe mode on read-only filesystems.
- Deps: T39 (the proven packaging/launch behavior the quick start describes; the tarball that carries this README).

## Gotchas

- README update lands with the feature per repo CLAUDE.md — shipping it as a post-release follow-up violates the repo's explicit maintenance policy and trips the release staleness check.
- Document what shipped, not what the spec dreamed: every claim traces to built behavior; where phase-9 verification narrowed something, the README follows reality.
- The security section is a trust document — resist both marketing inflation ("fully secure") and vagueness; name the concrete layers, as the spec does, in user language.
- `docs/` is reserved for the plugin's user-facing docs — the dashboard README lives at `dashboard/README.md` and is linked, not duplicated, from the root.
- The npm package page renders `dashboard/README.md` exactly as written — keep image references placeholder-safe (no repo-relative image paths that 404 on npmjs.com).
- Root-README edit is surgical: one row and its link — do not reflow, retitle, or "improve" neighboring sections in this task.
