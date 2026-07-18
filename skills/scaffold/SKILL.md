---
name: scaffold
description: |
  Use when starting hyperflow in a new project, refreshing the .hyperflow/ cache, or installing auto-detection shims (AGENTS.md, CLAUDE.md). One-shot project setup; does not start the spec → plan → dispatch chain.
  Trigger with /hyperflow:scaffold, "init hyperflow", "set up hyperflow", "refresh hyperflow", "install hyperflow shims".
allowed-tools: Read, Write, Edit, Bash(git:*), Bash(sha256sum:*), Bash(ls:*), Bash(find:*), Bash(scripts/*:*), Glob, Grep, Agent, AskUserQuestion
argument-hint: "[--tools all|claude-code|opencode|agents|codex|cursor|antigravity|grok] [--force] [--dry-run]"
version: 3.1.3
license: MIT
compatibility: Portable — Claude Code, Codex, OpenCode, Antigravity, Cursor, Grok (semantic ops via runtime-contract)
tags: [setup, initialization, project-analysis]
---

# Scaffold

One-shot project setup. Analyzes the codebase, builds the `.hyperflow/` cache, seeds the memory skeleton, and optionally installs detection shims for other AI tools. Does **not** start the plan → dispatch chain — invoke `/hyperflow:plan` when you're ready for that.

Semantic host ops: `spawn`, `wait`, `structured_question`, `shell`, `edit`, `skill_continuation`
([runtime-contract.md](../hyperflow/runtime-contract.md)). Setup does not auto-chain into plan/dispatch
([chain-router.md](../hyperflow/chain-router.md)).

All agents inherit the **current session model** — no model-tier routing. Searchers never review their own analysis;
when a review pass is required, use a **separate** labelled reviewer phase.

## Step 1 — Analysis Cache

Check for `.hyperflow/` at project root.

**If absent — dispatch six Searcher roles** (prefer parallel sibling `spawn` when the host inventory supports concurrent children; otherwise **sequenced labelled inline searcher** phases with honest serial wording):

| Label | File generated | Discovers |
|---|---|---|
| `Searcher — analyzing tech stack` | `profile.md` | Name, language, framework, build commands |
| `Searcher — mapping folder structure` | `architecture.md` | Dirs, patterns, routing, data flow |
| `Searcher — extracting conventions` | `conventions.md` | Naming, style, linting rules |
| `Searcher — scanning dependencies` | `dependencies.md` | UI lib, state, data fetching, DB, auth |
| `Searcher — auditing test setup` | `testing.md` | Runner, E2E, patterns, commands |
| `Searcher — reading git workflow` | `git-workflow.md` | Branches, commits, CI/CD, PR conventions |

See [project-analysis.md](references/project-analysis.md) for what each file captures and the spawn/inline role map.

**If present — staleness check:**
Compute SHA256 of tracked config files (host `shell`), compare against `.hyperflow/.checksums`. Refresh only stale
files via the matching Searcher role(s). Print `Refreshing — <comma-separated list of stale files>`.

**After analysis:**
- Write `.hyperflow/.checksums` (SHA256 of `package.json`, `tsconfig.json`, eslint/biome config, etc.)
- Write `.hyperflow/.version` (the current plugin version from `skills/hyperflow/VERSION`) so the cache is stamped current. The session-start migrator (`scripts/migrate-cache.py`) reads this marker on later sessions and brings an older cache forward when the plugin version moves — a missing/older marker triggers an idempotent, additive migration (new memory files, refreshed doctrine copy).
- Append to `.gitignore` if `.hyperflow/` is not already excluded

Optional coverage review: when the skill path requires a review pass, run a **separate** labelled reviewer after
searchers — never merge searcher draft and review.

## Step 2 — Memory Skeleton

Create `.hyperflow/memory/` if absent:

```
.hyperflow/memory/
├── doctrine.md          ← copied from skills/hyperflow/DOCTRINE.md
├── index.md
├── learnings.md         ← empty stub (populated by /hyperflow:dispatch wrap-up)
├── decisions.md
├── pitfalls.md
├── patterns.md
├── conventions.md
├── session-context.md   ← [populated by session.start lifecycle, NOT by scaffold]
└── archive/.gitkeep
```

**session-context.md — populated by the host session.start lifecycle, not scaffold:**
Scaffold creates the empty `.hyperflow/memory/` directory; it does NOT write `session-context.md`. That file is
generated at session start by the normalized `session.start` lifecycle ([runtime-contract.md](../hyperflow/runtime-contract.md)
/ provider hooks), which concatenates `.hyperflow/profile.md`, `architecture.md`, and `conventions.md` into a single
bundled file. This enables Pattern L3 (session-cached context): lean workers read one bundled file instead of three
separate source files.

**Limit:** mid-session changes to `profile.md`, `architecture.md`, or `conventions.md` won't propagate to
`session-context.md` until the next session start. Workers can still Read the source files directly if they suspect
staleness.

**doctrine.md generation (idempotent):**
- Source: `skills/hyperflow/DOCTRINE.md` (canonical orchestration rules)
- If `.hyperflow/memory/doctrine.md` is absent — copy it.
- If it already exists — compare modification timestamps (or SHA256) against the source. If the source is newer, re-copy. If up-to-date, skip and print `doctrine.md — checksum match`.
- This enables Pattern P5 (lean worker prompts): workers Read doctrine on demand instead of receiving it inlined in every prompt.

**learnings.md (idempotent):**
- If absent — create as an empty stub with a single heading `# Learnings` and the line `<!-- populated by /hyperflow:dispatch wrap-up -->`.
- If it already exists with content — do NOT overwrite. Accumulated learnings from prior runs must be preserved across refreshes.

**Other stubs** — if any of `decisions.md`, `pitfalls.md`, `patterns.md`, `conventions.md` are absent, create them as an empty stub: one H1 matching the filename (title-cased) and the line `<!-- to be populated by future runs -->`.

**Do not stub `index.md`.** It is derived — `scripts/memory-index.py` writes it from the category files at every session start. A hand-written stub is overwritten on the next run.

**Lean prompt note:** scaffold has now populated the memory skeleton. Run `/hyperflow:dispatch` and workers will use `skills/hyperflow/worker-prompt-lean.md` by default; pass `--thorough` to fall back to the full inlined template.

**Migration:** If a legacy global memory file exists at a known path from a prior install, migrate entries matching the current project path into the appropriate memory files. Tag migrated entries `[migrated]`. Do not invent migration sources that are not present.

## Step 3 — Detection Shims (provider-appropriate instruction targets)

Offer to run `scripts/setup-detection.sh` with the selected tool set to generate provider instruction shims.

Supported tools: `claude-code` (CLAUDE.md managed block), `opencode` / `agents` / `codex` / `cursor` (AGENTS.md
managed block), `antigravity` (AGENTS.md + `.agent/workflows/`), `grok` (AGENTS.md + `.grok/rules/hyperflow.md`),
`all` (every tool).

Flags — `--tools <all|claude-code|opencode|agents|codex|cursor|antigravity|grok>`, `--force`, `--dry-run`.

Default — `--tools all`. Ask once via `structured_question` if the user wants to skip any tool. When structured UI
is missing, render the exact **Hyperflow Question** chat block and **end the turn**. Do not invent confirmation
theater for pure mechanical setup that doctrine marks non-gated — but tool selection is user preference when
ambiguous.

**Managed-block rules (implementation owned by setup scripts / T6 contract):**
- Preserve all user content outside the versioned Hyperflow managed block on every normal, force, and refresh path.
- Codex and other AGENTS.md hosts maintain a versioned managed block in `AGENTS.md`; Claude maintains the
  corresponding block in `CLAUDE.md`. Mixed-provider projects may maintain both.
- Scaffold **routes** to `scripts/setup-detection.sh` / managed-block logic — it does not hand-overwrite entire
  AGENTS.md or CLAUDE.md files with a full-file replace that destroys user content.
- Never claim a shim write that did not land. Never claim App/desktop certification from file presence alone
  (status skill owns installed-vs-certified reporting).

## Step 4 — Summary

Print what was created, skipped, and migrated (elegant style, no icons). Prefer provider-appropriate instruction
targets in the summary (`AGENTS.md` for Codex/OpenCode/Cursor/Grok/Antigravity; `CLAUDE.md` for Claude Code):

```
Hyperflow init complete
  Created   .hyperflow/{profile,architecture,conventions,dependencies,testing,git-workflow}.md
  Created   .hyperflow/.checksums
  Created   .hyperflow/memory/doctrine.md — copied from skills/hyperflow/DOCTRINE.md
  Created   .hyperflow/memory/{index,learnings,decisions,pitfalls,patterns,conventions}.md
  Note      .hyperflow/memory/session-context.md — populated by session.start lifecycle (not scaffold)
  Skipped   .gitignore entry — already present
  Migrated  3 entries from legacy global memory (when present)
  Shims     AGENTS.md (managed block) · CLAUDE.md (when selected)

Memory skeleton populated — workers will use lean prompts (skills/hyperflow/worker-prompt-lean.md) by default.
Pass --thorough to /hyperflow:dispatch to fall back to the full inlined template.
```

When `usage_metrics` are unavailable, do not invent analysis agent token totals in the summary.

## Hand-off

This skill **does not** auto-chain. Init is project setup, not feature work. When the user wants to start a feature,
they invoke `/hyperflow:plan` (or natural-language plan routing). Other skills may `skill_continuation` into scaffold
when `.hyperflow/` is missing (mechanical setup per [chain-router.md](../hyperflow/chain-router.md)), then continue
the original skill — scaffold itself does not start plan/dispatch.

## Doctrine

Full rules in [DOCTRINE.md](../hyperflow/DOCTRINE.md). Output style in [output-style.md](references/output-style.md).
Analysis decision tree in [project-analysis.md](references/project-analysis.md).
Runtime ops: [runtime-contract.md](../hyperflow/runtime-contract.md).

## Overview

`/hyperflow:scaffold` is one-shot project setup. It analyzes the codebase via six Searcher roles (parallel `spawn`
when available; otherwise sequenced labelled inline phases), builds the `.hyperflow/` cache (profile, architecture,
conventions, dependencies, testing, git-workflow), seeds the memory skeleton, and optionally writes detection shims
(CLAUDE.md / AGENTS.md managed blocks, Grok rules, Antigravity workflows). Does not start the plan → dispatch chain.

## Prerequisites

- Git repository (recommended for tag detection + git-workflow analysis; degrades gracefully if absent).
- Write access to the project root for `.hyperflow/` creation.
- For migration only: an existing legacy global memory file from a prior install (when present).

## Portability

| Capability | Behavior |
|---|---|
| `spawn` present | Prefer parallel sibling searchers for independent analysis files |
| `spawn` absent | Six labelled inline searcher phases; optional separate coverage review |
| `structured_question` present | Tool-selection / skip questions as native UI |
| `structured_question` absent | Hyperflow Question chat block + end turn when a preference gate is needed |
| `shell` absent | Skip checksum/shell-dependent steps; surface unavailable; never bypass security |
| Codex / AGENTS hosts | Route shim install to AGENTS.md managed-block path |
| Claude hosts | Route shim install to CLAUDE.md managed-block path |

## Instructions

Numbered steps are in [Step 1 — Analysis Cache](#step-1--analysis-cache) through [Step 4 — Summary](#step-4--summary) above. Summary:

1. Check for `.hyperflow/` at project root; if absent, dispatch 6 Searcher roles (parallel when spawn allows) to produce profile.md, architecture.md, conventions.md, dependencies.md, testing.md, git-workflow.md.
2. If present, recompute SHA256 checksums and refresh only stale files.
3. Create `.hyperflow/memory/` skeleton: copy `skills/hyperflow/DOCTRINE.md` → `doctrine.md` (idempotent — re-copy only if source is newer); create `learnings.md` empty stub (skip if content exists); create `decisions.md`, `pitfalls.md`, `patterns.md`, `conventions.md` stubs if absent. `index.md` is derived — leave it to `scripts/memory-index.py`.
4. Migrate matching entries from legacy global memory when found.
5. Offer `scripts/setup-detection.sh` to write managed CLAUDE.md / AGENTS.md (and Grok/Antigravity) shims when those tools are selected — preserve user content outside managed blocks.
6. Print summary of created / skipped / migrated artifacts.

## Output

See the summary block under [Step 4 — Summary](#step-4--summary) above. Format: plain English, em-dash separator, sections for Created / Skipped / Migrated / Shims. No icons.

Step 2 generates the following files under `.hyperflow/memory/`:

| File | Source | Idempotence |
|---|---|---|
| `doctrine.md` | Copied from `skills/hyperflow/DOCTRINE.md` | Re-copied if source is newer; skipped if checksum matches |
| `learnings.md` | Empty stub (`# Learnings` heading) | Never overwritten if content exists — preserves accumulated learnings |
| `decisions.md`, `pitfalls.md`, `patterns.md`, `conventions.md` | Empty stubs | Created if absent; skipped if present |
| `index.md`, `.checksums` | Derived by `scripts/memory-index.py` / scaffold checksum write | `index.md` is not hand-authored; session.start rebuilds index from category files |
| `session-context.md` | Populated by `session.start` lifecycle (NOT scaffold) | Scaffold does not create this file |

## Error Handling

| Failure | Behavior |
|---|---|
| Not a git repo | Skip git-workflow.md searcher; print `(skipped — no git)` in summary. |
| Some searchers fail | Mark the failing files with `(partial)` in profile.md; continue. Other sources still produce valid output. |
| `.hyperflow/` exists but `.checksums` missing | Treat all tracked configs as stale; refresh everything. |
| Legacy memory file malformed | Skip migration; print `Migration skipped — legacy file parse failed at line N`. Original file untouched. |
| `setup-detection.sh` missing or non-executable | Print `Detection shims skipped — scripts/setup-detection.sh not runnable`. Initialization still succeeds. |
| `.gitignore` write blocked | Print warning and the suggested line to add manually; continue. |
| `spawn` unavailable | Labelled inline searchers; never claim parallel subagents for serial work. |

## Examples

### Fresh project

```
/hyperflow:scaffold

Searcher — analyzing tech stack
Searcher — mapping folder structure
Searcher — extracting conventions
Searcher — scanning dependencies
Searcher — auditing test setup
Searcher — reading git workflow

Hyperflow init complete
  Created   .hyperflow/{profile,architecture,conventions,dependencies,testing,git-workflow}.md
  Created   .hyperflow/.checksums
  Created   .hyperflow/memory/doctrine.md — copied from skills/hyperflow/DOCTRINE.md
  Created   .hyperflow/memory/{index,learnings,decisions,pitfalls,patterns,conventions}.md
  Note      .hyperflow/memory/session-context.md — will be populated by session.start on next session
  Created   .gitignore entry — .hyperflow/
  Shims     CLAUDE.md, AGENTS.md (managed blocks)

Memory skeleton populated — workers will use lean prompts by default.
```

### Refresh after dependency bump

```
/hyperflow:scaffold

Refreshing — dependencies.md, profile.md
Hyperflow refresh complete
  Updated   .hyperflow/dependencies.md, profile.md
  Skipped   architecture, conventions, testing, git-workflow — checksum match
  Shims     unchanged
```

### Dry run

```
/hyperflow:scaffold --dry-run

Would create   .hyperflow/profile.md (~120 lines)
Would create   .hyperflow/architecture.md (~200 lines)
... (full list)
No files written.
```

### Codex project with existing AGENTS.md

```
/hyperflow:scaffold --tools codex

... analysis ...
  Shims     AGENTS.md managed block updated — user content outside the block preserved
```

## Resources

- [project-analysis.md](references/project-analysis.md) — what each generated file captures; spawn/inline role map.
- [artefact-data.md](../hyperflow/artefact-data.md) — the visual artefact viewer is on by default (`viewer.enabled` in `config/defaults.json`); scaffold need not generate anything for it, but note it exists so `hyperflow view` works once artefacts are produced.
- [runtime-contract.md](../hyperflow/runtime-contract.md) — spawn / structured_question / session lifecycle.
- [chain-router.md](../hyperflow/chain-router.md) — scaffold is setup only; not a plan→dispatch edge.
- [DOCTRINE.md](../hyperflow/DOCTRINE.md) — orchestration rules (Layer 0 project analysis).
- [output-style.md](references/output-style.md) — summary block formatting.
