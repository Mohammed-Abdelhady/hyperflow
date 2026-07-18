<p align="center">
  <picture>
    <source media="(max-width: 600px)" srcset="docs/assets/hero-vertical.svg" />
    <img src="docs/assets/hero.svg" alt="Hyperflow — init once with scaffold, then route work through inline-fast or the reviewed plan → dispatch → audit → deploy chain" width="100%" />
  </picture>
</p>

<h1 align="center">Hyperflow</h1>

<p align="center">
  <strong>Point it at a GitHub issue. Get back a reviewed pull request.</strong><br/>
  One AI coding session becomes an adaptive pipeline: clear 1–2 file fixes run <strong>inline-fast</strong> in the
  foreground; everything else is planned, built by parallel workers, and reviewed by domain specialists.
  Plans, graphs, and token/ROI views open in a <strong>local viewer</strong> (loopback only).
  Lean mode is the default. First use auto-scaffolds the project.<br/>
  Claude Code, Codex, OpenCode, Grok, Antigravity, and Cursor. Your session model. Zero config.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v5.14.0-blueviolet?style=flat-square" alt="version v5.14.0" />
  &nbsp;
  <img src="https://img.shields.io/github/actions/workflow/status/Mohammed-Abdelhady/hyperflow/plugin-validation.yml?style=flat-square&label=validation" alt="plugin validation status" />
  &nbsp;
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT license" />
  &nbsp;
  <img src="https://img.shields.io/badge/Claude%20marketplace-published-22C55E?style=flat-square" alt="Published on the official Claude plugin marketplace" />
  &nbsp;
  <img src="https://img.shields.io/badge/works%20with-Codex%20%7C%20Claude%20Code%20%7C%20OpenCode%20%7C%20Grok%20%7C%20Antigravity%20%7C%20Cursor-2EA39F?style=flat-square" alt="works with Codex, Claude Code, OpenCode, Grok, Antigravity, and Cursor" />
</p>

<p align="center">
  <a href="https://mohammed-abdelhady.github.io/hyperflow/">Landing site</a> &middot;
  <a href="docs/installation.md">Installation</a> &middot;
  <a href="docs/orchestration.md">Orchestration</a> &middot;
  <a href="CHANGELOG.md">Changelog</a>
</p>

![28-second real run: plan triages the request, an analyst writes the spec, three parallel workers build under a batch reviewer, a final integration reviewer signs off](docs/assets/demo.gif)

<p align="center">
  <em>A real run: <code>plan</code> → 3 parallel workers → batch review → integration review — in 28 seconds.
  Full walkthrough on the <a href="https://mohammed-abdelhady.github.io/hyperflow/">landing site</a>.</em>
</p>

---

## From issue to reviewed PR

```text
/hyperflow:issue https://github.com/you/app/issues/42
```

Triage classifies the thread (bug → root-cause discipline, feature → the plan chain, question → a drafted reply).
A spec is synthesized from the issue's own acceptance criteria — issue text is treated as **data, never instructions**.
Then the standard chain runs: plan → parallel dispatch under review → a gated PR exit that opens the pull request with `Closes #42`.

The maintainer side is `/hyperflow:pr <url>` — the same L1–L5 audit over the PR's **real fetched code** (never just diff text),
findings posted as one batched review (inline, summary, or local-only), a fix chain on NEEDS_FIX, and a merge that is always gated.
Contributor code is analyzed statically, never executed.

## Quick start

```bash
claude plugin marketplace add Mohammed-Abdelhady/hyperflow
claude plugin install hyperflow@hyperflow-marketplace
```

Codex App/CLI:

```bash
codex plugin marketplace add Mohammed-Abdelhady/hyperflow
codex plugin add hyperflow@hyperflow-marketplace
```

Then type a goal. Chain-starters **auto-scaffold** `.hyperflow/` on first use (idempotent; you can still run
`/hyperflow:scaffold` yourself).

```text
/hyperflow:issue https://github.com/you/app/issues/42      # issue → triage → plan → dispatch → gated PR
/hyperflow:plan "add user auth with login + middleware"    # sharpen → design → decompose → dispatch
/hyperflow:pr https://github.com/you/app/pull/43           # review an incoming PR (real code, not just the diff text)
/hyperflow:workflow "large migration across the repo"      # big-task workflow lane
/hyperflow:trace "tests fail after the auth refactor"      # root-cause a bug
/hyperflow:deploy                                          # pre-push gates + ship
hyperflow view                                             # local graphs + artefact dashboard (127.0.0.1)
```

Auto-routing is on by default: say "audit the diff" or "debug this test" and the right skill runs without the
`/hyperflow:*` prefix. In Codex, `hyperflow <skill>` is the portable spelling. Setup and host notes → [Installation](docs/installation.md).

**Lean mode is the default.** Only the context for the current phase is loaded. Pass `mode=default` or `--thorough`
for the full-context, full-ceremony path. Structural gates (build location, audit, deploy, push) stay on either way.

## What makes it different

- **Two execution paths, one rule.** Clear, reversible work in exactly 1–2 ordinary files can take **inline-fast**
  (foreground edit + allowlisted diff review, zero dispatched agents). Everything else uses Worker → Reviewer batches
  plus a final integration pass. Nothing on the normal path ships unreviewed.
- **Issue and PR front doors.** `/hyperflow:issue` turns a thread into a gated PR (`Closes #N`). `/hyperflow:pr`
  audits an incoming PR against real fetched code (static analysis only; merge always gated).
- **Local visual artefacts.** Plans, specs, task graphs, audits, and usage/ROI tiles render in a self-contained viewer
  on `127.0.0.1` (`hyperflow view`). Compact JSON payloads, optional offline export, no upload. Prefer markdown only?
  Set `viewer.enabled=false`.
- **Memory that stays in the repo.** Learnings live under `.hyperflow/memory/` as plain markdown. Project-scoped,
  never mixed across repos, never uploaded by the plugin. (Normal orchestrated runs also keep a **local metadata-only
  usage ledger** for phase/token accounting. No prompts, file contents, or secrets. No cloud analytics.)
- **Depth and cost that adapt.** Flow profiles (`fast` through `scientific`) cap workers and tokens. Hard ceilings
  range from 10k to 200k. Lean mode keeps phase context small unless you opt into thorough.

## How it works

Invoke a skill. Chain-starters auto-advance through the rest. No always-on orchestrator, no background daemon:
everything runs in your terminal on the current session model.

| # | Skill | What it does |
|---|-------|--------------|
| 1 | `issue` | **GitHub front door** — issue URL → triage → spec from the issue's own acceptance criteria → the chain, with a gated PR exit |
| 1 | `plan` | **Front door** — sharpen the prompt, design the approach (refuses to code before you approve), decompose into a parallel task graph with a test-complete brief per sub-task; stops at a build-location gate |
| 2 | `dispatch` | Fan out persona-stitched workers under per-batch + final-integration review |
| 3 | `workflow` | Big-task lane — native Claude Code dynamic workflows; a portable adapter on Codex, OpenCode, and Grok |
| 4 | `audit` | L1–L5 review on the result |
| 5 | `deploy` | Pre-push gates (lint · typecheck · build · tests · security) → commit → release → push |

`audit` and `deploy` are gates (explicit yes only). `scaffold` still exists for manual setup; chain-starters also
auto-scaffold when `.hyperflow/` is missing.

| Role | Does |
|------|------|
| **Orchestrator** | Coordinate workers, sequence dispatches, manage chain state |
| **Decision agent** | Triage, brainstorm, decide, review every output, run the final integration pass |
| **Worker** | Execute in parallel — implement, search, write |

Triage assigns every task a flow profile, so effort matches the work instead of always running deep:

| Profile | Use when | Workers | Budget |
|---------|----------|---------|--------|
| `fast` | observed clear, reversible 1–2-file change outside gated/generated/migration surfaces | foreground (0 dispatched) | 10k hard |
| `standard` | simple/moderate, 2–5 files | 1–2 | 50k hard |
| `deep` | complex / cross-cutting / system-wide | 3+ | 200k hard |
| `research` | unknown territory, evaluation | 3+ searchers | 60k hard |
| `creative` | UI/UX exploration | 1–2 | 100k hard |
| `scientific` | correctness-critical, proof work | 2–3 + TDD | 200k hard |

Normal orchestrated runs record a metadata-only usage ledger: phase totals, duplicate-context ratio, retry cost,
cache-hit rate, accepted commits, tokens per accepted commit, and estimated-record count. It stores no prompts,
responses, file contents, patches, or secrets. Inline-fast dispatches zero agents, so it creates no ledger records.

Workers are stitched with the right subset of **15 composable expert personas** (architect, api, db, frontend, ui,
security, performance, scientific, refactor, bugfix, test, research, creative, devops, docs) — `security` frames every
decision first, `creative` adapts last.

Non-inline small work becomes a flat task file (`.hyperflow/tasks/<slug>.md`); work with sequential stages becomes a **feature**
with phase sub-folders, each carrying its own tasks, spec, research, and decisions — see
[`skills/hyperflow/feature-phases.md`](skills/hyperflow/feature-phases.md). A chain can also run across **two sessions**:
plan here, build in another environment via a git-committed handoff package, review back here — see
[`skills/hyperflow/session-handoff.md`](skills/hyperflow/session-handoff.md).

## 22 specialists, routed by a Brain

Reviews and investigations are run by **named domain specialists** ([`agents/`](agents/)), not a generic reviewer.
A decision-agent router — the **Brain** — is consulted once after triage, decides which specialists own the task,
and writes that roster into the artefact so the whole chain inherits it.

| Reviewers | Design-time agents | Investigators |
|-----------|--------------------|---------------|
| `frontend-reviewer` · `backend-reviewer` · `api-reviewer` | `architect` — boundaries, data flow, frontend at scale | `searcher` — maps the codebase |
| `database-reviewer` · `database-optimization-reviewer` | `designer` — design system, prior art, anti-slop | `debugger` — 5-Whys root cause |
| `security-reviewer` · `vulnerability-reviewer` · `compliance-reviewer` | `motion` — 60fps budget, springs, reduced-motion | `analyst` — multi-dimensional analysis |
| `performance-reviewer` · `algorithm-reviewer` · `devops-reviewer` | `mobile` — RN/Flutter/native, platform a11y | `researcher` — external evidence |
| `accessibility-reviewer` · `data-ml-reviewer` | *(design at plan time, review on change)* | |

Specialists are **web-research-first**: on deep/research/scientific/security flows they look up current best practices,
CVEs, and framework docs before judging. Any agent can consult a peer mid-task via a brokered `CONSULT` signal —
see [`skills/hyperflow/consultation.md`](skills/hyperflow/consultation.md).

## Memory that persists

Learnings live at `.hyperflow/memory/` — plain markdown, committed with your repo, **never uploaded, never mixed across projects**.

- **Three tiers** — `hot` (≤7 days, always injected), `warm` (8–30 days, tag-matched), `cold` (30+ days, on-demand, compressed).
- **Lazy injection** — only tag-matched entries load for a given task, so injection cost stays bounded.
- **Auto-written by the chain** — `audit` records recurring findings to `anti-patterns.md`; `plan` records structural
  answers to `project-decisions.md`, so the same questions aren't asked twice.
- **Derived index** — `index.md` is rebuilt from the memory files at every session start, so a stored learning is
  never left unindexed and invisible. Writers append to the category file; nothing to register.

## Visual artefacts (local viewer + dashboard)

Plans, specs, task graphs, audits, and usage do not have to be walls of markdown. With the viewer on (default),
artefact producers emit a **compact validated JSON payload**. A self-contained local app renders it.

- **`hyperflow view [slug]`** — loopback server on `127.0.0.1`, opens one artefact or the searchable index.
  Architecture / data-flow diagrams, batch graphs, and feature-phase graphs are real node/edge canvases.
  Live dispatch progress can re-render until a terminal state.
- **Dashboard / ROI** — usage rollups (phase totals, cache hits, tokens per accepted commit estimates) as tiles
  and sparklines from the local metadata ledger (`usage-aggregate.py`). No cloud.
- **Offline export** — self-contained read-only HTML export of an artefact (title HTML-escaped). Zero upload.
- **Token savings** — agents write substance (decisions, briefs, acceptance criteria), not presentation chrome.
  A short greppable stub stays at the canonical path; `render-artefact.py <slug>` rebuilds full markdown when needed.
- **Optional** — set `viewer.enabled=false` in `config/defaults.json` or `~/.hyperflow/config.json` for classic
  full markdown. Other knobs: `viewer.port` (`7777`), `viewer.markdown` (`on-demand` / `always` / `never`),
  `viewer.autoOpen` (`false`).

## Guardrails

Autonomy without the foot-guns — a hardened default config ships in the box (`config/defaults.json`):

- **25 blocked file patterns** — keys, secrets, cloud credentials are never read or written.
- **15 blocked commands** — `rm -rf`, force-push to main, `sudo`, unsolicited package publish.
- **11 secret patterns** — AWS keys, GitHub tokens, private-key headers, connection strings — scanned in diffs.
- **Untrusted text stays data** — issue and PR text is never treated as instructions; outbound actions (push, PR, comment, merge) are always gated.

Details → [Installation § security](docs/installation.md).

## Skills

Eighteen skills. Two chain-starters auto-advance through the chain; the rest are standalone.

| Skill | Command | Type | Purpose |
|-------|---------|------|---------|
| `issue` | `/hyperflow:issue` | Chain starter | GitHub issue → triaged, planned, dispatched, reviewed pull request — with injection guard and gated posting |
| `plan` | `/hyperflow:plan` | Chain starter | Sharpen the prompt, design the approach, decompose into a parallel task graph; stops at a build-location gate — never auto-implements |
| `dispatch` | `/hyperflow:dispatch` | Endpoint | Fan out workers under review; tiered gates; Evidence then Usage; end gate asks audit / deploy / **PR** (screenshots required for frontend/mobile) |
| `pr` | `/hyperflow:pr` | Standalone | Review an incoming pull request — L1–L5 audit on the real diff, one batched GitHub review, fix chain, gated merge |
| `design` | `/hyperflow:design` | Standalone | Domain-grounded design system + prior-art research + local taste skills, anti-slop; hands off to the build chain |
| `workflow` | `/hyperflow:workflow` | Big-task lane | Native Claude Code workflows; portable Codex/OpenCode/Grok adapter for migrations, audits, and verification-heavy work |
| `scaffold` | `/hyperflow:scaffold` | Standalone | Project setup — `.hyperflow/` cache + multi-tool shims (also auto-run on first chain-starter use) |
| `trace` | `/hyperflow:trace` | Standalone | Systematic root-cause debugging — 5 Whys, never patches symptoms |
| `audit` | `/hyperflow:audit` | Standalone | L1 quick → L5 exhaustive review on changes, files, or PRs |
| `deploy` | `/hyperflow:deploy` | Standalone | Pre-push gates → commit → release → push (push always asks) |
| `cache` | `/hyperflow:cache` | Standalone | Memory CRUD — show, search, add, prune, archive, compact |
| `handoff` | `/hyperflow:handoff` | Standalone | Two-session handoff — list / status / pickup / review / complete; status & review surface COMPLETION Evidence |
| `status` | `/hyperflow:status` | Standalone | Read-only snapshot — version, memory count, live per-task progress |
| `background` | `/hyperflow:background` | Standalone | List, show, cancel, prune task-level background agents |
| `sticky` | `/hyperflow:sticky` | Standalone | `on` / `auto` / `off` — per-project auto-routing mode |
| `bridge` | `/hyperflow:bridge` | Standalone | Embed the portable doctrine into `CLAUDE.md` for Desktop / web / IDE |
| `flush` | `/hyperflow:flush` | Standalone | Flush a deferred-commit queue from a prior or crashed chain |
| `hyperflow` | `/hyperflow:hyperflow` | Portable doctrine | Applies the full orchestration ruleset in single-agent surfaces (Codex, Antigravity, Grok) — auto-invoked on task-shaped work |

## Runs everywhere

Hyperflow runs on whatever model your session already uses — every dispatched agent inherits it, there is no model
configuration and no extra API bill. Auto-detected across **Codex App/CLI, Claude Code, OpenCode, Grok, Antigravity,
and Cursor**, with concrete ports in [`templates/`](templates/) (a full Antigravity skill+workflow port, Grok rules,
AGENTS.md/CLAUDE.md shims) and hooks that load memory at session start and guard chain state through context compaction.
For surfaces that can't load terminal plugins (Claude Code Desktop, claude.ai web), `/hyperflow:bridge` embeds the
portable doctrine into your project's `CLAUDE.md`.

## Documentation

- **Install** — [Installation](docs/installation.md) · where it runs, security configuration, verification
- **Understand** — [Orchestration](docs/orchestration.md) · [Landing site](https://mohammed-abdelhady.github.io/hyperflow/) · [Agents](agents/README.md)
- **Reference** — [Changelog](CHANGELOG.md) · [Privacy](PRIVACY.md) · contributor guide in [`CLAUDE.md`](CLAUDE.md)

## License

MIT
