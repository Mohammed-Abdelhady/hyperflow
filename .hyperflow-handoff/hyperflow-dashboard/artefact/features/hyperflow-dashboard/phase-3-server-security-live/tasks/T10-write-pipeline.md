# T10 — Write pipeline: the single write door

## Task

Implement `dashboard/src/server/services/write.ts` — the one function through which every dashboard filesystem write passes — sequencing T9b's gates and the atomicity/backup/conflict machinery: jail → denylist + secret blocklist on the resolved path → pre-write backup → temp write + fsync → atomic rename → mtime/content-hash conflict check. Includes the startup writability probe that flips the server into observe mode on a read-only filesystem. Unit tests under `dashboard/tests/unit/services/`.

## Why

Spec §1's module-boundary table names this "the only write door": routes and services never touch `fs` for writes directly — direct writes elsewhere are lint-banned (spec §5 `eslint.config.js`). Concentrating every write behind one door means the jail, denylist, blocklist, backup, and atomicity guarantees cannot be forgotten by any future mutation feature; the blast radius of any bug is bounded to the five allowlisted surfaces (spec §3B.8e). Atomic temp+rename means a crash mid-write can never leave a torn artefact for the watcher/parser to ingest; the pre-write backup powers undo (spec §4.4); the mtime+hash precondition makes concurrent external edits a visible conflict instead of silent last-write-wins.

## Scope

**IN:**
- `writeFile(request)` pipeline in the exact order: resolve through the path jail (realpath + symlink deny) → denylist + secret blocklist verdicts on the RESOLVED path → pre-write backup (timestamped copy to the session backup path) → write to a temp file in the target's directory + fsync → atomic rename over the target → surface the resulting `writeId` for SSE echo correlation.
- Conflict precondition: the request carries the mtime (and content hash) from when the client read the file; if the on-disk file changed since, the write is refused with a 409-mapped `WRITE_CONFLICT` typed error carrying the conflicting mtime in `details` — no write, no backup (spec §4.4 — never last-write-wins).
- New-file creation path (e.g. first `.mode` marker): skips backup (nothing to back up), still passes every gate.
- Preservation of the target's original line endings and BOM on rewrite (spec §4.2).
- Startup writability probe + first-write-failure probe: detect read-only filesystem and set the observe-mode flag consumed by routes/UI; probing must not create or leave any file (spec §4.4).
- Typed error mapping for every refusal class (jail → `NOT_FOUND`, denylist/blocklist → `PATH_BLOCKED`, conflict → `WRITE_CONFLICT`).
- Unit tests including gate-order and atomicity cases.

**OUT:**
- The gate implementations themselves (T9b — this task composes them, never re-implements pattern matching).
- Route wiring, Zod body validation, handoff STATUS state machine (services/routes tasks; the state machine gates BEFORE calling the write door).
- Watcher echo / SSE `write-echo` emission (T11/T12 + delta service) — this task only returns the `writeId`.
- Backup restore UI flows (management surface task); only the backup write itself is in scope.
- The ESLint no-direct-fs-write rule config (phase-1 tooling file) — but this task's tests assert the door is importable as the single entry point.

## Files in scope

- `dashboard/src/server/services/write.ts` — CREATE. Exports the single `writeFile`-shaped entry point taking a typed request (resolved-candidate path, content, expected mtime/hash, writeId) and the observe-mode probe. Internally sequences: jail resolve (deny → typed refusal), denylist verdict, blocklist verdict, conflict precondition check against current on-disk stat/hash, timestamped backup copy, temp-file write in the same directory (same filesystem — rename must stay atomic), fsync of file and directory entry, rename over target. Returns the confirmed writeId + new stat. Exposes the observe-mode state via an explicit typed accessor, set by the startup probe or flipped by the first EROFS/EACCES write failure.
- `dashboard/tests/unit/services/write.test.ts` — CREATE. Full pipeline suite against a scratch temp tree (see Test cases).

Keep the file within the 300-line cap — if backup naming or probe logic grows, split helpers within `services/` rather than inlining everything.

## Acceptance criteria

- [ ] Gate order is exactly: jail → denylist + blocklist on resolved path → backup → temp+fsync → atomic rename — proven by a test that instruments the sequence.
- [ ] A denied verdict at any gate produces NO filesystem side effect: no backup file, no temp file, no target change.
- [ ] Denylist protects derived files (`memory/index.md`, `memory/.checksums`) and ALL task-file classes (`tasks/*.md`, `features/*/…/tasks/*.md`, `phase.md`, `feature.md`) through this door — the pipeline, not UI affordances, is the enforcement point (spec §1).
- [ ] Blocklisted targets (e.g. `.env` inside the jail, symlink to `*.pem`) are refused with the `PATH_BLOCKED`/`BLOCKED` typed error even on write.
- [ ] Symlink escape and encoded/double-encoded traversal in the write target are refused via the jail (404-mapped, no path echo) — the door inherits T9b's guarantees, verified end-to-end through the door.
- [ ] mtime changed since read → 409 `WRITE_CONFLICT` with conflicting mtime in `details`; same mtime but changed content hash → same refusal (touch-back attacks don't slip through).
- [ ] Rename is atomic: the temp file lives in the target's directory (same filesystem), and no observable intermediate state exists where the target is missing or partial.
- [ ] Crash simulation between temp-write and rename leaves the original target intact and only an orphaned temp file.
- [ ] Every successful write leaves exactly one timestamped backup of the prior content; new-file creation succeeds without a backup.
- [ ] CRLF/BOM of the original file are preserved byte-for-byte outside the edited content contract (spec §4.2).
- [ ] Read-only filesystem: startup probe flips observe mode WITHOUT creating any file; a first-write EROFS also flips it; subsequent write attempts short-circuit with the observe-mode typed error.
- [ ] `writeFile` in `services/write.ts` is the only module in `src/server/` invoking fs write primitives (write/rename/copy/unlink on artefacts) — consistent with the lint ban.

## Test cases

Unit (Vitest, scratch temp directory as jail root, real files and symlinks):
- `pipeline order: jail verdict precedes denylist precedes backup (spy sequence)`
- `write to memory/decisions.md succeeds: backup exists, content swapped atomically, writeId returned`
- `write to memory/index.md denied, zero side effects on disk`
- `write to tasks/slug.md and features/f/phase-2-x/tasks/T3.md denied (task files never written)`
- `write to in-jail .env denied by blocklist even though jail admits the path`
- `write target is symlink escaping jail → refused, no temp file created`
- `double-encoded traversal in write target → refused (through-the-door check)`
- `mtime mismatch → WRITE_CONFLICT with conflicting mtime in details, target untouched, no backup`
- `content-hash mismatch with equal mtime → WRITE_CONFLICT`
- `simulated crash after temp write, before rename: target intact`
- `CRLF file rewritten keeps CRLF; BOM file keeps BOM`
- `read-only fs: probe sets observe mode and leaves directory listing unchanged (no probe artifacts)`
- `observe mode short-circuits writeFile before any gate work`

E2E — integration via T41 pointer: T41's Playwright suite covers memory CRUD and config edit against the running server; this task registers two attack scenarios for it — a raw HTTP POST writing to a task file asserting the 403 `PATH_BLOCKED` envelope, and a conflicting concurrent edit asserting 409 `WRITE_CONFLICT` + UI refresh behavior.

## Related context

- Spec §2(b) — full write-path diagram; the POST response acknowledges acceptance while the watcher echo (carrying `writeId`) is the source of truth for confirmed state.
- Spec §1 module-boundary table — "The only write door", exact gate order, lint ban on direct fs writes.
- Spec §3B.8(e) — write allowlist: memory category files, `~/.hyperflow/config.json`, `.mode`/`.sticky`, handoff STATUS; atomic temp+rename, pre-write `.bak`, mtime conflict check.
- Spec §4.4 — conflict semantics, undo-via-backup, read-only fs → observe mode; §4.2 — BOM/CRLF preservation.
- Spec §3B.15 — `PATH_BLOCKED` 403 · `WRITE_CONFLICT` 409 · `NOT_FOUND` 404 code mapping.
- Depends on T9a (transport gates in front of any write route) and T9b (jail/denylist/blocklist modules this door composes).

## Gotchas

- The observe-mode probe must not create files — probe writability via fs access/permission checks on the jail root, not by writing a sentinel file that would wake the watcher and pollute the tree.
- Temp file must be created in the target's own directory: `os.tmpdir()` may be another filesystem, where rename degrades to copy+delete and stops being atomic.
- fsync the directory as well as the file where the platform supports it — rename durability on crash depends on it.
- Backup happens after all gates pass but before the temp write; a refused write must never mint a backup (that would leak blocklisted content into the backup path).
- The conflict check needs both mtime AND content hash — mtime alone has 1s granularity on some filesystems and can be forged by touch.
- One concern per file still applies: the door orchestrates T9b's modules via their exported predicates; re-implementing any pattern logic here creates the divergence the single-guard design forbids.
- Return the `writeId` untouched for SSE echo correlation (spec §2b) — do not mint a new one server-side when the client supplied it with the mutation.
