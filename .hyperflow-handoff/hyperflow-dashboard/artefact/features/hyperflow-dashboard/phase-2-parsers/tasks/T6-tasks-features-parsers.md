# T6 — Tasks + features parsers + golden fixtures

## Status

| Field       | Value              |
|-------------|--------------------|
| Status      | pending            |
| Complexity  | m                  |
| Depends on  | T5                 |
| Specialist  | backend-reviewer   |

## Task

Implement the two task-artefact surface parsers — `tasks.ts` for flat `.hyperflow/tasks/<slug>.md` files (frontmatter shape AND terse-roster shape) and `features.ts` for multi-phase `.hyperflow/features/<slug>/` trees (feature.md + phase folders + nested tasks/) — with unit tests and golden fixtures for every format variant.

## Why

Task and feature artefacts are the dashboard's primary live surfaces: Mission Control progress, the plans browser, and the features drill-down all render from these parses, and dispatch rewrites them mid-chain. They are also the two shapes with the widest real-world drift (two documented task-file formats plus a checkbox-only legacy fallback), so this is where the parse-or-degrade contract earns its keep.

## Scope

**IN:**
- `dashboard/src/server/parser/tasks.ts` — parse one flat task file into the shared task-snapshot shape, accepting both documented shapes plus the no-status-block fallback.
- `dashboard/src/server/parser/features.ts` — parse a feature tree: `feature.md` overview, each `phase-<n>-<name>/phase.md`, and each nested `tasks/T<id>-<slug>.md` brief (brief files parse via `tasks.ts` single-file logic, composed — not re-implemented).
- Unit tests under `dashboard/tests/unit/parser/` and fixtures under `dashboard/tests/fixtures/golden/tasks/` and `dashboard/tests/fixtures/golden/features/`.

**OUT:**
- The parse primitives themselves — T5 owns them; this task composes them.
- Memory, audits, specs parsers — T7. Handoff, background, config, events — T8.
- Snapshot assembly across surfaces, watching, deltas — phase-3 service territory; `features.ts` receives paths/contents from the service layer per the spec boundary ("Services hand absolute paths in-jail"), it never discovers roots itself.
- Any write to task or feature files — task files are NEVER dashboard-written (spec §3B decision 8; write-pipeline denylist).

## Files in scope

**Read**
- `dashboard/src/server/parser/primitives/*` (T5) — status-block, frontmatter, checkboxes, fallback.
- `dashboard/src/shared/schemas/snapshot.ts` (phase-1 T2) — the task/feature snapshot sub-schemas the outputs must `z.infer` from.
- `skills/hyperflow/task-tracking.md` — the frontmatter task-file format (Objective, Research Findings, Files in Scope, Dependencies, Sub-tasks, Acceptance Criteria, Progress, Learnings, Blocked).
- `skills/hyperflow/artefact-format.md` — the terse-roster format (status block + roster lines + detail lines + Execution plan + Estimated/Actual cost).
- `skills/hyperflow/feature-phases.md` — feature.md / phase.md / tasks/T\<n\>-\<slug\>.md templates and the status-rollup rules.
- `skills/status/SKILL.md` — the checkbox-count fallback for status-less files.

**Create**
- `dashboard/src/server/parser/tasks.ts` — single-file task parser. Detection order per file: (1) frontmatter shape — T5 `frontmatter.ts` finds a valid `---` fence with `id`/`status` keys → parse frontmatter metadata + H2 sections (`## Objective`, `## Sub-tasks` checkbox roster via T5 `checkboxes.ts`, `## Acceptance Criteria` checkboxes, `## Progress` timestamped lines, `## Dependencies`, `## Learnings`, `## Blocked`); (2) terse-roster shape — a `## Status` block (either style, via T5 `status-block.ts`) + roster checkbox lines with `T<id> — <Role> · <title>` labels and indented detail lines (Read/Modify/Create/Complexity/Specialist/Brief), plus optional `## Execution plan` batch diagram (captured raw), `## Scope at a glance` and `## Estimated cost`/`## Actual cost` tables (parsed as generic tables — the cost table feeds the token analytics per spec §3B decision 7); (3) fallback — no frontmatter and no status block → derive done/running/pending counts from raw checkbox scanning (the status/SKILL.md contract) and mark the parse `derived` in parse-health (spec §4.2). Output: one shared-schema task node carrying slug (from filename), detected format, status, progress {done, running, pending, total}, sub-task list (id, role, title, state incl. in-flight, detail parts where present), and raw body. Any failure → T5 fallback node, never a throw.
- `dashboard/src/server/parser/features.ts` — feature-tree parser operating on a provided file map (path → content) for one `features/<slug>/` tree. Parses `feature.md` (H1 `# Feature: <Name>`, status table with Status/Phases/Branch/Specialists, `## Goal`, `## Phases` numbered list with per-phase status words and depends-on parentheticals, `## Phase dependency graph` fenced block captured raw); each `phase-<n>-<kebab-name>/phase.md` (H1, status table with Status/Progress/Depends on/Specialists, `## Goal`, `## Exit criteria` checkboxes, `## Tasks` roster lines with `→ tasks/T<id>-<slug>.md` pointers, `## Artefacts` list); and each nested `tasks/T<id>-<slug>.md` via the `tasks.ts` single-file parser. Phase ordering comes from the numeric folder prefix. Cross-checks roster checkbox state in `phase.md` against the pointed-at brief's own status and records mismatches as diagnostics (not errors). Missing optional files (`spec.md`, `research.md`, `decisions.md`) are recorded as absent, present ones captured raw for the artefact rail. A malformed member file degrades THAT node to fallback while the rest of the tree parses — one broken brief never degrades the whole feature.
- `dashboard/tests/unit/parser/tasks.test.ts`, `dashboard/tests/unit/parser/features.test.ts` — golden-fixture contract tests.
- `dashboard/tests/fixtures/golden/tasks/` and `dashboard/tests/fixtures/golden/features/` — fixture sets enumerated under Test cases (the features fixture is a directory tree, matching how the real artefact ships).

## Acceptance criteria

- [ ] `tasks.ts` parses BOTH documented shapes — frontmatter style and terse-roster style — into the same shared-schema task node, recording the detected format per file (spec §4.2: format detection per file, not per project).
- [ ] A task file with no status block and no frontmatter still yields counts via the checkbox fallback and is flagged `derived`, matching the status/SKILL.md contract.
- [ ] `[~]` in-flight markers surface as a distinct sub-task state and are included in totals.
- [ ] `features.ts` parses feature.md + every phase.md + every nested brief, preserves numeric phase order, and resolves `→ tasks/T<id>-<slug>.md` roster pointers to their parsed brief nodes.
- [ ] Per-node degradation: a corrupt brief or phase.md inside an otherwise-valid tree produces a fallback node for that file only; sibling nodes parse normally.
- [ ] Parse-or-degrade holds: neither parser throws on any fixture, including truncated and binary-garbage inputs — verified by explicit tests.
- [ ] Golden fixtures pin both task-file styles AND both status-block styles (table and key-line) across the fixture set.
- [ ] All outputs are `z.infer` of phase-1 shared schemas; no `any`; both source files under 300 lines (compose T5 primitives — no re-implemented table/checkbox scanning).
- [ ] `npm run lint`, typecheck, and the Vitest suite pass in `dashboard/`.

## Test cases

Fixtures in `dashboard/tests/fixtures/golden/tasks/`:

- `frontmatter-full.md` — the task-tracking.md template shape (frontmatter id/status/complexity/created/updated + Objective + Sub-tasks with 2 done / 4 pending + Acceptance Criteria + Progress + Learnings) → format `frontmatter`, status `in-progress`, done=2 total=6, sub-task labels extracted.
- `roster-table-status.md` — terse-roster file with table status block, 3 roster lines (`- [x] T1 — Writer · …` with detail lines incl. one `Brief:` pointer), Execution plan diagram, Estimated cost table → format `roster`, status-block map populated, T1 detail parts `{files, complexity, specialist, brief}`, cost table rows captured.
- `roster-keyline-status.md` — roster file whose status is the key-line style (`Sub-tasks: 1 / 3`, `Tokens used: …`, `Wall-clock: …`, `ETA: …`) with one `- [~]` line → format `roster`, style `keyline`, running sub-task identified, done=1 running=1 pending=1.
- `no-status-checkboxes-only.md` — checkboxes but no status block/frontmatter → `derived` flag, counts from raw scan.
- `torn-mid-write.md` — roster file truncated mid table row (spec §4.2 torn artefact) → fallback node, `parseError: true`, raw body preserved.
- `bom-crlf-roster.md` — BOM + CRLF twin of `roster-table-status.md` → identical parse result.

Fixture tree in `dashboard/tests/fixtures/golden/features/checkout-redesign/` (mirrors the feature-phases.md example): `feature.md` (Phases `2 / 3 complete`, three-entry `## Phases` list, dependency graph), `phase-1-data-layer/phase.md` (completed, all roster boxes checked) + `tasks/T1-schema.md`, `phase-2-api/phase.md` (in_progress, `- [~]` on T3, `Depends on phase-1`) + `tasks/T3-handlers.md`, `phase-3-ui/phase.md` (pending, empty tasks/) → feature node with 3 ordered phases, phase-2 progress reflects the in-flight marker, phase-3 parses with zero briefs. Plus `broken-brief/` variant tree where one `tasks/T2-*.md` is binary garbage → that brief is a fallback node, tree still parses.

Integration scenario (Vitest, real repo files): parse this repository's real `.hyperflow/features/hyperflow-dashboard/phase-2-parsers/phase.md` (this phase's own roster) via the phase.md logic in `features.ts` → status table parsed (Status `pending`, Depends on `phase-1-foundations`), 4 roster lines each resolving a `→ tasks/T<id>-*.md` pointer, exit-criteria checkboxes counted; zero throws.

E2E: N/A — no browser surface at this layer; composed-loop coverage lands in T40/T41.

## Related context

The frontmatter task shape the parser must accept (task-tracking.md):

```markdown
---
id: implement-user-auth
status: in-progress | blocked | in-review | completed
complexity: simple | medium | complex
created: 2026-05-15T14:30:00Z
updated: 2026-05-15T15:00:00Z
---

## Sub-tasks
- [x] Define JWT payload types in auth.ts
- [ ] Add token refresh rotation logic
```

The terse-roster shape (artefact-format.md):

```
- [x] T1 — Writer · Author compaction protocol reference
       Read: spec, cache/SKILL.md · Create: skills/cache/references/compaction.md · Complexity: medium · Specialist: searcher · Brief: <slug>/T1.md
- [ ] T2 — Implementer · Add memory.compactionThreshold to config/schema.json
       Modify: config/schema.json · Complexity: low · Specialist: backend-reviewer
```

The phase roster line with pointer (feature-phases.md phase.md template):

```
- [x] T1 — <Role> · <one-line task> · Specialist: <reviewer>   → `tasks/T1-<slug>.md`
```

The feature.md phases list (feature-phases.md): numbered entries `1. **phase-1-<name>** — <goal> — \`completed\`` with `(depends on phase-N)` parentheticals; Phases bar `` `██████░░░` 2 / 3 complete `` in the status table.

The checkbox fallback for status-less files (status/SKILL.md): count `^- \[x\]`, `^- \[~\]`, `^- \[ \]`; total = done + running + pending.

Sibling briefs: T5 (primitives this task composes), T7/T8 (parallel Batch 2 siblings — no shared files; the only shared surface is T5's primitives and phase-1 schemas).

## Gotchas

- **Dual-contract reality:** both task shapes are current doctrine, not legacy-vs-new — task-tracking.md documents frontmatter, artefact-format.md documents roster, and real projects hold both (spec §4.2). Never assume one shape per project; detect per file.
- **`[~]` flips constantly during dispatch** — it is the single most frequently rewritten character in a live tree. Treat running as a first-class state in the schema, not a bool on done.
- **Task files are read-only to the dashboard** (spec §3B decision 8: "task files are NEVER dashboard-written" — enforced in the write-pipeline denylist). Nothing in these parsers may normalize-and-persist; parse output is snapshot data only.
- **Trivial sub-tasks carry no Brief pointer** (artefact-format.md) — the detail line's `Brief:` segment is optional; do not degrade a roster line for lacking it. Same for detail lines entirely absent on trivial lines.
- **Phase folders encode order in the name** (`phase-<n>-<kebab-name>`) — sort numerically on `<n>`, not lexically (phase-10 after phase-9).
- **A feature tree is many files with independent blast radii** — degrade per node, never per tree. One hand-edited brief must not blank the features surface.
- **BOM/CRLF** (spec §4.2): rely on T5's shared normalization at the read boundary; do not re-normalize inside surface parsers.
- **300-line cap:** `features.ts` risks bloat (three file kinds). It composes `tasks.ts` for briefs and T5 primitives for tables/checkboxes; if feature.md + phase.md parsing still pushes past ~250 lines, split a `features-phase.ts` helper per artefact type rather than compressing.
- **Cost tables feed T-phase-4 analytics** — capture `## Estimated cost` / `## Actual cost` rows faithfully (Role/Agents/Tokens columns, `**Total**` row) even though this phase does no aggregation.
