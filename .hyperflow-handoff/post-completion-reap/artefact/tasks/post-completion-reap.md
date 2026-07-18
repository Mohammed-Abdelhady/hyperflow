# Post-Completion Reap

## Status

| Field | Value |
|---|---|
| Status | pending |
| Progress | `░░░░░░░░░░░░░░░░░░░░` 0 / 8 sub-tasks (0%) |
| Branch | selected by dispatch |
| Commits | 8 planned · one accepted sub-task per conventional commit |
| Specialists | `architect, backend-reviewer, devops-reviewer, security-reviewer, docs` |

## Goal

Add a scope-aware **reap** phase that garbage-collects a finished task's entire artefact scope — task file, brief dir, viewer JSON twin, draft specs, feature tree, and ephemeral session leftovers — archive-first and memory-preserving, firing automatically at every lifecycle terminus (dispatch wrap-up, deploy end, handoff `complete`) and available as `/hyperflow:reap <slug>`, then reporting exactly what it removed.

## Why

A cleanup engine already exists (`scripts/archive-artefacts.py`) but is mtime-driven, session-start-only, blind to actual completion, and leaks orphans: brief dirs (`tasks/<slug>/`), viewer JSON twins (`artefacts/*.json`), `*.draft.md` specs, and unbounded `usage/*.jsonl` + `.session-start.log`. deploy does no cleanup; handoff only archives its own package manually. Reap unifies the scattered primitives behind one deliberate, slug-scoped pass with a report.

> Design source: `.hyperflow/specs/post-completion-reap.md`

## Triage

| Field | Value |
|---|---|
| Types | `architect, devops, backend, test, docs, security` |
| Complexity | complex |
| Scope | system-wide |
| Risk | reversible (archive-first); deletion paths are the sharp edge |
| Ambiguity | 0.15 after clarification |
| Flow | deep |
| Integration risk | medium-high (edits 3 live lifecycle skills) |

## Scope at a glance

| Surface | Files | Created | Modified | Risk |
|---|---:|---:|---:|---|
| Reaper engine + config | 5 | 2 | 3 | high |
| Skill + lifecycle wiring | 5 | 1 | 4 | medium-high |
| Doctrine + docs + verify | 6 | 0 | 6 | low |

## Disposition policy (the contract every sub-task upholds)

- **Archive (reversible):** task file · brief dir · specs (+`.draft.md`) · feature tree · JSON twins → promote learnings, then move to `.hyperflow/archive/`.
- **Hard-delete (ephemeral):** `usage/*.jsonl` > retention · `.session-start.log` > `logMaxLines` · terminal `background/bg-*.md` > 7d · empty/settled `commits-queue/`.
- **Preserve + optimize (memory):** durable `*.md` never deleted; rebuild index, drop orphaned refs, compact oversized.
- **Never touch:** `.version` · `.last-cleanup` · active queue · in-flight work · `.hyperflow-handoff` (handoff owns it).

## Batches

### Batch 1 — Foundations (parallel)

- [ ] **T1** — `cleanup` config block (schema + defaults) · `security-reviewer`,`devops-reviewer`
  - Modify: `config/schema.json`, `config/defaults.json` · Create: `tests/test_config_cleanup.py`
  - Acceptance: `cleanup` object legal in schema (fixes `additionalProperties:false` rejection of existing keys); properties `auto`,`staleDays`,`pruneDays`,`reapOnComplete`,`usageRetentionDays`,`logMaxLines`,`dryRun` with defaults + bounds; existing `~/.hyperflow/config.json` cleanup blocks validate.
  - Brief: `post-completion-reap/T1.md`

- [ ] **T2** — `archive-artefacts.py`: dir-aware + JSON-twin + `--slug` mode · `backend-reviewer`,`security-reviewer`
  - Modify: `scripts/archive-artefacts.py`, `tests/test_archive_artefacts.py`
  - Acceptance: archives directories (brief dirs) not just `*.md`; collects `artefacts/*/<slug>.json` twins alongside their artefact; new `--slug <slug>` mode archives one slug's whole scope (promote-then-move) with path-under-`.hyperflow` assertion; existing daily-sweep behavior unchanged.
  - Brief: `post-completion-reap/T2.md`

### Batch 2 — Reaper engine (depends B1)

- [ ] **T3** — `scripts/reap.py` core + tests · `architect`,`backend-reviewer`,`security-reviewer`
  - Create: `scripts/reap.py`, `tests/test_reap.py`
  - Acceptance: `reap.py --slug S [--dry-run] [--force]` resolves flat/feature/spec scope; delegates archive to `archive-artefacts.py --slug`; hard-deletes ephemeral per retention; runs memory index-rebuild + orphaned-ref prune + compact-advisory (never deletes durable); refuses non-terminal slugs without `--force`; idempotent; slug validated `[a-z0-9-]+`; every path asserted under `.hyperflow/`; emits JSON report to stdout.
  - Brief: `post-completion-reap/T3.md`

### Batch 3 — Skill + lifecycle wiring (depends B2)

- [ ] **T4** — `skills/reap/SKILL.md` (command + reap-phase contract + report render) · `architect`,`devops-reviewer`
  - Create: `skills/reap/SKILL.md`
  - Acceptance: documents `/hyperflow:reap <slug>` (+ `--dry-run`); defines the reusable reap-phase the lifecycle skills call; renders the Reap Report block and appends `archive/.reap-log.jsonl`; never touches source code; refuses non-terminal without explicit `--force`.
  - Brief: `post-completion-reap/T4.md`

- [ ] **T5** — Register skill in manifests + README · `devops-reviewer`,`docs`
  - Modify: plugin manifest(s) under `.claude-plugin/` + `.codex-plugin/`, skills listing, `README.md`
  - Acceptance: `reap` skill discoverable on Claude Code + Codex; appears in README skill table with trigger phrases; no manifest schema breakage.
  - Brief: `post-completion-reap/T5.md`

- [ ] **T6** — Wire lifecycle hook-ins (dispatch / deploy / handoff) · `backend-reviewer`,`security-reviewer`,`architect`
  - Modify: `skills/dispatch/SKILL.md`, `skills/deploy/SKILL.md`, `skills/handoff/SKILL.md`
  - Acceptance: dispatch Step 4, deploy Step 7, and handoff `complete` invoke the reap phase gated on `cleanup.reapOnComplete`; each prints the Reap Report; dispatch's ad-hoc task-file delete is replaced by the reap phase; no auto-run on non-terminal state.
  - Brief: `post-completion-reap/T6.md`

### Batch 4 — Doctrine, docs, verification (depends B3)

- [ ] **T7** — Doctrine + references · `docs`,`architect`
  - Modify: `skills/hyperflow/DOCTRINE.md` (Layer 10), `skills/hyperflow/task-tracking.md`, `skills/hyperflow/feature-phases.md`, `skills/hyperflow/memory-system.md`
  - Acceptance: Layer 10 describes reap-on-completion + disposition policy; task/feature lifecycle docs point to reap as the terminal step; memory-system states the preservation guarantee; no reference drift (run drift detector).
  - Brief: `post-completion-reap/T7.md`

- [ ] **T8** — Config docs + CHANGELOG + end-to-end verification · `docs`,`devops-reviewer`
  - Modify: `docs/orchestration.md`, `CHANGELOG.md` · Verify: reap a real fixture slug
  - Acceptance: `cleanup.*` documented; CHANGELOG entry added; end-to-end run on a fixture proves archive+preserve+delete+report and idempotency; `--dry-run` mutates nothing.
  - Brief: `post-completion-reap/T8.md`

## Open questions

None — safety model (archive-first), triggers (auto at all termini + manual), and memory scope (preserve durable) are resolved.

## Verification plan

- Unit: `tests/test_config_cleanup.py`, `tests/test_archive_artefacts.py`, `tests/test_reap.py`.
- Integration: reap a completed fixture task → assert artefacts moved to `archive/`, durable memory intact, ephemeral gone, report emitted; reap again → no-op.
- Safety: slug traversal attempt refused; non-terminal slug refused without `--force`; `--dry-run` produces a plan with zero filesystem mutation.
- Regression: existing daily session-start sweep behavior unchanged.
