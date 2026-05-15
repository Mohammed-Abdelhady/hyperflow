<h1 align="center">Hyperflow</h1>

<p align="center">
  Multi-agent orchestration for Claude Code, Cursor, OpenCode, Codex, and Antigravity.
</p>

<p align="center">
  Thinking models orchestrate. Worker models execute. Every output reviewed. Project memory persisted. Quality gates enforced.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v1.10.0-blueviolet?style=flat-square" alt="version v1.10.0" />
  &nbsp;
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT license" />
  &nbsp;
  <img src="https://img.shields.io/badge/Claude%20Code-plugin-7C3AED?style=flat-square" alt="Claude Code plugin" />
  &nbsp;
  <img src="https://img.shields.io/badge/works%20with-Cursor%20%7C%20OpenCode%20%7C%20Codex%20%7C%20Antigravity-2EA39F?style=flat-square" alt="works with Cursor, OpenCode, Codex, Antigravity" />
</p>

<p align="center">
  <a href="docs/installation.md">Installation</a> &middot;
  <a href="docs/providers.md">Providers</a> &middot;
  <a href="docs/model-routing.md">Model Routing</a> &middot;
  <a href="docs/orchestration.md">Orchestration</a> &middot;
  <a href="CHANGELOG.md">Changelog</a>
</p>

<p align="center">
  <code>v1.12.1</code> · <a href="CHANGELOG.md">Changelog</a>
</p>

<p align="center">
  <img src="docs/assets/demo.gif" alt="Hyperflow Claude Code plugin demo — multi-agent orchestration with parallel worker execution, automatic code review, quality gates, and persistent project memory" width="100%" />
</p>

---

## Why Hyperflow?

- **Higher quality** — every worker output gets a two-pass thinking-model review; workers in batch 2 benefit from batch 1 discoveries via automatic learning injection.
- **Lower cost** — expensive thinking models orchestrate and review; cheap worker models write the code. Stop paying Opus prices for tasks Sonnet handles.
- **Faster execution** — independent subtasks run in parallel; three files with no shared state means three workers, simultaneously.
- **Multi-tool** — one config, auto-detected across Claude Code, Cursor, OpenCode, Codex, and Antigravity.
- **Project memory** — conventions, gotchas, and architectural decisions persist across conversations in `.hyperflow/memory/`, fully local and version-controllable.

---

## How it works

Instead of a single agent doing everything, Hyperflow splits every task into a **thinking-model orchestrator** coordinating **worker-model agents** in parallel — with automatic code review after every change.

```text
You: "Add user auth with login page and middleware"

Orchestrator ─── Decomposes into 3 independent tasks
    │
    ├── Worker 1 ── Creates auth middleware     ─┐
    ├── Worker 2 ── Builds login page            ├── parallel execution
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

Design decisions? Hyperflow brainstorms section-by-section and gets your approval before dispatching workers.

---

## Quick start

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

The installer auto-detects your tool, symlinks the skill, and walks you through model and security configuration.

**Activate:**

```text
You: /hyperflow
[Hyperflow loaded — autonomous orchestration active]
```

---

## Skills

Hyperflow ships 8 skills. The main `hyperflow` skill runs automatically on every task; the remaining 7 are focused workflows you invoke directly.

| Skill | Command | Purpose |
|-------|---------|---------|
| hyperflow | `/hyperflow:hyperflow` | All-in-one orchestrator that runs on every task — research, plan, dispatch, review, integrate |
| init | `/hyperflow:init` | Set up `.hyperflow/` cache, install multi-tool auto-detection shims, refresh analysis |
| review | `/hyperflow:review` | Multi-level code review (L1–L5) on uncommitted changes or a target |
| debug | `/hyperflow:debug` | Systematic root-cause analysis for bugs and test failures — fixes the cause, not the symptom |
| brainstorm | `/hyperflow:brainstorm` | Design exploration with section-by-section approval — never writes code until approved |
| plan | `/hyperflow:plan` | Decompose a task into worker subtasks; writes `.hyperflow/tasks/<slug>.md`; does not execute |
| ship | `/hyperflow:ship` | Pre-push gates (lint, typecheck, build, tests) + commit + release + push in one flow |
| memory | `/hyperflow:memory` | CRUD on `.hyperflow/memory/` — show, search, add, prune, archive, clear |

---

## The 10 orchestration layers

| Layer | Name | Summary |
|-------|------|---------|
| L0 | Project analysis | Caches tech stack, architecture, and conventions in `.hyperflow/` |
| L1 | Autonomy | Zero confirmations, minimal output, silent error recovery |
| L2 | Model routing | Configurable thinking/worker models per provider + priority chain |
| L3 | Orchestrator | Decompose → parallel dispatch → review → synthesize → integrate |
| L4 | Brainstorming | Design exploration with approval before implementation |
| L5 | Quality gates | Automated lint, typecheck, build, tests after every review |
| L6 | Project memory | Persistent learnings in `.hyperflow/memory/` (tagged, tiered) |
| L7 | Task templates | Pre-built decomposition (CRUD, API, UI, migration, refactor, bug fix) |
| L8 | Git workflow | Auto-branch, auto-commit after approval, never auto-push |
| L9 | Security | Prompt-injected blocklists for sensitive files and dangerous commands |

---

## Supported providers

| Provider | Thinking model | Worker model |
|----------|---------------|--------------|
| Claude Code | Opus 4.7 | Sonnet 4.6 |
| Cursor | Claude Opus 4.7 | Sonnet 4.6 |
| OpenCode | Claude Opus 4.7 | Sonnet 4.6 |
| Codex | o3 | o4-mini |
| Antigravity | Gemini 3.1 Pro | 3 Flash |

Provider is auto-detected at session start. Override any model in `~/.hyperflow/config.json` or switch mid-session with `hyperflow: thinking <model>`. See [Provider Setup](docs/providers.md).

---

## Configuration

Minimum `~/.hyperflow/config.json`:

```json
{
  "activeProvider": "claude-code",
  "defaults": {
    "thinkingModel": "claude-opus-4-7",
    "workerModel": "claude-sonnet-4-6"
  },
  "security": {
    "blockedFiles": { "add": [], "remove": [] },
    "blockedCommands": { "add": [], "remove": [] }
  }
}
```

Runtime switching: `hyperflow: thinking opus-4-7` · `hyperflow: worker haiku-4-5` · `hyperflow: models` (show current). Full schema at [`config/schema.json`](config/schema.json).

---

## Project memory

Memory lives at `.hyperflow/memory/` — project-scoped, plain markdown, version-controllable, and never mixed across repos. Hyperflow reads only tag-matched entries at session start and injects them into worker prompts automatically.

| Tier | Tag | Behaviour |
|------|-----|-----------|
| Hot | `#hot` | Always injected at session start |
| Warm | any topic tag | Injected when a task matches the tag |
| Cold | none | Available on demand; never auto-injected |

Full spec: [skills/hyperflow/session-memory.md](skills/hyperflow/session-memory.md).

---

## Plugin behavior

On every `SessionStart`, `clear`, and `compact` event, the [`hooks/session-start`](hooks/session-start) script reads [`skills/hyperflow/SKILL.md`](skills/hyperflow/SKILL.md) and injects it into the model's system prompt so orchestration is active from the first turn. No network calls are made at runtime; all data stays local. Worker containment rules live in [`skills/hyperflow/security.md`](skills/hyperflow/security.md). Hook configuration: [`hooks/hooks.json`](hooks/hooks.json).

---

## Contributing

Contributors are expected to keep `README.md` in sync with shipped features on every push. `scripts/release.sh` warns if README has not been updated since the last release tag. See `CLAUDE.md` for the full contributor guide. All commits must follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `perf:`, `style:`, `test:`) — the release script reads these to determine the version bump and generate CHANGELOG entries automatically.

---

## Update

```bash
claude plugin update hyperflow@hyperflow-marketplace
```

See [CHANGELOG](CHANGELOG.md) for what's new in v1.10.0.

---

## Uninstall

```bash
claude plugin uninstall hyperflow@hyperflow-marketplace
```

This removes all plugin files. Project memory at `.hyperflow/` can be deleted manually if you no longer need it.

---

## Documentation

- [Installation Guide](docs/installation.md) — setup, recommended settings, security config
- [Provider Setup](docs/providers.md) — per-platform model catalogs
- [Model Routing](docs/model-routing.md) — resolution priority, role overrides, runtime switching
- [Orchestration Pattern](docs/orchestration.md) — decomposition, review, learning injection

---

## License

MIT
