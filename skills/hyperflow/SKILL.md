---
name: hyperflow
description: |
  Use when applying Hyperflow's orchestration doctrine in Codex, Antigravity, Grok, OpenCode, or another portable surface. Auto-invoke for non-trivial engineering work: build, implement, add, refactor, debug, fix, review, audit, plan, design, brainstorm, ship, or deploy.
  Trigger with /hyperflow:hyperflow, "use hyperflow", "apply the doctrine", or automatically on any task-shaped message.
allowed-tools: Read, Write, Edit, Glob, Grep, Agent, Skill, AskUserQuestion, WebSearch, WebFetch, Bash(git:*), Bash(gh:*), Bash(npm:*), Bash(pnpm:*), Bash(npx:*), Bash(python3:*)
argument-hint: "[task]"
version: 1.1.0
license: MIT
compatibility: Portable doctrine — Claude Code, Codex App/CLI, OpenCode, Antigravity, Cursor, Grok
tags: [orchestration, doctrine, autonomy, multi-agent, portable]
---

# Hyperflow Doctrine (portable runtime)

Apply Hyperflow's behavioral floor on every host. Executable work uses **semantic ops** from [runtime-contract.md](runtime-contract.md). Host adapters map those ops to live tools via [provider-claude.md](provider-claude.md), [provider-codex.md](provider-codex.md), and [provider-opencode.md](provider-opencode.md). Cross-skill edges and structural gates live in [chain-router.md](chain-router.md).

Skill bodies call **ops** (`spawn`, `wait`, `structured_question`, `skill_continuation`, `edit`, `shell`, `usage_metrics`, …) — never a single provider tool string as the only path.

## Runtime Adaptation

Resolve capabilities once per session from the **live tool inventory** (see runtime-contract precedence). Then:

- Prefer host **`spawn`** when the inventory exposes a spawn/task/subagent tool (Claude `Agent`, Codex `collaboration.spawn_agent` then legacy candidates, OpenCode Task / subagent, Grok `spawn_subagent`, or any inventory-mapped equivalent).
- Otherwise do the work yourself, one coherent batch at a time.
- Self-review each batch before moving on — workers never review their own output; use a **separate** labelled inline reviewer phase (or a separate spawn) for review.
- Run a final integration self-review over the cumulative diff when doctrine requires it.
- Preserve autonomy, clarification, commit cadence, file-first artefacts, no-attribution, and security rules.

**Role separation (hard):** worker children never review or coordinate; reviewer children never coordinate or dispatch siblings. Every agent runs on the **current session model** — no per-role model selection.

## Portable Function Router

These hosts load Hyperflow as skills, not as native Claude-style slash commands. Treat these user messages as function aliases and execute the matching skill workflow via `skill_continuation` (native Skill when callable; otherwise load `skills/<name>/SKILL.md` completely and continue inline):

| User says | Run |
|---|---|
| `/hyperflow:plan`, `hyperflow plan`, `design with hyperflow`, `decompose with hyperflow` | `plan` |
| `/hyperflow:dispatch`, `hyperflow dispatch`, `run the hyperflow plan` | `dispatch` |
| `/hyperflow:workflow`, `hyperflow workflow`, `run a workflow` | `workflow` |
| `/hyperflow:trace`, `hyperflow trace`, `debug with hyperflow` | `trace` |
| `/hyperflow:audit`, `hyperflow audit`, `review with hyperflow` | `audit` |
| `/hyperflow:deploy`, `hyperflow deploy`, `ship with hyperflow` | `deploy` |
| `/hyperflow:issue`, `hyperflow issue`, `work on issue` | `issue` |
| `/hyperflow:pr`, `hyperflow pr`, `review this pull request` | `pr` |
| `/hyperflow:design`, `hyperflow design` | `design` |
| `/hyperflow:handoff`, `hyperflow handoff` | `handoff` |
| `/hyperflow:cache`, `hyperflow cache` | `cache` |
| `/hyperflow:status`, `hyperflow status` | `status` |
| `/hyperflow:sticky`, `hyperflow sticky` | `sticky` |
| `/hyperflow:bridge`, `hyperflow bridge` | `bridge` |
| `/hyperflow:flush`, `hyperflow flush` | `flush` |
| `/hyperflow:reap`, `hyperflow reap` | `reap` |
| `/hyperflow:background`, `hyperflow background` | `background` |
| `/hyperflow:scaffold`, `hyperflow scaffold` | `scaffold` |
| `/hyperflow:hyperflow`, `hyperflow`, `use hyperflow` | `hyperflow` |

Do not answer that `/hyperflow:*` is an unknown command on these surfaces. Strip the alias, resolve the target, and follow that skill. **Retired targets `spec` and `scope` are forbidden** as live chain stages — never route to them ([chain-router.md](chain-router.md)).

If a workflow names Claude-only tool strings (`Agent`, `Skill`, `AskUserQuestion`) and those tools are not in inventory, map them to the semantic op + degraded policy: labelled inline worker/reviewer phases, full target-skill load for handoffs, and the interaction fallback below for questions.

## Subagents And Auto-Chain

### Capability-driven spawn (all hosts)

Use **`spawn`** from the runtime contract. Intersect registry candidates with the live inventory; first callable match wins. Host-specific candidate lists live in the provider references — do **not** hardcode only `multi_agent_v1.spawn_agent` or require fictional `worker`/`explorer` agent types as the sole option.

When spawning:

1. Embed the Hyperflow role (implementer / searcher / writer / reviewer / specialist) and charter in the child brief.
2. If a legacy tool still accepts an `agent_type` enum that is real in the session, map implementer/writer → worker-like and searcher → explorer-like **only when that enum exists**; otherwise use the generic child + charter text.
3. Spawn independent sibling workers together when the host allows parallel tool calls; collect results (`wait` when present, same-turn collection otherwise) **before** review.
4. Reviewers are a **separate** spawn (or a separate labelled inline phase) — never the same child reviewing its own work.
5. Every agent runs on the current session model. Match reasoning effort to task complexity: `low` / `medium` / `high` — never default portable hosts to exotic max-effort modes (e.g. Codex `xhigh`).

When no spawn tool is available: labelled **inline worker** phase, then separate labelled **inline reviewer** phase. Batch order and gates unchanged.

### OpenCode Task / subagent

When OpenCode exposes Task / subagent (or inventory-equivalent spawn candidates), map Hyperflow worker and reviewer roles through that path with separate child calls. When Task/subagent is absent, use the single-agent port above.

### Grok

When Grok exposes `spawn_subagent`, prefer it for independent units. If subagents are disabled (`GROK_SUBAGENTS=0` or config), run worker/reviewer phases inline with clear labels. Prefer native structured question tools when present.

### Auto-chain (all hosts)

For `/hyperflow:workflow`, use the workflow skill (Claude native dynamic workflow when available; otherwise the portable adapter). Never fall through to retired `scope`.

These hosts may lack Claude Code's native `Skill` handoff. Treat every Hyperflow handoff as `skill_continuation` — **inline auto-chain** when the native tool is missing:

1. Load the target `skills/<name>/SKILL.md` **completely**.
2. Continue in the coordinator with preserved chain args and gate contract.
3. Do not stop with "Skill tool unavailable". Auto-chain is a behavior contract, not a host API requirement.

Primary chain edges (full table: [chain-router.md](chain-router.md)):

- `plan` always stops at its **build-location gate**. It never auto-implements. On "this session" → `skill_continuation` into `dispatch`; on "another session" → handoff package; on "stop" → keep the plan.
- `dispatch` offers audit / deploy / PR structural gates, then runs selected follow-ups via `skill_continuation`.
- `audit` fix gates continue into `plan` (which still stops at its own build-location gate).

## Interaction Fallback

Semantic op: **`structured_question`**. Prefer the host structured UI when callable (`AskUserQuestion`, `request_user_input`, or inventory equivalent). When a host lacks structured question UI, do not skip the question or silently choose the recommended option. Render the gate as a concise chat block, persist a safe checkpoint if the host will lose context, and **end the turn**:

```text
Hyperflow Question
<question>

1. <recommended option> (Recommended) — <short consequence>
2. <option> — <short consequence>
```

Use this fallback for every required clarification or structural gate (plan build-location, dispatch operational + end-of-chain, audit fix, deploy push, design handoff, PR posting/merge, security/irreversibility). It is still banned to ask invented confirmation questions such as "should I proceed?".

Binary action gates (`Yes/No`, `Push/Hold`, `Approve/Revise`, `Include/Exclude`) carry **no** `(Recommended)` marker. Named-workflow and multi-option lists (3+) mark a recommended option first.

Headless with no interactive channel at a structural gate → error and stop; never silently default a build, fix, push, or merge.

## Reasoning Policy

- Every agent runs on the current session model — there is no per-role model selection.
- Resolve reasoning effort by task/profile: `low` for trivial docs/config checks, `medium` for normal planning/review, and `high` for debugging, architecture, security, and final integration.
- Never default portable hosts to exotic max-effort modes (e.g. Codex `xhigh`).

## Core Rules

1. Execute task-shaped requests without confirmation.
2. Clarify only after reading the relevant code and only for genuine ambiguity.
3. Keep long-form plans, specs, task decompositions, and audits under `.hyperflow/`.
4. Use conventional commits, one distinct user task per commit.
5. Never reference the model as the actor in commits, docs, comments, task files, or memory.
6. Respect the security blocklist in `security.md`.
7. Metrics honesty per runtime-contract — never fabricate tokens, durations, parallelism ratios, or agent counts for foreground-only work.

## Workflow Routing

| Intent | Workflow |
|---|---|
| `brainstorm`, `design`, `explore`, "should we" | Research first, ask material questions, then propose approaches (`design` / `plan` as appropriate) |
| `scope`, `decompose`, "plan out" | Map affected files, then write a task graph under `.hyperflow/tasks/` via `plan` (never route to retired `scope`) |
| `big task`, `large migration`, `repo-wide audit`, `run a workflow`, `dynamic workflow` | `workflow` skill: Claude Code native when available, else portable adapter — never fall through to retired `scope` |
| `build`, `implement`, `add`, `refactor` | Inspect first; deterministic inline-fast for clear reversible 1–2-file work, otherwise `plan` → build-location → `dispatch` |
| `debug`, `fix it`, "why is X failing" | Root-cause before patching (`trace` / plan as needed) |
| `audit`, `review`, "check for issues" | Review findings first (`audit`), then offer/apply fixes through plan |
| `ship`, `push`, `release`, `deploy` | Run gates, commit/release, ask before push (`deploy`) |

## Related

- [runtime-contract.md](runtime-contract.md) — semantic ops, fallbacks, metrics honesty
- [chain-router.md](chain-router.md) — live skills, transitions, structural gates
- [DOCTRINE.md](DOCTRINE.md) — full multi-agent doctrine
- Provider thin maps: [provider-claude.md](provider-claude.md) · [provider-codex.md](provider-codex.md) · [provider-opencode.md](provider-opencode.md)
