# T9b — Path security gates: path jail, write denylist, secret blocklist

## Task

Implement the three path-level security modules — path jail (`path-jail.ts`), write denylist (`denylist.ts`), secret blocklist (`secret-blocklist.ts`) under `dashboard/src/server/security/` — plus their adversarial unit test suites under `dashboard/tests/unit/security/`. These are layers (c) and (d) of the spec §3B.8 model plus the resolved-path write-deny rules that T10's write door composes.

## Why

The jail defeats traversal, the blocklist defeats secret exfiltration through the read API, and the denylist bounds writes to the five allowlisted surfaces so no bug elsewhere can corrupt chain state (spec §3B.8). All three operate on the RESOLVED path — after realpath — because encoding tricks and symlinks are exactly how attackers land a forbidden path inside a naive string check (spec §1 module-boundary table: "the denylist and secret blocklist are then checked against the RESOLVED path before any read/write").

## Scope

**IN:**
- Path jail: candidate path is decoded (including double-decoding detection), resolved, realpathed, then required to be a prefix-child of the canonical jail root; jail root itself realpathed once at startup (spec §4.4); the explicit `~/.hyperflow/config.json` path is the one sanctioned out-of-jail target; symlinks resolving outside the jail are denied; escapes answered with 404 and no path echo (spec §4.6).
- Write denylist: derived files (`memory/index.md`, `memory/.checksums`) hard read-only; task files never dashboard-written — `tasks/`, `features/*/tasks/`, `features/*/*/tasks/`, `phase.md` and `feature.md` rosters; anything outside the closed write enumeration (memory category files, `~/.hyperflow/config.json`, `.mode`/`.sticky` markers, handoff STATUS) denied (spec §1 "write surface is a closed enumeration", §3B.8e).
- Secret blocklist: pattern set loaded from `config/defaults.json` → `security.blockedFiles` (`.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `credentials.json`, `service-account*.json`, `*-secret.json`, `*-secret.yaml`, `~/.ssh/*`, `~/.gnupg/*`, `id_rsa*`, `id_ed25519*`, `*.gpg`, `.npmrc`, `.pypirc`, `.docker/config.json`, `*.keychain`, `*-credentials`, `~/.aws/credentials`, `~/.azure/*`, `~/.config/gcloud/*`, `~/.kube/config`) with the `security.allowedFiles` exceptions (`.env.example`, `.env.template`, `.env.sample`); applied to the resolved path on both reads and writes, as a single shared guard no route can bypass (spec §4.6).
- Case-normalized comparison on case-insensitive filesystems so `TASKS/` and `.ENV` cannot bypass checks (spec §4.5); internal POSIX path normalization for Windows drive/UNC paths.
- Adversarial unit tests for all three modules.

**OUT:**
- The write pipeline itself — backup, temp+fsync, rename, conflict check (T10 composes these gates).
- Transport gates (T9a).
- Any route or service wiring; these modules export pure check functions consumed later.
- Blocklist config editing UI or runtime reloading of `defaults.json`.

## Files in scope

- `dashboard/src/server/security/path-jail.ts` — CREATE. Constructed once with the canonical (realpathed-at-startup) jail root plus the explicit allowed config path. Exposes a resolve-and-verify function: decode the candidate (reject inputs that still contain traversal or encoded sequences after one decode — i.e. detect double encoding), normalize to POSIX form, realpath (resolving symlinks), then verify prefix-childhood of the canonical root using a path-segment-aware comparison (so `/root-evil` does not pass a naive `startsWith('/root')`). Case-normalize both sides on case-insensitive filesystems. Denial returns a typed refusal that maps to 404 with no path echo.
- `dashboard/src/server/security/denylist.ts` — CREATE. Pure predicate over a resolved in-jail path answering "may the dashboard write here?". Encodes the closed allowlist (memory category files under `memory/` excluding `index.md` and `.checksums`, the global config path, `.mode`/`.sticky`, handoff `STATUS`) and the hard denials (derived files, every task-file class, everything not enumerated). Deny is the default; the allowlist is the only path to "yes".
- `dashboard/src/server/security/secret-blocklist.ts` — CREATE. Loads `security.blockedFiles` + `security.allowedFiles` from `config/defaults.json` at build/startup (single source — no hand-copied pattern list), compiles them to matchers over resolved paths (basename patterns like `*.pem` and home-anchored patterns like `~/.ssh/*` handled distinctly), and exposes one guard used by every read AND write path. A blocked hit yields the `BLOCKED`/`PATH_BLOCKED` typed refusal.
- `dashboard/tests/unit/security/path-jail.test.ts` — CREATE.
- `dashboard/tests/unit/security/denylist.test.ts` — CREATE.
- `dashboard/tests/unit/security/secret-blocklist.test.ts` — CREATE.

One concern per file — jail, denylist, and blocklist never merge, and each is independently testable.

## Acceptance criteria

- [ ] Encoded traversal defeated: `..%2f..%2fetc%2fpasswd` and `%2e%2e/` variants resolve-and-deny with 404-mapped refusal, no path echo (spec §4.6).
- [ ] Double-encoded traversal defeated: `%252e%252e%252f` is not double-decoded into a working `../` — detected and denied.
- [ ] Symlink escape out of jail defeated: a symlink inside `.hyperflow/` pointing at `/etc` or `~/.ssh` is denied after realpath even though the candidate string looks in-jail.
- [ ] Blocklisted `.env` and `*.pem` read attempts return the `BLOCKED` refusal from the single shared guard — regardless of which access shape asked (read, raw, diff, download; spec §4.6).
- [ ] Blocklist applies post-resolution: a symlink named `notes.md` targeting `.env`, or a blocklisted file reached through rename, is still blocked (spec §3B.8d).
- [ ] `allowedFiles` exceptions honored: `.env.example`, `.env.template`, `.env.sample` pass the blocklist.
- [ ] Denylist protects derived files: writes to `memory/index.md` and `memory/.checksums` are denied.
- [ ] Denylist protects ALL task-file classes: `tasks/<slug>.md`, `features/<slug>/phase-*/tasks/*.md`, `phase.md`, `feature.md` — every one denied for write (spec §1: enforced in the pipeline, not in UI affordances alone).
- [ ] Out-of-enumeration write targets (e.g. `specs/x.md`, `audits/x.md`, `events.ndjson`) are denied — allowlist is closed.
- [ ] Case-insensitive bypasses defeated: `TASKS/foo.md`, `.ENV`, `Memory/INDEX.md` hit the same denials on case-insensitive filesystems (spec §4.5).
- [ ] Jail root is realpathed exactly once at startup; per-request checks compare against that canonical root (spec §4.4 — symlinked project roots get one consistent decision).
- [ ] Blocklist patterns come from `config/defaults.json` — the test suite fails if the loaded set and the file drift.

## Test cases

Unit (Vitest, against a scratch fixture tree with real symlinks created in `beforeEach`):
- `denies plain traversal ../../etc/passwd`
- `denies url-encoded traversal ..%2f..%2f` and `%2e%2e%2f`
- `denies double-encoded traversal %252e%252e%252f (no second decode)`
- `denies backslash traversal ..\\..\\ on windows-shaped input`
- `denies null-byte and ....// mangled traversal`
- `denies symlink inside jail resolving to /etc/hosts (symlink escape)`
- `denies symlink chain (link → link → outside) after full realpath`
- `allows legitimate nested in-jail path and the explicit global config path`
- `rejects sibling-prefix escape: jail /a/.hyperflow does not admit /a/.hyperflow-evil`
- `blocks .env, .env.local, key.pem, server.key, id_rsa, credentials.json, service-account-prod.json reads`
- `allows .env.example / .env.template / .env.sample (allowedFiles)`
- `blocks symlink named readme.md that resolves to .env (post-resolution blocklist)`
- `denylist: memory/index.md and memory/.checksums write → denied`
- `denylist: tasks/slug.md, features/f/phase-1-x/tasks/T1.md, phase.md, feature.md write → denied`
- `denylist: memory/decisions.md, .mode, .sticky, handoff STATUS, global config → allowed`
- `case bypass: TASKS/x.md and .ENV denied on case-insensitive fs`

E2E (raw HTTP against the running server, once routes exist — integration via T41 pointer):
- `GET /api/v1/…?path=..%2f..%2f.ssh%2fid_rsa`-shaped request with a valid token → assert 404 and that the response body contains no filesystem path; request for an in-jail symlink to `.env` → assert 403/BLOCKED envelope. Registered as attack scenarios in T41's Playwright suite against the fixture project.

## Related context

- Spec §2(b) write path — order: path jail (realpath, symlink deny) → denylist + secret blocklist on resolved path → backup → temp+fsync → atomic rename. T9b builds the first two boxes; T10 owns the door that sequences them.
- Spec §3B.8 layers (c)/(d); §4.4 symlinked jail root; §4.5 case/Windows normalization; §4.6 traversal → 404 no-echo, blocklist → BLOCKED single guard.
- `config/defaults.json` → `security.blockedFiles` / `security.allowedFiles` — the authoritative blocklist source.
- Spec §3B.15 — `PATH_BLOCKED` → 403, `NOT_FOUND` → 404.
- Depends on T2 (shared schemas — typed refusal/error shapes).

## Gotchas

- One concern per file; the jail must not import the denylist or blocklist — T10 sequences them, keeping each independently fuzzable.
- Realpath the jail root once at startup, never per request — per-request re-resolution of the root drifts when the root itself is a symlink (spec §4.4).
- Prefix checks must be segment-aware; `startsWith` on raw strings admits `.hyperflow-evil` siblings.
- Reject anything that still decodes after the first decode pass instead of looping decodes — decode loops are how double-encoding bypasses sneak in.
- The blocklist guard also runs on WRITE targets, not just reads — a write to `.env.production` inside the jail must be blocked even before the denylist verdict.
- Do not hand-copy the pattern list into source: load or generate from `config/defaults.json` so the plugin and dashboard can never disagree on what a secret is.
- These modules are pure checks — no fs writes, no logging of candidate paths at error level (path echo is the leak the 404 contract exists to prevent).
