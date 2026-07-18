---
name: sticky
description: |
  Use when the user wants to set auto-routing mode: on (every task-shaped message routes), auto (intent-verb messages route — default), or off (no auto-routing). Intent-detection runs by default; use this skill to expand to full sticky or disable entirely.
  Trigger with /hyperflow:sticky, hyperflow sticky, "make hyperflow sticky", "stop using hyperflow", "is hyperflow sticky", "auto-route to hyperflow", "disable hyperflow auto-routing".
allowed-tools: Read, Write, Edit, Bash(rm:*), Bash(ls:*)
argument-hint: "<on|auto|off|status>"
version: 5.14.0
license: MIT
compatibility: Claude Code · Codex · OpenCode · Grok · Antigravity (state file is project-local)
tags: [session, automation, routing]
---

# Sticky

Set per-project auto-routing mode. Three states:

| State | Default? | Behavior |
|---|---|---|
| `auto` | yes (when `.sticky` absent) | **Intent-detection routing** — messages containing chain-starter verbs auto-route. Pure conversation passes through. |
| `on` | — | **Full sticky** — every task-shaped message routes, even without explicit intent verbs |
| `off` | — | **All auto-routing disabled** — only explicit `/hyperflow:*` or portable `hyperflow <skill>` aliases trigger chains |

Intent-detection is the floor — the user gets it without any opt-in (the orchestrator scans every user message for chain-starter verbs and routes when matched). Sticky `on` raises the ceiling; sticky `off` lowers the floor.

Full taxonomy and bypass matrix: [auto-routing.md](../hyperflow/auto-routing.md). Live continuation targets only: [chain-router.md](../hyperflow/chain-router.md) (never retired `spec` / `scope` skill stages). Portable alias table: [SKILL.md](../hyperflow/SKILL.md).

## Subcommands

| Subcommand | Description |
|---|---|
| `on` | Set state: on — full sticky routing on every task-shaped message |
| `auto` | Set state: auto — intent-verb routing only (the default) |
| `off` | Set state: off — disable ALL auto-routing including intent detection |
| `status` | Show current state (on / auto / off / when toggled) |

Default subcommand when none provided: `status`.

Portable hosts accept `/hyperflow:sticky <arg>` and `hyperflow sticky <arg>` equally — strip the alias, load this skill, execute.

## State persistence

Sticky state is stored at `.hyperflow/.sticky` (project-scoped, gitignored). File format:

```
state: on
since: 2026-05-17T14:30:00Z
trigger: user-mention   # or: explicit-toggle | session-default
```

When a session-start hook is present, it may print a one-line advisory when sticky is on (`Sticky mode: ON since 2026-05-17 14:30 — task-shaped messages auto-route through hyperflow`). Sticky persists across sessions until explicitly toggled. On hosts without hooks, the orchestrator still honors `.hyperflow/.sticky` when this skill or doctrine is loaded.

## Subcommand Details

### `on`

Write `.hyperflow/.sticky` with `state: on` + ISO-8601 timestamp + `trigger: explicit-toggle`. Print:

```
Sticky mode: ON (full routing)
Every task-shaped message now routes through hyperflow, even without intent verbs.
Disable with /hyperflow:sticky off · or relax to verb-only routing with /hyperflow:sticky auto.
```

### `auto`

Write `.hyperflow/.sticky` with `state: auto` + timestamp. This is the default state when no file exists; explicitly setting it is useful after `off` to re-enable intent-detection without going to full sticky. Print:

```
Sticky mode: AUTO (intent-detection routing, default)
Messages containing chain-starter verbs (audit, debug, fix, brainstorm, scope, deploy, review, workflow, …) auto-route to live skills (plan, dispatch, workflow, trace, audit, deploy, …).
Pure conversation passes through. Expand to full routing with /hyperflow:sticky on.
```

### `off`

Replace `.hyperflow/.sticky` contents with `state: off` + timestamp. (Keep the file rather than delete so session-start can show recent history.) Print:

```
Sticky mode: OFF
All auto-routing disabled — even intent verbs (audit, debug, fix, brainstorm, …) will no longer route.
Use explicit /hyperflow:* or hyperflow <skill> invocations. Re-enable with /hyperflow:sticky auto or /hyperflow:sticky on.
```

### `status`

Read `.hyperflow/.sticky`. Print one line:

```
Sticky mode: ON since 2026-05-17 14:30 (trigger: user-mention)
```

or:

```
Sticky mode: AUTO since 2026-05-17 14:30 (trigger: default · intent-detection routing)
```

or:

```
Sticky mode: OFF (last changed: 2026-05-16 09:12)
```

or, if file absent:

```
Sticky mode: AUTO (default · file not yet written · intent-detection routing active)
```

## Intent-verb → live skill map (`state: auto`)

Scan every user message (case-insensitive, word-boundary-aware). First match wins. Routes resolve only to **live** public skills — never to retired `spec` or `scope` stages:

| Intent class | Verbs / phrases | Route to |
|---|---|---|
| Design exploration | `brainstorm`, `design`, `explore`, `let's think about`, `what if`, `should we`, `how should`, `unsure about` | `plan` |
| Scope / plan | `scope`, `decompose`, `plan out`, `break down`, `create a plan`, `task graph` | `plan` (decomposition lives in plan — not a retired scope skill) |
| Big-task workflow | `big task`, `large migration`, `repo-wide audit`, `run a workflow`, `dynamic workflow` | `workflow` when the host supports it (Claude Code native workflows when enabled; Codex/OpenCode/Grok portable adapter); otherwise `plan` |
| Implementation | `build`, `implement`, `add`, `create`, `make a`, `refactor`, `write the`, `wire up`, `extract` | Inspect → deterministic inline-fast when proven safe; otherwise `plan` |
| Debugging / fix | `debug`, `fix it`, `fix`, `solve`, `troubleshoot`, `investigate`, `root-cause`, `why is`, stack trace | `trace` |
| Review / audit | `audit`, `review`, `check for issues`, `look for bugs`, `code review`, `security check` | `audit` |
| Shipping | `ship`, `push`, `release`, `deploy`, `cut a release` | `deploy` |
| Setup | `scaffold`, `setup hyperflow`, `init the project`, `set up the cache` | `scaffold` |
| Memory | `show memory`, `search memory`, `compact memory`, `clear memory`, `what does hyperflow remember` | `cache` |
| Status | `status`, `progress`, `what's running`, `how much done`, `eta` | `status` |
| Background | `list background`, `what's in background`, `cancel background` | `background` |

**Continuation:** use `skill_continuation` — native skill invoke when available; otherwise load `skills/<name>/SKILL.md` completely and continue inline ([runtime-contract.md](../hyperflow/runtime-contract.md), [chain-router.md](../hyperflow/chain-router.md)). Never stop with "Skill tool unavailable". Never document `/hyperflow:scope` or `/hyperflow:spec` as live routes.

## Behavioural contract (`state: on` — full sticky)

When sticky is ON, the orchestrator MUST follow this routing on every new user message:

1. **Chat-shaped messages** (questions about prior output, "yes" / "no" answers to a pending gate, acknowledgments like "ok"/"thanks", short clarifications) — pass through normally, no chain routing.
2. **Task-shaped messages** (any verb-led request for new work: "add X", "fix Y", "refactor Z", "build", "implement", "create", "design", "scope out", "decompose", "ship") — auto-route:
   - **New implementation work** → inspect the affected surface, then run deterministic pre-triage. `inline_fast` executes the clear reversible 1–2-file change in the foreground with affected checks and inline diff review. `classifier` continues into `plan` with the user's message.
   - **Design / plan / decompose work** → continue into `plan`; deterministic fast execution never applies to an explicitly exploratory request.
   - **Existing task file referenced** (e.g. "resume the auth task") → continue into `dispatch` with the matching slug.
3. **Bug reports** ("X is broken", "Y test fails", "Z throws…") → `trace`.
4. **Review requests** ("review this", "audit the diff", "any issues?") → `audit`.
5. **Ship intent** ("ship it", "push", "release", "deploy") → `deploy`.
6. **Big-task / workflow phrasing** → `workflow` (or `plan` when workflow is unsupported on the host).

The routing decision is announced with **one short line** — `Routing to /hyperflow:plan (sticky mode) …` or `Routing to plan (sticky mode) …` on portable hosts — then `skill_continuation`. Don't ask the user to confirm the routing (invented gate). Structural gates inside the routed skill still fire.

## Bypass / pass-through (all states)

| Pattern | Effect |
|---|---|
| Message starts with `/` | Honor the slash command / path as-is — no sticky routing |
| Message contains `without hyperflow` / `skip hyperflow` / `don't route` / `just answer` | No routing for that message |
| Chat-shaped: prior-output questions, gate answers, "ok"/"thanks", short clarifications | No routing — respond directly |
| Empty intent: no verb match and not task-shaped | No routing — respond directly |

## Activation triggers

Intent-detection routing (`state: auto`) is the **default** — active for every project without any user action.

Upgrades and downgrades:

1. **Upgrade to full sticky (`on`):**
   - Explicit: user runs `/hyperflow:sticky on` or `hyperflow sticky on`.
   - Implicit: user mentions the word "hyperflow" in a non-slash-command message AND `.hyperflow/.sticky` does not exist OR is `auto`. Orchestrator writes `state: on · trigger: user-mention · since: <ISO-8601>` and prints `Sticky mode: ON (upgraded from auto, activated by mention). Disable with /hyperflow:sticky off.`
2. **Downgrade to intent-only (`auto`):** user runs `/hyperflow:sticky auto` (or `hyperflow sticky auto`).
3. **Disable entirely (`off`):** user runs `/hyperflow:sticky off`. Disables intent detection too — only explicit `/hyperflow:*` or portable `hyperflow <skill>` aliases route after this.

State is never silently changed by the orchestrator. Only the user's explicit sticky subcommand (or the one-time implicit `hyperflow`-mention upgrade) modifies `.hyperflow/.sticky`.

## Anti-patterns

- Asking the user "should I route this to hyperflow?" — invented gate
- Skipping structural gates inside the routed skill — sticky controls *routing*, not *gates*
- Routing chat-shaped messages — answering a question shouldn't fire a chain
- Routing messages that start with `/` — honor them as-is
- Echoing the routing decision as a long paragraph — one short line is enough
- Routing to retired `spec` / `scope` skill names — always use live targets (`plan`, `dispatch`, `workflow`, …)
- Silently downgrading `on` → `auto` or `auto` → `off` because "this message felt different"

## Flow

1. Parse subcommand from invocation (default: `status`). Accept portable aliases.
2. Read `.hyperflow/.sticky` (if absent, treat as empty / default auto).
3. Execute subcommand: write the file (`on` / `auto` / `off`) or print state (`status`).
4. Print confirmation.

## Overview

`/hyperflow:sticky` toggles per-project sticky-session routing. It does not itself perform routing — that's the orchestrator's behavioral contract when sticky is ON or when intent verbs match in `auto`. This skill is the user-facing mode switch and status reader.

## Prerequisites

- `.hyperflow/` directory writable. If absent, the skill creates `.hyperflow/` and writes `.sticky` inside.

## Instructions

1. Parse subcommand (default `status`).
2. Read or write `.hyperflow/.sticky` per the chosen subcommand.
3. Print one-line confirmation.

When sticky is ON (or intent matches in AUTO), the orchestrator routes per the maps above on subsequent user messages — this skill itself isn't re-invoked for each route.

## Output

Single status block per subcommand (`on` / `auto` / `off` / `status`). No multi-line essay.

## Error Handling

| Failure | Behavior |
|---|---|
| `.hyperflow/` missing | Create the directory, then write `.sticky`. |
| `.hyperflow/.sticky` exists but malformed | Print one-line warning + treat as `OFF`. Backup the malformed file to `.sticky.bak`. |
| Invalid subcommand (not `on` / `auto` / `off` / `status`) | Print the valid subcommand list and exit. |
| Edit op unavailable | Refuse write subcommands with `edit unavailable`; `status` still reads if possible. |

## Examples

### Enable sticky mode

```
/hyperflow:sticky on

Sticky mode: ON (full routing)
Every task-shaped message now routes through hyperflow, even without intent verbs.
Disable with /hyperflow:sticky off · or relax to verb-only routing with /hyperflow:sticky auto.
```

### Portable alias

```
You: hyperflow sticky status

Sticky mode: AUTO (default · file not yet written · intent-detection routing active)
```

### Sticky activates from a casual mention

```
You: hey, let's use hyperflow for the next feature
[orchestrator: detects "hyperflow" mention, .hyperflow/.sticky doesn't exist yet]
Sticky mode: ON (upgraded from auto, activated by mention). Disable with /hyperflow:sticky off.

You: add a search bar to the dashboard with debounced input
[orchestrator: task-shaped → skill_continuation → plan]
Routing to /hyperflow:plan (sticky mode) …
```

### Bypass for one message

```
You: without hyperflow, just answer — what does .hyperflow/.sticky control?
[orchestrator: bypass — respond directly]
.hyperflow/.sticky stores per-project auto-routing mode (on / auto / off)…
```

### Intent verb in AUTO (no full sticky)

```
You: audit the last commit for security issues
[state: auto · verb audit → audit]
Routing to /hyperflow:audit (intent: audit) …
```

### Disable sticky

```
/hyperflow:sticky off

Sticky mode: OFF
All auto-routing disabled — use explicit /hyperflow:* or hyperflow <skill> invocations.
```

## Resources

- [auto-routing.md](../hyperflow/auto-routing.md) — full Layer-1 state machine, verb taxonomy, bypass matrix.
- [chain-router.md](../hyperflow/chain-router.md) — live transition targets; retired `spec`/`scope` banned.
- [runtime-contract.md](../hyperflow/runtime-contract.md) — `skill_continuation` and gate fallbacks.
- [DOCTRINE.md](../hyperflow/DOCTRINE.md) — Layer 1 sticky-session summary.
- [output-style.md](../hyperflow/output-style.md) — one-line confirmation format.
