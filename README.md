<p align="center">
  <img src="docs/assets/hero.svg" alt="Hyperflow — multi-agent orchestration. scaffold → spec → scope → dispatch → audit → deploy" width="100%" />
</p>

<h1 align="center">Hyperflow</h1>

<p align="center">
  <strong>Multi-agent orchestration for Claude Code, OpenCode &amp; Antigravity.</strong><br/>
  Thinking models orchestrate and review. Worker models execute. Every step dispatches a Worker → Reviewer pair.
</p>

<p align="center">
  <code>scaffold</code> → <code>spec</code> → <code>scope</code> → <code>dispatch</code> → <code>audit</code> → <code>deploy</code><br/>
  Start anywhere. Auto-advance forward. Memory persists across sessions.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v4.20.0-blueviolet?style=flat-square" alt="version v4.20.0" />
  &nbsp;
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT license" />
  &nbsp;
  <img src="https://img.shields.io/badge/Claude%20marketplace-published-22C55E?style=flat-square" alt="Published on the official Claude plugin marketplace" />
  &nbsp;
  <img src="https://img.shields.io/badge/works%20with-Claude%20Code%20%7C%20OpenCode%20%7C%20Antigravity-2EA39F?style=flat-square" alt="works with Claude Code, OpenCode, and Antigravity" />
</p>

<p align="center">
  <a href="https://mohammed-abdelhady.github.io/hyperflow/">Landing site</a> &middot;
  <a href="docs/installation.md">Installation</a> &middot;
  <a href="docs/providers.md">Providers</a> &middot;
  <a href="docs/model-routing.md">Model Routing</a> &middot;
  <a href="docs/orchestration.md">Orchestration</a> &middot;
  <a href="CHANGELOG.md">Changelog</a>
</p>

---

## Quick start

```bash
claude plugin marketplace add Mohammed-Abdelhady/hyperflow
claude plugin install hyperflow@hyperflow-marketplace
```

Then invoke any skill:

```text
/hyperflow:spec "add user auth with login + middleware"   # design → scope → dispatch
/hyperflow:amplify "make a login page"                     # enhance a rough prompt first
/hyperflow:trace "tests fail after the auth refactor"      # root-cause a bug
/hyperflow:deploy                                          # pre-push gates + ship
```

Auto-routing is on by default — say "audit the diff" or "debug this test" and the right skill runs without the `/hyperflow:*` prefix.

Setup, model routing, and per-provider notes → [Installation](docs/installation.md) · [Providers](docs/providers.md).

## How it works

Invoke a skill. Chain-starters auto-advance through the rest — no always-on orchestrator, no background process.

**Thinking-tier** models (Opus 4.7 · Gemini 3 Pro) orchestrate, triage, and review. **Worker-tier** models (Sonnet 4.6 · Gemini 3.5 Flash) execute in parallel. Every non-trivial phase decomposes into sub-phases, each with its own reviewer.

- **Every output is reviewed** — Worker → Reviewer at every step; parallel where independent.
- **Triaged + persona-stitched** — each task gets the flow profile and expert standards it needs.
- **Memory compounds** — conventions, decisions, and anti-patterns persist across sessions.

Full walkthrough → [Orchestration](docs/orchestration.md) · [Landing site](https://mohammed-abdelhady.github.io/hyperflow/).

## Skills

Fourteen skills. Chain-starters auto-advance; standalone skills run on their own.

| Skill | Command | Role |
|-------|---------|------|
| **Spec** | `/hyperflow:spec` | Design-first — auto-chains to scope → dispatch |
| **Scope** | `/hyperflow:scope` | Decompose into a task graph — auto-chains to dispatch |
| **Dispatch** | `/hyperflow:dispatch` | Fan out persona-stitched workers under tiered review |

Standalone: **amplify** (enhance a prompt) · **scaffold** (project setup) · **trace** (root-cause a bug) · **audit** (L1–L5 review) · **deploy** (pre-push gates + ship) · **cache** (memory CRUD) · **status** (live progress) · **background** · **sticky** · **flush** · **bridge**.

## Providers

| Provider | Thinking | Worker |
|----------|----------|--------|
| Claude Code | Opus 4.7 | Sonnet 4.6 |
| OpenCode | Claude Opus 4.7 | Sonnet 4.6 |
| Antigravity | Gemini 3 Pro | Gemini 3.5 Flash |

Auto-detected at session start. Override in `~/.hyperflow/config.json`. See [Model Routing](docs/model-routing.md).

## Documentation

- [Landing site](https://mohammed-abdelhady.github.io/hyperflow/) — the full overview
- [Installation](docs/installation.md) · [Providers](docs/providers.md) · [Model Routing](docs/model-routing.md) · [Orchestration](docs/orchestration.md)
- [Changelog](CHANGELOG.md) · [Privacy](PRIVACY.md) · contributor guide in [`CLAUDE.md`](CLAUDE.md)

## License

MIT
