---
name: cache
description: |
  Use when the user wants to view, search, add, edit, prune, archive, or clear hyperflow memory entries. CRUD interface for `.hyperflow/memory/` — never modifies source code, only memory files.
  Trigger with /hyperflow:cache, hyperflow cache, "show memory", "search memory for X", "clear memory", "what does hyperflow remember about Y".
allowed-tools: Read, Write, Edit, Bash(ls:*), Bash(mv:*), Bash(rm:*), Glob, Grep, Agent, AskUserQuestion
argument-hint: "<show|search|add|edit|prune|archive|clear|stats|migrate|off|compact> [args]"
version: 5.14.0
license: MIT
compatibility: Claude Code · Codex · OpenCode · Grok · Antigravity (memory files are project-local)
tags: [memory, persistence, project-state]
---

# Cache

CRUD interface for `.hyperflow/memory/`. Full protocol: [memory-system.md](references/memory-system.md). Semantic ops and gate fallbacks: [runtime-contract.md](../hyperflow/runtime-contract.md).

## Storage

All operations target `.hyperflow/memory/` at the project root. Never modify source code files — if asked to "remember X about file Y", add a memory entry only, never edit Y.

## Subcommands

| Subcommand | Description |
|---|---|
| `show [tag]` | Print index or filter entries by tag |
| `search <query>` | Full-text search across all memory files |
| `add <category> <title>` | Append a new entry (prompts for details) |
| `edit <entry-id>` | Find entry by date+title slug and update in place |
| `prune` | Remove stale, superseded, and orphaned entries |
| `archive` | Move entries older than 30 days to cold storage |
| `clear` | Wipe all memory (with confirmation, recoverable) |
| `stats` | Counts, tier breakdown, tag frequency, oldest/newest |
| `migrate` | Import entries from legacy global memory files when present |
| `off` | Disable memory writes for this session |
| `compact` | Summarise aged memory entries into stubs + monthly archive sidecars |

## Subcommand Details

### `show [tag]`
No arg → print `index.md`. With tag → filter all files for matching entries.
Output table: `Date | Title | Tags | File | Tier`

### `search <query>`
grep/ripgrep across `learnings.md`, `decisions.md`, `pitfalls.md`, `patterns.md`, `conventions.md`.
Return `file:line` + snippet, ranked by relevance. Prefer host `grep` / ripgrep via the shell op when available; otherwise read files and scan inline. Do not invent matches.

### `add <category> <title>`
Categories: `learning` `decision` `pitfall` `pattern` `convention`

Collect details via **`structured_question`** (prefer native structured question UI / `AskUserQuestion` when present): `what`, `why it matters`, `tags` (controlled vocab).

**When structured input is absent** (no popup / no `request_user_input` / no host question tool):

1. Print the exact **Hyperflow Question** chat block from [runtime-contract.md](../hyperflow/runtime-contract.md) for each required field (or one multi-field prompt with numbered options where choices are discrete).
2. **End the turn** and wait for the user's answer.
3. **Never** invent what/why/tags and append silently. **Never** pick a recommended default for free-form fields.

After answers arrive, append to the matching file using:

```
### [YYYY-MM-DD] <title>  `[tag1, tag2]`
**What:** ...
**Why it matters:** ...
**Evidence:** ...
```

That is the whole write. `index.md` is derived — `scripts/memory-index.py` rebuilds it at the next session start. Never append index rows by hand; to refresh it now, run `python3 <plugin-root>/scripts/memory-index.py .hyperflow` when the script is available (resolve plugin root like bridge: `$CODEX_PLUGIN_ROOT` / `$CLAUDE_PLUGIN_ROOT` / … / path relative to this skill).

### `edit <entry-id>`
Locate by date+title slug. Show current value, prompt for new value via `structured_question` (same portable fallback as `add`), update in place. No silent overwrite without the new value from the user.

### `prune`
Per [memory-system.md](references/memory-system.md) pruning protocol:
- Remove `[SUPERSEDED]` entries older than 7 days
- Remove entries whose referenced files no longer exist (`test -f` / host file check)
- Archive entries unreferenced 90+ days to `.hyperflow/memory/archive/YYYY-MM.md`
Print summary of removed/archived counts.

### `archive`
Compress hot entries older than 30 days → `.hyperflow/memory/archive/YYYY-MM.md`.
Leave one-line summary in original file. The stub keeps its date, so the derived index re-tiers it to `cold` on its own.

### `clear` (STRUCTURAL DESTRUCTIVE GATE — never silent)

**Always confirm before any wipe.** This is a structural irreversibility-adjacent gate: autonomy directives do **not** skip it.

1. Prefer `structured_question` / native question UI with a **binary** action gate (no `(Recommended)` marker):

```
This wipes all memory for this project. Are you sure?
  Yes — move everything to archive/cleared-<timestamp>.md then reset category stubs
  No  — leave memory untouched
```

2. **If structured input is absent:** print the same options as a `Hyperflow Question` chat block and **end the turn**. Do not delete, move, or truncate any memory file until the user answers.
3. **If no interactive channel at all (headless):** refuse. Print `clear requires interactive confirmation` and stop. Do not wipe.
4. On **Yes** only → move all content to `.hyperflow/memory/archive/cleared-<timestamp>.md`, then reset category files to empty stubs. On **No** → print `Clear cancelled` and stop.

Silent defaulting of this gate is a doctrine / runtime-contract violation.

### `stats`
Print: total entries, hot/warm/cold counts, tag frequency table, oldest and newest entry dates. When entry timestamps are missing, print `unavailable` for those fields — never fabricate dates.

### `migrate`
Import from legacy global memory when readable:
1. Prefer `~/.claude/hyperflow-memory.md` if present (historical Claude install).
2. Also accept project-local legacy paths documented in memory-system when present.
3. Filter entries matching the current project path; append matching entries to `learnings.md` tagged `[migrated]`. Leave source files untouched.
4. Print count of migrated entries + source path(s).
5. If no source found: print `(nothing to migrate — no legacy memory file found)` and stop. Not an error.

Do not require Claude-only paths when they are absent; do not invent migrated content.

### `off`
Print: "Memory writes disabled for this session." No files modified.

### `compact`
User-invoked memory compaction. Summarises entries older than 7 days into stub lines and preserves the full text in monthly archive sidecars at `.hyperflow/memory/archive/YYYY-MM.md`.

Flow:
1. The compact subcommand handler reads the target memory file (default: `learnings.md`; pass a path to target another).
2. The Date/tag parser splits entries into hot (≤7 days, preserved) and eligible (>7 days). Both `[domain, type]` and legacy backticked `` `[domain, type]` `` tag forms are accepted.
3. **Compaction Writer** — prefer `spawn` for an independent writer child when the host collaboration inventory exposes it; otherwise run a labelled **inline worker** phase (`Worker — compacting memory entries`). Never require an unmapped Claude-only Agent API as the sole path ([runtime-contract.md](../hyperflow/runtime-contract.md)).
4. The Stub formatter renders each replacement line as `### [YYYY-MM-DD] Short title  [domain, type] — summarized, see archive/YYYY-MM.md`.
5. **Dedup Reviewer** — separate `spawn` or labelled **inline reviewer** phase (`**Reviewer** — memory compact dedup`). Source-side stub-line match and archive-side header match (date + title + tags). Workers never self-review.
6. The Archive-sidecar writer appends accepted entries to `archive/YYYY-MM.md`, grouped by each entry's calendar month.
7. The source file is rewritten with stubs replacing the original entries.
8. Refresh `.hyperflow/memory/.checksums` (memory-scoped sidecar — distinct from `.hyperflow/.checksums` which scaffold staleness owns) when that sidecar is in use, then print a summary.

Output: `N entries compacted into archive/YYYY-MM.md · M stubs rejected as duplicates · source N→M lines`. Full protocol in [compaction.md](references/compaction.md).

## Flow

1. Parse invocation to determine subcommand
2. If subcommand missing → list subcommands table above with one-line descriptions
3. Execute subcommand (gates use `structured_question` → Hyperflow Question → refuse; never silent default)
4. Print structured result with counts/changes summary

## Overview

`/hyperflow:cache` (alias: `hyperflow cache`) is the operator interface to project-scoped memory under `.hyperflow/memory/`. It's the only skill that mutates memory files directly (other skills append via the memory-system protocol). Subcommands cover the full lifecycle: show, search, add, edit, prune, archive, clear, stats, migrate, compact. All operations are project-local — entries never leak across projects.

## Prerequisites

- `.hyperflow/` initialized (run `/hyperflow:scaffold` if missing — cache creates `.hyperflow/memory/` on first write but expects the parent dir).
- Write access to `.hyperflow/memory/` and `.hyperflow/memory/archive/` for mutating subcommands.
- For `migrate` only: read access to a legacy memory file when one exists.

## Instructions

1. Parse the subcommand from the user's invocation (or list subcommands if none given). Portable hosts accept `/hyperflow:cache …` and `hyperflow cache …` equally ([SKILL.md](../hyperflow/SKILL.md) router).
2. Validate prerequisites for the chosen subcommand (`clear` / `add` / `edit` require a real user answer before mutation; never invent answers).
3. Execute against `.hyperflow/memory/` using host `edit` / `shell` ops when available.
4. Print structured result with counts and any file-level changes.

## Output

Each subcommand prints a compact summary:

- `show` — table of matching entries (Date | Title | Tags | File | Tier).
- `search` — `file:line` matches with snippets, ranked by relevance.
- `add` / `edit` — confirmation line with new entry id and target file (only after answered prompts).
- `prune` / `archive` / `clear` — counts of removed/archived/cleared entries plus destination paths.
- `stats` — totals + hot/warm/cold breakdown + top-N tags.
- `migrate` — count of migrated entries + source path(s).
- `off` — single-line `Memory writes disabled for this session.`
- `compact` — compaction counts + archive path.

## Error Handling

| Failure | Behavior |
|---|---|
| `.hyperflow/memory/` missing | Auto-create skeleton (category files + archive/.gitkeep) on first write; for read-only subcommands, print `(no memory yet — invoke /hyperflow:scaffold first)`. |
| Subcommand unknown | Print subcommands table; suggest closest match via Levenshtein distance. |
| `add` with invalid category | Reject and list valid categories: learning, decision, pitfall, pattern, convention. |
| `edit` entry id not found | List 3 closest matches by title slug + date. |
| `clear` / `add` / `edit` without structured input | Hyperflow Question chat block + end turn; **no mutation** until answered. |
| `clear` without confirmation (headless / no channel) | Refuse and print `clear requires interactive confirmation`. Do not wipe. |
| `migrate` source file missing | Print `(nothing to migrate — no legacy memory file found)` and stop. |
| `spawn` unavailable during compact | Labelled inline worker then separate inline reviewer; same stub/dedup rules. |
| Shell / edit op unavailable | Refuse the mutating subcommand with `edit/shell unavailable`; do not claim files changed. |

## Examples

### Show all entries

```
/hyperflow:cache show

Date         Title                              Tags                  File              Tier
2026-05-16   Bash scoping required by validator [validator, marketplace] learnings.md   hot
2026-05-15   No AI attribution in commits       [convention, git]     conventions.md    hot
2026-05-14   Per-task commits in plugin dev     [convention, git]     conventions.md    hot
3 entries (3 hot, 0 warm, 0 cold)
```

### Search

```
hyperflow cache search "validator"

.hyperflow/memory/learnings.md:42 — "Jeremy's validator requires scoped Bash..."
.hyperflow/memory/decisions.md:8 — "...validator score of 73 → 94 after fix"
2 matches
```

### Clear without structured UI (portable)

```
/hyperflow:cache clear

Hyperflow Question
This wipes all memory for this project. Are you sure?

1. Yes — move everything to archive/cleared-<timestamp>.md then reset category stubs
2. No — leave memory untouched

[end turn — no files modified until the user answers]
```

### Add a learning

```
/hyperflow:cache add learning "Markdown frontmatter needs block scalar for colons"

? What: Block scalar (|) preserves : and backticks in YAML values
? Why it matters: prevents fatal YAML parse failures in marketplace validators
? Tags: yaml, validator, frontmatter
Added — .hyperflow/memory/learnings.md (entry 2026-05-16-block-scalar-frontmatter)
```

### Stats

```
/hyperflow:cache stats

Memory entries: 47
  Hot   (≤7d)   12
  Warm  (8-30d) 23
  Cold  (30d+)  12
Top tags: validator (8), convention (7), git (6), yaml (4)
Oldest: 2026-02-14   Newest: 2026-05-16
```

## Resources

- [memory-system.md](references/memory-system.md) — full protocol: files, tiers, tagging, pruning rules.
- [artefact-data.md](../hyperflow/artefact-data.md) — viewer mode: memory entries are the leaner `{title, task, decision, tags}` shape (tags required for tag-matched injection), viewable as a card gallery via `hyperflow view`; the markdown category files remain the on-disk form CRUD operates on.
- [compaction.md](references/compaction.md) — `/hyperflow:cache compact` protocol: stub format, archive sidecar, idempotency.
- [output-style.md](references/output-style.md) — label and table conventions.
- [runtime-contract.md](../hyperflow/runtime-contract.md) — `structured_question`, spawn/inline, honest metrics.
- [DOCTRINE.md](../hyperflow/DOCTRINE.md) — orchestration rules.

## Hygiene check

Read-only conflict + prune scan (does not mutate memory):

```bash
python3 scripts/memory-hygiene.py --memory-dir .hyperflow/memory
python3 scripts/memory-hygiene.py --memory-dir .hyperflow/memory --json
python3 scripts/memory-hygiene.py --memory-dir .hyperflow/memory --strict   # exit 1 on CONFLICT
```

Use before large prune/archive runs. Reports:

| Prefix | Meaning |
|---|---|
| `CONFLICT` | Duplicate decision headings, or polarity clash (e.g. **Use X** vs **Avoid X**) |
| `WARN` | Near-duplicate topics, titles shared across `decisions.md` and `project-decisions.md` |
| `PRUNE` | Compaction candidates (over line threshold), cold-tier entries, empty bodies, missing type tags |

`--strict` fails CI/local gates when CONFLICT rows exist; PRUNE/WARN stay advisory. `/hyperflow:status` and `DISPATCH_RESUME` `memory_ok` use the same scanner.
