# T12 — SSE layer: hub, ring buffer, client registry

## Task

Implement the server-side SSE machinery under `dashboard/src/server/sse/` — `hub.ts` (the sole SSE writer and sole assigner of `epoch-seq` event ids), `ring-buffer.ts` (bounded recent-delta buffer backing `Last-Event-ID` replay), and `clients.ts` (client registry, heartbeat comment frames, disconnect reaping) — plus unit tests under `dashboard/tests/unit/sse/`.

## Why

The SSE wire contract (spec §3B.13) is one of the spec's ADR-flagged public contracts: named events with `<epoch>-<seq>` ids make restart detection structural — a client can never mistake a fresh server's seq 12 for the old server's seq 12 and silently skip state. Centralizing id assignment and stream writing in one hub is what makes the replay/resync semantics provable: if anything else could write to a stream or mint an id, ordering and replay guarantees evaporate (spec §1: "the hub is the sole assigner of event ids and the sole SSE writer"). Heartbeats let clients detect dead connections behind OS socket timeouts (spec §2).

## Scope

**IN:**
- `hub.ts`: single entry point for publishing events; mints the process `epoch` once at startup; assigns strictly monotonic `seq` per event; stamps id `"<epoch>-<seq>"`; serializes named SSE events from the fixed vocabulary (`snapshot-delta`, `hf-event`, `write-echo`, `resync-required`) per spec §3B.13; pushes every published event into the ring buffer; fans each event out to all registered clients in order.
- Reconnect handling: given a client's `Last-Event-ID` — same epoch AND seq inside the buffer window → replay the missed deltas in order before live events; epoch mismatch OR seq fallen out of the buffer → send `resync-required` (client then refetches the snapshot; spec §2 SSE reconnect / §3B.13).
- `ring-buffer.ts`: bounded FIFO of recent published events (capacity a named constant); supports "give me everything after seq N" lookups; overwrite-oldest on overflow.
- `clients.ts`: client registry (add/remove, per-client write sink), periodic heartbeat comment frames on an interval, reaping of dead/disconnected clients (write failure or socket close), clean shutdown flushing nothing and closing all.
- Unit tests: replay, resync, ordering, heartbeat, reaping (see Test cases).

**OUT:**
- The HTTP route `routes/stream.ts` (separate routes task — it delegates to the hub; transport auth is T9a's query-param token gate).
- Delta production (services/delta), watcher (T11), and events tailer — they are hub *publishers*, wired later.
- Client-side EventSource lifecycle, BroadcastChannel fan-out, leader election (SPA phase).
- Payload schemas beyond consuming the shared delta/event types from T2's `shared/schemas/`.

## Files in scope

- `dashboard/src/server/sse/hub.ts` — CREATE. Owns `epoch` (minted once per process start — crypto-random or startup-timestamp based, opaque to clients) and the monotonic `seq` counter. Publish API takes a named event + typed payload, assigns the id, appends to the ring buffer, writes to every live client via the registry. Subscribe API takes a client sink + optional `Last-Event-ID` string: parses it defensively (malformed → treat as no-id → resync path), decides replay vs `resync-required`, replays from the buffer in seq order, then attaches the client for live flow. Nothing else in the codebase writes SSE frames or ids — hub is the single door.
- `dashboard/src/server/sse/ring-buffer.ts` — CREATE. Generic bounded buffer over `{seq, frame}` entries: append, `after(seq)` range read returning in-order entries or an out-of-window signal, capacity as a constructor arg with a named default. No SSE knowledge beyond the entry shape.
- `dashboard/src/server/sse/clients.ts` — CREATE. Registry keyed by client id: register/unregister, broadcast helper writing a serialized frame to each sink, heartbeat timer emitting SSE comment frames (`:hb` style) on a named-constant interval, reap-on-write-failure and reap-on-close, dispose() cancelling the timer and closing all clients.
- `dashboard/tests/unit/sse/hub.test.ts` — CREATE.
- `dashboard/tests/unit/sse/ring-buffer.test.ts` — CREATE.
- `dashboard/tests/unit/sse/clients.test.ts` — CREATE.

One mechanism per file (spec §5); hub composes the other two — buffer and registry never import each other or the hub.

## Acceptance criteria

- [ ] Every published event carries id `"<epoch>-<seq>"` with `seq` strictly monotonic within the process — no gaps, no reuse, proven under interleaved publishes (spec §3B.13).
- [ ] `Last-Event-ID` with same epoch and seq inside the buffer → the client receives exactly the missed events, in order, before any live event (replay proven in tests).
- [ ] `Last-Event-ID` with a different epoch → client receives `resync-required` (epoch mismatch proven in tests, spec §2 restart detection).
- [ ] `Last-Event-ID` with same epoch but seq older than the buffer window → `resync-required` (hard replay horizon, spec §3B.13 trade-off).
- [ ] Malformed or absent `Last-Event-ID` never throws — treated as a fresh subscription needing resync/initial snapshot semantics.
- [ ] Only the four named events + comment heartbeats are ever emitted; event names come from a shared constant vocabulary (additive-only contract, spec §3B.13).
- [ ] Ring buffer is bounded: overflow evicts oldest; `after(seq)` distinguishes "empty range, in window" from "out of window".
- [ ] Heartbeat comment frames go to every live client on the interval; a client whose sink write fails is reaped and receives nothing further.
- [ ] A reaped/disconnected client does not stall or corrupt delivery order for remaining clients.
- [ ] The hub is the sole id assigner and sole SSE writer — no other `src/server/` module serializes SSE frames or mints ids (checked in review; the publish API is the only export that accepts payloads).
- [ ] dispose() cancels the heartbeat timer and closes all clients — test process exits with no open handles.

## Test cases

Unit (Vitest; clients as in-memory sink fakes, injectable clock for heartbeats):
- `assigns strictly monotonic seq across 1000 interleaved publishes; id format matches <epoch>-<seq>`
- `replay: client reconnects with Last-Event-ID <epoch>-5 while buffer holds 3..12 → receives 6..12 in order, then live events`
- `replay boundary: Last-Event-ID equal to newest seq → no replay, live only`
- `epoch mismatch: Last-Event-ID <old-epoch>-9 → resync-required emitted, no replay`
- `overrun: Last-Event-ID <epoch>-1 when buffer starts at 40 → resync-required` (seq fell out of window)
- `malformed Last-Event-ID ("garbage", "12", "-", "") → resync path, no throw`
- `ring-buffer: capacity 8, append 12 → after(3) reports out-of-window; after(9) returns 10..12`
- `clients: heartbeat comment frame reaches all registered sinks each interval tick`
- `clients: sink that throws on write is reaped; subsequent broadcast reaches the survivors in order`
- `hub: publish while a replay is in flight preserves total order for that client (no live event delivered before its replayed predecessors)`
- `dispose: no timers or sinks left open`

Integration — via T41 pointer: T41's Playwright suite covers the live-update flow end-to-end (file write → watcher → delta → SSE → store) and a reconnect scenario: kill/restart the server mid-session and assert the client receives `resync-required` and re-snapshots. Additionally register one raw-HTTP scenario there: `GET /api/v1/stream` without the query-param token asserting 401 (transport gate from T9a in front of this hub).

## Related context

- Spec §3B.13 — full SSE wire contract: named vocabulary (`snapshot-delta`, `hf-event`, `write-echo`, `resync-required`, comment heartbeats), `epoch-seq` id scheme, ring-buffer replay, epoch-gated resync, additive-only evolution. ADR-flagged public contract (§2 ADR flags).
- Spec §2 "SSE reconnect / resync" — replay window semantics, leader-tab reconnect (client side, out of scope here), heartbeat purpose.
- Spec §1 module-boundary table — "the hub is the sole assigner of event ids and the sole SSE writer"; watcher and tailer emit TO the hub.
- Spec §3B.8 / §3B.14 — the stream route carries the session token as a query parameter (EventSource cannot set headers) and never logs its URL; auth happens in T9a's gates before the hub sees a client.
- Depends on T2 (shared schemas — delta shapes, event-line schema, event-name constants live in `shared/`).

## Gotchas

- EventSource cannot set request headers — the stream route's token arrives as a query parameter (T9a); the hub itself must never log subscription URLs or embed the token in any frame.
- Parse `Last-Event-ID` defensively — it is client-controlled input on an authenticated-but-untrusted channel; a malformed id must land on the resync path, never in a crash or a bogus replay.
- Replay-then-live ordering needs care: buffer the client's live feed (or hold the registry attach) until replay completes, or a live event can interleave ahead of its replayed predecessors.
- `seq` is per-process and never resets while the process lives; `epoch` changes ONLY on process restart — regenerating epoch at runtime would force every client into needless resync.
- Heartbeats are SSE comment frames (`:` prefixed), not named events — they must not consume seq ids or enter the ring buffer.
- One mechanism per file and the 300-line cap: frame serialization helpers belong in the hub, buffer stays generic, registry stays transport-dumb.
