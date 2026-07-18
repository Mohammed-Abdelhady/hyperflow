# Project Memory System (Audit)

Advanced project-scoped memory replacing the global `~/.claude/hyperflow-memory.md` approach. All data lives inside the project root under `.hyperflow/memory/`. Memory behaviour is **provider-neutral**: the same hot/warm/cold injection rules apply on Claude, Codex, OpenCode, and other hosts. Canonical detail: [../../hyperflow/memory-system.md](../../hyperflow/memory-system.md). This copy keeps the audit-facing producer/consumer contracts substantial so audit Step 4d and Searcher context stay correct.

## Storage Layout

```
.hyperflow/memory/
├── index.md              # DERIVED — quick-scan index: all entry titles, tags, dates, tier
├── .checksums            # DERIVED — per-file sha256 + lineCount (compaction advisory)
├── learnings.md          # Discovered patterns and gotchas
├── decisions.md          # Architectural decisions + reasoning
├── pitfalls.md           # Failed approaches + why they failed
├── patterns.md           # Reusable code and architecture patterns
├── conventions.md        # Project-specific conventions learned mid-session
├── anti-patterns.md      # Recurring problem patterns curated from audit findings (hot-tier)
├── project-decisions.md  # Structural project-level answers memoized across plan design runs
└── archive/
    └── YYYY-MM.md        # Compressed cold entries, one file per month
```

`.hyperflow/` is gitignored. Memory is local to each developer's machine.

## Derived State — index.md and .checksums

`index.md` and `.checksums` are **generated, never hand-authored**. `scripts/memory-index.py` runs from the session-start hook (or the host-normalized session.start lifecycle — [runtime-contract.md](../../hyperflow/runtime-contract.md) / provider hooks), parses every entry heading in the category files, tiers each entry by age, and rewrites both.

No chain step maintains them. This is deliberate: when the index was LLM-maintained, every skill's write protocol *said* to append an index row and none of them did — the index sat at its scaffold stub while the category files grew, and because session start reads memory *through* the index, every stored learning was invisible. Deriving the index from the files it indexes makes that drift impossible.

Consequences for writers:

- **Append entries to the category file only.** Do not write index rows. Do not update `.checksums`.
- The next session start picks the entry up automatically — no registration step, nothing to forget.
- Hand-edits to `index.md` are overwritten on the next run. Edit the category files instead.

## Registered Memory Files

Files in `.hyperflow/memory/` that have a defined producer, consumer, and injection tier. All others follow the standard hot/warm/cold tiering based on entry age.

| File | Tier | Producer | Consumer | Notes |
|------|------|----------|----------|-------|
| `learnings.md` | hot/warm/cold (age-based) | orchestrator (after each batch / audit 4c) | all workers (tag-matched) | General patterns and gotchas |
| `decisions.md` | hot/warm/cold (age-based) | orchestrator (after each batch / plan) | all workers (tag-matched) | Architectural decisions |
| `pitfalls.md` | hot/warm/cold (age-based) | orchestrator (after each batch) | all workers (tag-matched) | Failed approaches |
| `patterns.md` | hot/warm/cold (age-based) | orchestrator (after each batch) | all workers (tag-matched) | Reusable code patterns |
| `conventions.md` | hot/warm/cold (age-based) | orchestrator (after each batch) | all workers (tag-matched) | Project-specific conventions |
| `anti-patterns.md` | **hot — always injected** | audit Step 4d (anti-pattern curation Writer) | all workers, all sessions | See below |
| `project-decisions.md` | **plan-tier — plan design pre-flight only** | plan design / clarify path (post-collection append) | plan clarify pre-flight read | See below — **not** a retired `spec` skill step |

### anti-patterns.md (hot-tier)

Always treated as hot-tier. Every worker prompt that loads anti-patterns receives it regardless of task tags (lean mode may inject matching entries rather than the whole file — same semantics, lazy load).

- **Producer:** audit Step 4d dispatches a Writer (via `spawn` or labelled inline worker phase) that reads the existing file, extracts up to 3 new entries from `[Critical]` and `[Important]` findings, and appends or increments frequency counters. The Step 4d Reviewer validates dedup and frequency accuracy before the write lands.
- **Consumer:** injected into worker prompts under `## Known anti-patterns` at session start / on demand. Workers use it to avoid repeating mistakes that prior audits flagged. **Same injection on every provider** — no host-specific memory path.
- **Format:**
  ```markdown
  ## <Pattern category> (e.g. Error handling, Naming, Dead code)
  - <description> — first observed in audit <YYYY-MM-DD>, frequency: <count>, last seen: <YYYY-MM-DD>
    Recommendation: <what workers should do to avoid this>
  ```
- **Compaction:** subject to the standard compaction protocol (default 300-line threshold, configurable via `memory.compactionThreshold`). Run `/hyperflow:cache compact` when the session-start advisory fires. See the Compaction Protocol section below.
- **Dedup rule:** before appending, the Writer checks for a semantic match in the existing file. On match: increment `frequency` and update `last seen`. Never create a duplicate entry.
- **New-entry cap:** max 3 new entries per audit run. When more than 3 eligible findings exist, prioritize multi-file findings over single-file findings.

### project-decisions.md (plan-tier)

Not hot-tier. Only the **live** `/hyperflow:plan` design/clarify path reads and writes it. Injecting it into every worker prompt would be waste — workers don't make structural project decisions; they implement them.

> **Retired skill names.** Historical docs called this "spec Step 4". The `spec` skill is **retired** as a chain target ([chain-router.md](../../hyperflow/chain-router.md)). The same memoization lives under **plan** (design phase / Step 5 clarify). Never treat retired `spec` / `scope` names as live continuation targets.

- **Producer:** after the user answers plan clarify / Smart Questions, the orchestrator scans answers for structural decisions (database choice, auth strategy, test framework, framework patterns, project-level defaults) and appends each one inline (no Agent dispatch; trivial per DOCTRINE §12.1).
- **Consumer:** plan clarify pre-flight — before generating the question list, plan reads this file and skips any question whose answer is already recorded. If a cached answer conflicts with the current task's requirements, the question fires anyway, framed as "project-decisions.md says X — does this task change that?"
- **Format:**
  ```markdown
  ## <Category>
  - <decision> (recorded <YYYY-MM-DD>, source chain: <task-slug>)
  ```
- **Compaction:** same threshold policy as other memory files. Entries are structural and rarely go stale, so compaction is infrequent in practice.
- **Scope:** only structural, project-wide decisions belong here. Task-specific answers (e.g., "use a modal for this feature") are excluded.

## Tag Taxonomy

Every entry carries tags drawn from this controlled vocabulary. Pick the minimum set that accurately describes the entry.

**Domain tags** (what area of the codebase):
`auth` `db` `api` `ui` `state` `testing` `build` `ci` `deploy` `perf` `security` `i18n` `rtl` `a11y`

**Type tags** (what kind of learning):
`pattern` `gotcha` `decision` `pitfall` `convention` `dependency-quirk`

Rules:
- Every entry must have exactly one type tag
- Every entry must have at least one domain tag
- Maximum four tags total per entry

## Entry Format

```markdown
### [YYYY-MM-DD] Short title  `[domain, type]`
**What:** One-line statement of the learning.
**Why it matters:** Context explaining when this applies.
**Evidence:** file:line reference or commit SHA where this was discovered.
```

Write new entries in this form — it is the only one that carries tags, and without tags an entry can never be warm-tier injected on a tag match.

The index parser also accepts the untagged `## Short title (YYYY-MM-DD, source-slug)` heading that earlier runs emitted, so existing entries stay indexed and tiered. They just never match a tag.

### Examples

```markdown
### [2026-05-15] Zod schemas are the single source of truth for request validation  `[api, convention]`
**What:** All request validation goes through `src/shared/validation/` — never inline Zod in route handlers.
**Why it matters:** Duplicating schemas causes silent drift between validation and types.
**Evidence:** src/shared/validation/user.ts:1, confirmed by searching 23 route files.

### [2026-05-10] Prisma `findUnique` throws on missing relation if `select` omits it  `[db, gotcha]`
**What:** Selecting a relation field that's not in the include block silently returns null instead of throwing.
**Why it matters:** Leads to runtime null-dereference errors that only appear in production data paths.
**Evidence:** src/services/order.ts:88, commit a3f92c1.

### [2026-05-02] Tailwind v4 uses CSS variable tokens, not tailwind.config  `[ui, dependency-quirk]`
**What:** Color and spacing customizations live in CSS custom properties (`--color-*`), not `tailwind.config.js`.
**Why it matters:** Any attempt to extend via config is silently ignored in v4.
**Evidence:** tailwind.css:3-40.
```

## Hot / Warm / Cold Tiering

| Tier | Age | Load behavior |
|------|-----|---------------|
| Hot | ≤ 7 days | Always loaded at session start (default/thorough) or on-demand tag match (lean) |
| Warm | 8–30 days | Loaded only when task tags match entry tags |
| Cold | > 30 days | Compressed to one-line summary; original archived to `archive/YYYY-MM.md` |

`index.md` always records tier alongside each entry so the orchestrator can decide without reading individual files.

### index.md Format

```markdown
| Date       | Tier | File          | Title                                          | Tags                      |
|------------|------|---------------|------------------------------------------------|---------------------------|
| 2026-05-15 | hot  | learnings.md  | Zod schemas are the single source of truth     | api, convention           |
| 2026-05-10 | warm | learnings.md  | Prisma findUnique throws on missing relation    | db, gotcha                |
| 2026-04-02 | cold | archive/2026-04.md | Tailwind v4 uses CSS variable tokens      | ui, dependency-quirk      |
```

## Read Protocol (Session Start)

`scripts/memory-index.py` always rebuilds derived state at session start. Injection depends on mode — **identical semantics on every provider**.

1. Rebuild `index.md` + `.checksums` from the category files in every mode.
2. In default/thorough mode, inject the index, hot entries, and `anti-patterns.md` as before.
3. In lean mode (the default), inject only paths to `index.md` and `session-context.md`; infer task tags, then read matching hot/warm entries and anti-patterns on demand.

The orchestrator performs the rest:

4. Infer tags from the current task / audit target description. Read **hot and warm** entries whose tags overlap — the index names the source file.
5. Skip **cold** entries unless the user explicitly requests them (`hyperflow: memory show <tag>`).
6. Inject only the loaded entries into worker / Searcher prompts. Load relevant anti-pattern entries under a separate header; do not inject the whole file in lean mode.

Workers and audit Searchers receive only the subset matching their task's inferred tags — never the full dump. A Codex session with the same `.hyperflow/memory/` sees the same scoped injection as Claude.

## Write Protocol (After Each Batch / Audit)

1. Orchestrator reviews worker outputs (or audit findings in Step 4c/4d) for candidate learnings.
2. Apply the test: "Would a worker on this project benefit from knowing this in 2 weeks?"
3. Discard ephemeral learnings (task-specific facts that won't recur).
4. Deduplicate against existing entries: if the same fact already exists (semantic match, not exact string), skip or update rather than append.
5. Append to the appropriate file using the entry format above.

There is no index step — `index.md` and `.checksums` are derived at the next session start (see Derived State above). Appending to the category file is the whole write.

Write only from the orchestrator — never delegate memory writes to workers as an unsupervised side-channel (audit Step 4d is the orchestrated exception: Writer + Reviewer pair with a fixed curation contract).

## Compression Protocol

Triggered at session start for any entry whose date crossed the 30-day threshold since last session.

1. Replace the full entry in its source file with a one-line summary:
   ```markdown
   ### [YYYY-MM-DD] Short title  `[tags]`  *(archived)*
   > Tailwind v4 uses CSS variable tokens, not tailwind.config. See archive/2026-04.md.
   ```
2. Append the original full entry to `archive/YYYY-MM.md` (month of the original entry date).

The index re-derives itself from the rewritten source file on the next session start — the stub keeps its date, so it re-tiers as `cold` on its own.

## Pruning Protocol

Run at session start, after tiering is computed.

| Condition | Action |
|-----------|--------|
| Entry contradicted by a newer entry | Mark `[SUPERSEDED by YYYY-MM-DD entry]`; delete after 7 days |
| Entry references a file that no longer exists | Delete immediately; remove from index |
| Entry not referenced in any session after 90 days | Move to archive without summary |
| Cold entry in archive older than 180 days | Delete permanently |

"Referenced" means the entry was loaded (hot auto-load counts; warm tag-match counts).

## Lazy Injection

Workers and audit Searchers receive only the memory subset relevant to their task:

1. Orchestrator infers tags from the worker's task description or the audit target (e.g., "review login flow" → `auth`, `api`, `security`).
2. Filter loaded entries to those sharing at least one tag.
3. Inject filtered entries under `## Learnings from prior sessions` in the worker prompt.
4. Never inject the full memory dump into any worker prompt.

## Migration from Legacy

On first session start in a project that has no `.hyperflow/memory/` but has `~/.claude/hyperflow-memory.md` (or a legacy global memory path):

1. Parse the legacy file for entries belonging to the current project path.
2. Map each bullet point to a `learnings.md` entry, tagging as `pattern` + best-guess domain.
3. Write migrated entries to `learnings.md`.
4. Print: `Hyperflow — migrated N entries from legacy memory`
5. Do not delete the legacy file — the user may have other projects in it.

## User Controls

| Command | Effect |
|---------|--------|
| `hyperflow: memory off` | Disable memory reads and writes for the current session |
| `hyperflow: memory clear` | Wipe `.hyperflow/memory/` — requires `structured_question` confirmation first (Hyperflow Question chat gate when structured UI is missing; never silent clear) |
| `hyperflow: memory show <tag>` | List all entries (including cold) matching the tag |
| `hyperflow: memory show all` | Dump full index |

## Constraints

- The session-start hook injects only the first 200 lines of `index.md`. The index is one row per entry, so once a project carries ~190 live entries, archive or compact the cold ones — that shrinks the derived index at its source.
- No code snippets in memory entries — patterns and facts only.
- Memory writes never block task execution. If a write fails, log and continue.
- Users may edit any category file directly — it is plain markdown. `index.md` and `.checksums` are derived and get overwritten.
- No AI attribution in memory entries (DOCTRINE rule 9).

## Compaction Protocol

Memory files crossing a line-count threshold (default 300, configurable via `memory.compactionThreshold` in `~/.hyperflow/config.json`) can be compacted via the user-invoked `/hyperflow:cache compact` subcommand. Compaction summarises entries older than 7 days into stub lines and preserves the full text in monthly archive sidecars at `<memory-dir>/archive/YYYY-MM.md`.

A non-blocking session-start advisory is emitted by the Session-start lineCount checker when any tracked memory file's cached `lineCount` (stored in `.hyperflow/memory/.checksums`, scoped to memory files only — not to be confused with `.hyperflow/.checksums` which the scaffold staleness check owns) meets or exceeds the threshold.

The stub format is:

```
### [YYYY-MM-DD] Short title  [domain, type] — summarized, see archive/YYYY-MM.md
```

The Date/tag parser accepts BOTH `[domain, type]` (new) and `` `[domain, type]` `` (legacy backticked) so existing entries remain eligible after the feature lands.

Idempotency is guaranteed by source-side stub-line match and archive-side header match (both check date + title + tags). Re-running `/hyperflow:cache compact` on a fully compacted file produces no new writes.

See `skills/cache/references/compaction.md` for the full protocol (Compaction Writer dispatch, Dedup Reviewer reuse, Archive-sidecar writer details).

## Related

- [../../hyperflow/memory-system.md](../../hyperflow/memory-system.md) — canonical full protocol
- [../../hyperflow/runtime-contract.md](../../hyperflow/runtime-contract.md) — structured_question for destructive clears
- [../../hyperflow/chain-router.md](../../hyperflow/chain-router.md) — live skills only (no retired `spec`/`scope`)
