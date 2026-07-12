# T11 — Watch layer: recursive watcher, settle discipline, integrity heuristic

## Task

Implement the file-watching mechanism under `dashboard/src/server/watch/` — `watcher.ts` (recursive `node:fs.watch` with a runtime capability probe and chokidar fallback), `settle.ts` (debounce/settle window with per-path burst coalescing), and `integrity.ts` (size-stable re-read + checksum-vs-cache suppression of no-op and mid-write events) — plus unit tests under `dashboard/tests/unit/watch/`.

## Why

Chain runs produce bursts of partial writes — a dispatch batch ticking 3 checkboxes, rewriting a Status block, and committing lands hundreds of raw fs notifications in seconds (spec §3B.3, §4.3). Reacting per-event would parse torn files; the settle-then-re-read contract guarantees the parser only ever sees complete documents, and burst coalescing keeps the SSE stream at one collapsed update per tick instead of one per notification. Native `fs.watch` keeps the dependency footprint at zero on macOS/Windows; the probe-based chokidar fallback buys Linux correctness (recursive watch landed late and unevenly there — spec §3B.3) and covers Windows recursive-watch gaps (spec §4.5).

## Scope

**IN:**
- `watcher.ts`: recursive watch over three roots — the project `.hyperflow/` tree, the `.hyperflow-handoff/` sibling, and `~/.hyperflow/config.json` (spec §3B.3); a startup probe verifying `fs.watch({recursive:true})` actually works on the running platform; transparent swap to chokidar on probe failure OR on runtime watcher error, with equivalent event semantics either way; clean disposal (close watchers, cancel timers) for tests and shutdown.
- `settle.ts`: 150 ms per-path debounce plus a global coalescing window; a burst of events across many paths collapses into one settled changeset per tick (spec §4.3); a still-changing path keeps deferring until stable.
- `integrity.ts`: after settle, size/mtime-stability re-check followed by full re-read and content checksum against the cached checksum — unchanged content emits nothing (no-op suppression); a file still growing or mid-write (size changed between stability checks) is deferred, never emitted (spec §2a "suppress" branch, §4.2 torn-write handling).
- Typed output contract: the layer emits settled, integrity-checked change sets (created/changed/deleted paths + content checksums) for the snapshot/delta service — it never parses artefacts and never talks to the SSE hub directly (spec §1: "Watcher emits settled, integrity-checked change sets; the hub is the sole assigner of event ids").
- Unit tests with real temp-dir writes exercising bursts, mid-write suppression, and fallback swap.

**OUT:**
- `tailer.ts` — the events.ndjson byte-offset tailer is a separate mechanism/task; do not fold it in here.
- Snapshot diffing, parsing, delta shaping (services layer) and SSE emission (T12).
- Watch-root discovery (CLI passes the resolved roots in — spec §1 CLI → server contract).
- The 4.3 "hundreds of events" performance tuning beyond the specified debounce/settle/coalesce contract.

## Files in scope

- `dashboard/src/server/watch/watcher.ts` — CREATE. Watch-engine abstraction: constructor takes the three resolved roots; startup probe (create-watch-and-verify on a scratch check, or capability detection appropriate to the platform) decides native vs chokidar; both engines normalize into one internal raw-event shape (path + kind) fed to settle; runtime error on the native engine triggers a one-way swap to chokidar without losing the roots; exposes start/stop lifecycle.
- `dashboard/src/server/watch/settle.ts` — CREATE. Pure-ish timing module (injectable clock for tests): per-path debounce (150 ms default, constant not magic-number), global coalescing tick that batches all settled paths into one changeset; re-arms on new events for a still-hot path.
- `dashboard/src/server/watch/integrity.ts` — CREATE. Given a settled path set: stat for size/mtime stability across a short interval, full re-read, checksum, compare to the cache; classify each path as changed (emit with new checksum), no-op (suppress), or unstable (defer back to settle). Maintains the checksum cache; handles deletions (cache eviction + delete event).
- `dashboard/tests/unit/watch/watcher.test.ts` — CREATE.
- `dashboard/tests/unit/watch/settle.test.ts` — CREATE.
- `dashboard/tests/unit/watch/integrity.test.ts` — CREATE.

One mechanism per file (spec §5 layout); settle and integrity must be testable without any real fs watcher attached.

## Acceptance criteria

- [ ] A burst of rapid writes to one file (simulated dispatch checkbox ticking) produces exactly one settled changeset containing that path once — not one event per write (spec §4.3).
- [ ] A burst across many files inside the coalescing window produces one changeset listing all settled paths — never N separate emissions.
- [ ] A file written in visible chunks (mid-write) is never emitted while growing; it emits once, after size/mtime stability, with the final content checksum (spec §4.2 torn-write, §2a suppress branch).
- [ ] Rewriting a file with identical content emits nothing (checksum no-op suppression).
- [ ] The probe correctly selects chokidar when recursive `fs.watch` is unavailable/broken, and a runtime watcher error mid-session swaps engines without dropping the watched roots (spec §3B.3).
- [ ] Both engines deliver identical downstream semantics — the settle/integrity tests pass unchanged against either engine's raw events.
- [ ] All three roots are watched: `.hyperflow/`, `.hyperflow-handoff/`, and the global config file; events under each reach the changeset with jail-relative (POSIX-normalized) paths.
- [ ] Deletion of a watched file emits a delete entry and evicts its checksum cache.
- [ ] Debounce and coalesce timings are named constants; tests drive them via an injected clock, not real sleeps, except one real-timing smoke test.
- [ ] Disposal stops all timers and watchers — the test process exits cleanly with no open handles.

## Test cases

Unit (Vitest; settle/integrity via injected fake clock, watcher via real temp dirs):
- `settle: 50 raw events on one path within 150ms → one settled path` (burst coalescing)
- `settle: events on 8 paths within one coalescing window → single changeset with 8 paths`
- `settle: path receiving events every 100ms never settles until writes stop`
- `integrity: file appended in 3 chunks with stability checks between → zero emissions until final stability, then one changed entry` (mid-write suppression)
- `integrity: rewrite with byte-identical content → suppressed as no-op`
- `integrity: touch (mtime bump, same content) → suppressed`
- `integrity: delete → delete entry + cache eviction`
- `watcher: probe failure injects chokidar engine; raw events still flow for nested-directory writes`
- `watcher: native engine runtime error swaps to chokidar; a write after the swap is still observed`
- `watcher: writes under handoff sibling and to the global config file are observed`
- real-timing smoke: write a file in a real temp tree, assert exactly one changeset arrives within the settle budget (~150–300 ms, spec §3B.3 accepted latency)

Integration — via T41 pointer: T41's Playwright "mission live-update" flow scripts real file writes into the fixture project and asserts the UI delta arrives once and settled; this layer's burst/mid-write behavior is exercised there end-to-end through watcher → delta → SSE → store.

## Related context

- Spec §2(a) read path — fs event burst → debounce/settle → integrity heuristic → parse; the suppress branch for no-op/mid-write is this layer's contract.
- Spec §3B.3 — engine choice, probe, 150 ms debounce, settle-then-re-read guarantee, accepted 150–300 ms latency, chokidar-in-dependencies trade-off.
- Spec §4.3 — dispatch-burst coalescing; §4.2 — partial-write/torn-artefact deferral with last-good-parse retained downstream; §4.5 — Windows recursive-watch gaps → chokidar fallback with equivalent debounce semantics.
- Spec §1 module boundary — watcher hands settled change sets to the services layer; the SSE hub (T12) is the sole id assigner and sole SSE writer.
- Depends on T1 (package/tooling scaffold; chokidar in dependencies, Node >=20 engines).

## Gotchas

- The runtime probe is mandatory — `fs.watch({recursive:true})` can exist as an API yet not work on the platform; trusting the API surface instead of probing reintroduces the exact Linux gap the spec calls out (spec §3B.3).
- Do not emit paths straight from raw watcher events: engines differ in event granularity and duplication (rename vs change, double-fire); everything funnels through settle → integrity so both engines are indistinguishable downstream.
- Keep the checksum cache bounded to watched-tree membership — evict on delete, or a long session leaks memory proportional to file churn.
- The global config target is a single file, not a tree — watch its parent directory where file-level watches are unreliable (editors replace files via rename, which orphans a file-handle watch).
- This layer never assigns event ids and never writes SSE — that is T12's hub, sole assigner by contract (spec §1).
- One mechanism per file and the 300-line cap: resist folding the tailer or delta diffing in here; they are separate modules by design.
