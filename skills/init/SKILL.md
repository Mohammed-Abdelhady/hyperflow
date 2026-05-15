---
name: init
description: Use when starting hyperflow in a new project, re-initializing analysis, refreshing `.hyperflow/` cache, or installing multi-tool auto-detection shims (AGENTS.md, Cursor rules, GEMINI.md, CLAUDE.md). Trigger phrases: "init hyperflow", "set up hyperflow", "refresh hyperflow", "install hyperflow shims".
---

# Hyperflow Init

Focused init flow for manual invocation. The main `hyperflow:hyperflow` skill runs this automatically at session start; invoke this skill directly to re-initialize, force-refresh, or install shims.

## Step 1: Analysis Cache

Check for `.hyperflow/` at project root.

**If absent → dispatch parallel searcher agents:**

| Label | File generated | Discovers |
|---|---|---|
| `⚡ [Searcher] Analyzing tech stack` | `profile.md` | Name, language, framework, build commands |
| `⚡ [Searcher] Mapping folder structure` | `architecture.md` | Dirs, patterns, routing, data flow |
| `⚡ [Searcher] Extracting conventions` | `conventions.md` | Naming, style, linting rules |
| `⚡ [Searcher] Scanning dependencies` | `dependencies.md` | UI lib, state, data fetching, DB, auth |
| `⚡ [Searcher] Auditing test setup` | `testing.md` | Runner, E2E, patterns, commands |
| `⚡ [Searcher] Reading git workflow` | `git-workflow.md` | Branches, commits, CI/CD, PR conventions |

All six dispatch simultaneously. See [project-analysis.md](../hyperflow/project-analysis.md) for what each file captures.

**If present → staleness check:**
Compute SHA256 of tracked config files, compare against `.hyperflow/.checksums`. Refresh only stale files.

**After analysis:**
- Write `.hyperflow/.checksums` (SHA256 of `package.json`, `tsconfig.json`, eslint/biome config, etc.)
- Append to `.gitignore` if `.hyperflow/` is not already excluded

## Step 2: Memory Skeleton

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

## Step 3: Multi-Tool Shims

Offer to run `scripts/setup-detection.sh --tools all` to generate AGENTS.md, Cursor rules, GEMINI.md, and CLAUDE.md.

Flags: `--tools <all|agents|cursor|gemini|claude>`, `--force`, `--dry-run`.

Default: `--tools all`. Ask once via `AskUserQuestion` if user wants to skip any tool.

## Step 4: Summary

Print what was created, skipped, and migrated:

```
⚡ Hyperflow Init Complete
  Created  .hyperflow/{profile,architecture,conventions,dependencies,testing,git-workflow}.md
  Created  .hyperflow/.checksums
  Created  .hyperflow/memory/{index,learnings,decisions,pitfalls,patterns,conventions}.md
  Skipped  .gitignore entry (already present)
  Migrated 3 entries from ~/.claude/hyperflow-memory.md
  Shims    AGENTS.md, .cursor/rules, GEMINI.md, CLAUDE.md
```
