# T41 — e2e specs: live update, replay, CRUD, config, handoff, auth, leader election

## Task

Write the Playwright spec suite under `dashboard/tests/e2e/*.spec.ts` on top of T40's harness: mission live-update driven by scripted file writes into the fixture copy, replay scrubbing, memory CRUD, config edit round-trip, handoff STATUS transitions (legal forward step AND illegal step rejected with 409), auth failure behavior (401 / 403 / BLOCKED), and two-tab leader election with token handoff. Every selector comes from `tests/e2e/utils/selectors.ts`; no text or class queries; no `waitForTimeout`.

## Why

These specs are the executable form of the spec's §4 edge clusters — the guarantees that make the dashboard safe to point at a real project. Unit tests already pin parsers and reducers; only e2e over the real server proves the composed loop: a file write travels watcher → settle → parse → delta → SSE → leader tab → BroadcastChannel → store → pixels (spec §2a), a rejected write travels denylist → 4xx envelope → optimistic rollback (spec §2b), and a second tab genuinely shares one EventSource (spec §3B.2). Shipping without these means the product's core promises exist only as prose.

## Scope

**IN:**
- Spec files under `dashboard/tests/e2e/`, grouped with `test.describe` per flow, one flow-family per file: mission live-update, replay scrub, memory CRUD, config round-trip, handoff transitions, auth failures, multi-tab leader election.
- Scripted fixture-copy file writes as the live-update stimulus (checkbox flip, status-block edit, `events.ndjson` append) — performed from the test via Node fs against the per-run copy, never against the committed tree.
- The §4.6 security cases at the e2e level: missing/wrong token → 401 generic, foreign Origin/Host → 403, blocklisted file requested through a read route → BLOCKED, plus denylist writes (derived memory index, task file) → 403.
- Two-browser-context work for leader election: leader closes → follower re-elects, resumes via `Last-Event-ID`, and the follower acquires the token over the BroadcastChannel handoff (spec §3B.14) without a re-launch.
- Assertions on user-visible outcomes through registry selectors (chips, rows, banners, dialogs, values) plus response-level assertions (status codes, error envelope `code`) where the flow is an API rejection.

**OUT:**
- The harness, fixture tree, and selector registry themselves (T40) — this task ADDS testids to the registry if a flow needs one that is missing, but does not restructure it.
- a11y/RTL/reduced-motion checks (T42).
- Unit-level parser/metric/reducer coverage (phases 2/5).
- Load or soak testing; visual regression screenshots.

## Files in scope

- `dashboard/tests/e2e/mission-live-update.spec.ts` — CREATE. Boot on `/mission`, script writes into the fixture copy's task/status files and append to `events.ndjson`, assert the board updates live without reload: checkbox flip advances the roster row's counts, a status-block change flips the stage chip in place, an appended event line lands in the stream feed. Uses `expect` polling/web-first assertions on registry selectors — never fixed sleeps — so the watcher's settle window (~150-300 ms, spec §3B.3) is absorbed by the built-in retry.
- `dashboard/tests/e2e/replay-scrub.spec.ts` — CREATE. Open `/replay` over the canned event history, drag the scrubber playhead, assert the board state matches the scrubbed instant (snap semantics — no intermediate ghost states), step with arrow keys (event) and Shift-arrow (stage), assert playhead settles to an event boundary on release.
- `dashboard/tests/e2e/memory-crud.spec.ts` — CREATE. Create a memory entry, assert it appears in the roster and on disk in the fixture copy; edit it and assert the round-trip; delete via the inline inspector confirm (no modal) and assert removal; attempt a write to the derived `memory/index.md` path via the API and assert 403 with the envelope code — derived files are pipeline-enforced read-only (spec §3B decision on write enumeration).
- `dashboard/tests/e2e/config-edit.spec.ts` — CREATE. Load the config form, change a schema-valid value, save, assert the persisted file in the fixture copy carries the change AND that unrecognized keys present in the fixture config survive the save verbatim (spec §3B.9 drift tolerance); submit a schema-invalid value and assert the 400 `VALIDATION_FAILED` rejection surfaces in the form with no file change.
- `dashboard/tests/e2e/handoff-transition.spec.ts` — CREATE. On the management surface: perform the legal `planned → built` STATUS transition and assert both the UI state and the STATUS file in the fixture copy; then attempt the illegal `built → planned` (backward) transition via the API and assert 409, no write, no backup file created (spec §2b: illegal transition → 409, no write, no backup).
- `dashboard/tests/e2e/auth-failures.spec.ts` — CREATE. Raw-request assertions against the running harness server: no token → 401 with generic body (no failure-mode hint); wrong token → byte-identical 401; foreign `Origin`/`Host` → 403 pre-route; blocklisted path (`.env` planted in the fixture copy) requested through the read route → BLOCKED response, file content never returned (spec §4.6). Also assert the unauthenticated SPA shell shows its locked/unauthenticated state rather than leaking data.
- `dashboard/tests/e2e/leader-election.spec.ts` — CREATE. Two pages in one browser context (shared BroadcastChannel origin): assert only the leader holds the EventSource while both tabs render identical live updates from a scripted file write; close the leader; assert the follower re-elects, acquires the token via BroadcastChannel (no re-launch, fresh sessionStorage — spec §3B.14), resumes via `Last-Event-ID`, and continues receiving deltas from a second scripted write.
- `dashboard/tests/e2e/utils/selectors.ts` — MODIFY (additive only). Add any testid entries these flows require that T40's registry lacks; corresponding `data-testid` attributes are added to client components where genuinely missing.

## Acceptance criteria

- [ ] Every spec selects exclusively through `utils/selectors.ts` — zero inline selector strings, zero `getByText`, zero class/CSS-structure queries across all spec files.
- [ ] No `waitForTimeout` anywhere in the suite — all timing is web-first assertions/polling with Playwright's built-in retry (repo Playwright standard; the watcher settle window is absorbed, never slept over).
- [ ] Mission live-update proven end-to-end: a scripted fixture-copy file write becomes a visible board change with no reload — the full §2a read path exercised over the real watcher and SSE hub.
- [ ] Replay scrub proven: scrubbed board state snaps to the scrubbed instant, keyboard stepping works, playhead settles on release (spec §3A replay decisions).
- [ ] Memory CRUD, config round-trip (including unknown-key preservation), and both handoff outcomes (legal transition persisted; illegal transition → 409, no write, no backup) all pass.
- [ ] The §4.6 security cases pass at e2e level: 401 generic (byte-identical across missing/wrong token), 403 on foreign Host/Origin, BLOCKED on a blocklisted read, 403 on denylisted writes — asserted on both status code and envelope `code`, never on message text (spec §3B.15).
- [ ] Two-tab leader election proven: single EventSource under two tabs, follower token handoff over BroadcastChannel, re-election plus `Last-Event-ID` resume after leader close, both tabs converging to identical state.
- [ ] Suite is deterministic: two consecutive full runs green with no retries consumed; committed fixture tree untouched after runs.

## Test cases

- `mission board reflects checkbox flip without reload` — flip `- [ ]` to `- [x]` in a fixture-copy task file → roster row count increments; stage chip cross-fades in place.
- `mission stream shows appended ndjson event` — append a valid `v:1` event line → the event row appears in the live feed with its agent and type.
- `torn tail then completed line ingests once` — complete the fixture's torn last line then append → exactly one new event row, no duplicate, no error banner.
- `replay scrub snaps board to instant` — drag playhead to mid-history → board shows that instant's state, no transitional animation states asserted present.
- `arrow steps event, shift-arrow steps stage` — keyboard on the focused scrubber → playhead index changes by one event / one stage respectively.
- `memory create-edit-delete round-trips to disk` — each mutation reflected in roster AND in the fixture-copy file.
- `derived memory index write rejected` — POST targeting `memory/index.md` → 403, envelope code asserted, file unchanged.
- `config save preserves unrecognized keys` — fixture config carries an unknown key → after a valid save, the key survives verbatim.
- `invalid config value rejected without write` — schema-violating save → 400 `VALIDATION_FAILED` surfaced in-form, file mtime unchanged.
- `handoff planned→built succeeds` — UI transition → STATUS file reads `built`; `built→planned` via API → 409, STATUS still `built`, no `.bak` created.
- `missing and wrong tokens get identical 401s` — compare raw response bodies byte-for-byte.
- `foreign origin with valid token gets 403` — the token alone must not pass a cross-origin request.
- `blocklisted .env read returns BLOCKED with no content` — response contains no fragment of the planted file body.
- `two tabs, one EventSource` — count stream connections server-side (or via network inspection) with two tabs open → exactly one.
- `leader close re-elects and resumes` — close leader tab → follower shows live state from a post-close scripted write; no resync-required unless the buffer genuinely overran.

## Related context

- Spec §4.3 (live updates: burst coalescing, torn tail, SSE drop/resume, leader election) — enforced by mission-live-update, replay, and leader-election specs.
- Spec §4.4 (writes: conflict checks, handoff state machine, backups) — enforced by memory-crud, config-edit, handoff-transition specs.
- Spec §4.6 (security: 401 generic, 403 Host/Origin, traversal 404, BLOCKED reads) — enforced by auth-failures spec.
- Spec §4.2 (format drift renders parsed, not blank) — standing coverage via T40's fixture variants rendered in the browse flows.
- Spec §2a/§2b — the read and write paths these flows traverse end-to-end; §2b's "watcher echo, not POST response, is confirmation" explains why CRUD assertions poll the UI after mutation.
- Spec §3B.13/§3B.14/§3B.15 — SSE contract, token transport + BroadcastChannel handoff, error envelope codes the specs assert on.
- Repo Playwright conventions: `test.describe` grouping, built-in waits/assertions only, `data-testid` selectors via the shared registry, happy paths + accessibility + regressions focus.
- Deps: T40 (harness, fixture project, selector registry).

## Gotchas

- The harness's webServer is the REAL bin: the watcher settle window means file-write effects land ~150-300 ms later — always assert with web-first polling, never a sleep, and never assert "immediately after write".
- Scripted writes go to the per-run fixture COPY (the server's jail root), never the committed tree; writing to the committed path silently tests nothing and dirties the repo.
- Confirmation truth is the watcher echo, not the POST response (spec §2b) — after a CRUD action, assert the confirmed UI state (or on-disk state), not just the 2xx acknowledgment.
- Leader election needs both pages in the SAME browser context — separate contexts have separate BroadcastChannel origins/sessionStorage and will silently test two independent leaders.
- Assert on envelope `code`, never `message` (spec §3B.15 — message copy is freely editable).
- Adding a missing `data-testid` to a component is in scope; changing component behavior to make a spec pass is not — a behavioral gap found here is a finding to route back, not a quiet patch.
- The illegal-handoff 409 must also assert NO backup file appeared — the state machine rejects before the write pipeline runs (spec §2b).
