<h1 align="center">Hyperflow</h1>

<p align="center">
  <strong>Advanced multi-agent orchestration with persistent cross-session memory, per-step multi-level review, persona stitching, and adaptive flow profiles.</strong>
</p>

<p align="center">
  Start anywhere. Auto-advance through the chain.<br/>
  <code>scaffold</code> → <code>spec</code> → <code>scope</code> → <code>dispatch</code> → <code>audit</code> → <code>deploy</code><br/>
  Thinking models think. Worker models execute. Every step dispatches its own Worker → Reviewer pair (rule 12).<br/>
  Project memory persists across sessions · 15 stitched personas · 6 adaptive flow profiles · multi-level review <code>L1–L5</code>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v3.1.0-blueviolet?style=flat-square" alt="version v3.1.0" />
  &nbsp;
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT license" />
  &nbsp;
  <img src="https://img.shields.io/badge/Claude%20Code-plugin-7C3AED?style=flat-square" alt="Claude Code plugin" />
  &nbsp;
  <img src="https://img.shields.io/badge/works%20with-Claude%20Code%20%7C%20OpenCode-2EA39F?style=flat-square" alt="works with Claude Code and OpenCode" />
</p>

<p align="center">
  <a href="docs/installation.md">Installation</a> &middot;
  <a href="docs/providers.md">Providers</a> &middot;
  <a href="docs/model-routing.md">Model Routing</a> &middot;
  <a href="docs/orchestration.md">Orchestration</a> &middot;
  <a href="CHANGELOG.md">Changelog</a>
</p>

<p align="center">
  <code>v3.1.2</code> · <a href="CHANGELOG.md">Changelog</a>
</p>

---

## How It Works

Hyperflow is **not always-on**. You invoke a skill, and chain-starters auto-advance forward through the rest of the chain.

```
/hyperflow:spec "Add user auth with login page and middleware"
    │
    │ Step 0 — asks: auto or manual chain mode?
    │ Triage classifies the task (flow profile, depth, personas)
    │ Step 1–8 — asks design questions, proposes approaches, approves design
    ▼
/hyperflow:scope (auto-invoked, inherits chain mode + triage)
    │
    │ Decomposes into a task file with parallel batches
    │ Writes .hyperflow/tasks/add-auth.md
    ▼
/hyperflow:dispatch (auto-invoked, inherits chain mode + triage)
    │
    │ Batch 1 (parallel) — 3 workers, each persona-stitched and thinking-tier reviewed
    │ Batch 2 — depends on batch 1, gets learnings injected
    │ Final integration review
    ▼
Done. Next: /hyperflow:deploy (gates + commit + push) — user-explicit, not auto.
```

**Chain mode** is set once at the first skill's Step 0:

- **Auto** — chain forward through each phase with no confirmations
- **Manual** — pause between phases and confirm before advancing

**Start from any skill:**

- `/hyperflow:spec` — when the design is ambiguous → auto-chains to `scope` → `dispatch`
- `/hyperflow:scope` — when the spec is clear → auto-chains to `dispatch`
- `/hyperflow:dispatch` — when a task file already exists in `.hyperflow/tasks/`
- `/hyperflow:trace`, `/hyperflow:audit`, `/hyperflow:deploy`, `/hyperflow:scaffold`, `/hyperflow:cache`, `/hyperflow:status` — standalone, don't chain

<p align="center">
  <img src="docs/assets/demo.gif" alt="Hyperflow — chain-of-skills with parallel dispatch, quality gates, and persistent memory" width="100%" />
</p>

---

## Why Hyperflow?

- **Triages every task** — a cheap classification call picks the right flow profile before any worker fires; a 5-line edit gets `fast` (≤30k tokens), not a 300k deep run.
- **15 composable personas** — `security + api + db + frontend` are stitched per task so every worker gets expert-level guidance for the exact kind of work in front of it.
- **Higher quality** — every worker output gets a two-pass thinking-model review; workers in batch 2 benefit from batch 1 discoveries via automatic learning injection.
- **Lower cost** — expensive thinking models orchestrate and review; cheap worker models write the code. Stop paying Opus prices for tasks Sonnet handles.
- **Faster execution** — independent subtasks run in parallel; three files with no shared state means three workers, simultaneously.
- **Multi-tool** — one config, auto-detected across Claude Code and OpenCode.
- **Project memory** — conventions, gotchas, and architectural decisions persist across conversations in `.hyperflow/memory/`, fully local and version-controllable.

---

## Inside a chain

Every chain-starter begins with a **triage call** that classifies the task into `{ types[], complexity, risk, scope, ambiguity, flow, personas[] }`. That classification picks the flow profile, the spec depth, and which persona blocks are stitched into each worker prompt.

```text
You: /hyperflow:spec "Build user auth with login page, middleware, and password reset"
         │
[Triage] ─ types: [api, db, security, frontend, ui]
           complexity: complex  flow: deep  ambiguity: 0.55
         │
[Spec] ─ standard depth (2-3 questions) → design approved
         │
[Scope] ─ Decompose, write .hyperflow/tasks/auth.md
         │
[Dispatch — deep flow] ─ Parallel workers with stitched personas:
         │
         ├── Worker 1  [security + api]   — Auth middleware
         ├── Worker 2  [db + security]    — User schema + migration
         └── Worker 3  [frontend + ui]    — Login + reset pages
                       │
[Per-batch reviewer] ─ Reviews each output (thinking-tier)
         │
[Final integration review] ─ Cross-file coherence
         │
       Done. (Budget: 287k / 300k — within profile)
```

## Skills

Hyperflow ships **9 specialized skills**. There is no always-on orchestrator — you pick the entry point, and chain-starters auto-advance forward.

### Chain-starting skills (auto-advance forward)

| Skill | Command | Phase | Auto-chains to |
|-------|---------|-------|----------------|
| **Spec** | `/hyperflow:spec` | Specify the design | `scope` → `dispatch` |
| **Scope** | `/hyperflow:scope` | Decompose the work | `dispatch` |
| **Dispatch** | `/hyperflow:dispatch` | Execute the batches | endpoint — suggests `audit`/`deploy` |

Each chain-starter asks at Step 0 whether to advance **auto** (no gates between phases) or **manual** (confirm before each phase), then propagates that mode to the next skill via the `Skill` tool's `args` parameter.

### Standalone skills

| Skill | Command | Phase | Purpose |
|-------|---------|-------|---------|
| **Scaffold** | `/hyperflow:scaffold` | Project setup | Analyzes the project, creates `.hyperflow/` cache, installs provider auto-detection shims |
| **Trace** | `/hyperflow:trace` | Root-cause a bug | Systematic 5 Whys + hypothesis testing — never blind-patches symptoms |
| **Audit** | `/hyperflow:audit` | Code review | Multi-level review (L1 quick → L5 exhaustive) on uncommitted changes, a file/range, or a PR |
| **Deploy** | `/hyperflow:deploy` | Pre-push gates | Lint + typecheck + build + tests + security sweep + commit + release + push (push always asks) |
| **Cache** | `/hyperflow:cache` | Memory CRUD | `show`, `search`, `add`, `edit`, `prune`, `archive`, `clear`, `stats`, `migrate`, `off` |
| **Status** | `/hyperflow:status` | Live progress | Read-only one-screen view: static snapshot (version · profile freshness · memory count) **plus** live in-flight progress per task — sub-tasks done/pending, tokens used, wall-clock, ETA |

**Reuse architecture:** every skill is ~80–150 lines and references shared protocol files in `skills/hyperflow/` — `DOCTRINE.md` (autonomy + model routing + iron rules), `worker-prompt.md`, `reviewer-prompt.md`, `review-levels.md`, `memory-system.md`, `security.md`, `git-workflow.md`, `output-style.md`. No content duplication.

**Typical chains:**
- New feature, ambiguous scope → `/hyperflow:spec` → (auto) `scope` → `dispatch` → suggest `deploy`
- New feature, clear spec → `/hyperflow:scope` → (auto) `dispatch` → suggest `deploy`
- Hit a bug → `/hyperflow:trace` → internal audit → suggest `deploy`
- New project → `/hyperflow:scaffold` → stop; user picks next entry point

**Model routing:** Reviewer/Debugger agents use the thinking-tier model (Opus 4.7 in Claude Code by default); Implementer/Searcher/Writer agents use the worker-tier (Sonnet 4.6). Configurable via `~/.hyperflow/config.json`.

**Output style:** elegant, no decorative icons. Agent labels use `Role — short description` with `**Reviewer**` and `**Debugger**` in bold; workers stay plain. Full spec in [`skills/hyperflow/output-style.md`](skills/hyperflow/output-style.md).

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

### OpenCode

```bash
curl -fsSL https://raw.githubusercontent.com/Mohammed-Abdelhady/hyperflow/main/install.sh | bash
```

The installer auto-detects your tool, symlinks the skill, and walks you through model and security configuration.

**Invoke a skill:**

```text
You: /hyperflow:scaffold                       # first-time project setup
You: /hyperflow:spec "add auth"                # design → scope → dispatch (auto-chain)
You: /hyperflow:scope "fix login bug"          # scope → dispatch
You: /hyperflow:trace                          # root-cause a failing test
You: /hyperflow:deploy                         # pre-push gates + commit + push
```

There is no always-on activation. Each slash command runs its skill and (for chain-starters) auto-advances until the review phase. The user is asked **once** at Step 0 whether to advance in auto or manual mode.

---

## The 10 orchestration layers

| Layer | Name | Summary |
|-------|------|---------|
| L0 | Project analysis | Caches tech stack, architecture, and conventions in `.hyperflow/` |
| L0.5 | Task triage | Classifies each request into `{ types, complexity, risk, flow, personas[] }` to drive the rest |
| L1 | Autonomy | Zero confirmations, minimal output, silent error recovery |
| L2 | Model routing | Configurable thinking/worker models per provider + priority chain |
| L3 | Orchestrator | Decompose → parallel dispatch → review → synthesize → integrate |
| L4 | Spec (Brainstorming) | Design exploration with approval before implementation |
| L5 | Quality gates | Automated lint, typecheck, build, tests after every review |
| L6 | Project memory | Persistent learnings in `.hyperflow/memory/` (tagged, tiered) |
| L7 | Task templates | Pre-built decomposition (CRUD, API, UI, migration, refactor, bug fix) |
| L8 | Git workflow | Auto-branch, auto-commit after approval, never auto-push |
| L9 | Security | Prompt-injected blocklists for sensitive files and dangerous commands |

### How the layers map onto the chain

| Phase | Skill | Layers exercised | Review levels | Approval gates |
|---|---|---|---|---|
| Setup | `/hyperflow:scaffold` | L0 | — | None |
| Spec | `/hyperflow:spec` | L0.5, L4 | — | Chain-mode (Step 0) · Section approval (×5) · Phase advance (manual) |
| Scope | `/hyperflow:scope` | L0, L6, L7 | — | Chain-mode (if direct) · Phase advance (manual) |
| Dispatch | `/hyperflow:dispatch` | L2, L3, L5, L6, L8, L9 | L1–L5 per profile (fast=L1 · standard=L1–2 · deep/scientific=L1–5) | Inter-batch (manual) · `SECURITY_VIOLATION` halt · **Audit prompt + Deploy prompt at Step 5** |
| Audit | `/hyperflow:audit` | L9 | L1–L5 explicit | **Fix gate (NEEDS_FIX → AskUserQuestion: Fix all / Crit+Imp / Crit only / No)** |
| Trace | `/hyperflow:trace` | L3, L6, L9 | L1–L3 on fix | None |
| Deploy | `/hyperflow:deploy` | L5, L8, L9 | — | Commit-inclusion (uncommitted user changes) · Push confirmation (mandatory) |
| Cache | `/hyperflow:cache` | L6 | — | Confirm-on-clear |
| Status | `/hyperflow:status` | — | — | None — read-only, no dispatch |

L1 syntax/format · L2 spec/naming/edges · L3 integration/security · L4 perf/scale · L5 a11y/UX. Full checklist in [`skills/hyperflow/review-levels.md`](skills/hyperflow/review-levels.md).

---

## Examples

<details open>
<summary><strong>Implementation</strong> — clear approach, just build it</summary>

```
You: /hyperflow:scope "Add a search bar to the dashboard with debounced input"

  Triage      classifies: standard flow, 2 files, ambiguity 0.1
  Scope       decomposes into: SearchBar + useDebounce + wire into Dashboard
  Dispatch    Implementer — builds SearchBar          ─┐
              Implementer — creates useDebounce        ├── parallel
                                                       ─┘
  **Reviewer** reviews both outputs
  Implementer wires SearchBar into Dashboard (with learnings)
  **Reviewer** final integration review
```
</details>

<details>
<summary><strong>Design</strong> — ambiguous scope, spec first</summary>

```
You: /hyperflow:spec "I need a notification system for the app"

  Triage     classifies: deep flow, ambiguity 0.7
  Spec       explores codebase, asks 2 targeted questions
             proposes 2 approaches with trade-offs → you pick
             presents design section by section → you approve
  Scope      (auto) decomposes into batches
  Dispatch   (auto) workers + per-batch reviews + final integration
```
</details>

<details>
<summary><strong>Debugging</strong> — parallel investigation</summary>

```
You: /hyperflow:trace "Tests are failing after the auth refactor"

  **Debugger** identifies 3 independent broken test files
  Searcher    auth-middleware.test.ts    ─┐
  Searcher    login-flow.test.ts          ├── parallel
  Searcher    session-handler.test.ts    ─┘
  Implementer applies root-cause fix
  Writer      adds regression test
  **Reviewer** validates fix + test
```
</details>

<details>
<summary><strong>Quick tasks</strong> — fast flow profile, still reviewed</summary>

```
You: /hyperflow:scope "Rename the Button component to PrimaryButton"

  Triage      classifies: fast flow, 1 file, ambiguity 0.0
  Dispatch    Implementer renames component + updates all imports
  **Reviewer** inline self-review (fast profile)
```
</details>

**What you'll notice:** No "should I proceed?" prompts within a phase. The only gates that fire are *structural* (rule 8):

- (a) **Step 0** — auto-vs-manual chain mode, once per chain
- (b) **Spec questions** — floor of 2 questions per spec run, scaled to triage ambiguity
- (c) **Section approval** — once per design section in deep mode
- (d) **Inter-phase advance** — only if you chose `manual` mode at Step 0
- (e) **Inter-batch advance** — only in `manual` mode, after each batch's gates pass
- (f) **Audit prompt** at end of dispatch — *"Run /hyperflow:audit?"*
- (g) **Deploy prompt** at end of dispatch — *"Run /hyperflow:deploy?"*
- (h) **Audit fix gate** — when audit finds issues, *"Apply fixes via /hyperflow:scope → /hyperflow:dispatch?"*
- (i) **Push confirmation** in deploy — *"Push to origin/<branch>?"* — mandatory, never force-pushes to main
- (j) **`SECURITY_VIOLATION`** — hard halt at any reviewer, no auto-continue

Want a live look at what's running, what's done, and how long until it finishes? Run `/hyperflow:status` — shows a progress bar per task with tokens used and ETA, read straight from each task file's `## Status` block that dispatch keeps updated.

---

## Adaptive flow profiles

| Profile | Use when | Workers | Reviews | Budget |
|---------|----------|---------|---------|--------|
| `fast` | trivial single-file, reversible, low-ambiguity | 1 | inline self-review | ≤30k |
| `standard` | simple/moderate, 2–5 files | 1–2 | 1 batch reviewer | ≤100k |
| `deep` | complex / cross-cutting / system-wide | 3+ | per-batch + final | 300k |
| `research` | unknown territory, library/code evaluation | 3+ searchers | inline | ≤80k |
| `creative` | UI/UX exploration, design-dominant | 1–2 | 1 reviewer | ≤150k |
| `scientific` | correctness-critical, numerical/proof | 2–3 + TDD | multi-level L1–L5 | 300k |

Triage picks the profile based on `{ complexity, scope, risk, types, ambiguity }`. Profiles upgrade mid-flight if a worker returns `ESCALATE:` — and downgrade if research shows the task is simpler than expected.

---

## Specialist personas

Every task is tagged with one or more types. The orchestrator stitches matching persona blocks into worker prompts so each worker receives expert-level guidance for the kind of work in front of it. A user-auth task (`[api, db, security]`) gets `api + db + security` guidance composed in priority order in a single worker prompt.

15 personas span the common engineering domains:

| Category | Personas |
|----------|----------|
| Foundational | `architect`, `frontend`, `ui`, `api`, `db` |
| Cross-cutting | `security`, `scientific`, `performance` |
| Workflow | `refactor`, `bugfix`, `test`, `research` |
| Surface | `creative`, `devops`, `docs` |

Personas compose by priority. `security` is stitched first so its constraints frame every other decision; `creative` is stitched last so divergent exploration adapts to the structural choices above it.

---

## Supported providers

| Provider | Thinking model | Worker model |
|----------|---------------|--------------|
| Claude Code | Opus 4.7 | Sonnet 4.6 |
| OpenCode | Claude Opus 4.7 | Sonnet 4.6 |

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

The 9 autonomy rules live in [`skills/hyperflow/DOCTRINE.md`](skills/hyperflow/DOCTRINE.md) under "Layer 1: Autonomy". `DOCTRINE.md` is the shared rule sheet referenced by every skill — not a registered skill itself. Add, remove, or modify rules to match your workflow; the changes apply to all skills that reference it.
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

## Contributing

Contributors keep `README.md` in sync with shipped features on every push. `scripts/release.sh` warns if README has not been updated since the last release tag. See `CLAUDE.md` for the full contributor guide. All commits must follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `perf:`, `style:`, `test:`) — the release script reads these to determine the version bump and generate CHANGELOG entries automatically. Major orchestrator changes are documented in the reference files under `skills/hyperflow/*.md`. Start with `DOCTRINE.md`, `task-triage.md`, `flow-profiles.md`, and `adaptive-brainstorming.md` for the orchestration internals.

### Project structure

```
hyperflow/
├── skills/
│   ├── hyperflow/                #   Shared doctrine + reference docs (not a skill itself)
│   │   ├── DOCTRINE.md           #     Layers 0–9: autonomy, model routing, orchestrator, gates, memory, security
│   │   ├── task-triage.md        #     Layer 0.5 triage prompt + JSON schema + examples
│   │   ├── flow-profiles.md      #     6 flow profiles + pipelines + skip/upgrade conditions
│   │   ├── adaptive-brainstorming.md  # Depth modes, question framework, section-approval
│   │   ├── escalation.md         #     Mid-flight escalation paths, token accounting
│   │   ├── personas-A.md         #     Personas 1–8 (security, scientific, architect, …)
│   │   ├── personas-B.md         #     Personas 9–15 (research, refactor, bugfix, …)
│   │   ├── output-style.md       #     Elegant label/status style (no icons, em-dash, bold-for-thinking)
│   │   ├── model-config.md       #     Model configuration reference
│   │   ├── worker-prompt.md      #     Worker dispatch template
│   │   ├── reviewer-prompt.md    #     Review template
│   │   ├── review-levels.md      #     L1–L5 review checklists
│   │   ├── quality-gates.md      #     Automated checks
│   │   ├── memory-system.md      #     Cross-session learnings
│   │   ├── session-memory.md     #     Session-scoped memory protocol
│   │   ├── task-templates.md     #     Decomposition patterns
│   │   ├── task-tracking.md      #     Task-file format and lifecycle
│   │   ├── git-workflow.md       #     Branching + auto-commit
│   │   ├── security.md           #     Worker containment
│   │   ├── project-analysis.md   #     .hyperflow/ cache spec
│   │   └── brainstorming-advanced.md
│   ├── scaffold/SKILL.md         #   /hyperflow:scaffold — project setup (standalone)
│   ├── spec/SKILL.md             #   /hyperflow:spec     — specify the design (chain-starter)
│   ├── scope/SKILL.md            #   /hyperflow:scope    — decompose into task file (chain-starter)
│   ├── dispatch/SKILL.md         #   /hyperflow:dispatch — dispatch workers + reviews (chain-endpoint)
│   ├── trace/SKILL.md            #   /hyperflow:trace    — root-cause a bug
│   ├── audit/SKILL.md            #   /hyperflow:audit    — multi-level code review
│   ├── deploy/SKILL.md           #   /hyperflow:deploy   — pre-push gates + commit + push
│   ├── cache/SKILL.md            #   /hyperflow:cache    — memory CRUD
│   └── status/SKILL.md           #   /hyperflow:status   — read-only project snapshot
├── scripts/
│   ├── release.sh                #   Auto-release with changelog generation
│   └── bump-version.sh           #   Sync version across all manifests
├── config/
│   ├── defaults.json             #   Default model catalogs
│   └── schema.json               #   Config JSON Schema
├── hooks/
│   ├── hooks.json                #   Session startup config
│   └── session-start             #   Welcome injection (lists entry skills — no longer injects an always-on orchestrator)
├── docs/                         #   Guides and references
├── .claude-plugin/plugin.json    #   Claude Code plugin manifest
├── install.sh                    #   Installer + setup wizard
├── package.json
├── CHANGELOG.md                  #   Version history
├── LICENSE                       #   MIT
└── README.md
```

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

This removes all plugin files. Project memory at `.hyperflow/memory/` is kept — delete it manually if you want a clean slate.

---

## Plugin behavior & permissions

For full transparency — what this plugin does at runtime, so reviewers and users know exactly what they're installing:

| Surface | What happens | Code |
|---|---|---|
| **`SessionStart` hook** | On `startup`, `clear`, and `compact` events, runs `hooks/session-start` (bash). The script emits a small welcome message listing the available `/hyperflow:*` entry skills. It does **not** inject an always-on orchestrator — each skill is loaded only when invoked. | [`hooks/session-start`](hooks/session-start), [`hooks/hooks.json`](hooks/hooks.json) |
| **Skill content** | Each skill file (`skills/<name>/SKILL.md`) is loaded only when the user invokes that slash command. Chain-starting skills (`spec`, `scope`, `dispatch`) ask at Step 0 whether to auto-advance forward or pause between phases, then run their phase. Shared rules live in `skills/hyperflow/DOCTRINE.md` and supporting reference files. | [`skills/hyperflow/DOCTRINE.md`](skills/hyperflow/DOCTRINE.md) |
| **Session memory** | Reads and appends to `.hyperflow/memory/` (project-scoped) to persist learnings across conversations. No data leaves your machine. | [`skills/hyperflow/session-memory.md`](skills/hyperflow/session-memory.md) |
| **Config** | Optional `~/.hyperflow/config.json` for model selection and security overrides. Created only if you run the installer wizard; not required. | [`config/schema.json`](config/schema.json) |
| **Network access** | None at runtime. The plugin does not make outbound network calls. The optional `install.sh` setup wizard clones the repo and writes config locally. | — |
| **File writes** | `.hyperflow/memory/` (project-scoped session memory) and, if you run the installer, `~/.hyperflow/config.json` and tool shim files (`CLAUDE.md`, `AGENTS.md`). The skill instructs the orchestrator to follow project conventions for everything else. | — |
| **Worker containment** | Workers are constrained by prompt-injected blocklists for sensitive files (`.env`, `*.pem`, `*.key`, `~/.ssh/*`, cloud creds) and destructive commands (`rm -rf`, `git push --force` to main, `sudo`, `chmod 777`). See Layer 9 above. | [`skills/hyperflow/security.md`](skills/hyperflow/security.md) |
| **Dependencies** | The hook script requires `bash`, `python3`, and standard POSIX tools — all available by default on macOS and Linux. No Node, no package installs. | — |

**Why the welcome injection?** The hook only surfaces the available `/hyperflow:*` entry skills and a brief overview — it does not embed a full doctrine. Each skill loads independently when invoked. The doctrine (autonomy rules, model routing, output style, security) lives in [`skills/hyperflow/DOCTRINE.md`](skills/hyperflow/DOCTRINE.md) and is referenced by each skill on demand.

---

## Documentation

- [Installation Guide](docs/installation.md) — setup, recommended settings, security config
- [Provider Setup](docs/providers.md) — per-platform model catalogs
- [Model Routing](docs/model-routing.md) — resolution priority, role overrides, runtime switching
- [Orchestration Pattern](docs/orchestration.md) — decomposition, review, learning injection

---

## License

MIT
