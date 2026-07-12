# T7 — Memory + audits + specs parsers + golden fixtures

## Status

| Field       | Value              |
|-------------|--------------------|
| Status      | pending            |
| Complexity  | m                  |
| Depends on  | T5                 |
| Specialist  | backend-reviewer   |

## Task

Implement the three knowledge-artefact surface parsers — `memory.ts` for `.hyperflow/memory/<category>.md` entries (tagged AND legacy-untagged headings), `audits.ts` for `.hyperflow/audits/` findings with severity rollup (Critical → Praise), and `specs.ts` for `.hyperflow/specs/` documents with a section index — plus unit tests and golden fixtures per format variant.

## Why

These three surfaces power the memory browser + knowledge graph, the audits browser + trend heatmap, and the specs viewer + section diff. Memory is the surface with the deepest documented format history (tagged entries, legacy untagged headings, archived stubs — memory-system.md carries all three), and audit severity rollups feed the Flow Health score, so faithful parsing here directly determines the dashboard's headline metrics.

## Scope

**IN:**
- `dashboard/src/server/parser/memory.ts` — parse one memory category file into a list of entries: tagged current-format entries, legacy untagged entries, and compaction/archive stubs.
- `dashboard/src/server/parser/audits.ts` — parse one audit file: verdict table + findings grouped by severity + per-file severity rollup in the fixed order Critical → Important → Suggestion → Praise.
- `dashboard/src/server/parser/specs.ts` — parse one spec document: status table, TL;DR, Components, and a section index over the H2/H3 heading tree (heading text, level, line range) with mermaid fences captured raw.
- Unit tests under `dashboard/tests/unit/parser/` and fixtures under `dashboard/tests/fixtures/golden/{memory,audits,specs}/`.

**OUT:**
- Parse primitives — T5 (composed here). Tasks/features — T6. Handoff/background/config/events — T8.
- Memory CRUD, index regeneration, `.checksums` handling — phase-3+ services; this parser READS category files only. `index.md` and `.checksums` are derived files the dashboard never writes and this parser never treats as a source of entry truth.
- Severity trend aggregation across audits (heatmap math) and Flow Health scoring — `shared/derived/` pure functions, phase-1/phase-4; this task only produces the per-file rollup they consume.
- Spec section diffing — client feature; this task only builds the section index that makes diffing possible.

## Files in scope

**Read**
- `dashboard/src/server/parser/primitives/*` (T5) — status-block, checkboxes, fallback.
- `dashboard/src/shared/schemas/snapshot.ts` (phase-1 T2) — memory-entry, audit, and spec sub-schemas.
- `skills/hyperflow/memory-system.md` — entry format (tagged), legacy heading form, compaction stub form, tag taxonomy.
- `skills/hyperflow/artefact-format.md` — audit verdict table, finding block shape, severity order, spec file additions (TL;DR, Components, Trade-offs).

**Create**
- `dashboard/src/server/parser/memory.ts` — entry-splitting parser for one category file (learnings.md, decisions.md, pitfalls.md, patterns.md, conventions.md, anti-patterns.md, project-decisions.md — filename passed in, format shared). Recognizes, per heading, in priority order: (1) tagged current format `### [YYYY-MM-DD] Short title  ` + tags in backticked `` `[domain, type]` `` OR plain `[domain, type]` form (memory-system.md compaction protocol accepts both) → entry with date, title, tags array, and the `**What:**` / `**Why it matters:**` / `**Evidence:**` body fields where present; (2) archived/compaction stubs — trailing `*(archived)*` marker with a `>` summary line, or the ` — summarized, see archive/YYYY-MM.md` suffix → entry flagged `archived` with its summary and archive pointer; (3) legacy untagged `## Short title (YYYY-MM-DD, source-slug)` headings (spec §4.2 legacy memory heading fallback) → entry with date and source slug, empty tags, flagged `legacy`; (4) anything else under a heading → raw entry node flagged unparsed, kept in place (spec §4.2: "unmappable entries render raw inside the memory view rather than being dropped"). Also parses the anti-patterns.md house shape (`## <Pattern category>` heading + `frequency:` / `last seen:` / `Recommendation:` bullet fields) into the same entry model with category metadata. Output: ordered entry list + per-file parse-health counts. File-level failure → T5 fallback node.
- `dashboard/src/server/parser/audits.ts` — audit-file parser. Parses the verdict-style status block via T5 (Verdict, Scope, Level, Findings, Date — no Progress/Branch rows); parses the Findings summary line (`0 Critical · 4 Important · 4 Suggestions · 5 Praise`) into numeric counts; splits findings on `### [<Severity>] <file>:<line> — <title>` headings, extracting severity (one of Critical/Important/Suggestion/Praise), the file:line anchor (line optional), title, and the `**Issue:**` / `**Fix:**` / `**Why it matters:**` blocks. Computes the per-file severity rollup in the fixed order Critical → Important → Suggestion → Praise and reconciles it against the Findings row — a mismatch is a diagnostic on the parse-health record, not an error. Recognizes the audit-fix-spec source blockquote (`> Source: .hyperflow/audits/<file>.md`) when present. Unknown severity words degrade that finding to a raw node; file-level failure → fallback.
- `dashboard/src/server/parser/specs.ts` — spec-document parser. Parses the status block via T5 (spec files use `Section 4 / 5 approved` progress style — preserved as text plus parsed N/M); extracts `## TL;DR` text and the `## Components` bullet list; builds the section index: every H2/H3 heading in document order with its level, exact heading text, normalized anchor, and start/end line numbers — including the numbered doctrine sections (`## 1. Architecture` … `## 5. File structure`) whose numeric prefix is parsed out for §-addressing; captures fenced ` ```mermaid ` blocks raw with their owning section (client renders them; malformed mermaid is the client error boundary's job per spec §4.2 — the parser never validates mermaid source); records `## Trade-offs accepted / rejected` presence. Handles `.draft.md` names as the same shape with a draft flag from the filename. File-level failure → fallback.
- `dashboard/tests/unit/parser/memory.test.ts`, `audits.test.ts`, `specs.test.ts` — golden-fixture contract tests.
- `dashboard/tests/fixtures/golden/memory/`, `dashboard/tests/fixtures/golden/audits/`, `dashboard/tests/fixtures/golden/specs/` — fixture sets enumerated under Test cases.

## Acceptance criteria

- [ ] `memory.ts` parses all four entry classes — tagged (both backticked and plain tag styles), archived/stub, legacy untagged, and unparsable-raw — from a single mixed file, preserving document order and dropping nothing.
- [ ] Memory tags parse into an array honoring the taxonomy shape (domain tags + exactly one type tag is NOT enforced by the parser — it reports what is there; validation is a consumer concern).
- [ ] `audits.ts` extracts every finding with severity, file:line anchor, title, and Issue/Fix/Why blocks, and produces the severity rollup in the fixed order Critical → Important → Suggestion → Praise with correct counts.
- [ ] Audit Findings-row counts vs actual finding-heading counts are reconciled; mismatch surfaces as a diagnostic, never a throw.
- [ ] `specs.ts` produces a complete section index (H2 + H3, ordered, with line ranges) and parses the `Section N / M approved` progress style; mermaid fences are captured raw and never evaluated.
- [ ] Parse-or-degrade holds across all three: no throw on truncated, binary, or heading-less input — verified by explicit tests; file-level failures return the T5 fallback node.
- [ ] Golden fixtures pin both memory heading generations AND both tag styles; audit fixtures pin all four severities; spec fixtures pin the numbered-section shape.
- [ ] All outputs are `z.infer` of phase-1 shared schemas; no `any`; each source file under 300 lines; `npm run lint`, typecheck, and Vitest pass in `dashboard/`.

## Test cases

Fixtures in `dashboard/tests/fixtures/golden/memory/`:

- `tagged-current.md` — three entries copied from the memory-system.md examples (Zod schemas / Prisma findUnique / Tailwind v4, with backticked `` `[api, convention]` ``-style tags and What/Why/Evidence bodies) → 3 tagged entries, tags arrays `["api","convention"]` etc., evidence strings extracted.
- `tags-unbackticked.md` — one entry using the plain `[domain, type]` compaction-era tag style → parses identically to backticked.
- `legacy-headings.md` — two `## Short title (2026-04-02, some-slug)` entries → 2 `legacy` entries with dates and source slugs, empty tags.
- `mixed-generations.md` — tagged + legacy + one archived stub (`*(archived)*` + `>` summary) + one summarized stub (`— summarized, see archive/2026-04.md`) in one file → 4 entries, correct class per entry, order preserved.
- `anti-patterns.md` — the memory-system.md anti-patterns shape (`## Error handling` category, frequency/last-seen/Recommendation fields) → category entries with numeric frequency.
- `garbage.md` — binary-ish noise, no headings → file-level fallback node, `parseError: true`.

Fixtures in `dashboard/tests/fixtures/golden/audits/`:

- `needs-fix-l3.md` — verdict table from the artefact-format example (Verdict `NEEDS_FIX`, Findings `0 Critical · 4 Important · 4 Suggestions · 5 Praise`) + findings including the `### [Important] config/features.json:128 — cache.purpose omits \`compact\`` example with Issue/Fix/Why blocks → verdict map, 13 findings, rollup {Critical:0, Important:4, Suggestion:4, Praise:5}, ordered Critical → Praise.
- `all-severities.md` — one finding of each severity, one finding without a `:line` anchor → 4 findings, all severities recognized, anchor line optional.
- `count-mismatch.md` — Findings row says 2 Important, body holds 3 → parse succeeds, diagnostic recorded, rollup reflects the body (ground truth is the findings themselves).
- `unknown-severity.md` — a `### [Catastrophic] …` heading → that finding degrades to raw, siblings parse.
- `keyline-status-audit.md` — audit body with a key-line style status (drifted writer) → status parsed via the T5 key-line path, findings still extracted.

Fixtures in `dashboard/tests/fixtures/golden/specs/`:

- `numbered-sections.md` — miniature spec with status table (`Section 3 / 5 approved`), TL;DR, Components, `## 1. Architecture` through `## 5. File structure` with H3 children and one mermaid fence → section index of all headings with §-numbers 1-5, mermaid block attached to its section, progress parsed as 3/5.
- `draft-spec.draft.md` — same shape, `.draft.md` name → draft flag true.
- `no-status-spec.md` — headings only, no status block → index still builds, status absent, no throw.

Integration scenario (Vitest, real repo file): parse this repository's real `.hyperflow/specs/hyperflow-dashboard.md` via `specs.ts` → status map has Status=`approved` and Progress `Section 5 / 5 approved`; the section index contains the five numbered H2 sections (`1. Architecture`, `2. Data flow`, `3. Key decisions`, `4. Edge cases`, `5. File structure`) plus TL;DR and Components; at least three mermaid fences are captured raw; zero throws. Second integration case: parse the repo's real `skills/hyperflow/memory-system.md` Entry Format examples region copied verbatim as a fixture — guards against the brief's quoted fragments drifting from the source doc.

E2E: N/A — no browser surface at this layer; composed-loop coverage lands in T40/T41.

## Related context

The tagged memory entry the parser must accept (memory-system.md, Entry Format):

```markdown
### [YYYY-MM-DD] Short title  `[domain, type]`
**What:** One-line statement of the learning.
**Why it matters:** Context explaining when this applies.
**Evidence:** file:line reference or commit SHA where this was discovered.
```

The legacy heading it must also accept (memory-system.md): "The index parser also accepts the untagged `## Short title (YYYY-MM-DD, source-slug)` heading that earlier runs emitted." And the compaction stub (both tag styles are legal): `### [YYYY-MM-DD] Short title  [domain, type] — summarized, see archive/YYYY-MM.md`.

The audit verdict table (artefact-format.md, Audit file additions):

```markdown
| Field    | Value                                              |
|----------|----------------------------------------------------|
| Verdict  | `NEEDS_FIX`                                        |
| Scope    | `main..HEAD` (13 files · 284 insertions)           |
| Level    | L3                                                 |
| Findings | 0 Critical · 4 Important · 4 Suggestions · 5 Praise |
| Date     | 2026-05-16 17:30                                   |
```

The finding block: `### [Important] config/features.json:128 — cache.purpose omits \`compact\`` followed by `**Issue:**` / `**Fix:**` / `**Why it matters:**` paragraphs; severity order fixed: **Critical → Important → Suggestion → Praise**.

Spec additions (artefact-format.md): TL;DR is the "first H2 under the status block"; spec Progress uses `Section 4 / 5 approved` style; mermaid graphs are fenced ` ```mermaid ` blocks in `## 1. Architecture` / `## 2. Data flow`.

Sibling briefs: T5 (primitives composed here), T6/T8 (parallel Batch 2 siblings — no shared files).

## Gotchas

- **Three memory generations coexist in one file** — tagged, legacy, archived stubs. Entry-splitting must key on heading patterns, not on a per-file format decision; a file that starts tagged can end legacy.
- **Both tag styles are current** — memory-system.md's compaction protocol explicitly accepts `[domain, type]` AND `` `[domain, type]` ``. Matching only the backticked form silently untags every compacted entry.
- **Derived files are read-only and not entry sources:** `memory/index.md` and `.checksums` are generated by `scripts/memory-index.py`; the dashboard write-denylist hard-blocks them and this parser must never derive entries from the index — always from category files (the index drifted for months historically; that is the documented reason it became derived).
- **Findings row vs body counts can disagree** (hand-edited audits) — the body is ground truth; the row is a cross-check. Never "fix" the file, never throw.
- **Praise is a severity, not decoration** — the rollup order Critical → Important → Suggestion → Praise is a fixed vocabulary AND a fixed sort; the heatmap and Flow Health consume the counts positionally.
- **Never execute or validate mermaid server-side** — capture raw; rendering failures are handled by the client error boundary (spec §4.2 malformed-Mermaid case).
- **Spec section numbering is addressing** — `## 3. Key decisions` must index as both heading text and §3; downstream deep-links use `?slug=` + section anchors.
- **BOM/CRLF** — rely on T5's shared read-boundary normalization; memory files are the most hand-edited artefacts in the tree and the likeliest to carry CRLF from foreign editors.
- **300-line cap** — three surfaces are three files by design; the memory entry-classifier is the bloat risk. If `memory.ts` nears ~250 lines, split the anti-patterns house-shape handling into a sibling helper module (split per artefact type, never compress).
