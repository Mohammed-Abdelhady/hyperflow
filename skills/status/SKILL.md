---
name: status
description: |
  Use when the user wants a one-screen view of current hyperflow project state — version, install vs certification, profile freshness, memory count, and live progress on every in-flight task. Read-only; never modifies state, never dispatches workers.
  Trigger with /hyperflow:status, "what is hyperflow doing", "show task progress", "where are we".
allowed-tools: Read, Bash(git:*), Bash(ls:*), Bash(stat:*), Bash(date:*), Bash(grep:*), Bash(sed:*), Bash(cut:*), Bash(head:*), Bash(awk:*), Glob, Grep
argument-hint: ""
version: 3.1.3
license: MIT
compatibility: Portable — Claude Code, Codex, OpenCode, Antigravity, Cursor, Grok (semantic ops via runtime-contract)
tags: [introspection, read-only, project-state]
---

# Status

Read-only snapshot of the current hyperflow project, with live progress on every active task file. Standalone — does
not auto-chain and is never invoked by other skills. Invoked manually via `/hyperflow:status`.

Semantic host ops used only for reads: `shell` (git/stat/ls), file Read. Never `spawn`, never `edit`, never
`background` fire. Metrics honesty follows [runtime-contract.md](../hyperflow/runtime-contract.md). Output
conventions: [output-style.md](references/output-style.md).

The skill has four sections:

1. **Static snapshot** — version, profile freshness, memory count
2. **Capabilities** — **installed/enabled** vs **hooks/workflows certified** (never conflated)
3. **In-flight work** — per-task live progress (sub-tasks done/total, tokens when tracked, wall-clock, ETA)
4. **Background** (optional) — registry summary only when real entries exist; never invent jobs

## What to read

### Static snapshot

| Field | Source | Fallback |
|-------|--------|----------|
| Version | Plugin `skills/hyperflow/VERSION` and/or latest git tag matching `v*` + tag commit date | `(missing)` |
| Profile | `.hyperflow/profile.md` file modification time | `(missing)` |
| Memory | Line count of `.hyperflow/memory/index.md` minus header rows | `(none)` |
| Active tasks | Files matching `.hyperflow/tasks/*.md` | `(none)` |
| Active features | Folders matching `.hyperflow/features/*/feature.md` | `(none)` |

### Capabilities — installed vs certified (required)

Plugin presence **never** proves workflow certification for every host surface. Keep these rows distinct
([output-style.md](references/output-style.md) §9; [provider-codex.md](../hyperflow/provider-codex.md) surface claims).

| Term | Meaning | How to detect (honest) |
|---|---|---|
| **Installed** | Hyperflow version / plugin tree / provider-appropriate instruction target present for this project | Version file; plugin list / marketplace entry when queryable; `AGENTS.md` or `CLAUDE.md` presence (provider-appropriate) |
| **Enabled** | Session can load Hyperflow skills / aliases on this host | Live skill inventory or session descriptor when available; otherwise `(not reported)` |
| **Certified** | A **named** host surface (CLI, app-server, desktop App, etc.) has completed workflow certification for this provider lane | Certification artefacts / canaries / `config/codex-compatibility.json` (or equivalent) when present and positive; otherwise **`(not reported)`** or explicit partial claim |

Rules:
- Codex / OpenCode / Cursor / Grok / Antigravity → prefer reporting **`AGENTS.md`** under installed.
- Claude Code → prefer reporting **`CLAUDE.md`** under installed.
- Never claim App / desktop certification solely because marketplace install or CLI plugin-list succeeded.
- Registry-only proof (plugin installed, canaries absent) → `installed` / maybe `enabled`, **not** fully certified.
- When certification data is absent: print `certified   (not reported)` — do **not** invent a surface claim.
- When hooks or workflows were not exercised: do not print them as certified.

```
[capabilities]
  installed   hyperflow v<x> · AGENTS.md present   (or CLAUDE.md on Claude hosts)
  enabled     yes | (not reported)
  certified   CLI (when proven) | (not reported) | partial — <what is proven>
```

### Active features (multi-phase work)

For every `.hyperflow/features/*/feature.md` (see [feature-phases.md](../hyperflow/feature-phases.md)), parse its
`## Status` block and the phase roster, then for each `phase-<n>-*/phase.md` show the phase status + Progress bar:

```
── Feature: checkout-redesign ──  (2 / 3 phases)
  phase-1-data-layer   completed
  phase-2-api          in_progress  [████░░░░]  2/5 tasks · running: T3-handlers
  phase-3-ui           pending      depends on phase-2
```

The per-phase bar uses the same parsing as the per-task-file section below (each `phase.md` carries the same
`## Status` block shape). Omit this section when no `.hyperflow/features/*/` exist. Use plain words only — no
decorative status icons (see [output-style.md](references/output-style.md) banned characters).

### In-flight work (per task file)

For every `.hyperflow/tasks/*.md`, parse its `## Status` block (written by `/hyperflow:plan` at creation and updated by `/hyperflow:dispatch` after each sub-task PASS — see plan/SKILL.md Step 10):

| Field | Source | Behaviour |
|-------|--------|----------|
| Slug | basename of the task file minus `.md` | always present |
| Done / total | `Progress` row in the two-column Status table | falls back to legacy `Sub-tasks: <done> / <total>`, then checkbox counting |
| Done sub-task names | lines with `[x]` from the `## Batches` section | listed under the bar |
| Running sub-task | the first `[~]` checkbox (dispatch marks `~` while a sub-task is mid-flight) | `(idle)` if none |
| Pending sub-task count | count of `[ ]` checkboxes | shown as `N pending` |
| Tokens used | `Tokens` row in Status table (ledger total + execution/review/verification phase totals) | falls back to legacy `Tokens used:`; **`(not tracked yet)`** or **`unavailable`** if absent — never invent |
| Wall-clock | `Wall-clock` row in Status table | falls back to legacy `Wall-clock:`; `(not started)` if absent |
| ETA | ETA text inside `Wall-clock` row | falls back to legacy `ETA:`; `(computing)` if <3 sub-tasks done |

### Background (optional)

If `.hyperflow/background/registry.json` exists and has entries, print a one-line summary:
`Background  N running · N uncollected · N stalled` (counts from real registry only).

If missing or empty: omit the section, or print `Background  (none)` — never invent job IDs. On hosts without the
`background` op, do not claim in-flight background agents unless the registry literally contains them from a prior
capable session.

## How to compute each field

### Version

Prefer plugin version file, then git tags:

```bash
plugin_ver=$(cat skills/hyperflow/VERSION 2>/dev/null || cat "$PLUGIN_ROOT/skills/hyperflow/VERSION" 2>/dev/null)
tag=$(git tag --sort=-v:refname | grep -E '^v[0-9]' | head -1)
released=$(git log -1 --format=%ci "$tag" 2>/dev/null | cut -d' ' -f1)
```

If neither is available → print `(missing)`. Do not invent a version.

### Profile freshness

```bash
profile=".hyperflow/profile.md"
now=$(date +%s)
mtime=$(stat -f %m "$profile" 2>/dev/null || stat -c %Y "$profile" 2>/dev/null)
hours=$(( (now - mtime) / 3600 ))
```

- File absent → `(missing)`
- `hours <= 24` → `fresh   (analyzed Xh ago)`
- `hours > 24`  → `stale   (analyzed Xh ago)`

### Memory entry count

Count table-body rows in `.hyperflow/memory/index.md` (lines starting with `|`, minus header + separator):

```bash
count=$(grep -c '^|' .hyperflow/memory/index.md 2>/dev/null)
entries=$(( count - 2 ))
```

If file absent or count ≤ 0 → `(none)`.

### Active tasks list

```bash
tasks=$(ls .hyperflow/tasks/*.md 2>/dev/null)
```

If no files → show `(none)` and skip the In-flight section entirely.

### Per-task Status parsing

For each `.hyperflow/tasks/<slug>.md`:

```bash
# Canonical two-column markdown table first.
table_value() {
  awk -F'|' -v target="$1" '
    {
      key=$2; value=$3
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      if (key == target) { print value; exit }
    }
  ' "$file"
}

progress=$(table_value "Progress")
tokens=$(table_value "Tokens")
wall=$(table_value "Wall-clock")
sub_done=$(printf '%s\n' "$progress" | sed -nE 's|.* ([0-9]+) */ *([0-9]+) sub-tasks.*|\1|p')
sub_total=$(printf '%s\n' "$progress" | sed -nE 's|.* ([0-9]+) */ *([0-9]+) sub-tasks.*|\2|p')
eta=$(printf '%s\n' "$wall" | sed -nE 's|.*ETA[[:space:]]*([^·]+).*|\1|p')

# Backwards compatibility for pre-table task files.
[ -n "$sub_done" ] || sub_done=$(grep '^Sub-tasks:' "$file" | sed -E 's|.*: *([0-9]+) */ *([0-9]+).*|\1|')
[ -n "$sub_total" ] || sub_total=$(grep '^Sub-tasks:' "$file" | sed -E 's|.*: *([0-9]+) */ *([0-9]+).*|\2|')
[ -n "$tokens" ] || tokens=$(grep '^Tokens used:' "$file" | sed 's|^Tokens used: *||')
[ -n "$wall" ] || wall=$(grep '^Wall-clock:' "$file" | sed 's|^Wall-clock: *||')
[ -n "$eta" ] || eta=$(grep '^ETA:' "$file" | sed 's|^ETA: *||')
started=$(grep '^Started:' "$file" | sed 's|^Started: *||')
```

If the Status block is missing or malformed (old-style task file from before this format), fall back to counting checkboxes directly:

```bash
done=$(grep -c '^- \[x\]' "$file" 2>/dev/null)
running=$(grep -c '^- \[~\]' "$file" 2>/dev/null)
pending=$(grep -c '^- \[ \]' "$file" 2>/dev/null)
total=$(( done + running + pending ))
```

Empty tokens → `(not tracked yet)` or `unavailable`. **Never fabricate** token totals, cache hits, or agent counts.

### Done sub-task names (for the indented list)

```bash
grep '^- \[x\]' "$file" | sed -E 's|^- \[x\] *||' | head -5
```

Show up to the **last 3 completed** + the **currently running** sub-task. If there are more than 3 done, prefix the list with `… (N earlier done)`.

### Running sub-task

The dispatch skill marks the in-flight sub-task with `[~]` while the worker is running. After PASS + commit, dispatch flips `[~]` → `[x]`.

```bash
running=$(grep '^- \[~\]' "$file" | sed -E 's|^- \[~\] *||' | head -1)
```

If no `[~]` line exists → the dispatch is either between sub-tasks (idle for milliseconds) or has handed control back. Show `(idle — last update Xm Ys ago)` based on `Last update:` timestamp when present.

### Progress bar

20-char ASCII bar based on `done / total`:

```
[████████████░░░░░░░░] 12/20  60%
```

Use `█` (filled) and `░` (empty). No emoji or color icons.

## Output format

Print the block below. If no in-flight tasks, omit the `── In-flight work ──` section.

```
── Hyperflow Status ─────────────────────────────────────────
Version       v3.0.0     (released 2026-05-16)
Profile       fresh      (analyzed 2h ago)
Memory        12 entries
Active tasks  2

[capabilities]
  installed   hyperflow v3.0.0 · AGENTS.md present
  enabled     (not reported)
  certified   (not reported)

── In-flight work ───────────────────────────────────────────
Task:         implement-auth
  Progress    [███████████░░░░░░░░░] 8/14  57%
  Last done   T7: Reset email worker
  Running     T8: Login UI (Implementer · 14s elapsed)
  Pending     6 sub-tasks
  Tokens      231.2k total · execution 142.0k · review 89.2k · verification 0
  Wall-clock  4m 22s elapsed
  ETA         ~3m 16s remaining   (avg 32s/sub-task · 6 left)

Task:         fix-login-bug
  Progress    [░░░░░░░░░░░░░░░░░░░░] 0/3   0%
  Status      not started (created 8m ago, no dispatch run yet)
  Tokens      (not tracked yet)
─────────────────────────────────────────────────────────────
```

When Profile is `(missing)`, omit the `(analyzed Xh ago)` parenthetical.

When Version is `(missing)`, print `Version       (missing)`.

When no `.hyperflow/tasks/*.md` files exist, omit the `── In-flight work ──` section entirely; the snapshot +
capabilities blocks stand alone.

When tokens are not in the Status table: print `Tokens      (not tracked yet)` or `Tokens      unavailable` —
never invent.

## ETA computation

```
elapsed_seconds       = parsed elapsed value from the Wall-clock table row
avg_per_subtask       = elapsed_seconds / done
remaining_seconds     = avg_per_subtask * pending
```

Format as `Xm Ys` or `Hh Mm` (skip zero leading units). Show `(computing)` when `done < 3` — too few data points for a useful average.

If the task has multiple batches and the next batch is `sequential` per the planner output, multiply remaining by `1.1` to account for inter-batch synchronisation overhead.

## Failure modes

Every section degrades gracefully:

- Missing git tags / version file → `Version  (missing)`
- Missing `.hyperflow/profile.md` → `Profile  (missing)`
- Missing `.hyperflow/memory/index.md` → `Memory  (none)`
- No `.hyperflow/tasks/*.md` files → `Active tasks  (none)`, no In-flight section
- Task file present but Status block malformed/missing → fall back to checkbox count, show `(not tracked yet)` for tokens/ETA
- `Wall-clock` table row absent (and no legacy `Started:` line) → `Status  not started`, skip ETA
- No certification canaries → `certified   (not reported)` — not a failure
- `usage_metrics` / ledger absent → tokens `unavailable` / `(not tracked yet)`
- Background registry missing → omit or `(none)`; never invent agents

Never error out. Never modify any file. Never dispatch an agent. Never fabricate metrics or certification.

## Doctrine

This skill has no Worker/Reviewer dispatch — it is a pure read. It does not count as a hyperflow run and does not
append to memory. Output style follows [output-style.md](references/output-style.md) — no decorative icons, em-dash
separators, plain status words. Runtime honesty: [runtime-contract.md](../hyperflow/runtime-contract.md).

## Overview

`/hyperflow:status` prints a one-screen snapshot of the project's hyperflow state, an explicit installed-vs-certified
capabilities block, and a live progress block for every in-flight task. Useful when picking up a session mid-flight,
deciding whether to invoke `/hyperflow:dispatch`, or auditing whether a chain run is still healthy. Pure read — no
agents, no writes, no chain side-effects.

## Prerequisites

- Git repository (for the version line — degrades to `(missing)` otherwise).
- `.hyperflow/` directory (for profile/memory/tasks lines — each section degrades to `(missing)` or `(none)` if absent).
- No prerequisites for invocation itself — runs anywhere.

## Instructions

See [What to read](#what-to-read) and [How to compute each field](#how-to-compute-each-field) above for the full operational spec. Summary:

1. Read version from plugin VERSION and/or latest git tag matching `v*`.
2. Stat `.hyperflow/profile.md` for freshness; bucket into fresh/stale/missing.
3. Count entries in `.hyperflow/memory/index.md`.
4. Render **[capabilities]** with installed / enabled / certified rows (honest unknowns).
5. Glob `.hyperflow/tasks/*.md` and parse each Status block for live progress (tokens only when present).
6. Optionally summarize background registry if real entries exist.
7. Stop. No prompts, no follow-ups, no agents.

## Output

See [Output format](#output-format) above for the exact block. Snapshot + capabilities + (if active tasks) In-flight
work with per-task progress bar, last-done sub-task, currently-running sub-task, pending count, tokens (or
unavailable), wall-clock, ETA.

## Error Handling

| Failure | Behavior |
|---|---|
| Not a git repo | `Version  (missing)` unless plugin VERSION is readable; everything else still renders if `.hyperflow/` exists. |
| `.hyperflow/profile.md` missing | `Profile  (missing)` (no parenthetical). |
| `.hyperflow/memory/index.md` missing | `Memory  (none)`. |
| No task files | Omit the In-flight section entirely; just print the snapshot + capabilities. |
| Task file with malformed Status block | Fall back to counting `[x]` vs `[ ]` checkboxes; show `(not tracked yet)` for tokens/ETA. |
| `stat` flag differs between BSD (macOS) and GNU (Linux) | Try `stat -f %m` then fall back to `stat -c %Y`. |
| Certification data absent | `certified   (not reported)` — do not invent CLI/App claims. |
| Tokens not in Status table | `Tokens      (not tracked yet)` or `unavailable`. |

Never errors out. Never modifies any file. Never dispatches an agent.

## Examples

### Healthy project, no active tasks, registry-only install (not certified)

```
── Hyperflow Status ─────────────────────────────────────────
Version       v3.1.2
Profile       fresh      (analyzed 2h ago)
Memory        12 entries
Active tasks  (none)

[capabilities]
  installed   hyperflow v3.1.2 · AGENTS.md present
  enabled     yes
  certified   (not reported)
─────────────────────────────────────────────────────────────
```

Plugin installed/enabled does **not** print as fully certified when hooks/workflow canaries are absent.

### Mid-dispatch with two active tasks

```
── Hyperflow Status ─────────────────────────────────────────
Version       v3.1.2     (released 2026-05-16)
Profile       fresh      (analyzed 2h ago)
Memory        12 entries
Active tasks  2

[capabilities]
  installed   hyperflow v3.1.2 · CLAUDE.md present
  enabled     (not reported)
  certified   (not reported)

── In-flight work ───────────────────────────────────────────
Task:         implement-auth
  Progress    [███████████░░░░░░░░░] 8/14  57%
  Last done   T7: Reset email worker
  Running     T8: Login UI (Implementer · 14s elapsed)
  Pending     6 sub-tasks
  Tokens      thinking 89.2k · worker 142.0k · total 231.2k
  Wall-clock  4m 22s elapsed
  ETA         ~3m 16s remaining   (avg 32s/sub-task · 6 left)

Task:         fix-login-bug
  Progress    [░░░░░░░░░░░░░░░░░░░░] 0/3   0%
  Status      not started (created 8m ago, no dispatch run yet)
  Tokens      (not tracked yet)
─────────────────────────────────────────────────────────────
```

### Brand new install (no .hyperflow/ yet)

```
── Hyperflow Status ─────────────────────────────────────────
Version       v3.1.2
Profile       (missing)
Memory        (none)
Active tasks  (none)

[capabilities]
  installed   hyperflow v3.1.2 · (instruction file not reported)
  enabled     (not reported)
  certified   (not reported)
─────────────────────────────────────────────────────────────
```

## Resources

- [output-style.md](references/output-style.md) — em-dash style, no decorative chars, plain status words, installed vs certified.
- [artefact-data.md](../hyperflow/artefact-data.md) — viewer mode: read `.hyperflow/artefacts/<type>/<slug>.json` first (parse `status`/batch progress from JSON), fall back to the slim stub, then the legacy full-markdown status block.
- [runtime-contract.md](../hyperflow/runtime-contract.md) — metrics honesty, background absence, capability precedence.
- [provider-codex.md](../hyperflow/provider-codex.md) — surface claims (CLI vs App certified separately).
- [DOCTRINE.md](../hyperflow/DOCTRINE.md) — orchestration rules (status is exempt from per-step agent dispatch).
