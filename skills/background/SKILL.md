---
name: background
description: |
  Use when the user wants to see, inspect, cancel, or prune background agents fired during prior chain runs. Read/manage `.hyperflow/background/registry.json` and the per-agent output buffers at `.hyperflow/background/<id>.md`. Standalone — never auto-invoked.
  Trigger with /hyperflow:background, "list background agents", "what's running in background", "cancel background agent", "show background result".
allowed-tools: Read, Write, Edit, Bash(ls:*), Bash(cat:*), Bash(rm:*), Bash(find:*), Glob, Grep
argument-hint: "<list|show|cancel|prune> [id|--all]"
version: 4.7.0
license: MIT
compatibility: Portable — Claude Code, Codex, OpenCode, Antigravity, Cursor, Grok (semantic ops via runtime-contract)
tags: [background, orchestration, lifecycle]
---

# Background

Read-only-by-default management interface for **task-level** background agents fired by other hyperflow skills
(dispatch quality gates, deploy CI watcher, scaffold analysis refresh, cache compact, scope speculative prefetch)
**only when the host actually supports the `background` op**.

Reads from `.hyperflow/background/registry.json` + per-agent output buffers when those artefacts exist.

Full doctrine: [background-agents.md](../hyperflow/background-agents.md).
Canonical op: `background` ([runtime-contract.md](../hyperflow/runtime-contract.md)).

## Capability honesty (non-negotiable)

| Host capability | Behavior |
|---|---|
| `background` present | Registry + buffers reflect real background dispatches from other skills. Subcommands manage them. |
| `background` absent (Codex default and many portable hosts) | **Foreground-only.** State clearly that this session cannot fire notify-on-complete background agents. Do **not** invent job IDs, completion hooks, PushNotification, durations, token counts, or fake `status: complete` entries. |
| Registry file missing | Treat as empty — see Error Handling. Never seed a pretend registry. |
| `interrupt` present | Prefer host interrupt for cancel of a live child when the registry id maps to a real child. |
| `interrupt` absent | Mark entry `cancelled` for Hyperflow bookkeeping only; state that live process cancellation is unavailable. Do not claim the agent was killed. |

**This skill never fires a background agent.** It only reads/manages the registry. Other skills fire background work
via the host `background` op when present; when absent they must use foreground labelled phases instead.

Honesty rules:
- Never fabricate PushNotification, wall-clock duration, token usage, or completion timestamps as observed data.
- Never report estimated background completion as observed.
- Duration / token fields print only when the buffer or host metadata actually recorded them; otherwise `unavailable`
  or omit the field.
- Metrics use `usage_metrics` when inventory exposes them — otherwise `unavailable` ([runtime-contract.md](../hyperflow/runtime-contract.md)).

## Subcommands

| Subcommand | Description |
|---|---|
| `list` | Print the registry: in-flight · completed-uncollected · stalled · errored |
| `show <id>` | Print one agent's output buffer (`.hyperflow/background/<id>.md`) |
| `cancel <id>` | Cancel one specific in-flight agent (or mark cancelled when interrupt unavailable) |
| `cancel --all` | Cancel every in-flight agent (use before closing a session) |
| `prune` | Delete completed `.hyperflow/background/<id>.md` files older than 7 days |

Default subcommand when none provided: `list`.

## Subcommand Details

### `list`

Read `.hyperflow/background/registry.json`. Group entries by status and print a compact table.

When the host has no `background` capability **and** the registry is empty:

```
Background: foreground-only on this host — no task-level background registry entries.
```

Do not invent sample rows.

When entries exist (from a prior session or a host that supports background):

```markdown
## In flight (N)

| ID                                | Purpose                              | Fired      | Timeout | Blocks  |
|-----------------------------------|--------------------------------------|------------|---------|---------|
| `bg-1718049600-quality-gates-b2`  | Layer 5 gates Batch 2                | 17:30      | 18:00   | step3   |

## Completed (uncollected, N)

| ID                                | Purpose                              | Completed  | Duration | Output |
|-----------------------------------|--------------------------------------|------------|----------|--------|
| `bg-1718045400-scaffold-refresh`  | Refresh .hyperflow/architecture.md   | 16:42      | 2m 18s   | 1.4kb  |

## Stalled / Errored (N)

| ID                                | Purpose                              | Status            | Reason            |
|-----------------------------------|--------------------------------------|-------------------|-------------------|
| `bg-1717980000-cache-compact`     | Compact learnings.md                 | STALLED           | timeout (30m)     |
```

Print one trailing line: `<count> in flight · <count> uncollected · <count> needs attention`.
If registry is empty on a background-capable host: print `No background agents.` and stop.

Duration / output size columns: use values **only** from registry or buffer metadata. If missing → `unavailable` —
never invent.

### `show <id>`

Read `.hyperflow/background/<id>.md` and print it verbatim. If the agent is still running, print the registry entry
first then `Output buffer not yet written.` and stop.

Never synthesize a buffer for a missing id.

### `cancel <id>`

1. Read registry, find the entry.
2. If `status: running`:
   - If host `interrupt` (or equivalent cancel) is available **and** the registry maps to a live child → call it.
   - Else mark the entry `status: cancelled`, `cancelled_at: <now>`, and print that live cancellation is unavailable —
     the process may run until host timeout, but Hyperflow will discard the result on collection.
3. Print `Cancelled <id> — <purpose>` (or the honest partial-cancel message above).

If the agent already completed, print `Agent <id> already <status> — nothing to cancel.`

### `cancel --all`

For every entry with `status: running`, run the `cancel` flow. Print summary: `Cancelled N agents.` (or
`Marked N as cancelled (no live interrupt on this host).`).

### `prune`

Remove completed `.hyperflow/background/bg-*.md` files older than 7 days and remove their entries from
`registry.json` (only entries with `status: complete | error | stalled | cancelled` older than 7 days).
Print: `Pruned N output buffers · N registry entries`. Use host `shell` / file tools when available; never claim
prunes that did not run.

## Flow

1. Parse subcommand from invocation (default: `list`).
2. Resolve whether host `background` is effectively available (live inventory wins over provider defaults).
3. Read `.hyperflow/background/registry.json` (if absent, treat as empty).
4. Execute subcommand with honesty rules above.
5. Print result. No source-code mutations.

## Overview

`/hyperflow:background` is the user-facing read/manage interface for task-level background agents. The orchestrator
maintains the registry as a side-effect of real host-background dispatches in other skills when the `background` op
is present. On hosts without that op, chains stay **foreground-only** and this skill reports that fact honestly.

## Prerequisites

- `.hyperflow/background/registry.json` may exist (created on first real background dispatch by any other skill).
  If absent, all subcommands degrade gracefully.
- `.hyperflow/` initialized is recommended (`/hyperflow:scaffold`) but not required.

## Instructions

See [Subcommands](#subcommands) and [Subcommand Details](#subcommand-details). Summary:

1. Parse the subcommand (default `list` when none given).
2. State foreground-only if `background` is unavailable and registry is empty.
3. Read the registry from `.hyperflow/background/registry.json` when present.
4. Execute the subcommand against the registry + per-agent output buffers.
5. Print compact result; never invent metrics or notifications.

## Output

- `list` — table of in-flight / completed-uncollected / stalled+errored, with one trailing summary line — or the
  foreground-only / empty message.
- `show <id>` — file contents of `.hyperflow/background/<id>.md` when present.
- `cancel <id>` / `cancel --all` — one-line confirmation per cancelled agent + total (honest about interrupt availability).
- `prune` — count of pruned buffers + registry entries.

## Error Handling

| Failure | Behavior |
|---|---|
| Registry file missing | Treat as empty — `list` prints `No background agents.` (or foreground-only message); other subcommands print `No registry — no background agents recorded.` and stop. |
| Registry JSON malformed | Print `Registry malformed — back up to .hyperflow/background/registry.json.bak and re-create empty.` Move file, write empty registry, continue. |
| `show <id>` for unknown id | List up to 3 closest IDs by edit distance; do not invent a buffer. |
| `cancel <id>` for already-completed agent | Print `Agent <id> already <status> — nothing to cancel.` |
| Host interrupt / cancel API unavailable | Mark entry `status: cancelled` in registry only. Print `Marked <id> as cancelled (host has no live interrupt — agent may run to completion or timeout; result discarded on collection).` Never claim PushNotification or process kill. |
| Prune called with no eligible entries | Print `Nothing to prune — no completed buffers older than 7 days.` |
| Foreground-only host, user asks to "fire background" | Refuse fire; this skill does not fire agents. Point at the calling skill's foreground path. |

## Examples

### List on a background-capable host with real entries

```
/hyperflow:background list

## In flight (1)
| ID                                | Purpose                              | Fired | Timeout | Blocks |
|-----------------------------------|--------------------------------------|-------|---------|--------|
| `bg-1718049600-quality-gates-b2`  | Layer 5 gates Batch 2                | 17:30 | 18:00   | step3  |

1 in flight · 0 uncollected · 0 needs attention
```

### List on a host without background lifecycle

```
/hyperflow:background list

Background: foreground-only on this host — no task-level background registry entries.
```

### Show a completed agent's output (real buffer only)

```
/hyperflow:background show bg-1718045400-scaffold-refresh

# Background Result — Refresh .hyperflow/architecture.md

| Field      | Value                                |
|------------|--------------------------------------|
| Agent ID   | `bg-1718045400-scaffold-refresh`     |
| Fired at   | 2026-05-16T16:40:00Z                 |
| Completed  | 2026-05-16T16:42:18Z (2m 18s)        |
| Status     | complete                             |
| Tokens     | unavailable                          |

## Output
<refreshed architecture.md content fragments + diff summary>
```

Tokens / duration appear only when the buffer recorded them; never invent.

### Cancel with honest interrupt fallback

```
/hyperflow:background cancel bg-1718049600-quality-gates-b2

Marked bg-1718049600-quality-gates-b2 as cancelled (host has no live interrupt — agent may run to completion or timeout; result discarded on collection).
```

## Resources

- [background-agents.md](../hyperflow/background-agents.md) — full doctrine: when to use, hard rules, registry shape, failure modes, anti-patterns, Codex foreground-only table.
- [runtime-contract.md](../hyperflow/runtime-contract.md) — `background` op, metrics honesty, interrupt fallback.
- [DOCTRINE.md](../hyperflow/DOCTRINE.md) — rule 8 (background extensions), rule 9 (no AI-attributed background commits).
- [output-style.md](../hyperflow/output-style.md) — table conventions for `list` output.
