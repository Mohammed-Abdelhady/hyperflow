# phase-8-core-emission

## Status

| Field       | Value                                          |
|-------------|------------------------------------------------|
| Status      | pending                                        |
| Progress    | `░░░░░░░░░░` 0 / 4 tasks (0%)                  |
| Depends on  | `phase-1-foundations`                          |
| Specialists | `backend-reviewer, api-reviewer, devops-reviewer` |

## Goal

Add the only hyperflow-core surface the dashboard needs: additive machine-readable event emission — `scripts/emit-event.sh` appending one NDJSON line per event to `.hyperflow/events.ndjson` from three hook points (dispatch Step 2d status updates, background registry writes, `scripts/queue-commit.sh`), governed by the public-contract ADR `skills/hyperflow/events.md` — plus the release plumbing for the `dashboard/` subpackage (version sync, validator ignore, gitignore). Every core edit is ADDITIVE-ONLY: zero breakage of anything the 18 existing skills parse, zero new required behavior for old plugin versions, and emission that can never fail a running chain (spec §2 events path, §3B.6, §5 core-touched table).

## Exit criteria

- [ ] Lines emitted by `scripts/emit-event.sh` validate against the shared event-line Zod schema (`dashboard/src/shared/schemas/event-line.ts`, phase-1 T2) — verified by integration test.
- [ ] All existing plugin tests and validators still pass: `python3 scripts/validate-plugin.py` reports PASSED on the modified tree, and `scripts/queue-commit.sh` / `scripts/bump-version.sh` keep their existing exit codes, output lines, and behavior on trees the new files don't exist in.
- [ ] Old-plugin projects are unaffected: no `.hyperflow/events.ndjson` is ever created outside a `.hyperflow/`-initialized project, every hook point is a silent no-op when `scripts/emit-event.sh` is absent, and an emission failure never changes any caller's exit code (the dashboard's markdown-only fallback per spec §2c stays fully supported).
- [ ] `skills/hyperflow/events.md` documents the line schema `{v, ts, chain, skill, type, batch?, task?, status?, agent?, tokens?, detail?}`, the `v`-gate rule, the additive-only evolution rules, and the three-touchpoint list — the type vocabulary used by T36/T37 comes from this file, nowhere else.

## Tasks

- [ ] T35 — Implementer · emit helper + public contract ADR · Specialist: backend-reviewer, api-reviewer   → `tasks/T35-emit-helper-contract.md`
- [ ] T36 — Writer · dispatch emit instruction · Specialist: backend-reviewer (trivial — no brief)
- [ ] T37 — Implementer · queue-commit + background emit hooks · Specialist: backend-reviewer   → `tasks/T37-queue-background-emit-hooks.md`
- [ ] T38 — Implementer · release integration · Specialist: devops-reviewer   → `tasks/T38-release-integration.md`

T36 scope (roster-only): in `skills/dispatch/SKILL.md` Step 2d, the "**Update the task file's `## Status` block** after each commit lands" bullet gains one appended emit instruction — call `scripts/emit-event.sh` (when it exists) after each Status-block/checkbox write, with the `task-status` type from `skills/hyperflow/events.md`. Pure insertion; the existing bullet text, the `/hyperflow:status` grep contract it names, and every other line of the skill stay byte-identical.

## Batch order

```
Batch 1 — Contract + release plumbing   (2 parallel)
  T35 · T38
       ↓
Batch 2 — Emit hook points              (2 parallel · depend on T35)
  T36 · T37
```

T36 and T37 consume T35's ADR type vocabulary and helper interface — they cannot start until T35 lands. T38 touches disjoint files (release plumbing only) and has no dependency inside the phase.
