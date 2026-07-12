# T20 — Zustand slices + SSE-delta reducers

## Status

| Field      | Value                          |
|------------|--------------------------------|
| Task       | T20                            |
| Role       | Implementer                    |
| Complexity | m                              |
| Batch      | B1                             |
| Depends on | T2 (shared schemas)            |
| Reviewers  | frontend-reviewer              |

## Task

Build the client state layer: per-feature Zustand slices, pure SSE-delta reducers that run identically in leader and follower tabs, memoized selector helpers, and the slice-selection hooks components subscribe through — plus fixture-delta-stream unit tests proving reducer determinism.

## Why

Spec §3B decision 10 stakes the whole multi-tab model on one deterministic reducer path: the same typed delta applied by the same pure reducer must produce identical state in the leader tab (fed by EventSource) and every follower (fed by BroadcastChannel rebroadcast). Decision 7 requires all derived intelligence to flow through memoized selectors so an SSE delta re-renders only the views whose inputs changed. This task is the substrate for T21 (clients dispatch into it) and every feature phase (surfaces select from it).

## Scope

**IN:**
- `stores/snapshot.ts` — the live normalized snapshot in per-feature slices (mission, tasks/features, audits, memory, specs, connection per spec decision 10's slice list), hydrated once from the initial snapshot fetch and mutated exclusively by delta reducers; includes the connection slice (stream status, last-applied event id, fidelity mode, observe mode) that T19's banners and T21's lifecycle read/write.
- `stores/events.ts` — live event feed slice with capped in-store retention (spec §1: event feed caps retention; overflow is fetched on demand via `/api/v1/events` — the fetch itself is T21/feature-phase territory).
- `stores/replay.ts` — replay slice: scrubber position, playback state, timeline index, the global `scrubbing` flag that zeroes motion durations (system.md §Live-data patterns Scrubber).
- `stores/ui.ts` — UI state slices (selection, drawer, tab, filter) fully separated from data slices so a drawer toggle never invalidates a data selector.
- Pure delta reducers: functions of `(sliceState, typedDelta) → sliceState` over the `shared/` delta schema — no I/O, no Date.now, no randomness, no reads outside their arguments. Handle every named delta kind plus `parseError`-flagged fallback nodes (spec §3B decision 13: degradations travel inside `snapshot-delta`); unknown delta kinds are ignored losslessly, never thrown on.
- Reducer entry points for the full lifecycle: hydrate-from-snapshot, apply-delta, apply-write-echo (writeId reconciliation of optimistic entries), reset-for-resync.
- `utils/selectors.ts` — memoized selector helpers (input-reference equality) wrapping the `shared/derived/` pure functions (health, leaderboard, conclusions, tokens) over slice state.
- `hooks/use-slice.ts` — typed slice-selection hooks with equality functions so components subscribe to minimal slices.
- `dashboard/tests/unit/client/stores/*` — fixture-delta-stream tests (see Test cases).

**OUT:**
- EventSource, BroadcastChannel, leader election, TanStack Query wiring (T21) — this task exposes the dispatch surface T21 calls.
- The derived pure functions themselves (`shared/derived/`, phase-1) — only the memoized selector wrappers over them.
- Virtual-list and debounced-input hooks (T24).
- Any component rendering.

## Files in scope

- `dashboard/src/client/stores/snapshot.ts` — create. Slice map + reducers + hydrate/reset; if the slice count pushes past the 300-line cap, split per-domain reducer modules under `stores/` and compose them here.
- `dashboard/src/client/stores/events.ts` — create. Feed slice with retention cap constant (sourced from `constants/`), append/coalesce reducer, range-merge entry point for scrubber backfill.
- `dashboard/src/client/stores/replay.ts` — create. Scrub position, `scrubbing` flag, event/stage stepping state.
- `dashboard/src/client/stores/ui.ts` — create. Selection/drawer/tab/filter slices, keyed per feature surface.
- `dashboard/src/client/utils/selectors.ts` — create. Memoization helper + the derived-metric selector instances.
- `dashboard/src/client/hooks/use-slice.ts` — create. `useSlice`-style typed hooks with shallow/custom equality.
- `dashboard/tests/unit/client/stores/` — create test files mirroring the store modules, driven by recorded fixture delta streams.

## Acceptance criteria

- [ ] All snapshot mutations flow through pure reducers over `z.infer` types from `shared/schemas/delta` — no component or hook writes snapshot state directly; UI slices are the only setter-style surface.
- [ ] Reducers are deterministic: same initial state + same ordered delta stream → deeply equal state, with no dependence on wall clock, tab identity, or call site — the property that makes leader/follower equivalence possible.
- [ ] Unknown delta kinds and unknown fields are tolerated (spec additive-only evolution): ignored without error, counted in a diagnostics tally on the connection slice.
- [ ] `parseError`-flagged fallback nodes are stored as first-class degraded entries, not dropped (spec §4.2 parse-or-degrade).
- [ ] Write-echo reconciliation: an optimistic entry carrying a writeId is replaced (not duplicated) when the matching `write-echo` delta arrives; a foreign writeId applies as a normal external change.
- [ ] Resync reset clears data slices and replays hydration without touching UI slices (selection survives a resync).
- [ ] Selector memoization holds: applying a delta that touches only the events slice does not produce new references from mission/audit/memory selectors (asserted by reference equality in tests).
- [ ] UI-slice changes produce zero new references in any data selector output.
- [ ] Event-feed retention cap enforced with lossless ordering (drop-oldest), cap value from `constants/`, no magic number.
- [ ] No `any`, exported APIs fully typed, no file over 300 lines.

## Test cases

- Unit (determinism, the headline case): replaying a recorded fixture delta stream through the leader-path entry point and separately through the follower-path entry point yields byte-identical store state (`JSON.stringify` equality on the full data-slice tree) — run against at least two fixture streams: a dispatch burst and a mixed stream containing unknown event kinds + a `parseError` node.
- Unit: order sensitivity — the same fixture stream with two deltas swapped produces a different (still valid) state, proving reducers respect id order rather than merging commutatively.
- Unit: hydrate → apply N deltas → resync-reset → rehydrate equals hydrate-fresh state; UI slices unchanged across the reset.
- Unit: write-echo with matching writeId collapses the optimistic entry; without a match it appends.
- Unit (memoization): apply an events-only delta; assert mission selector output is reference-equal before/after, and the health selector recomputes only when its input slice changed.
- Integration (jsdom): two store instances in one process — one fed directly, one fed via a simulated BroadcastChannel round-trip (structured-clone of each delta) — end in deeply equal state; a component subscribed via `use-slice` to the ui slice re-renders on drawer toggle while a sibling subscribed to the audits slice does not (render-count probe).

E2E: N/A — no browser surface at this layer; composed-loop coverage lands in T40/T41.

## Related context

- Spec §3B decision 10 (state topology — slice list, reducer determinism, UI/data separation), decision 7 (memoized derived selectors), decision 13 (delta vocabulary the reducers consume, `epoch-seq` ordering), §2a read path (delta → reducer → selector → UI), §4.3 (resync, staleness).
- system.md §Live-data patterns — the `scrubbing` flag this task owns is what zeroes durations board-wide; §Motion tokens are consumed downstream, not here.
- Fixture streams live under `dashboard/tests/fixtures/` per spec §5 testing layout; fixtures are never imported by prod code (spec §5 Boundaries).

## Gotchas

- 300-line cap: `snapshot.ts` is the natural overflow point — split per-domain reducers early, keep the file as composition only.
- Reducers must never call selectors or read other slices — cross-slice derivation belongs in `utils/selectors.ts`.
- UI-state changes must not re-render data lists: enforce by construction (separate slices, separate hooks), not by memo patches in components.
- Deltas arriving during hydration are T21's buffer concern, but the hydrate entry point must accept a `lastEventId` watermark so T21 can apply the buffer in id order without double-applying.
- No `Date.now()`/`Math.random()` anywhere in a reducer — timestamps come from the delta payloads.
- Retention-cap eviction must not evict entries the replay slice's timeline index still references — coordinate the two slices' contracts explicitly.
