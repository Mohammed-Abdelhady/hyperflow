---
name: sticky
description: |
  Use when the user wants to enable, disable, or check sticky-session mode. With sticky ON, every task-shaped user message in the current session routes through the appropriate hyperflow chain-starter (spec / scope / dispatch) without the user re-typing /hyperflow:*. Chat-shaped messages still pass through normally.
  Trigger with /hyperflow:sticky, "make hyperflow sticky", "stop using hyperflow", "is hyperflow sticky", "auto-route to hyperflow".
allowed-tools: Read, Write, Edit, Bash(rm:*), Bash(ls:*)
argument-hint: "<on|off|status>"
version: 4.8.0
license: MIT
compatibility: Designed for Claude Code
tags: [session, automation, routing]
---

# Sticky

Toggle "sticky session" mode. With sticky ON, every task-shaped user message in the current session auto-routes through the appropriate hyperflow chain-starter (`/hyperflow:spec` for ambiguous designs, `/hyperflow:scope` for clear specs). Chat-shaped messages (questions, answers, acknowledgments, "yes"/"no") still pass through normally.

Full doctrine: [DOCTRINE.md](../hyperflow/DOCTRINE.md) Layer 1 sticky-session clause.

## Subcommands

| Subcommand | Description |
|---|---|
| `on` | Enable sticky mode — auto-route task-shaped messages until disabled |
| `off` | Disable sticky mode — back to explicit `/hyperflow:*` invocations |
| `status` | Show current state (on / off / when toggled) |

Default subcommand when none provided: `status`.

## State persistence

Sticky state is stored at `.hyperflow/.sticky` (project-scoped, gitignored). File format:

```
state: on
since: 2026-05-17T14:30:00Z
trigger: user-mention   # or: explicit-toggle | session-default
```

The session-start hook reads this file and prints a one-line advisory when sticky is on (`Sticky mode: ON since 2026-05-17 14:30 — task-shaped messages auto-route through hyperflow`). Sticky persists across sessions until explicitly toggled off.

## Subcommand Details

### `on`

Write `.hyperflow/.sticky` with `state: on` + ISO-8601 timestamp + `trigger: explicit-toggle`. If the file already exists with `state: on`, refresh the timestamp + trigger but don't reset other state. Print:

```
Sticky mode: ON
Task-shaped messages now auto-route through /hyperflow:spec (or /hyperflow:scope when the design is clear).
Chat-shaped messages (questions, answers, acknowledgments) still pass through normally.
Disable with /hyperflow:sticky off.
```

### `off`

If `.hyperflow/.sticky` exists, replace its contents with `state: off` + timestamp. (Keep the file rather than delete so the session-start hook can show recent history.) Print:

```
Sticky mode: OFF
Task-shaped messages will no longer auto-route. Use explicit /hyperflow:* invocations.
```

### `status`

Read `.hyperflow/.sticky`. Print one line:

```
Sticky mode: ON since 2026-05-17 14:30 (trigger: user-mention)
```

or:

```
Sticky mode: OFF (last changed: 2026-05-16 09:12)
```

or, if file absent:

```
Sticky mode: OFF (never configured for this project — use /hyperflow:sticky on to enable)
```

## Behavioural contract

When sticky is ON, the orchestrator MUST follow this routing on every new user message:

1. **Chat-shaped messages** (questions about prior output, "yes" / "no" answers to a pending gate, acknowledgments like "ok"/"thanks", short clarifications) — pass through normally, no chain routing.
2. **Task-shaped messages** (any verb-led request for new work: "add X", "fix Y", "refactor Z", "build", "implement", "create", "design", "scope out", "decompose", "ship") — auto-route:
   - **Ambiguous design** (the user asks *what* or *should we*) → invoke `/hyperflow:spec` with the user's message as `ARGUMENTS`.
   - **Clear spec** (the user describes *how* or names concrete files / functions) → invoke `/hyperflow:scope` with the user's message as `ARGUMENTS`.
   - **Existing task file referenced** (e.g. "resume the auth task") → invoke `/hyperflow:dispatch` with the matching slug.
3. **Bug reports** ("X is broken", "Y test fails", "Z throws…") → invoke `/hyperflow:trace`.
4. **Review requests** ("review this", "audit the diff", "any issues?") → invoke `/hyperflow:audit`.
5. **Ship intent** ("ship it", "push", "release", "deploy") → invoke `/hyperflow:deploy`.

The routing decision is made silently — print one short line (`Routing to /hyperflow:spec (sticky mode) …`) and invoke. Don't ask the user to confirm the routing (that would be an invented gate per DOCTRINE rule 8). The Step 0 chain-mode question still fires inside the routed skill.

**Override:** if the user message starts with `/` (any slash command) OR contains "without hyperflow" / "skip hyperflow" / "don't route" → bypass routing for that message; respond directly.

## Activation triggers

Sticky mode turns ON automatically when:

1. The user runs `/hyperflow:sticky on` (explicit toggle).
2. The user mentions the word "hyperflow" in any non-slash-command message during the session, AND `.hyperflow/.sticky` does not yet exist for this project (so first mention is the trigger; subsequent mentions are no-ops). The trigger field in the file is recorded as `user-mention`.

Sticky mode turns OFF only when the user runs `/hyperflow:sticky off`. It is never silently disabled.

## Anti-patterns (when sticky is ON)

- Asking the user "should I route this to hyperflow?" — that's an invented gate; the user already opted in via sticky
- Skipping the Step 0 chain-mode question inside the routed skill — sticky controls *routing*, not *gates*
- Routing chat-shaped messages — answering a question shouldn't fire a chain
- Routing messages that start with `/` — those are explicit slash commands; honor them as-is
- Echoing the routing decision as a long paragraph — one short line is enough (`Routing to /hyperflow:scope (sticky mode) …`)

## Flow

1. Parse subcommand from invocation (default: `status`).
2. Read `.hyperflow/.sticky` (if absent, treat as empty).
3. Execute subcommand: write the file (`on` / `off`) or print state (`status`).
4. Print confirmation.

## Overview

`/hyperflow:sticky` toggles per-project sticky-session routing. It does not itself perform routing — that's the orchestrator's behavioral contract when sticky is ON. This skill is the user-facing on/off switch and status reader.

## Prerequisites

- `.hyperflow/` directory writable. If absent, the skill creates `.hyperflow/` and writes `.sticky` inside.

## Instructions

See [Subcommands](#subcommands) and [Behavioural contract](#behavioural-contract). Summary:

1. Parse subcommand (default `status`).
2. Read or write `.hyperflow/.sticky` per the chosen subcommand.
3. Print one-line confirmation.

When sticky is ON, the orchestrator routes per the Behavioural contract on every subsequent user message — this skill itself isn't re-invoked, the contract lives in DOCTRINE.

## Output

Single one-line status per subcommand (`on` / `off` / `status`). No multi-line output.

## Error Handling

| Failure | Behavior |
|---|---|
| `.hyperflow/` missing | Create the directory, then write `.sticky`. |
| `.hyperflow/.sticky` exists but malformed | Print one-line warning + treat as `OFF`. Backup the malformed file to `.sticky.bak`. |
| Invalid subcommand (not `on`/`off`/`status`) | Print the valid subcommand list and exit. |

## Examples

### Enable sticky mode

```
/hyperflow:sticky on

Sticky mode: ON
Task-shaped messages now auto-route through /hyperflow:spec (or /hyperflow:scope when the design is clear).
Chat-shaped messages (questions, answers, acknowledgments) still pass through normally.
Disable with /hyperflow:sticky off.
```

### Sticky activates from a casual mention

```
You: hey, let's use hyperflow for the next feature
[orchestrator: detects "hyperflow" mention, .hyperflow/.sticky doesn't exist yet]
Sticky mode: ON (activated by mention)
Task-shaped messages now auto-route. Disable with /hyperflow:sticky off.

You: add a search bar to the dashboard with debounced input
[orchestrator: task-shaped, clear spec → routes to /hyperflow:scope]
Routing to /hyperflow:scope (sticky mode) …
```

### Check status

```
/hyperflow:sticky status

Sticky mode: ON since 2026-05-17 14:30 (trigger: user-mention)
```

### Bypass for one message

```
You: without hyperflow, just tell me what hooks.json controls
[orchestrator: contains "without hyperflow" → bypass for this message]
hooks.json declares the session lifecycle hooks the plugin registers with Claude Code…
```

### Disable sticky

```
/hyperflow:sticky off

Sticky mode: OFF
Task-shaped messages will no longer auto-route. Use explicit /hyperflow:* invocations.
```

## Resources

- [DOCTRINE.md](../hyperflow/DOCTRINE.md) — Layer 1 sticky-session clause (the behavioural contract the orchestrator follows when sticky is ON).
- [output-style.md](../hyperflow/output-style.md) — one-line confirmation format.
