---
name: scaffold
description: |
  Use when starting hyperflow in a new project, refreshing the .hyperflow/ cache, or installing auto-detection shims (AGENTS.md, CLAUDE.md). One-shot project setup; does not start the spec → scope → dispatch chain.
  Trigger with /hyperflow:scaffold, "init hyperflow", "set up hyperflow", "refresh hyperflow", "install hyperflow shims".
allowed-tools: Read, Write, Edit, Bash(git:*), Glob, Grep
argument-hint: "[--tools all|claude-code|opencode|agents] [--force] [--dry-run]"
version: 3.1.2
author: Mohammed Abdelhady <abdelhadycongar@gmail.com>
license: MIT
compatibility: Designed for Claude Code
tags: [setup, initialization, project-analysis]
---

# Scaffold

One-shot project setup. Analyzes the codebase, builds the `.hyperflow/` cache, seeds the memory skeleton, and optionally installs detection shims for other AI tools. Does not start the spec → scope → dispatch chain — invoke `/hyperflow:spec` (or `/hyperflow:scope`) when you're ready for that.

## Step 1 — Analysis Cache

Check for `.hyperflow/` at project root.

**If absent — dispatch parallel searchers (single message, six Agent calls):**

| Label | File generated | Discovers |
|---|---|---|
| `Searcher — analyzing tech stack` | `profile.md` | Name, language, framework, build commands |
| `Searcher — mapping folder structure` | `architecture.md` | Dirs, patterns, routing, data flow |
| `Searcher — extracting conventions` | `conventions.md` | Naming, style, linting rules |
| `Searcher — scanning dependencies` | `dependencies.md` | UI lib, state, data fetching, DB, auth |
| `Searcher — auditing test setup` | `testing.md` | Runner, E2E, patterns, commands |
| `Searcher — reading git workflow` | `git-workflow.md` | Branches, commits, CI/CD, PR conventions |

See [project-analysis.md](references/project-analysis.md) for what each file captures.

**If present — staleness check:**
Compute SHA256 of tracked config files, compare against `.hyperflow/.checksums`. Refresh only stale files. Print `Refreshing — <comma-separated list of stale files>`.

**After analysis:**
- Write `.hyperflow/.checksums` (SHA256 of `package.json`, `tsconfig.json`, eslint/biome config, etc.)
- Append to `.gitignore` if `.hyperflow/` is not already excluded

## Step 2 — Memory Skeleton

Create `.hyperflow/memory/` if absent:

```
.hyperflow/memory/
├── index.md
├── learnings.md
├── decisions.md
├── pitfalls.md
├── patterns.md
├── conventions.md
└── archive/.gitkeep
```

**Migration:** If `~/.claude/hyperflow-memory.md` exists, migrate entries matching the current project path into the appropriate memory files. Tag migrated entries `[migrated]`.

## Step 3 — Detection Shims

Offer to run `scripts/setup-detection.sh --tools all` to generate AGENTS.md and CLAUDE.md.

Supported tools: `claude-code` (writes CLAUDE.md), `opencode` / `agents` (writes AGENTS.md), `all` (both).

Flags — `--tools <all|claude-code|opencode|agents>`, `--force`, `--dry-run`.

Default — `--tools all`. Ask once via `AskUserQuestion` if the user wants to skip any tool.

## Step 4 — Summary

Print what was created, skipped, and migrated (elegant style, no icons):

```
Hyperflow init complete
  Created   .hyperflow/{profile,architecture,conventions,dependencies,testing,git-workflow}.md
  Created   .hyperflow/.checksums
  Created   .hyperflow/memory/{index,learnings,decisions,pitfalls,patterns,conventions}.md
  Skipped   .gitignore entry — already present
  Migrated  3 entries from ~/.claude/hyperflow-memory.md
  Shims     AGENTS.md, CLAUDE.md
```

## Hand-off

This skill **does not** auto-chain. Init is project setup, not feature work. When the user wants to start a feature, they invoke `/hyperflow:spec` (for ambiguous scope) or `/hyperflow:scope` (for clear specs).

## Doctrine

Full rules in [DOCTRINE.md](references/DOCTRINE.md). Output style in [output-style.md](references/output-style.md).

## Overview

`/hyperflow:scaffold` is one-shot project setup. It analyzes the codebase via 6 parallel Sonnet searchers, builds the `.hyperflow/` cache (profile, architecture, conventions, dependencies, testing, git-workflow), seeds the memory skeleton, and optionally writes detection shims (CLAUDE.md for Claude Code, AGENTS.md for OpenCode). Does not start the spec → scope → dispatch chain — invoke `/hyperflow:spec` (ambiguous scope) or `/hyperflow:scope` (clear spec) when ready.

## Prerequisites

- Git repository (recommended for tag detection + git-workflow analysis; degrades gracefully if absent).
- Write access to the project root for `.hyperflow/` creation.
- For migration only: existing `~/.claude/hyperflow-memory.md` from a prior global install.

## Instructions

Numbered steps are in [Step 1 — Analysis Cache](#step-1--analysis-cache) through [Step 4 — Summary](#step-4--summary) above. Summary:

1. Check for `.hyperflow/` at project root; if absent, dispatch 6 parallel searchers (single message) to produce profile.md, architecture.md, conventions.md, dependencies.md, testing.md, git-workflow.md.
2. If present, recompute SHA256 checksums and refresh only stale files.
3. Create `.hyperflow/memory/` skeleton (index + 5 category files + archive/).
4. Migrate matching entries from legacy `~/.claude/hyperflow-memory.md` if found.
5. Offer `scripts/setup-detection.sh --tools all` to write CLAUDE.md + AGENTS.md.
6. Print summary of created / skipped / migrated artifacts.

## Output

See the summary block under [Step 4 — Summary](#step-4--summary) above. Format: plain English, em-dash separator, sections for Created / Skipped / Migrated / Shims. No icons.

## Error Handling

| Failure | Behavior |
|---|---|
| Not a git repo | Skip git-workflow.md searcher; print `(skipped — no git)` in summary. |
| Some searchers fail | Mark the failing files with `(partial)` in profile.md; continue. Other 5 sources still produce valid output. |
| `.hyperflow/` exists but `.checksums` missing | Treat all tracked configs as stale; refresh everything. |
| `~/.claude/hyperflow-memory.md` malformed | Skip migration; print `Migration skipped — legacy file parse failed at line N`. Original file untouched. |
| `setup-detection.sh` missing or non-executable | Print `Detection shims skipped — scripts/setup-detection.sh not runnable`. Initialization still succeeds. |
| `.gitignore` write blocked | Print warning and the suggested line to add manually; continue. |

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
  Created   .hyperflow/memory/{index,learnings,decisions,pitfalls,patterns,conventions}.md
  Created   .gitignore entry — .hyperflow/
  Shims     CLAUDE.md, AGENTS.md
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

## Resources

- [project-analysis.md](references/project-analysis.md) — what each generated file captures.
- [DOCTRINE.md](references/DOCTRINE.md) — orchestration rules (Layer 0 project analysis).
- [output-style.md](references/output-style.md) — summary block formatting.
