# T21 — api + SSE + leader clients

## Status

| Field      | Value                                         |
|------------|-----------------------------------------------|
| Task       | T21                                           |
| Role       | Implementer                                   |
| Complexity | m                                             |
| Batch      | B2 (after T20)                                |
| Depends on | T2 (shared schemas), T20 (store surface)      |
| Reviewers  | frontend-reviewer, security-reviewer          |

## Task

Build the client's three network services and their hook: the typed TanStack Query api client (token header, optimistic mutations with rollback and in-flight dedup), the EventSource lifecycle manager (hydration buffer, `Last-Event-ID` resume, `resync-required`, sleep/wake staleness), and the BroadcastChannel leader election with token handoff to follower tabs — plus the `use-sse` subscription hook wiring it into the store.

## Why

Spec §3B decision 2 caps the app at one EventSource per browser (HTTP/1.1 per-origin connection limit), so multi-tab correctness hangs on leader election and verbatim delta fan-out. Decision 13 defines the resume/resync contract that keeps a reconnecting client from silently skipping state, and decision 14 defines the only legal token transports — header everywhere, query param on the stream alone, BroadcastChannel handoff for follower tabs. This is the security-sensitive seam of the client; it is reviewed as such.

## Scope

**IN:**
- `services/api.ts` — typed `/api/v1` client: fetchers and mutation functions validated against `shared/schemas/api`, `X-Hyperflow-Token` header on every request, the `{code, message, details?}` error envelope surfaced as typed errors the UI branches on by `code` (spec decision 15); TanStack Query defaults (retry policy, dedup) and mutation wiring with optimistic slice patch + rollback on typed failure; the initial `GET /api/v1/snapshot` fetcher that hydrates T20's store.
- `services/sse.ts` — EventSource lifecycle: subscribe with `Last-Event-ID` from the connection slice; named-event listeners for `snapshot-delta`, `hf-event`, `write-echo`, `resync-required` (unknown names ignored per additive-only rule); hydration buffer — deltas arriving before hydration completes are held and applied afterward in id order against the snapshot's watermark; `resync-required` handling (refetch snapshot, reset slices, resubscribe from the new id); heartbeat-gap dead-connection detection; sleep/wake staleness — on visibility/online resume, compare last-event age against a staleness threshold and force a resync instead of trusting the stale position (spec §4.3).
- `services/leader.ts` — BroadcastChannel leader election: exactly one tab owns the EventSource; leader rebroadcasts every event verbatim (id + name + payload untouched) so follower reducers see the identical stream; leader-death detection and re-election with resume from the last id any tab applied; **token handoff** — a follower with empty `sessionStorage` requests the token over the channel and the leader answers it (spec decision 14), scoped so the token never rides a broadcast unless requested and never touches `localStorage`.
- `hooks/use-sse.ts` — the subscription hook: starts/steps the election + lifecycle, exposes connection status to the shell, tears down cleanly on unmount.
- Unit/integration tests for all four modules.

**OUT:**
- Store internals and reducers (T20) — this task only calls the entry points T20 exposes.
- Feature-level queries/mutations (memory CRUD, config save — feature phases) — this task ships the client foundation they build on.
- Server-side SSE hub, ring buffer, heartbeats (server phase).
- Shell banner rendering (T19) — this task only feeds the connection slice they read.

## Files in scope

- `dashboard/src/client/services/api.ts` — create. Fetch wrapper (token header injection from sessionStorage, envelope parse, typed error mapping by `code`), query-key usage from `constants/`, snapshot fetcher, mutation factory with optimistic patch/rollback/dedup semantics delegated to TanStack Query.
- `dashboard/src/client/services/sse.ts` — create. Lifecycle state machine (connecting → live → buffering → resyncing → dead), named-event registration, hydration buffer with id-order flush, staleness check on `visibilitychange`/`online`.
- `dashboard/src/client/services/leader.ts` — create. Election protocol over BroadcastChannel, verbatim rebroadcast, re-election on leader close, token request/response handshake for followers.
- `dashboard/src/client/hooks/use-sse.ts` — create. Composition hook over leader + sse + store dispatch; single instance enforced (app-level, mounted once in the shell).
- `dashboard/tests/unit/client/services/` — create tests mirroring the three services + hook.

## Acceptance criteria

- [ ] Every `/api/v1` request carries the token as `X-Hyperflow-Token`; the token appears in a URL in exactly one place — the EventSource subscription query param on `/api/v1/stream` — and is never logged, never in any other constructed URL, never in `localStorage`.
- [ ] Client branches on envelope `code` (e.g. `TOKEN_INVALID`, `WRITE_CONFLICT`), never on `message` text; a 401 flips the connection slice to unauthenticated instead of retrying forever.
- [ ] Mutations apply an optimistic patch, roll it back on typed failure, and dedupe identical in-flight requests; the watcher `write-echo` (not the POST response) confirms final state via T20's reconciliation entry point.
- [ ] Hydration ordering is correct: deltas received mid-hydration are buffered and applied strictly after hydrate, in id order, skipping ids at or below the snapshot watermark — no delta is applied twice or dropped.
- [ ] Reconnect resumes with `Last-Event-ID`; on `resync-required` (epoch mismatch or buffer overrun) the client refetches the snapshot, resets data slices, and resubscribes from the new id — asserted end-to-end.
- [ ] Exactly one EventSource exists across N tabs; followers receive byte-identical events via BroadcastChannel (verbatim rebroadcast, no re-serialization drift); leader close triggers re-election and resume from the last applied id.
- [ ] Follower token handoff works: a fresh tab with empty `sessionStorage` obtains the token over the channel and becomes API-capable without a re-launch; the handoff responds only to explicit requests on the app's own channel.
- [ ] Sleep/wake: after a simulated visibility gap beyond the staleness threshold, the client forces a snapshot resync rather than resuming the stream position.
- [ ] All wire shapes are `z.infer` from `shared/` — no locally defined response types; no `any`; no file over 300 lines.

## Test cases

- Unit (api): token header present on every fetcher/mutation; envelope with `code: WRITE_CONFLICT` produces the typed conflict error; optimistic mutation rolls back the store patch on failure and dedupes a double-fire.
- Unit (sse): scripted event sequence — connect, 3 deltas, disconnect, reconnect with `Last-Event-ID` — resumes without gap; `resync-required` path resets and resubscribes; deltas injected during a slow hydrate are flushed after it in id order with the watermark respected.
- Unit (leader): two simulated tabs — exactly one opens the EventSource; leader close re-elects within the protocol timeout and the new leader resumes from the max applied id across tabs; token request from a fresh follower is answered, and no token frame is emitted unrequested.
- Integration (jsdom + mock EventSource + real BroadcastChannel polyfill): full pipeline — leader receives a fixture delta stream, followers apply via rebroadcast, final store state is byte-identical leader vs follower (reuses T20's determinism fixtures across the real transport seam).
- E2E (Playwright, real server + fixture project): open two tabs; scripted file write in the fixture tree appears in both tabs; close the leader tab; a further file write still reaches the surviving tab (re-election + resume observed through the UI); assert via `data-testid` and network inspection that only the stream request ever carries the token in its URL.

## Related context

- Spec §3B decisions 2 (SSE + BroadcastChannel topology), 13 (named events, `epoch-seq` ids, ring-buffer replay, resync), 14 (token transports + follower handoff), 15 (error envelope); §2 read/write paths and SSE reconnect/resync section; §4.3 (connection drops, tab cap, sleep/wake); §4.6 (401 is generic — do not leak token state in UI copy).
- T20's store contracts: hydrate watermark, apply-delta, write-echo reconciliation, resync reset, connection slice.
- system.md §Voice for any connection-status copy pushed to the slice ("Stream reconnecting — resuming from last event", fact then action).

## Gotchas

- EventSource cannot set headers — the query-param token on `/api/v1/stream` is the single sanctioned exception (spec decision 14); resist "consistency" refactors that move the token into other URLs, and never log the stream URL client-side.
- Rebroadcast must be verbatim: re-parsing and re-emitting a normalized object in the leader would create a second reduction path and break leader/follower determinism — forward the raw `{id, name, data}` triple.
- BroadcastChannel messages structured-clone: keep frames JSON-safe, no class instances.
- UI-state changes must not re-render data lists — connection status writes go to the connection slice only; never trigger snapshot-slice churn on heartbeat.
- 300-line cap: the sse lifecycle state machine tends to sprawl — extract the hydration buffer and staleness logic into small modules if needed.
- No inline business logic in JSX — `use-sse` returns state; the shell renders it.
- Mind the election races: two tabs starting simultaneously must converge on one leader (deterministic tiebreak, e.g. lexicographic tab id), and a follower promoted mid-hydration must not double-hydrate.
