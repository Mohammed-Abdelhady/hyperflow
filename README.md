<h1 align="center">Hyperflow</h1>

<p align="center">
  <strong>Multi-agent orchestration for AI coding tools</strong>
</p>

<p align="center">
  The thinking model orchestrates. Workers execute in parallel. Every output gets reviewed.<br/>
  Ship faster, cheaper, and better.
</p>

<p align="center">
  <a href="docs/installation.md">Installation</a> &middot;
  <a href="docs/providers.md">Providers</a> &middot;
  <a href="docs/model-routing.md">Model Routing</a> &middot;
  <a href="docs/orchestration.md">Orchestration</a>
</p>

<p align="center">
  <code>v1.9.0</code> · <a href="CHANGELOG.md">Changelog</a>
</p>

---

## Overview

<p align="center">
  <img src="docs/assets/hero.svg" alt="Hyperflow orchestration flow: thinking-model orchestrator decomposes a task, three worker-model agents execute in parallel, the reviewer synthesizes outputs, and a final worker integrates with learnings injected back into the next batch" width="100%" />
</p>

---

## How It Works

Instead of a single agent doing everything, Hyperflow splits every task into a **thinking-model orchestrator** coordinating **worker-model agents** in parallel — with automatic review after every change.

```
You: "Add user auth with login page and middleware"

Orchestrator ─── Decomposes into 3 independent tasks
    │
    ├── Worker 1 ── Creates auth middleware     ─┐
    ├── Worker 2 ── Builds login page            ├── parallel
    └── Worker 3 ── Sets up user model          ─┘
                           │
Orchestrator ─── Reviews all 3 outputs
    │
Orchestrator ─── Synthesizes learnings
    │
    └── Worker 4 ── Wires up routes (with context from prior tasks)
                           │
Orchestrator ─── Final integration review ── Done.
```

Design decisions? Hyperflow brainstorms with you first — exploring options and getting approval — then dispatches workers to build it.

<p align="center">
  <img src="docs/assets/demo.gif" alt="Hyperflow — 9 layers in 75 seconds: project analysis, brainstorming, parallel dispatch, quality gates with auto-retry, security halt, learnings injection, auto-commit, and persistent memory" width="100%" />
</p>

---

## Why Hyperflow?

| | |
|---|---|
| **Higher quality** | Every output gets a two-pass review. Workers learn from each other — Batch 2 benefits from Batch 1's discoveries. |
| **Lower cost** | Expensive thinking models orchestrate and review. Cheap worker models write the code. Stop paying Opus prices for tasks Sonnet handles. |
| **Faster execution** | Independent tasks run in parallel. 3 files that don't share state? 3 workers, simultaneously. |
| **Persistent memory** | Project conventions, gotchas, and architectural decisions persist across conversations. Hyperflow remembers what it learned yesterday and applies it today — project-scoped under `.hyperflow/memory/`, fully local. |
| **Works everywhere** | Claude Code, Cursor, OpenCode, Codex, Antigravity — one config file, auto-detection, same workflow. |

---

## Specialized Skills

In addition to the main `hyperflow:hyperflow` orchestrator that runs on every task, hyperflow ships **7 specialized skills** you can invoke directly for focused workflows:

| Skill | Command | Purpose |
|-------|---------|---------|
| **Init** | `/hyperflow:init` | First-time setup — analyzes the project, creates `.hyperflow/` cache, installs multi-tool auto-detection shims |
| **Review** | `/hyperflow:review` | Multi-level code review (L1 quick → L5 exhaustive) on uncommitted changes or a target file/range/PR |
| **Debug** | `/hyperflow:debug` | Systematic root-cause analysis using 5 Whys + hypothesis testing — never blind-patches symptoms |
| **Brainstorm** | `/hyperflow:brainstorm` | Design exploration with multi-dimensional analysis, AskUserQuestion clarification, and 2-3 alternative approaches — refuses to write code until design is approved |
| **Plan** | `/hyperflow:plan` | Decomposes a task into parallel worker subtasks and writes `.hyperflow/tasks/<slug>.md` — does not execute |
| **Ship** | `/hyperflow:ship` | Pre-push gates (lint, typecheck, build, tests, security sweep) + commit + release + push (with explicit confirmation) |
| **Memory** | `/hyperflow:memory` | CRUD on `.hyperflow/memory/` — `show`, `search`, `add`, `edit`, `prune`, `archive`, `clear`, `stats`, `migrate`, `off` |

**Reuse architecture:** Each specialized skill is ~80 lines and references shared protocol files (`skills/hyperflow/worker-prompt.md`, `reviewer-prompt.md`, `review-levels.md`, `memory-system.md`, `security.md`, `git-workflow.md`). No content duplication.

**Typical hand-offs:**
- Brainstorm a design → Plan the work → run main orchestrator → Review → Ship
- Hit a bug → Debug → Review the fix → Ship
- New project → Init → main orchestrator

**Model routing inherited from main skill:** Reviewer/Debugger agents use the thinking-tier model (Opus 4.7 in Claude Code by default); Implementer/Searcher/Writer agents use the worker-tier (Sonnet 4.6). Configurable via `~/.hyperflow/config.json`.

---

## Quick Start

### Claude Code

```bash
claude plugin marketplace add Mohammed-Abdelhady/hyperflow
claude plugin install hyperflow@hyperflow-marketplace
```

Works immediately with defaults (Opus 4.7 / Sonnet 4.6, security on). To customize models or security, run the setup wizard:

```bash
curl -fsSL https://raw.githubusercontent.com/Mohammed-Abdelhady/hyperflow/main/install.sh | bash
```

### Cursor / OpenCode / Codex / Antigravity

```bash
curl -fsSL https://raw.githubusercontent.com/Mohammed-Abdelhady/hyperflow/main/install.sh | bash
```

The installer auto-detects your providers, clones the repo, symlinks the skill, and walks you through model selection and security configuration:

```
> Detected: Cursor

  Cursor — linked

Thinking model (orchestrator, reviewer, debugger):
  [1] Claude 4.7 Opus — Hyperflow default
  [2] Claude 4.6 Opus — Previous Opus
  [3] GPT-5.5 — Latest GPT
  [4] Gemini 3.1 Pro — Standard availability

Worker model (implementer, searcher, writer):
  [1] Claude 4.6 Sonnet — Hyperflow default
  [2] Claude 4.5 Haiku — Fast and cheap

Enable security layer? [Y/n]:

> Config saved to ~/.hyperflow/config.json
```

**Activate:**

```
You: /hyperflow
[Hyperflow loaded — autonomous orchestration active]
```

<details>
<summary>Change models later</summary>

Edit `~/.hyperflow/config.json` directly, re-run the installer, or switch mid-session:

```
hyperflow: thinking opus-4-7
hyperflow: worker haiku-4-5
hyperflow: models              # show current config
```
</details>

---

## Usage Examples

<details open>
<summary><strong>Implementation</strong> — clear approach, just build it</summary>

```
You: "Add a search bar to the dashboard with debounced input"

  [Opus]   Decomposes into: SearchBar + useDebounce hook + wire into Dashboard
  [Sonnet] Builds SearchBar component          ─┐
  [Sonnet] Creates useDebounce hook             ├── parallel
                                                ─┘
  [Opus]   Reviews both outputs
  [Sonnet] Wires SearchBar into Dashboard (with learnings)
  [Opus]   Final review
```
</details>

<details>
<summary><strong>Design</strong> — ambiguous scope, brainstorm first</summary>

```
You: "I need a notification system for the app"

  [Opus] Explores your codebase for existing patterns
  [Opus] Asks: "Real-time (WebSocket) or polling-based?"
  You:   "Real-time"
  [Opus] Asks: "Toast notifications, notification center, or both?"
  You:   "Both"
  [Opus] Proposes 2 approaches with trade-offs
  You:   Pick one
  [Opus] Presents design section by section → you approve
  [Opus] Transitions to orchestrator → dispatches workers → builds it
```
</details>

<details>
<summary><strong>Debugging</strong> — parallel investigation</summary>

```
You: "Tests are failing after the auth refactor"

  [Opus]   Analyzes failures, identifies 3 independent broken test files
  [Sonnet] Investigates auth-middleware.test.ts    ─┐
  [Sonnet] Investigates login-flow.test.ts          ├── parallel
  [Sonnet] Investigates session-handler.test.ts    ─┘
  [Opus]   Reviews each fix
  [Opus]   Runs full test suite to verify
```
</details>

<details>
<summary><strong>Quick tasks</strong> — even small things get reviewed</summary>

```
You: "Rename the Button component to PrimaryButton"

  [Sonnet] Renames component + updates all imports
  [Opus]   Reviews for missed references
```
</details>

**What you'll notice:** No permission prompts. No "should I proceed?" questions. No walls of explanation. Just parallel execution and code.

---

## The 9 Layers

| # | Layer | What it does | When |
|:-:|-------|-------------|------|
| 1 | **Autonomy** | Zero confirmations, minimal output, auto-accept | Always |
| 2 | **Model Routing** | Configurable thinking/worker models per provider | Always |
| 3 | **Orchestrator** | Decompose, dispatch parallel, review, synthesize | Implementation |
| 4 | **Brainstorming** | Explore, question, propose, approve | Design tasks |
| 5 | **Quality Gates** | Lint, typecheck, tests must pass | After every review |
| 6 | **Session Memory** | Persist learnings across conversations | Session start + end |
| 7 | **Task Templates** | Pre-built decomposition patterns | Auto-selected |
| 8 | **Git Workflow** | Auto-branch, auto-commit, squash option | Throughout |
| 9 | **Security** | Blocked files, commands, secret detection | Always |

<details>
<summary><strong>Model Routing</strong> — who does what</summary>

Defaults for Claude Code (all configurable):

| Role | Model | Use for |
|------|-------|---------|
| Orchestrator | Opus 4.7 | Decompose, coordinate, synthesize |
| Reviewer | Opus 4.7 | Review every worker output |
| Debugger | Opus 4.7 | Root cause analysis |
| Decision-maker | Opus 4.7 | Architecture, approach selection |
| Brainstormer | Opus 4.7 | Design exploration, proposals |
| Implementer | Sonnet 4.6 | Write code, edit files |
| Searcher | Sonnet 4.6 | Explore codebase, find files |
| Writer | Sonnet 4.6 | Tests, docs, configs |

**Iron rule:** Every worker output gets a thinking-model review.

Other providers: Cursor (Claude 4.7 Opus/Sonnet), OpenCode (anthropic/claude-opus-4-7), Codex (o3/o4-mini), Antigravity (Gemini 3.1 Pro/Flash). See [Model Routing Guide](docs/model-routing.md).
</details>

<details>
<summary><strong>Memory & Learning Injection</strong> — workers get smarter over time and across sessions</summary>

**Within a session:** after each batch, the orchestrator synthesizes patterns and gotchas into a learnings block injected into subsequent worker prompts:

```markdown
## Learnings from prior tasks
- Auth uses JWT with RS256, not HS256
- All validation goes through zod schemas
- CSS uses logical properties for RTL support
```

**Across sessions:** reusable learnings persist to `.hyperflow/memory/` inside the project — project-scoped, version-controllable, and never mixed with other repos. At session start, Hyperflow reads only tag-matched entries (hot tier) and injects them into the first worker prompt.

```
.hyperflow/memory/
├── index.md        ← entry registry + tags
├── learnings.md    ← discovered facts and conventions
├── decisions.md    ← architectural decisions and rationale
├── pitfalls.md     ← gotchas and anti-patterns
├── patterns.md     ← recurring code and design patterns
└── conventions.md  ← project-specific style and naming rules
```

**Tier model:**
- **Hot** — injected automatically at session start (tagged as `#hot`)
- **Warm** — injected when a task matches entry tags
- **Cold** — available on demand; never auto-injected

**Curation rules** built in:
- **Project-scoped** — lives in `.hyperflow/memory/`, not a global file
- **Lazy injection** — only tag-matched entries reach worker prompts
- **Auto-pruning** — entries older than 30 days, or contradicted by newer ones, are removed at session start
- **Patterns, not code** — learnings capture facts and conventions, never code snippets
- **User-editable** — plain markdown; edit, delete, or commit to git as you like
- **Local-only** — nothing leaves your machine

Controls: `hyperflow: memory off` (disable for session) · `hyperflow: memory show` (print current entries) · `hyperflow: memory clear` (wipe all entries)

> **Migrating from legacy global memory:** if you have an existing `~/.claude/hyperflow-memory.md`, copy the relevant entries for each project into that project's `.hyperflow/memory/learnings.md` and delete (or archive) the global file.

Full spec: [skills/hyperflow/session-memory.md](skills/hyperflow/session-memory.md).
</details>

<details>
<summary><strong>Quality Gates</strong> — automated checks after every review</summary>

- **Lint** — `pnpm lint` / `npm run lint`
- **Typecheck** — `tsc --noEmit`
- **Tests** — affected files only (full suite on final review)

Gate fails? Worker fixes and re-runs. Max 3 retries before escalating.
</details>

<details>
<summary><strong>Task Templates</strong> — pre-built decomposition patterns</summary>

| Template | Trigger |
|----------|---------|
| CRUD Feature | "add X management" |
| API Endpoint | "create API for X" |
| UI Component | "build X component" |
| DB Migration | "add X column" |
| Refactor | "extract X into Y" |
| Bug Fix | "fix X" |

Templates are adapted to context — not rigid steps.
</details>

<details>
<summary><strong>Git Workflow</strong> — automated branching and commits</summary>

- Auto-creates feature branches (never commits to main)
- Auto-commits after each approved task
- Follows project commit conventions
- Asks to squash or keep at the end
- Never pushes — waits for you

Disable: `hyperflow: auto-commit off`
</details>

<details>
<summary><strong>Security</strong> — worker containment</summary>

Workers are contained by prompt-injected blocklists:

- **Blocked files** — `.env`, `*.pem`, `*.key`, `~/.ssh/*`, `~/.aws/credentials`, cloud configs
- **Blocked commands** — `rm -rf` (destructive), `git push --force` to main, `sudo`, `chmod 777`
- **Secret detection** — Reviewer checks for API key patterns (`sk-*`, `AKIA*`, `ghp_*`), private keys, connection strings

Workers that need a blocked resource report `BLOCKED:` and stop. Reviewers that find violations report `SECURITY_VIOLATION:` which halts the task.

Customize via `~/.hyperflow/config.json`:

```json
{
  "security": {
    "blockedFiles": { "add": ["*.vault"], "remove": [] },
    "blockedCommands": { "add": ["docker rm -f"], "remove": [] }
  }
}
```

Disable per-session: `hyperflow: security off`
</details>

---

## Supported Platforms

| Platform | Thinking Model | Worker Model | Detection |
|----------|---------------|-------------|-----------|
| **Claude Code** | Opus 4.7 | Sonnet 4.6 | Auto |
| **Cursor** | Claude 4.7 Opus | Claude 4.6 Sonnet | Auto |
| **OpenCode** | Claude Opus 4.7 | Claude Sonnet 4.6 | Auto |
| **Codex** | o3 | o4-mini | Auto |
| **Antigravity** | Gemini 3.1 Pro | Gemini 3 Flash | Auto |

All models are configurable per provider. See [Provider Setup](docs/providers.md).

---

## Multi-Tool Auto-Detection

Hyperflow generates native config shim files so every supported tool auto-loads it without manual setup.

```bash
./scripts/setup-detection.sh          # generate shims for all detected tools
./scripts/setup-detection.sh --tools claude,cursor,codex   # specific tools only
./scripts/setup-detection.sh --dry-run   # preview what would be written
./scripts/setup-detection.sh --force     # overwrite existing shim files
```

The installer (`install.sh`) runs `setup-detection.sh` automatically. Re-run it any time you add a new tool to the project.

### Which file does each tool read?

| Tool | Shim file written | Location |
|------|------------------|----------|
| **Claude Code** | `CLAUDE.md` | project root |
| **Cursor** | `hyperflow.mdc` | `.cursor/rules/` |
| **Codex** | `AGENTS.md` | project root |
| **OpenCode** | `AGENTS.md` | project root |
| **GitHub Copilot** | `AGENTS.md` | project root |
| **Antigravity / Gemini CLI** | `GEMINI.md` | project root |

Each shim is a one-liner that sources the real skill from `.hyperflow/` — you never edit the shims directly.

### What the shims point to

| Path | Contents |
|------|----------|
| `.hyperflow/` | Project analysis cache (codebase map, dependency graph) |
| `.hyperflow/memory/` | Persistent learnings — injected into each session |

Commit the shim files (and `.hyperflow/memory/`) to version control so every team member and every tool gets the same context automatically.

---

## Project Memory

Memory lives at `.hyperflow/memory/` — project-scoped, plain markdown, version-controllable.

```
.hyperflow/memory/
├── index.md        ← entry registry + tags
├── learnings.md    ← discovered facts and conventions
├── decisions.md    ← architectural decisions and rationale
├── pitfalls.md     ← gotchas and anti-patterns
├── patterns.md     ← recurring code and design patterns
└── conventions.md  ← project-specific style and naming rules
```

### Tiering

| Tier | Tag | Behaviour |
|------|-----|-----------|
| **Hot** | `#hot` | Always injected at session start |
| **Warm** | any topic tag | Injected when a task matches the tag |
| **Cold** | none | Available on demand; never auto-injected |

### Controls

| Command | Effect |
|---------|--------|
| `hyperflow: memory off` | Disable memory injection for this session |
| `hyperflow: memory show` | Print all current memory entries |
| `hyperflow: memory clear` | Wipe all entries in `.hyperflow/memory/` |

### Migrating from legacy global memory

If you have an existing `~/.claude/hyperflow-memory.md`, copy the relevant project entries into `.hyperflow/memory/learnings.md` and delete (or archive) the global file.

```bash
# example one-shot migration
grep -A5 "$(pwd)" ~/.claude/hyperflow-memory.md >> .hyperflow/memory/learnings.md
```

Full spec: [skills/hyperflow/session-memory.md](skills/hyperflow/session-memory.md).

---

## Customization

<details>
<summary><strong>Change model versions</strong></summary>

Edit `~/.hyperflow/config.json` or use runtime commands. See [Model Routing Guide](docs/model-routing.md) for all options, role overrides, and runtime commands.
</details>

<details>
<summary><strong>Add your own skills</strong></summary>

Create a new folder under `skills/` with a `SKILL.md`:

```markdown
---
name: my-skill
description: Use when [specific triggering conditions]
---

# My Skill

[Your skill content here]
```
</details>

<details>
<summary><strong>Modify autonomy rules</strong></summary>

The 9 autonomy rules are in `skills/hyperflow/SKILL.md` under "Layer 1: Autonomy". Add, remove, or modify rules to match your workflow.
</details>

<details>
<summary><strong>Release a new version</strong></summary>

The release script reads conventional commits, generates CHANGELOG entries, bumps version across all manifests, and creates a git tag:

```bash
./scripts/release.sh          # auto-detect bump type from commits
./scripts/release.sh minor    # force a minor bump
./scripts/release.sh patch    # force a patch bump
```

Commit prefixes determine the bump type:
- `feat:` → minor
- `fix:`, `refactor:`, `docs:`, `chore:` → patch
- `BREAKING CHANGE` → major

After running, push with `git push && git push --tags`.
</details>

---

## Project Structure

```
hyperflow/
├── skills/hyperflow/           # The unified skill (9 layers) + 7 specialized skills (see Specialized Skills)
│   ├── SKILL.md                #   Core skill definition
│   ├── model-config.md         #   Model configuration reference
│   ├── worker-prompt.md        #   Worker dispatch template
│   ├── reviewer-prompt.md      #   Review template
│   ├── quality-gates.md        #   Layer 5: automated checks
│   ├── session-memory.md       #   Layer 6: cross-session learnings
│   ├── task-templates.md       #   Layer 7: decomposition patterns
│   ├── git-workflow.md         #   Layer 8: branching + auto-commit
│   ├── security.md             #   Layer 9: worker containment
│   └── brainstorming-advanced.md #   Advanced brainstorming framework
├── scripts/
│   ├── release.sh             #   Auto-release with changelog generation
│   └── bump-version.sh        #   Sync version across all manifests
├── config/
│   ├── defaults.json           #   Default model catalogs
│   └── schema.json             #   Config JSON Schema
├── hooks/
│   ├── hooks.json              #   Session startup config
│   └── session-start           #   Injection script
├── docs/                       #   Guides and references
├── .claude-plugin/plugin.json  #   Claude Code plugin manifest
├── install.sh                  #   Installer + setup wizard
├── package.json
├── CHANGELOG.md                #   Version history
├── LICENSE                     #   MIT
└── README.md
```

---

## Update

<table>
<tr><td><strong>Claude Code</strong></td><td>

```bash
claude plugin update hyperflow@hyperflow-marketplace
```
</td></tr>
<tr><td><strong>Other providers</strong></td><td>

```bash
git -C ~/.hyperflow/repo pull
```

Or re-run the installer to also reconfigure models and security:

```bash
~/.hyperflow/repo/install.sh
```
</td></tr>
</table>

Check the [CHANGELOG](CHANGELOG.md) for what's new in each release.

---

## Uninstall

<table>
<tr><td><strong>Claude Code</strong></td><td>

```bash
claude plugin uninstall hyperflow@hyperflow-marketplace
```
</td></tr>
<tr><td><strong>All providers</strong></td><td>

```bash
~/.hyperflow/repo/install.sh --uninstall
```
</td></tr>
</table>

This removes all symlinks, the cloned repo, and config. Project memory at `.hyperflow/memory/` is kept — delete it manually if you want a clean slate.

---

## Plugin Behavior & Permissions

For full transparency — what this plugin does at runtime, so reviewers and users know exactly what they're installing:

| Surface | What happens | Code |
|---|---|---|
| **`SessionStart` hook** | On `startup`, `clear`, and `compact` events, runs `hooks/session-start` (bash). The script reads `skills/hyperflow/SKILL.md`, JSON-encodes it via Python 3, and emits a `system-prompt-inject` payload that adds the Hyperflow skill to the model's system prompt. | [`hooks/session-start`](hooks/session-start), [`hooks/hooks.json`](hooks/hooks.json) |
| **Skill content** | Instructs the agent to operate as a thinking-model orchestrator coordinating worker-model subagents, with brainstorming for design decisions and reviews after every change. | [`skills/hyperflow/SKILL.md`](skills/hyperflow/SKILL.md) |
| **Session memory** | Reads and appends to `.hyperflow/memory/` (project-scoped) to persist learnings across conversations. No data leaves your machine. | [`skills/hyperflow/session-memory.md`](skills/hyperflow/session-memory.md) |
| **Config** | Optional `~/.hyperflow/config.json` for model selection and security overrides. Created only if you run the installer wizard; not required. | [`config/schema.json`](config/schema.json) |
| **Network access** | None at runtime. The plugin does not make outbound network calls. The optional `install.sh` setup wizard clones the repo and writes config locally. | — |
| **File writes** | `.hyperflow/memory/` (project-scoped session memory) and, if you run the installer, `~/.hyperflow/config.json` and tool shim files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules/hyperflow.mdc`). The skill instructs the orchestrator to follow project conventions for everything else. | — |
| **Worker containment** | Workers are constrained by prompt-injected blocklists for sensitive files (`.env`, `*.pem`, `*.key`, `~/.ssh/*`, cloud creds) and destructive commands (`rm -rf`, `git push --force` to main, `sudo`, `chmod 777`). See Layer 9 above. | [`skills/hyperflow/security.md`](skills/hyperflow/security.md) |
| **Dependencies** | The hook script requires `bash`, `python3`, and standard POSIX tools — all available by default on macOS and Linux. No Node, no package installs. | — |

**Why a system-prompt injection?** Hyperflow's orchestration pattern needs to be active from the first user turn — including after `/clear` and after compaction — which is what the `SessionStart` hook delivers. The injected content is the skill body and nothing else; you can read it in full at [`skills/hyperflow/SKILL.md`](skills/hyperflow/SKILL.md).

---

## Documentation

- [Installation Guide](docs/installation.md) — setup, recommended settings, security config
- [Model Routing](docs/model-routing.md) — resolution priority, role overrides, runtime switching
- [Provider Setup](docs/providers.md) — per-platform model catalogs
- [Orchestration Pattern](docs/orchestration.md) — decomposition, review, learning injection

## License

MIT
