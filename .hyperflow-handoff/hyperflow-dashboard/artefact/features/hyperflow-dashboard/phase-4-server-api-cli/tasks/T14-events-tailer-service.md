# T14 — Events tailer + events service

## Task

Implement the `events.ndjson` byte-offset tailer (`watch/tailer.ts`) and the events domain service (`services/events.ts`): the tailer resumes from a stored byte offset, holds partial trailing lines, detects shrink-below-offset and resyncs from zero; the service provides validated range reads over the file and maintains the replay timeline index the Chain Replay scrubber fetches against.

## Why

Markdown captures state; NDJSON captures sequence (spec §3B decision 6). The tailer is the sole bridge from hyperflow-core's append-only emit contract into the live event bus feeding Mission Control, Chain Replay, and token aggregation (spec §2c). A tailer that emits torn lines or silently loses its place after rotation corrupts the replay timeline — the hold/resync discipline is the correctness core of this task.

## Scope

**IN:**
- `tailer.ts`: byte-offset resume, partial-trailing-line hold (re-read once the writer completes it), shrink-below-offset detection → re-read from zero + emit a `resync` signal so replay indexes rebuild, per-line handoff to the events service.
- `events.ts` (service): Zod line validation with the `v`-field gate (unknown `v` → opaque raw event, best-effort known-field mapping), skipped-line diagnostics tally, range reads over the file for `GET /api/v1/events`, replay timeline index (event boundaries + stage groupings for the scrubber).
- File-absent handling: signal markdown-only mode (spec §4.3) so T16 can flag reduced fidelity in snapshot meta.
- Unit tests for both.

**OUT:**
- The `fs.watch`/chokidar watcher itself (phase 3) — the tailer is triggered by change notifications on `events.ndjson`, it does not own the watch loop.
- SSE hub / id assignment / ring buffer (T12) — validated event objects are handed to the hub; the hub is the sole SSE writer.
- The HTTP route `routes/events.ts` (T16) — this task exposes a service API only.
- hyperflow-core emission (`scripts/emit-event.sh` and hook points) — separate core-side work.
- Client-side replay UI and token aggregation selectors.

## Files in scope

- `dashboard/src/server/watch/tailer.ts` — create. Stateful tailer over one NDJSON file path: stores the byte offset of the last complete line consumed; on change notification opens a read stream from that offset; splits on newlines; a trailing chunk without a terminating newline is held (offset NOT advanced past it) and re-read on the next notification; if current file size < stored offset (truncation/rotation), reset offset to zero, re-read, and emit a resync signal before replaying lines. Emits raw line strings plus resync signals to a consumer callback — no schema knowledge in this module.
- `dashboard/src/server/services/events.ts` — create. Consumes tailer lines: parses JSON, validates against the shared event-line schema, gates on `v` (known → typed event; unknown → opaque raw event with best-effort field mapping; unparseable → skip + increment diagnostics counter, never throw). Maintains the replay timeline index (ordered event positions with stage/batch boundaries). Exposes: range read (offset/limit or time-range over the file for the scrubber's on-demand fetch), timeline index read, diagnostics tally read, and a file-absent/markdown-only status flag.
- `dashboard/tests/unit/watch/tailer.test.ts` — create. Offset resume, partial-line hold, shrink resync against temp files.
- `dashboard/tests/unit/services/events.test.ts` — create. Line validation, `v` gate, range reads, timeline index.

## Acceptance criteria

- [ ] Appending one complete NDJSON line to a tailed file yields exactly one emitted line; offset advances past it.
- [ ] Appending a partial line (no trailing newline) emits nothing and does not advance the offset; completing the line on a later write emits it exactly once (no duplication, no loss).
- [ ] Truncating the file below the stored offset triggers a full re-read from zero preceded by a resync signal (spec §2c truncation/rotation contract).
- [ ] Unknown `v` value → opaque raw event with known fields mapped best-effort; unknown fields on a known `v` are ignored; an unparseable line is skipped and counted — none of these throw (spec §4.3 tolerant reader).
- [ ] Range reads return schema-valid event pages suitable for the replay scrubber; the timeline index rebuilds after a resync.
- [ ] File absent → service reports markdown-only mode; no error, no retry storm (spec §2c version-skew fallback).
- [ ] Tailer never blocks on partial lines (spec §1 events tailer → hub boundary); both files under 300 lines; no `any`.

## Test cases

- Write 3 complete lines, tail, append 2 more → exactly 5 lines emitted in order, no re-emission of the first 3.
- Append `{"v":1,"ts":...` (torn, no newline) → zero emissions; append the remainder + newline → one emission with the full object.
- Simulate writer flushing a line in two chunks split mid-UTF-8-codepoint → emitted line decodes correctly (byte-offset, not string-offset, bookkeeping).
- Truncate the file to zero then append one line → resync signal observed, then the one line; timeline index contains only post-resync events.
- Line with `v: 99` and extra unknown fields → opaque raw event emitted, diagnostics tally unchanged; line with invalid JSON → skipped, tally incremented.
- Range read of events 10–20 from a 50-line fixture file → correct slice, each validating against the shared event-line schema.
- Fixture file absent → markdown-only status true; creating the file later flips status and starts tailing without restart.
- E2E (with T16 in place): boot server against the fixture project, scripted append of one event line to `.hyperflow/events.ndjson` → an `hf-event` SSE frame arrives at a connected client within 2s.

## Related context

- Spec §2c — events path diagram: append → tailer (offset resume, partial-line hold) → Zod validate + `v` gate → live event bus → hub; truncation/resync paragraph beneath it.
- Spec §3B decision 6 — NDJSON schema `{v, ts, chain, skill, type, batch?, task?, status?, agent?, tokens?, detail?}`, additive-only evolution, tolerant-reader rule.
- Spec §4.3 — `events.ndjson` absent / unknown `v` / torn last line edge cases.
- Spec §5 — `watch/tailer.ts` and `services/events.ts` one-liners.
- Shared schemas consumed (T2): `shared/schemas/event-line.ts` (line schema + version gate) — the ONLY schema this task validates against; range-read response envelopes come from `shared/schemas/api.ts` at the route layer (T16), not here.

## Gotchas

- The tailer must hold partial lines and resync on shrink — these two behaviors are the entire reason it exists; do not replace with a naive `readFile`-and-split.
- Byte offsets, not line counts or string indices: multi-byte UTF-8 across chunk boundaries will corrupt string-based bookkeeping.
- Keep schema knowledge out of `tailer.ts` — it emits raw strings; validation lives in the service (spec module split keeps each file under the line cap and separately testable).
- The hub assigns `epoch-seq` ids (spec §3B decision 13) — events leave this layer id-less.
- Emission is additive-only and ADR-governed on the core side — never "fix" or normalize event shapes here; unknown means displayable-raw, not error.
- Services own logic, routes own transport: the range-read API takes typed parameters, not query strings.
