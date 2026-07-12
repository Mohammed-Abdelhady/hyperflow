# T15 — Domain services: memory, markers, config, handoff, restore

## Task

Implement the five write-surface domain services: memory CRUD (with `memory/index.md` and `memory/.checksums` hard read-only), `.mode`/`.sticky` marker toggles, drift-tolerant config read/write (unrecognized keys preserved verbatim), the handoff STATUS state machine (planned → built → reviewed, forward-only, anything else → 409-class typed error), and the restore-from-backup action that reinstates a pre-write backup through the same conflict-checked write door.

## Why

These services ARE the closed write-surface enumeration (spec §1: "Write surface is a closed enumeration", §3B decision 8 layer e). Every mutation the dashboard can ever perform funnels through them into the single write door built in phase 3 — enforcing read-only rules and state machines here, in the service layer, is what makes the guarantees hold regardless of UI affordances or future route additions.

## Scope

**IN:**
- `memory.ts`: list/read/create/update/delete over `.hyperflow/memory/<category>.md` entries, composed on the phase-2 memory parser for reads and the write door for mutations; hard refusal of `index.md` and `.checksums` as targets.
- `markers.ts`: read + toggle of `.hyperflow/.mode` and `.hyperflow/.sticky` marker files.
- `config.ts`: read of `~/.hyperflow/config.json` with drift tolerance (keys outside the schema surfaced as "unrecognized keys", preserved verbatim through writes, never stripped); writes validated against the shared Zod mirror of `config/schema.json`.
- `handoff.ts`: handoff package reads plus the STATUS transition state machine — planned → built → reviewed only, forward-only; illegal transitions rejected with a typed conflict error BEFORE any write or backup happens.
- `restore.ts`: restore-from-backup service action — lists session backups for a target, reinstates a chosen backup through the conflict-checked write door (mtime + content-hash precondition against the CURRENT on-disk file).
- Unit tests for all five.

**OUT:**
- The write door itself (`services/write.ts`, T10) and the jail/denylist/blocklist modules (phase 3) — consumed, not built.
- HTTP routes (T17) — services expose typed functions and throw typed domain errors; no status codes here.
- The error-mapper middleware (T16) — services throw typed error classes; mapping to `{code,message,details?}` + HTTP status happens there.
- Config editor UI, marker UI, handoff panel (client phases).
- Backup creation — the write door makes pre-write backups; restore only consumes them.

## Files in scope

- `dashboard/src/server/services/memory.ts` — create. CRUD composition: reads go through the phase-2 memory parser (tagged AND legacy-untagged shapes); create/update/delete serialize the entry back into its category file and submit through the write door with the mtime + content-hash precondition captured at read time. Any operation whose resolved target is `memory/index.md` or `memory/.checksums` throws the typed forbidden-path error without reaching the write door — belt on top of the pipeline-denylist braces.
- `dashboard/src/server/services/markers.ts` — create. Read current marker values; toggle writes the new marker content through the write door. Missing marker file reads as the documented default state, not an error.
- `dashboard/src/server/services/config.ts` — create. Read: parse the global config, validate against the shared Zod mirror, partition into recognized keys + unrecognized keys (e.g. the `cleanup` block and provider entries — spec §3B decision 9); both parts returned, nothing dropped. Write: validate the recognized payload against the mirror, merge unrecognized keys back verbatim, submit through the write door with conflict precondition. Free-text JSON writes stay schema-checked too — drift tolerance applies to reads, conformance to writes.
- `dashboard/src/server/services/handoff.ts` — create. Reads over `.hyperflow-handoff/<slug>/` (HANDOFF.md, STATUS, COMPLETION.md via phase-2 handoff parser). Transition function: load current STATUS, check the requested transition against the forward-only machine planned → built → reviewed; legal → write new STATUS through the write door; illegal (backward, skipping, unknown state, same-state) → throw the typed illegal-transition conflict error with current + requested states in its details; no write, no backup (spec §2b).
- `dashboard/src/server/services/restore.ts` — create. Enumerate the session backup copies the write door created for a given target; restore submits the backup content through the standard write door path (jail → denylist → new pre-write backup of the current file → temp+fsync → rename) with a conflict check against the current on-disk state — a restore is just another guarded write (spec §4.4).
- `dashboard/tests/unit/services/memory.test.ts`, `markers.test.ts`, `config.test.ts`, `handoff.test.ts`, `restore.test.ts` — create. Per-service units against fixture files in temp directories.

## Acceptance criteria

- [ ] Memory CRUD refuses `index.md` and `.checksums` as targets with a typed forbidden-path error — verified at the service layer even with the pipeline denylist mocked out.
- [ ] Every mutation in all five services goes through the write door — zero direct `fs` write calls in any service file (lint rule passes; test greps confirm).
- [ ] Illegal handoff transition (built → planned, planned → reviewed, reviewed → anything, unknown → anything) throws the typed conflict error and provably performs no write and creates no backup.
- [ ] Legal handoff transitions planned → built and built → reviewed succeed and persist.
- [ ] Config read surfaces unrecognized keys separately without stripping them; a config write round-trips unrecognized keys byte-preserved while rejecting schema-invalid recognized keys.
- [ ] A write whose target changed on disk since read (mtime/content-hash mismatch) throws the typed write-conflict error — never last-write-wins (spec §4.4).
- [ ] Restore reinstates a backup only through the conflict-checked write door, and itself produces a fresh pre-write backup of the file it overwrites.
- [ ] All files under 300 lines; no `any`; services throw typed error classes only — no HTTP status codes, no hand-built error bodies.

## Test cases

- Memory: create entry in `memory/decisions.md` → file contains the new entry in current tagged shape; update it → precondition passes on unchanged file; delete it → entry gone, siblings intact.
- Memory: update attempt against `memory/index.md` → typed forbidden-path error; write door never invoked (spy assertion).
- Memory: external edit to the category file between read and update → typed write-conflict error; file content is the external edit, untouched.
- Markers: toggle `.mode` twice → original value restored; read with `.sticky` absent → default state returned, no throw.
- Config: fixture config containing a `cleanup` block absent from the schema → read returns it under unrecognized keys; save of an edited recognized key → written file still contains `cleanup` verbatim.
- Config: write payload with a schema-invalid recognized key → typed validation error, file untouched.
- Handoff: STATUS `planned`, transition to `built` → ok; then to `reviewed` → ok; then to `built` → typed illegal-transition error carrying `{current: "reviewed", requested: "built"}` details; STATUS file unchanged and no new backup file exists.
- Restore: write entry (backup created) → externally corrupt the file → restore the backup → content reinstated AND a backup of the corrupted version now exists; restore against a target modified after backup enumeration → conflict error.
- E2E (with T16/T17 in place, Playwright over the fixture project): memory entry created via the API appears on disk and echoes back over SSE; illegal STATUS jump via the API returns 409 and the STATUS file on disk is unchanged.

## Related context

- Spec §1 — boundary rows: services → write pipeline ("the only write door"), routes → services; write-surface closed enumeration under Key structural decisions.
- Spec §2b — write path diagram: the 409-no-write-no-backup rule for illegal handoff transitions; watcher echo (not POST response) as confirmed-state truth.
- Spec §3B decision 8 (five security layers — layer e is this task's write allowlist), decision 9 (drift-tolerant config), decision 15 (typed domain errors — thrown here, mapped in T16).
- Spec §4.4 — every edge in this section is this task's checklist: conflict precondition, writes-during-dispatch disjointness, restore-through-the-write-door, observe mode on read-only fs.
- Shared schemas consumed (T2): `shared/schemas/config.ts` (Zod mirror of `config/schema.json` — config service), `shared/schemas/snapshot.ts` (memory-entry and handoff-package shapes — memory + handoff services), `shared/schemas/api.ts` (typed error code constants the domain error classes carry).

## Gotchas

- Services own logic, routes own transport — no `Response` objects, no status codes, no JSON envelopes in this layer; throw typed errors and let T16's mapper translate.
- Illegal handoff transition means NO side effects at all — the backup step must sit after the state-machine check, or a rejected transition still litters backup files.
- Unrecognized config keys are preserved on write, not just on read — the merge must happen at save time or a round-trip silently destroys them (spec decision 9's exact failure mode).
- Writes preserve each file's original line-ending style and BOM (spec §4.2) so diffs stay clean — rely on the write door/serializers for this; do not hand-normalize.
- Restore is not a special path: if it bypasses the door "because it's already our own backup", the jail/denylist/conflict guarantees silently die. Through the door, always.
- Read-only filesystem (spec §4.4): a write-door failure with a permissions error must surface as its typed error so T16 can flip observe mode — do not swallow or retry.
- security-reviewer co-signs this task: the index.md/.checksums refusal, the write-door exclusivity, and the no-side-effects-on-reject rule are the security surface.
