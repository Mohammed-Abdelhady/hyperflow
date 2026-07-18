---
name: bridge
description: |
  Use when the user wants hyperflow's behavioral rules to apply outside the terminal CLI — in Claude Code Desktop, claude.ai web, IDE extensions, Codex, OpenCode, Cursor, Grok, or Antigravity that load project instruction files but not CLI plugins. Writes a managed doctrine block into the provider-appropriate instruction file (CLAUDE.md and/or AGENTS.md) so autonomy + intent-routing + commit cadence + role separation + file-first rules carry over. Lossy (no slash commands, no actual skill dispatch) but useful.
  Trigger with /hyperflow:bridge, hyperflow bridge, "make hyperflow work in desktop", "make hyperflow work in claude.ai", "embed hyperflow doctrine in CLAUDE.md", "embed hyperflow doctrine in AGENTS.md", "portable hyperflow rules".
allowed-tools: Read, Write, Edit, Bash(cat:*), Bash(ls:*), Bash(date:*), Bash(python3:*)
argument-hint: "<generate|refresh|remove|status|mode> [auto|manual|off] [--target claude|agents|all]"
version: 5.14.0
license: MIT
compatibility: Claude Code · Codex · OpenCode · Cursor · Grok · Antigravity · any surface that loads CLAUDE.md or AGENTS.md
tags: [portability, desktop, web, claude-md, agents-md, bridge]
---

# Bridge

Embed the portable subset of hyperflow's doctrine into the project's **provider-appropriate instruction file(s)** so it applies in surfaces that don't load CLI plugins. The doctrine block is managed via fenced markers, so refreshing on plugin updates is idempotent and never rewrites content outside the markers.

Source template: [`templates/claude-md-doctrine.md`](../../templates/claude-md-doctrine.md) (same body for CLAUDE.md and AGENTS.md). Doctrine background: [DOCTRINE.md](../hyperflow/DOCTRINE.md). Implementation surface for auto mode: [`scripts/auto-bridge.py`](../../scripts/auto-bridge.py) (owned by setup/bridge scripts; this skill is the operator interface).

## Target selection (AGENTS vs CLAUDE)

Select which instruction file(s) to write using the same rules as `scripts/auto-bridge.py`. Live host signals and optional `--target` override the default:

| Provider / signal | Default target(s) |
|---|---|
| Claude Code (`CLAUDE_PLUGIN_ROOT`, Claude entrypoints) | `./CLAUDE.md` only |
| Codex (`CODEX_PLUGIN_ROOT`, `CODEX_HOME`, …) | `./AGENTS.md` only — **never** auto-mutates `CLAUDE.md` |
| OpenCode / Cursor / Grok / Antigravity | `./AGENTS.md`; also refresh `./CLAUDE.md` **only if** it already contains a managed doctrine block (mixed-surface projects stay current without creating CLAUDE.md for AGENTS-only setups) |
| Unknown / mixed | Refresh every instruction file that already has a managed block; if none, default to `./CLAUDE.md` (legacy) |
| Explicit `--target claude` | `./CLAUDE.md` only |
| Explicit `--target agents` | `./AGENTS.md` only |
| Explicit `--target all` | Both `./CLAUDE.md` and `./AGENTS.md` (create/refresh each; still preserves non-marker content) |

**Iron rule:** content outside `<!-- hyperflow:doctrine:start … -->` … `<!-- hyperflow:doctrine:end -->` is preserved byte-for-byte. Hyperflow owns only the managed block.

## Subcommands

| Subcommand | Description |
|---|---|
| `generate` | Write the doctrine block into the resolved target file(s) (create if absent, append if no block, replace block if present) |
| `refresh` | Same as `generate` — alias when the block already exists |
| `remove` | Remove the doctrine block from each resolved target (preserves user content; leave empty file if the file becomes whitespace-only — do not delete) |
| `status` | Show whether each candidate instruction file has the block, versions, freshness |
| `mode <auto\|manual\|off>` | Set auto-bridge mode for this project → `.hyperflow/.bridge-mode`. Session-start reads this |

Default subcommand when none provided: `status`.

Optional flag on `generate` / `refresh` / `remove` / `status`: `--target claude|agents|all` (overrides provider default for that invocation only; does not change `.bridge-mode`).

## Auto-bridge (default ON)

The session-start hook runs `scripts/auto-bridge.py` when the host supports hooks. Behavior depends on `.hyperflow/.bridge-mode`:

| Mode | Behavior |
|---|---|
| `auto` (**default** when `.bridge-mode` is absent) | If a resolved target is missing the doctrine block OR has an outdated body-sha/version, **silently writes/refreshes** that target and prints a one-line notice. Zero user friction. |
| `manual` | Never writes. Prints a one-line advisory when a target is missing or outdated: `./AGENTS.md doctrine block would be refreshed (version <X>) — run /hyperflow:bridge refresh to apply` (filename is the actual target). |
| `off` | Does nothing. No writes, no advisories. |

Codex-only sessions auto-bridge **AGENTS.md only**. Claude Code sessions auto-bridge **CLAUDE.md only**. Mixed-surface projects can keep both files current when both already carry managed blocks (or when the user runs `--target all`).

To opt out: `/hyperflow:bridge mode off` (or `hyperflow bridge mode off` on portable hosts). To require explicit refresh: `mode manual`.

## What gets written

A fenced block in each resolved target (repo root — where Desktop / web / Codex / OpenCode / Grok load project instructions):

```markdown
<!-- hyperflow:doctrine:start version=<X.Y.Z> generated=<ISO-8601> body-sha=<12-hex> source=https://github.com/Mohammed-Abdelhady/hyperflow -->

# Hyperflow Doctrine (Portable Subset)

<the full template body — autonomy, intent-routing, commit cadence,
 role separation, file-first artefacts, no AI attribution, security
 blocklists, what's missing vs CLI>

<!-- hyperflow:doctrine:end -->
```

The fenced markers let `refresh` replace **only** the doctrine block. Place the block anywhere; the bridge respects its position. One algorithm for CLAUDE.md and AGENTS.md — no forked bodies.

## When to use

| Situation | Use bridge? |
|---|---|
| Work exclusively in Claude Code CLI (terminal plugin) | Optional — plugin loads doctrine; bridge helps Desktop/web teammates |
| Claude Code Desktop / claude.ai web | **Yes** — target `CLAUDE.md` |
| Codex App/CLI for this project | **Yes** — target `AGENTS.md` |
| OpenCode / Cursor / Grok / Antigravity | **Yes** — target `AGENTS.md` (+ existing CLAUDE block if present) |
| IDE extension that shells out to the `claude` CLI | No — CLI plugin applies |
| Mixed teammates (Claude + Codex) | **Yes** — commit both instruction files when both are in use; prefer `--target all` once |

## What you keep / lose vs the full CLI plugin

| Capability | CLI plugin | Instruction-file bridge |
|---|---|---|
| Autonomy rules (no confirmations, minimal output, no hedging) | yes | **yes** |
| Intent-based routing (audit/debug/fix/brainstorm verbs) | yes | **yes (described as rules for the orchestrator)** |
| Per-task commit cadence | yes | **yes** |
| Role separation (workers execute, reviewers review) | yes | **yes** |
| File-first artefacts under `.hyperflow/` | yes | **yes** |
| Binary-gate rule (no recommendation on yes/no) | yes | **yes** |
| No-AI-attribution rule | yes | **yes** |
| Security blocklists | yes | **yes** |
| `/hyperflow:*` slash commands | yes | no — surfaces without the plugin can't dispatch named skills (portable hosts still resolve `hyperflow <skill>` aliases when skills are installed) |
| Chain-mode Step-0 / operational pre-elections | yes | no — portable defaults per doctrine text |
| Per-step Worker → Reviewer prompt templates | yes | partial — role-separation spirit only |
| Background agents, sticky/status/cache as slash commands | yes | no — need installed skills + host tools |
| Adaptive flow profiles (`fast` / `standard` / `deep`) | yes | no — orchestrator infers from message complexity |

Net coverage: ~70% of hyperflow's behavioral value. Slash commands and the infrastructure that wraps them are the missing 30% on pure instruction-file surfaces.

## Subcommand Details

### `generate` / `refresh`

1. Resolve plugin root for the template (first hit): `$CODEX_PLUGIN_ROOT`, `$CLAUDE_PLUGIN_ROOT`, `$OPENCODE_PLUGIN_ROOT`, `$GROK_PLUGIN_ROOT`, `$ANTIGRAVITY_PLUGIN_ROOT`, `$CURSOR_PLUGIN_ROOT`, then the install path that contains this `SKILL.md` (`../..` from `skills/bridge/`), then a vendored copy next to the plugin source. Prefer running `python3 <plugin-root>/scripts/auto-bridge.py <plugin-root> <project-root>` when that script is present (same algorithm as session-start). Manual path below if the script is unavailable.
2. Read template `templates/claude-md-doctrine.md`. Substitute `__HYPERFLOW_VERSION__` → `skills/hyperflow/VERSION`, `__GENERATED_AT__` → current UTC ISO-8601; stamp `body-sha` on the start marker (content-hash of the template body, matching `auto-bridge.py`).
3. Resolve target file list (provider table + optional `--target`).
4. For **each** target, read the file. Three cases:
   - **File absent** — create with just the doctrine block.
   - **File exists, no doctrine block** — append the block (one blank line separator if needed).
   - **File exists, block present** — replace only between start/end markers (inclusive). All other content preserved exactly.
5. Write each updated file.
6. Print a short confirmation listing every path written and the version.

Example confirmation:

```
Wrote hyperflow doctrine block:
  ./AGENTS.md (version 5.14.0, refreshed)
Surfaces that load AGENTS.md (Codex, OpenCode, Cursor, Grok, Antigravity) will now honor:
  · Autonomy rules
  · Intent-based routing (audit/debug/fix/brainstorm/scope/deploy verbs → live skills; never retired spec/scope stages)
  · Per-task commit cadence
  · Role separation (workers execute, reviewers review)
  · File-first artefacts under .hyperflow/
  · No AI attribution
  · Security blocklists

Re-run `/hyperflow:bridge refresh` (or `hyperflow bridge refresh`) after updating the plugin to pick up doctrine changes.
What's NOT in the bridge: slash-command dispatch without installed skills, plugin-loaded skill files, operational pre-elections.
```

When Claude is the provider, the path line is `./CLAUDE.md` instead. When both targets are written, list both.

### `remove`

1. Resolve targets (same table / `--target`).
2. For each target: if absent or no markers → note `Nothing to remove — no hyperflow doctrine block in ./<file>.` for that path.
3. Remove the block between markers; collapse adjacent blank lines (no triple newlines).
4. If the file is only whitespace after removal, leave an empty file — do not delete.
5. Print one line per file removed.

### `mode <auto|manual|off>`

Write the chosen mode to `.hyperflow/.bridge-mode` (one word). Session-start hooks read it on hosts that fire session start. Print one of:

```
Auto-bridge: AUTO — resolved instruction files are silently maintained on every supported session start (Claude → CLAUDE.md · Codex → AGENTS.md).
Auto-bridge: MANUAL — session start prints an advisory when a block is stale; you run /hyperflow:bridge refresh.
Auto-bridge: OFF — no advisories, no writes. Use /hyperflow:bridge generate manually if you want the block.
```

Defaults to `auto` when `.bridge-mode` is absent. Setting `auto` explicitly records the intent.

### `status`

For each of `./CLAUDE.md` and `./AGENTS.md` (always report both for visibility; mark which are in the **active write set** for this provider):

```
Hyperflow doctrine bridge
  Provider target set: AGENTS.md          # or CLAUDE.md · or CLAUDE.md + AGENTS.md · or --target override
  ./AGENTS.md: PRESENT · version 5.14.0 · generated 2026-05-17T15:30:00Z · body-sha abcdef012345 · up to date
  ./CLAUDE.md: NOT PRESENT
  Plugin current: 5.14.0
  Mode: auto (.hyperflow/.bridge-mode)
```

Other shapes:

```
  ./CLAUDE.md: PRESENT · version 5.13.0 · update available (re-run /hyperflow:bridge refresh)
  ./AGENTS.md: NOT PRESENT (no ./AGENTS.md in project root)
```

When neither file exists:

```
Hyperflow doctrine block: NOT PRESENT (no ./CLAUDE.md or ./AGENTS.md in project root)
  Use /hyperflow:bridge generate to create the provider-default instruction file with the doctrine block.
```

## Flow

1. Parse subcommand (default `status`) and optional `--target`.
2. Resolve provider target set.
3. Execute subcommand per details above (prefer `scripts/auto-bridge.py` for generate/refresh when available).
4. Print one confirmation block.

## Overview

`/hyperflow:bridge` (alias: `hyperflow bridge`) is the user-facing interface for the portable doctrine bridge. It does **not** enforce doctrine itself — it writes rules into instruction files that hosts load. Enforcement happens when the host loads `CLAUDE.md` and/or `AGENTS.md` at session start.

## Prerequisites

- Project root is writable (bridge writes `./CLAUDE.md` and/or `./AGENTS.md` and optionally `.hyperflow/.bridge-mode`).
- Template reachable via plugin root resolution above. If the template is missing, refuse with a clear error — do not invent doctrine text.

## Instructions

1. Parse subcommand (default `status`) + `--target` if present.
2. Resolve targets by provider table (never silently write CLAUDE.md on a Codex-only session unless `--target claude|all`).
3. Read/write instruction files per the subcommand; preserve all non-marker content.
4. Print one short confirmation block.

## Output

- `generate` / `refresh` — multi-line confirmation: paths written, version, surfaces that honor the block, what is NOT bridged.
- `remove` — one line per path.
- `status` — provider target set + per-file present/version/freshness + mode.
- `mode` — one-line mode confirmation.

## Error Handling

| Failure | Behavior |
|---|---|
| Target not writable | Print explicit error with path; suggest fixing permissions. Do **not** silently fall back to a hidden location or the other instruction file. |
| Plugin template not found | Search plugin-root candidates listed above. If still missing, refuse with a clear error. |
| Existing block has malformed markers (one without the other) | Refuse to refresh **that file**; print line ranges; ask the user to fix markers. Do **not** auto-repair — user content may be at risk. Other targets in the set may still proceed. |
| Multiple doctrine blocks in one file | Refuse that file; surface both line ranges. User decides which to keep. |
| Codex session + `--target` omitted | Write AGENTS.md only — never create/mutate CLAUDE.md automatically. |
| User runs `generate` repeatedly | Idempotent — replace block with latest template + timestamp/body-sha. No duplication. |
| `scripts/auto-bridge.py` unavailable | Perform the same marker algorithm inline with edit/shell ops; do not claim session-start auto-bridge will work if hooks are absent. |

## Examples

### Codex project (AGENTS.md)

```
You: /hyperflow:bridge generate

Wrote hyperflow doctrine block:
  ./AGENTS.md (version 5.14.0, generated)
Surfaces that load AGENTS.md will now honor autonomy, intent routing, commit cadence, role separation, file-first artefacts, no AI attribution, and security blocklists.
```

### Claude project (CLAUDE.md)

```
You: /hyperflow:bridge status

Hyperflow doctrine bridge
  Provider target set: CLAUDE.md
  ./CLAUDE.md: PRESENT · version 5.13.0 · update available
  ./AGENTS.md: NOT PRESENT
  Plugin current: 5.14.0
  Mode: auto
```

### Mixed surfaces

```
You: hyperflow bridge refresh --target all

Wrote hyperflow doctrine block:
  ./CLAUDE.md (version 5.14.0, refreshed)
  ./AGENTS.md (version 5.14.0, refreshed)
```

### Remove

```
You: /hyperflow:bridge remove

Removed hyperflow doctrine block from ./AGENTS.md. Surfaces that loaded the block will revert to default behaviour for that file.
```

## Resources

- [`templates/claude-md-doctrine.md`](../../templates/claude-md-doctrine.md) — portable doctrine template.
- [`scripts/auto-bridge.py`](../../scripts/auto-bridge.py) — provider-aware write algorithm used at session start.
- [DOCTRINE.md](../hyperflow/DOCTRINE.md) — full doctrine (CLI surface).
- [runtime-contract.md](../hyperflow/runtime-contract.md) — portable ops when edit/shell tools differ by host.
- [chain-router.md](../hyperflow/chain-router.md) — live skills only (never route to retired `spec` / `scope`).
- [output-style.md](../hyperflow/output-style.md) — confirmation-block format.
