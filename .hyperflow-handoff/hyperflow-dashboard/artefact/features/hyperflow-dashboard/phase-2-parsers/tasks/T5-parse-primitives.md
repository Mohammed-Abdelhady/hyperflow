# T5 — Parse primitives + golden fixtures

## Status

| Field       | Value              |
|-------------|--------------------|
| Status      | pending            |
| Complexity  | m                  |
| Depends on  | T2 (phase-1-foundations — shared Zod schemas) |
| Specialist  | backend-reviewer   |

## Task

Implement the four shared parse primitives every surface parser composes over — status-block extraction (both styles), YAML-frontmatter extraction, checkbox/roster counting (including `[~]`), and the raw-fallback constructor — plus their unit tests and the status-block golden-fixture set.

## Why

Every one of the 9 surface parsers (T6-T8) reads status blocks, checkboxes, or frontmatter. Centralizing that format knowledge in `primitives/` means one place where the dual-format contract lives, one fixture suite pinning it, and surface parsers that stay under the 300-line cap by composing instead of re-implementing. Nothing in Batch 2 can start until these exist.

## Scope

**IN:**
- `dashboard/src/server/parser/primitives/status-block.ts` — parse `| Field | Value |` markdown tables AND plain `Key:` lines into one normalized field map.
- `dashboard/src/server/parser/primitives/frontmatter.ts` — extract and parse the YAML frontmatter block delimited by `---` fences at document start.
- `dashboard/src/server/parser/primitives/checkboxes.ts` — count and extract `- [ ]` / `- [x]` / `- [~]` lines, per-document and per-section, and split roster lines into their structured parts.
- `dashboard/src/server/parser/primitives/fallback.ts` — construct the raw-markdown fallback node with `parseError` flag (the degrade half of the parse-or-degrade contract).
- Input normalization shared by all four: BOM strip + CRLF→LF at read boundary (may live in one of the four files or a sibling helper inside `primitives/` — implementer's call, but it must be a single shared function).
- Unit tests under `dashboard/tests/unit/parser/primitives/` and golden fixtures under `dashboard/tests/fixtures/golden/status-block/`.

**OUT:**
- Any surface parser (`tasks.ts`, `features.ts`, `memory.ts`, `audits.ts`, `specs.ts`, `handoff.ts`, `background.ts`, `config.ts`, `events.ts`) — owned by T6/T7/T8.
- Shared Zod schema definitions — owned by phase-1 T2; this task imports them, never defines wire shapes.
- File watching, settle/integrity heuristics, snapshot assembly — phase-1/phase-3 territory.
- NDJSON line handling — T8 (`events.ts` does not use markdown primitives).

## Files in scope

**Read**
- `dashboard/src/shared/schemas/snapshot.ts` (phase-1) — the normalized shapes the primitives' outputs must conform to; primitive return types are `z.infer` of the relevant sub-schemas.
- `skills/hyperflow/artefact-format.md` — the status-block table contract, field rules, roster line shape.
- `skills/status/SKILL.md` — the key-line grep contract (`Sub-tasks:`, `Tokens used:`, `Wall-clock:`, `ETA:`, `Started:`, `Last update:`) and the checkbox-count fallback.

**Create**
- `dashboard/src/server/parser/primitives/status-block.ts` — given a markdown document (or section), locate the `## Status` block and return a normalized `{field → value}` map. Must accept BOTH styles: (a) the two-column markdown table (`| Status | pending |` rows, header + separator rows skipped, values trimmed, backtick-wrapped values preserved verbatim including progress-bar strings); (b) the plain key-line style from the status grep contract (`Sub-tasks: 7 / 15`, `Tokens used: …`, `Wall-clock: …`, `ETA: …`, `Started: …`, `Last update: …` — colon-delimited, one per line). Detection is per-document in priority order (table first, then key-lines), and the detected style is reported alongside the map for parse-health diagnostics. Missing block returns an explicit absent result — not a throw, not an empty map indistinguishable from an empty block. Also parses the `N / M` progress shape (`Sub-tasks: 7 / 15`, `Progress` cell `7 / 15 sub-tasks (47%)`) into numeric done/total where present.
- `dashboard/src/server/parser/primitives/frontmatter.ts` — detect a document that opens with a `---` fence, extract the YAML body up to the closing `---`, and parse the flat key/value shape used by task files (`id`, `status`, `complexity`, `created`, `updated` — string scalars only, per task-tracking.md). No YAML library dependency for nested structures is required — the doctrine's frontmatter is flat scalars; unknown keys are preserved in the returned map. Malformed or unterminated frontmatter returns an absent/error result and the caller decides degradation; the body offset (first line after the closing fence) is returned so surface parsers can parse the remainder.
- `dashboard/src/server/parser/primitives/checkboxes.ts` — line-level checkbox scanning: classify `- [ ]` (pending), `- [x]` (done), `- [~]` (in-flight, the dispatch mid-flight marker) at line start; return counts (done/running/pending/total) globally and per H2 section; extract the label text after the marker. Additionally split a roster line of the shape `T<id> — <Role> · <title>` into `{taskId, role, title}` and parse its indented detail line (`Read:`/`Modify:`/`Create:` file lists, `Complexity:`, `Specialist:`, optional `Brief:` pointer — `·`-separated key segments). Lines that do not match the roster shape return the plain label — never a throw.
- `dashboard/src/server/parser/primitives/fallback.ts` — the single constructor for the `RawFallback` node used by every surface parser: takes the raw (normalized) document text, the absolute artefact path, and a machine-readable failure reason, returns the shared-schema fallback shape with `parseError: true`. Also exports the parse-or-degrade wrapper helper: run a parse function, catch anything, return the fallback — so surface parsers get never-throw behavior by construction rather than by discipline.
- `dashboard/tests/unit/parser/primitives/status-block.test.ts`, `frontmatter.test.ts`, `checkboxes.test.ts`, `fallback.test.ts` — Vitest golden-fixture contract tests (fixture in → expected normalized output).
- `dashboard/tests/fixtures/golden/status-block/` — the fixture set enumerated under Test cases.

## Acceptance criteria

- [ ] `status-block.ts` parses the table style and the key-line style into the same normalized field map, and reports which style was detected per document.
- [ ] `status-block.ts` handles the artefact-format field vocabulary: Status, Progress, Branch, Commits, Wall-clock, Tokens, Specialists (task/spec files) and Verdict, Scope, Level, Findings, Date (audit files) — unknown fields pass through into the map untouched.
- [ ] `frontmatter.ts` extracts the task-tracking frontmatter (`id`, `status`, `complexity`, `created`, `updated`), preserves unknown keys, and returns the body offset.
- [ ] `checkboxes.ts` counts `- [ ]`, `- [x]`, AND `- [~]` correctly, per document and per H2 section, and parses the roster-line and detail-line shapes.
- [ ] `fallback.ts` produces the shared-schema `RawFallback` node with `parseError: true`, and its wrapper helper converts any thrown error into a fallback result.
- [ ] Parse-or-degrade contract holds: no primitive throws on any input — empty string, binary garbage, unterminated table, unterminated frontmatter fence — verified by explicit tests.
- [ ] BOM-prefixed and CRLF fixtures produce byte-identical normalized output to their clean-LF twins.
- [ ] Golden fixtures pin BOTH format styles: at least one table-style and one key-line-style status-block fixture, each with an expected-output assertion.
- [ ] All primitive return types are `z.infer` of phase-1 shared schemas or plain local structural types that never cross the parser layer boundary; no `any`.
- [ ] Every created source file is under 300 lines; `npm run lint`, typecheck, and the Vitest suite pass in `dashboard/`.

## Test cases

Fixtures in `dashboard/tests/fixtures/golden/status-block/`:

- `table-task.md` — a task-file status block copied from the artefact-format template (Status `in_progress`, Progress `` `████████░░░░░░░░░░░░` 7 / 15 sub-tasks (47%) ``, Branch, Commits, Wall-clock, Tokens, Specialists) → field map with all 7 fields, style `table`, progress parsed as done=7 total=15.
- `table-audit.md` — an audit verdict table (Verdict `` `NEEDS_FIX` ``, Scope, Level `L3`, Findings `0 Critical · 4 Important · 4 Suggestions · 5 Praise`, Date) → field map with the audit vocabulary, no throw on the absent Progress row.
- `keyline-task.md` — the status grep-contract style: `Sub-tasks: 8 / 14`, `Tokens used: thinking 89.2k · worker 142.0k · total 231.2k`, `Wall-clock: 4m 22s elapsed`, `ETA: ~3m 16s remaining`, `Started: …`, `Last update: …` → same normalized map shape, style `keyline`, done=8 total=14.
- `missing-block.md` — a document with checkboxes but no `## Status` and no key lines → explicit absent result (feeds the checkbox-count fallback path in T6).
- `malformed-table.md` — a status table with a truncated row (torn mid-write shape from spec §4.2) → degrade result, no throw.
- `bom-crlf-table.md` — the `table-task.md` content with a UTF-8 BOM prefix and CRLF endings → identical parse result to `table-task.md`.
- `frontmatter-task.md` — task-tracking frontmatter + body → `{id, status, complexity, created, updated}` extracted, body offset points past the closing fence.
- `frontmatter-unterminated.md` — opening `---` with no closing fence → absent/error result, no throw.
- `checkboxes-mixed.md` — a `## Sub-tasks` section containing `- [x]`, `- [~]`, and `- [ ]` lines plus a roster line with indented detail line → counts done=N running=1 pending=M, roster split into `{taskId: "T1", role: "Writer", title: …}` and detail parts.

Integration scenario (Vitest, real repo files): read this repository's real `skills/hyperflow/artefact-format.md` status-block example (the fenced template) and the real `.hyperflow/specs/hyperflow-dashboard.md` `## Status` table through `status-block.ts` → the spec's map contains Status=`approved`, Progress=`Section 5 / 5 approved`, Specialists non-empty; no throw on either document.

E2E: N/A — no browser surface at this layer; composed-loop coverage lands in T40/T41.

## Related context

The table style the parser must accept (artefact-format.md, "The status block"):

```markdown
## Status

| Field      | Value                                            |
|------------|--------------------------------------------------|
| Status     | <pending | in_progress | approved | completed>   |
| Progress   | `████████░░░░░░░░░░░░`  7 / 15 sub-tasks (47%)   |
| Branch     | `feat/<slug>`                                    |
| Wall-clock | 12m elapsed · ETA ~8m                            |
| Tokens     | 30 agents · ~365k total                          |
| Specialists| `api-reviewer, security-reviewer · debugger`     |
```

The key-line style (status/SKILL.md grep contract — these exact greps are the compatibility floor):

```bash
sub_done=$(grep '^Sub-tasks:' "$file" | sed -E 's|.*: *([0-9]+) */ *([0-9]+).*|\1|')
tokens=$(grep '^Tokens used:' "$file" | sed 's|^Tokens used: *||')
wall=$(grep '^Wall-clock:' "$file" | sed 's|^Wall-clock: *||')
eta=$(grep '^ETA:' "$file" | sed 's|^ETA: *||')
started=$(grep '^Started:' "$file" | sed 's|^Started: *||')
```

The checkbox fallback and mid-flight marker (status/SKILL.md): `grep -c '^- \[x\]'` / `'^- \[~\]'` / `'^- \[ \]'`; "dispatch marks `~` while a sub-task is mid-flight".

The roster line + detail line (artefact-format.md, "Per-task / per-section line format"):

```
- [x] T1 — Writer · Author compaction protocol reference
       Read: spec, cache/SKILL.md · Create: skills/cache/references/compaction.md · Complexity: medium · Specialist: searcher · Brief: <slug>/T1.md
```

The frontmatter shape (task-tracking.md, "Task File Format"): `---` fence, then `id:`, `status: in-progress | blocked | in-review | completed`, `complexity:`, `created:`, `updated:`, closing `---`.

Sibling briefs: T6 (tasks/features parsers consume all four primitives), T7 (memory/audits/specs consume status-block + fallback), T8 (handoff/background/config/events consume status-block + fallback only).

## Gotchas

- **Dual-contract reality:** artefacts are produced by skills, not a serializer. Real files mix styles (spec §4.2: "Both status-block styles and frontmatter-style task files in one project"). Detection is per FILE in priority order, never per project — do not cache a project-wide style decision.
- **`[~]` is real and load-bearing:** dispatch writes it mid-flight and status greps for it. A checkbox scanner that only knows `[ ]`/`[x]` silently miscounts totals during every live chain run — the exact moment the dashboard matters most.
- **Progress-bar strings are data, not noise:** the backtick-wrapped `████░░░░` value must survive verbatim in the field map (the client re-renders it); parse the numeric `N / M` out of the same cell without destroying the raw value.
- **BOM/CRLF normalization is read-side only** (spec §4.2): strip BOM and normalize CRLF before parsing, but never persist normalization — the write pipeline (phase-1/phase-4) preserves original endings; keep the primitive pure so it cannot leak into writes.
- **Never-throw is a constructed property:** route every surface parser's entry through the `fallback.ts` wrapper. If never-throw depends on each surface parser remembering to try/catch, one forgotten catch blanks a panel.
- **300-line cap:** four primitives are four files by design. If `status-block.ts` grows past ~250 lines (table + keyline + progress parsing), split the progress/`N / M` numeric extraction into a helper file inside `primitives/` — never compress to dodge the cap.
- **Frontmatter is flat:** do not pull in a full YAML dependency for five scalar keys; a nested-YAML task file is out-of-doctrine input and should degrade, not parse.
