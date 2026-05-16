# Artefact Format

How long-form artefacts written under `.hyperflow/` should be structured so the user can open the file in their editor and grasp it in under 10 seconds.

Applies to:

- Task files — `.hyperflow/tasks/<slug>.md` (written by `scope`)
- Spec files — `.hyperflow/specs/<slug>.md` (written by `spec`)
- Audit files — `.hyperflow/audits/<YYYY-MM-DD-HHmm>-<scope>.md` (written by `audit`)
- Audit-fix specs — `.hyperflow/specs/audit-<date>-<slug>.md` (written by `audit` fix gate)

## Core conventions

- **No decorative icons** in any file (`⚡ ✓ ✗ ▸ → • 🚀 📦 ⚠️ 🟢 🔴 *` banned as label prefix per [output-style.md](output-style.md)).
- **Box-drawing characters allowed** for the status block at the top — they render in monospace editors and don't add semantic noise: `╭─╮╰─╯│`. Use sparingly; one box per file.
- **Progress bars are text-only:** `████████░░░░░░░░░░░░` (8 filled + 12 empty for 8/20). No coloured emoji bars.
- **Section headers** use plain `##` (H2) — never decorated with brackets or hashes for visual weight. The H2 itself is the weight.
- **Tables for any structured list of 3+ items** — file lists, batches, costs, severity counts. Easier to scan than bullet trees.
- **Inline file paths** stay in backticks (`` `path/to/file` ``) and end with a one-line role hint: `` `path/to/file` — what it does ``.
- **Severity / status words** are plain text, never coloured: `low / medium / high`, `pending / in_progress / completed`, `Critical / Important / Suggestion / Praise`.

## The status block (mandatory at top of every artefact)

A single bordered block that summarises the artefact's current state. The user reads this first; everything below it is detail.

```
╭─────────────────────────────────────────────────────────────────╮
│ Status      <in_progress | approved | completed>                │
│ Progress    ████████░░░░░░░░  7 / 15 sub-tasks (47%)            │
│ Branch      feat/<slug>                                         │
│ Commits     7 since main · per-task cadence                     │
│ Wall-clock  12m elapsed · ETA ~8m                               │
│ Tokens      thinking 145k · worker 220k · total 365k            │
╰─────────────────────────────────────────────────────────────────╯
```

Field rules:

- **Status** — one word from the artefact's lifecycle vocabulary
- **Progress** — only on task files; spec files use `Section 4/5 approved` style; audit files use `Verdict: NEEDS_FIX`
- **Branch / Commits** — only on task files
- **Wall-clock / Tokens** — only when live (skip on completed-and-archived files)
- Box width = 67 characters (fits most editor windows side-by-side)

When the artefact is completed and frozen, replace live counters with final totals and append `· final`.

## Visual dependency diagram

When an artefact has 3+ batches or sections with dependencies, include an ASCII flow under `## Execution plan` (task files) or `## Section dependencies` (spec files). Plain Unicode arrows only — no boxes, no colours.

```
Batch 1 — Doc surface alignment        (4 parallel)
  T1 · T2 · T3 · T4
       ↓
Batch 2 — Mirrors + schema             (7 parallel · depends on T1)
  T5 · T6 · T7 · T8 · T9 · T10 · T11
       ↓
Batch 3 — Wire compact subcommand      (1 sequential)
  T13
       ↓
Batch 4 — Final integration review     (1 sequential)
  T15
```

Use `↓` for sequential, ` · ` (space-dot-space) for parallel siblings on one line. Never draw boxes around batches — adds noise without information.

## Per-task / per-section line format

Each sub-task or section gets one checkbox line + one indented detail line. No multi-paragraph descriptions in task files (those go in the spec).

```
- [x] T1 — Writer · Author compaction protocol reference
       Read: spec, cache/SKILL.md · Create: skills/cache/references/compaction.md · Complexity: medium
- [ ] T2 — Implementer · Add memory.compactionThreshold to config/schema.json
       Modify: config/schema.json · Complexity: low
```

The detail line is two spaces indented + the file path(s) + complexity. Long task descriptions move to the spec file.

## Scope-at-a-glance table

When the artefact touches more than 5 files, include a roll-up table under `## Scope at a glance`. Helps the user see the blast radius without reading every batch.

```
| Surface       | Files | Created | Modified | Risk   |
|---------------|------:|--------:|---------:|--------|
| Docs          |     3 |       0 |        3 | low    |
| Skill bodies  |     7 |       0 |        7 | low    |
| Wiring        |     2 |       0 |        2 | medium |
| Runtime code  |     1 |       0 |        1 | medium |
| **Total**     |**13** |   **0** |   **13** |        |
```

Risk is the *integration* risk of that surface, not difficulty: `low / medium / high`. The Planner sets it from the triage classification.

## Affected-files grouping

Group by lifecycle, not by directory. The user wants to know what gets created vs what gets modified.

```
**Created (N)**
- `path/to/new-file.md` — one-line purpose

**Modified (N)**
- `path/to/existing.md` — one-line change description

**Skipped (confirmed N)**
- `path/to/skipped.md` — why it's not touched (e.g. "does not enumerate subcommands")
```

The `Skipped` section is mandatory when the spec lists files that the Planner consciously decided not to touch — prevents future implementers from re-asking "what about X?"

## Cost table

```
| Tier      | Agents | Tokens   |
|-----------|-------:|---------:|
| Thinking  |     16 |     ~80k |
| Worker    |     14 |    ~140k |
| **Total** | **30** | **~220k**|
```

Always at the bottom under `## Estimated cost`. After completion, replace with `## Actual cost` and the real numbers.

## Spec file additions

Spec files add three extra sections beyond the task-file template:

1. **TL;DR** — first H2 under the status block. 2–3 sentences in plain English. What the feature does + the single most important design decision.
2. **Components** — bullet list of named components (compact subcommand handler, Compaction Writer, etc.) with one-line role. Lets the Planner cross-reference Section 1 names without re-reading the architecture prose.
3. **Trade-offs accepted / rejected** — explicit list at the end of `## 3. Key decisions`. What the design said no to and why. Most useful section for future implementers and audit reviewers.

## Audit file additions

Audit files add a severity-counts block right under the status box:

```
╭─────────────────────────────────────────────────────────────────╮
│ Verdict     NEEDS_FIX                                           │
│ Scope       main..HEAD (13 files · 284 insertions)              │
│ Level       L3                                                  │
│ Findings    0 Critical · 4 Important · 4 Suggestions · 5 Praise │
╰─────────────────────────────────────────────────────────────────╯
```

Then findings are grouped by severity in this order: **Critical → Important → Suggestion → Praise**. Each finding:

```
### [Important] config/features.json:128 — cache.purpose omits `compact`

**Issue:** The `skills[].purpose` field for the cache skill still reads "Show, search, add, edit, prune, archive, clear, stats, migrate" — `compact` is missing.

**Fix:** Append `, off, compact` to the `purpose` string.

**Why it matters:** README and capabilities array both mention compact; this field is the third source of truth and drives the marketplace listing.
```

Three short blocks per finding (Issue / Fix / Why it matters). Each block is one short paragraph max — if a finding needs more, it's a design question, not an audit finding, and belongs in a spec.

## Chat output (the index, not the content)

The orchestrator's chat output during artefact creation should be the *index pointing at the file*, not the content. Keep these conventions:

- **One short status box** when the artefact is written (or finalized). Includes: file path, line count, lifecycle phase.
- **No file content** echoed into chat. Even for review summaries — the file is the source of truth.
- **Hand-off lines** are one sentence: `Plan ready — .hyperflow/tasks/<slug>.md (5 batches · 15 sub-tasks). Auto-chaining to /hyperflow:dispatch...`
- **Gate prompts** reference the file: `Design draft ready at .hyperflow/specs/<slug>.draft.md — review the file, then approve or revise.`

Chat scrolls; files persist. Long-form goes to files.

## When NOT to use this format

Two cases where the format relaxes:

1. **`fast` profile, single-sub-task chains.** A one-task, one-batch run is overkill for the full template. The minimum task file is: H1 title, Goal one-liner, single batch with one `[ ]` line, Status block. Skip Scope-at-a-glance, dependency diagram, cost table.
2. **Audit-fix specs derived from existing audit files.** Don't duplicate the Findings section — link back to the audit file in a `> Source: .hyperflow/audits/<file>.md` blockquote at top.
