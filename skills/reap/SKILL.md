---
name: reap
description: |
  Use when the user wants to archive completed hyperflow artefacts for a slug, clear ephemeral leftovers (usage ledgers, session log bloat, settled commit queues, terminal background buffers), and optimise durable memory — never source code. Also the phase contract lifecycle skills (dispatch/deploy/handoff) invoke at completion when cleanup.reapOnComplete is true.
  Trigger with /hyperflow:reap, hyperflow reap, "reap completed tasks", "archive finished slug", "clean up after dispatch", "post-completion cleanup".
allowed-tools: Read, Bash(ls:*), Bash(cat:*), Bash(python3:*), Bash(scripts/*:*), AskUserQuestion
argument-hint: "<slug> [--dry-run] [--force]"
version: 5.14.0
license: MIT
compatibility: Claude Code · Codex · OpenCode · Grok · Antigravity (project-local .hyperflow only)
tags: [cleanup, archive, lifecycle, post-completion, hygiene]
---

# Reap

Scope-aware post-completion reaper for `.hyperflow` artefacts. Given a slug, archive its completed task/feature scope, hard-delete ephemeral leftovers, optimise durable memory (never delete memory category files wholesale), and emit a structured report. Idempotent. Never touches application source code — only paths under the project's `.hyperflow/` tree (plus archive destinations under it).

Portable hosts accept `/hyperflow:reap` and `hyperflow reap` equally. Semantic ops: [runtime-contract.md](../hyperflow/runtime-contract.md) (`shell`, `structured_question` — no provider-specific APIs).

## Command

```
/hyperflow:reap <slug> [--dry-run] [--force]
```

| Arg / flag | Description |
|---|---|
| `<slug>` | Required. Artefact slug (`^[a-z0-9-]+$`) — flat task or multi-phase feature. |
| `--dry-run` | Report plan only; mutate nothing (also honours `cleanup.dryRun` in config). |
| `--force` | Reap even when the slug is non-terminal (Status/State not `complete`/`completed`). Requires confirmation on manual runs — see [Non-terminal manual gate](#non-terminal-manual-gate). |

## What gets reaped (classes)

| Class | Action | Paths (under `.hyperflow/`) |
|---|---|---|
| **Archive** | Move completed scope into `.hyperflow/archive/` via `archive-artefacts.py` | `tasks/<slug>.md`, `tasks/<slug>/`, `specs/<slug>.md`, `specs/<slug>.draft.md`, `features/<slug>/`, artefact twins `artefacts/*/<slug>.json` |
| **Ephemeral** | Hard-delete or truncate | Stale `usage/*.jsonl` (past `usageRetentionDays`, never the active chain ledger), `.session-start.log` over `logMaxLines`, terminal+stale `background/bg-*.md`, settled `commits-queue/` |
| **Memory** | Optimise only — auto-reap removes no durable entry | Rebuild `memory/index.md`, flag oversized files for `/hyperflow:cache compact`. Entry pruning is opt-in (`cleanup.dropOrphanRefs`, default `false`) and quarantines orphaned entries to `memory/archive/YYYY-MM.md`, never hard-deleting |

**Protected (never mutated):** `.version`, `.last-cleanup`, `.hyperflow-handoff`, `.active-chain-id`, `.chain-base`, and all application source outside `.hyperflow/`.

**Terminal gate (default):** slug must be terminal — flat `tasks/<slug>.md` Status/State `complete|completed`, or `features/<slug>/feature.md` Status `completed`. Non-terminal → skip with `reason: non-terminal` unless `--force`.

## Script resolution (provider-neutral)

Resolve `reap.py` with the first existing path:

1. `$CODEX_PLUGIN_ROOT/scripts/reap.py`
2. `$CLAUDE_PLUGIN_ROOT/scripts/reap.py`
3. `$OPENCODE_PLUGIN_ROOT/scripts/reap.py`
4. `$GROK_PLUGIN_ROOT/scripts/reap.py`
5. `$ANTIGRAVITY_PLUGIN_ROOT/scripts/reap.py`
6. `$CURSOR_PLUGIN_ROOT/scripts/reap.py`
7. Plugin root derived from this skill file: `../../scripts/reap.py` relative to `skills/reap/`
8. `$PROJECT_ROOT/scripts/reap.py` if the project vendors the script

When the script is found and the host exposes a **shell** op: run the exact call below and print stdout/stderr (JSON report on stdout; human summary on stderr when not `--json`).

When the script is **missing**: refuse with `reap.py not found — install/update hyperflow plugin or vendor scripts/reap.py`. Do not hand-roll archive/delete logic in the skill; the script is the single source of truth.

When `shell` is unavailable: print the planned report shape from read-only inspection of terminal status + candidate paths, and the exact command for the user to run; do not claim a reap succeeded.

## Exact invocation

```
python3 <resolved-reap.py> <project-root>/.hyperflow --slug <slug> [--dry-run] [--force] [--json]
```

- First positional argument is always the **`.hyperflow` directory**, not the project root alone.
- `--slug` is required.
- Config knobs load from `~/.hyperflow/config.json` → `cleanup.*` (and `memory.compactionThreshold` for flagging only). Schema: [config/schema.json](../../config/schema.json) `cleanup` block.

### Config knobs (read by the script)

| Key | Default | Role |
|---|---|---|
| `cleanup.reapOnComplete` | `true` | Lifecycle skills fire reap at termini when true |
| `cleanup.dryRun` | `false` | Global dry-run override (OR with CLI `--dry-run`) |
| `cleanup.usageRetentionDays` | `30` | Age before usage ledgers may delete |
| `cleanup.logMaxLines` | `2000` | Max lines kept in `.session-start.log` |
| `cleanup.staleDays` / `pruneDays` / `auto` | (archive sweep) | Daily session-start sweep — not this skill's path; reap is slug-scoped |

## Reap-phase contract (lifecycle skills)

Lifecycle termini **must** call the reaper when `cleanup.reapOnComplete` is `true` (default). Authors of **dispatch** (wrap-up), **deploy** (end), and **handoff** (`complete` / terminal review path) implement the same phase — do not invent alternate cleanup.

### Gate

1. Read effective config (project/user `cleanup` block; fall back to defaults).
2. If `cleanup.reapOnComplete` is `false` → skip reap; print one line `reap skipped — cleanup.reapOnComplete=false` and continue the parent skill.
3. If no completed slug is in scope for this terminus → skip (nothing to reap).
4. Otherwise run the exact call (not a paraphrase):

```
python3 <resolved-reap.py> <project>/.hyperflow --slug <S>
```

where `<S>` is the just-completed task or feature slug. Lifecycle automatic path does **not** pass `--force`. Non-terminal → script no-ops with `skipped: non-terminal` (exit 0) — parent skill continues.

Optional: pass `--json` only when the parent skill needs machine-parseable stdout; default human-friendly dual output is fine.

### Phase placement

| Skill | When | Slug source |
|---|---|---|
| `dispatch` | Step wrap-up after chain success / terminal task status written | Task or feature slug just marked complete |
| `deploy` | After successful deploy end for a scoped slug | Deploy target slug when artefacts are complete |
| `handoff` | On `complete <slug>` / archive path after reviewed | Handoff package slug when tied to a completed `.hyperflow` artefact |

Do **not** reap mid-chain. Do **not** reap source trees. Do **not** skip the gate silently when `reapOnComplete` is true and a terminal slug is available — run the script (or surface shell unavailability honestly).

### Lifecycle phase report

After the call, print the [Report block](#report-block) (or the script's JSON + one-line summary). Parent skill must not claim "cleaned up" if the script was skipped or failed.

## Non-terminal manual gate

Manual `/hyperflow:reap <slug>` without `--force` on a **non-terminal** slug: the script returns empty work + `skipped: non-terminal`. The skill should surface that clearly.

Manual `/hyperflow:reap <slug> --force` (or operator asks to force a non-terminal slug):

1. Prefer a **dry-run preview first**:
   `python3 <resolved-reap.py> <project>/.hyperflow --slug <slug> --force --dry-run`
2. Print the planned archived/deleted paths from the report.
3. Confirm via **`structured_question`** (prefer native structured question UI / `AskUserQuestion` when present) — **binary** action gate, **no** `(Recommended)` marker:

```
Reap non-terminal slug "<slug>"? This archives in-scope .hyperflow artefacts and may delete ephemeral leftovers. Source code is never touched.
  Yes — run reap with --force
  No  — cancel
```

4. **If structured input is absent:** print the same options as a `Hyperflow Question` chat block and **end the turn**. Do not mutate until the user answers.
5. **If no interactive channel (headless):** refuse. Print `force reap requires interactive confirmation` and stop. Do not pass `--force`.
6. On **Yes** only → run without `--dry-run` (keep `--force`). On **No** → print `Reap cancelled` and stop.

Silent defaulting of this gate is a doctrine / runtime-contract violation.

`--dry-run` alone never requires confirmation (read-only plan).

## Flow

1. Parse args: require `<slug>`; optional `--dry-run`, `--force`.
2. Validate slug shape (`^[a-z0-9-]+$`). Invalid → refuse with usage; do not call the script.
3. Confirm `.hyperflow/` exists at project root. If missing → print `No .hyperflow/ — run /hyperflow:scaffold first` and stop.
4. Resolve `reap.py` (provider-neutral list above).
5. If `--force` and not already dry-run-only → [Non-terminal manual gate](#non-terminal-manual-gate) (preview + confirm) when the slug is non-terminal or force was requested without a prior preview in this turn.
6. Run via host **shell**:
   `python3 <script> <project>/.hyperflow --slug <slug> [--dry-run] [--force]`
7. Print script output + compact **Report block** footer.
8. Never edit application source; never `git commit` as part of reap; never wipe `memory/*.md` category files wholesale.

## Report block

Always render a compact footer (parse JSON stdout when present; otherwise map stderr human summary):

```
── Reap ──────────────────────────────
Slug:         <slug>
Mode:         live | dry-run | force | force+dry-run
Terminal:     yes | no | unknown
Archived:     N
Deleted:      N
Bytes freed:  <n> | unavailable
Memory:       indexRebuilt=<bool> · orphansDropped=<n> · compactFlagged=<n>
Skipped:      N  (reasons: …)
Result:       reaped | dry-run | skipped-non-terminal | cancelled | error | script-missing
──────────────────────────────────────
```

JSON report shape (script stdout, single object):

```json
{
  "slug": "<slug>",
  "dryRun": false,
  "archived": [{"path": "tasks/<slug>.md", "dest": "archive/..."}],
  "deleted": ["usage/old-chain.jsonl"],
  "bytesFreed": 0,
  "memory": {
    "indexRebuilt": true,
    "orphansDropped": 0,
    "compacted": []
  },
  "skipped": [{"path": "<slug>", "reason": "non-terminal"}]
}
```

- `memory.compacted` is a **flag list** of oversized durable files (suggest `/hyperflow:cache compact`) — not automatic deletion.
- Idempotent: second reap on the same completed slug yields empty `archived` / minimal `deleted`.

## Iron rules

- **Never touches source code.** Only `.hyperflow/**` (archive, ephemeral, memory optimise).
- **Never** `rm -rf` the project, never delete `.hyperflow` itself, never force-push, never `--no-verify`.
- **Never** auto-`--force` from lifecycle phase; only the manual skill path with confirmation.
- **Never** invent archived/deleted paths when the script did not run.
- **Autonomy does not skip** the force confirmation gate or headless refuse rules.
- Durable memory category files are not wiped; an auto-reap only rebuilds `index.md` and flags oversized files. Orphan-Evidence entries drop only when `cleanup.dropOrphanRefs` is enabled (default off), and are quarantined to `memory/archive/YYYY-MM.md`, never hard-deleted.

## Overview

`/hyperflow:reap` is the operator interface for slug-scoped post-completion hygiene. Lifecycle skills call the same `scripts/reap.py` automatically when `cleanup.reapOnComplete` is true. Manual use covers interrupted cleanup, forced archive of abandoned scopes, and dry-run previews before destructive ephemeral deletes.

## Prerequisites

- `.hyperflow/` initialized (`/hyperflow:scaffold` if missing).
- `python3` + resolved `scripts/reap.py` (plugin or vendored).
- Host **shell** op for mutation; without it, status/plan + manual command only.
- Write access under `.hyperflow/` for live (non-dry-run) runs.

## Instructions

1. Parse `<slug>` and flags from the invocation (portable: `/hyperflow:reap …` or `hyperflow reap …`).
2. Validate prerequisites; resolve script path.
3. Apply non-terminal force gate when needed (`structured_question` → Hyperflow Question → refuse headless).
4. Execute exact `python3 …/reap.py <project>/.hyperflow --slug S […]` via **shell**.
5. Print [Report block](#report-block). Stop. No chain continuation required (lifecycle parents already own next steps).

## Output

- Script JSON (stdout) and optional human summary (stderr).
- Skill footer: [Report block](#report-block).
- On skip/cancel/error: explicit `Result:` line — never silent success.

## Error Handling

| Failure | Behavior |
|---|---|
| Missing `<slug>` | Print usage: `/hyperflow:reap <slug> [--dry-run] [--force]`. Exit without mutation. |
| Invalid slug | Refuse; print `invalid slug` (must match `^[a-z0-9-]+$`). |
| `.hyperflow/` missing | Print scaffold hint; stop. |
| `reap.py` not found | Refuse with resolution list; do not invent cleanup. |
| Non-terminal without `--force` | Report `skipped-non-terminal`; no mutation of archive-class paths. |
| `--force` without confirmation (interactive) | Hyperflow Question / structured_question; **no mutation** until Yes. |
| `--force` headless | Refuse: `force reap requires interactive confirmation`. |
| `cleanup.reapOnComplete=false` (lifecycle) | Skip phase; one-line notice; parent continues. |
| Shell op unavailable | Read-only plan if possible + exact manual command; `Result: error` / script-missing equivalent — do not claim reaped. |
| Script non-zero / `ReapError` | Print stderr (`hyperflow reap: refused — …`); leave state as the script left it; `Result: error`. |
| Unflushed commits queue | Script skips queue delete (`unflushed-queue`); direct user to `/hyperflow:flush` if commits should land first. |

## Examples

### Dry-run completed slug

```
/hyperflow:reap auth-refactor --dry-run

{"slug":"auth-refactor","dryRun":true,"archived":[{"path":"tasks/auth-refactor.md","dest":"archive/(planned)/auth-refactor.md"}],"deleted":[],"bytesFreed":0,"memory":{"indexRebuilt":true,"orphansDropped":0,"compacted":[]},"skipped":[]}
── Reap ──────────────────────────────
Slug:         auth-refactor
Mode:         dry-run
Terminal:     yes
Archived:     1
Deleted:      0
Bytes freed:  0
Memory:       indexRebuilt=true · orphansDropped=0 · compactFlagged=0
Skipped:      0
Result:       dry-run
──────────────────────────────────────
```

### Live reap after completion

```
hyperflow reap auth-refactor

hyperflow reap: slug='auth-refactor' · archived 2 · deleted 1 · bytesFreed 4096 · orphansDropped 0 · skipped 0
── Reap ──────────────────────────────
Slug:         auth-refactor
Mode:         live
Terminal:     yes
Archived:     2
Deleted:      1
Bytes freed:  4096
Memory:       indexRebuilt=true · orphansDropped=0 · compactFlagged=0
Skipped:      0
Result:       reaped
──────────────────────────────────────
```

### Non-terminal without force

```
/hyperflow:reap wip-login

── Reap ──────────────────────────────
Slug:         wip-login
Mode:         live
Terminal:     no
Archived:     0
Deleted:      0
Bytes freed:  0
Memory:       indexRebuilt=false · orphansDropped=0 · compactFlagged=0
Skipped:      1  (reasons: non-terminal)
Result:       skipped-non-terminal
──────────────────────────────────────
```

### Force with confirmation (portable)

```
/hyperflow:reap wip-login --force

(dry-run preview…)
Hyperflow Question
Reap non-terminal slug "wip-login"? This archives in-scope .hyperflow artefacts and may delete ephemeral leftovers. Source code is never touched.

1. Yes — run reap with --force
2. No — cancel

[end turn — no files modified until the user answers]
```

### Lifecycle phase (dispatch wrap-up sketch)

```
# cleanup.reapOnComplete == true, slug terminal
python3 "$PLUGIN_ROOT/scripts/reap.py" "$PROJECT/.hyperflow" --slug implement-auth
# then print Report block; continue deploy/handoff gates as the parent skill defines
```

## Resources

- [`scripts/reap.py`](../../scripts/reap.py) — reaper implementation (single source of truth).
- [`scripts/archive-artefacts.py`](../../scripts/archive-artefacts.py) — archive class (invoked by reap).
- [`scripts/memory-index.py`](../../scripts/memory-index.py) — index rebuild (after any opt-in orphan drops).
- [config/schema.json](../../config/schema.json) — `cleanup.reapOnComplete`, `cleanup.dryRun`, retention knobs.
- [runtime-contract.md](../hyperflow/runtime-contract.md) — `shell`, `structured_question`, honest failure reporting.
- [DOCTRINE.md](../hyperflow/DOCTRINE.md) — file-first artefacts; no AI attribution; autonomy vs confirmation gates.
- [cache/SKILL.md](../cache/SKILL.md) — memory compact when reap flags oversized durable files.
- [flush/SKILL.md](../flush/SKILL.md) — flush unflushed commit queues before reap can clear `commits-queue/`.
