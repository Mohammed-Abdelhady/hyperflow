<h1 align="center">Hyperflow</h1>

<p align="center">
  <strong>Multi-agent orchestration for Claude Code &amp; OpenCode.</strong><br/>
  Thinking models think. Worker models execute. Every step dispatches a Worker → Reviewer pair.
</p>

<p align="center">
  <code>scaffold</code> → <code>spec</code> → <code>scope</code> → <code>dispatch</code> → <code>audit</code> → <code>deploy</code><br/>
  Start anywhere. Auto-advance forward. Memory persists across sessions.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v4.3.0-blueviolet?style=flat-square" alt="version v4.3.0" />
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
  <img src="docs/assets/demo.gif" alt="Hyperflow — chain-of-skills with parallel dispatch, quality gates, and persistent memory" width="100%" />
</p>

---

## What it does

Hyperflow is **not always-on**. You invoke a skill, and chain-starters auto-advance forward through the rest of the chain.

```
/hyperflow:spec "Add user auth with login page and middleware"
    │
    │ Step 0 — auto vs manual chain mode (named workflow paths: marker on)
    │ Triage classifies the task (flow profile, depth, personas)
    │ Smart Questions fire AFTER context analysis (floor 2)
    ▼
/hyperflow:scope (auto-invoked, inherits chain mode + triage)
    │
    │ Searchers map the affected surface (in parallel)
    │ Post-research clarify — fires only if ambiguity remains
    │ Operational pre-elections — commit cadence · branch · push (in auto)
    │ Planner decomposes into batches → .hyperflow/tasks/<slug>.md
    ▼
/hyperflow:dispatch (auto-invoked, inherits chain mode + triage + ops args)
    │
    │ Batch 1 (parallel) — N workers, persona-stitched, thinking-tier reviewed
    │ Per-sub-task commit (or per-batch / single / none — from scope op-election)
    │ Batch 2 — depends on batch 1, gets learnings injected
    │ Conditional final integration review · End-of-chain audit + deploy gates
    ▼
Done.
```

**Chain mode** is set once at the first skill's Step 0:

- **Auto** — chain forward through each phase with no inter-phase pauses
- **Manual** — pause between phases and confirm before advancing

Auto vs manual controls **only** confirmation pauses. Clarification questions fire in both modes, always after the orchestrator has analyzed the requirement and read the relevant code.

**Start from any skill:**

- `/hyperflow:spec` — ambiguous design → auto-chains to `scope` → `dispatch`
- `/hyperflow:scope` — clear spec → auto-chains to `dispatch`
- `/hyperflow:dispatch` — task file already in `.hyperflow/tasks/`
- `/hyperflow:trace`, `/hyperflow:audit`, `/hyperflow:deploy`, `/hyperflow:scaffold`, `/hyperflow:cache`, `/hyperflow:status` — standalone, don't chain

---

## Why

- **Triages every task** — a cheap classification call picks the flow profile before any worker fires; a 5-line edit gets `fast` (≤30k tokens), not a 300k deep run.
- **15 composable personas** — `security + api + db + frontend` are stitched per task so every worker gets expert-level guidance for the exact work in front of it.
- **Higher quality** — every worker output gets a two-pass thinking-model review; batch-2 workers benefit from batch-1 discoveries via automatic learning injection.
- **Lower cost** — expensive thinking models orchestrate and review; cheap worker models write the code.
- **Faster execution** — independent sub-tasks run in parallel; three files with no shared state means three workers, simultaneously.
- **Multi-tool** — one config, auto-detected across Claude Code and OpenCode.
- **Project memory** — conventions, gotchas, decisions persist in `.hyperflow/memory/` — local, version-controllable, never mixed across repos. User-invoked `/hyperflow:cache compact` keeps memory files lean.

**Latency:** parallel sibling drafts (P1) + batched same-level reviews (P2) + triage-driven step skipping (P4) + lean worker prompts (P5) cut a median spec run from ~16 sequential round-trips to ~4–6. Pass `--thorough` to disable speed patterns for high-risk runs. Pattern catalogue: [`skills/spec/references/latency-patterns.md`](skills/spec/references/latency-patterns.md).

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
[Scope] ─ Searchers map auth surface → post-research clarify (if needed)
         │ Operational pre-elections: commit=per-task · branch=new · push=ask
         │ Decompose → .hyperflow/tasks/auth.md
         │
[Dispatch — deep flow] ─ Parallel workers with stitched personas:
         │
         ├── Worker 1  [security + api]   — Auth middleware
         ├── Worker 2  [db + security]    — User schema + migration
         └── Worker 3  [frontend + ui]    — Login + reset pages
                       │
[Per-batch reviewer] ─ Reviews each output (thinking-tier · batched)
         │
[Final integration review] ─ Cross-file coherence (conditional)
         │
       Done. End-of-chain gates: audit? deploy?
```

---

## Skills

Hyperflow ships **9 specialized skills**. There is no always-on orchestrator — you pick the entry point, and chain-starters auto-advance forward.

### Chain-starting skills

| Skill | Command | Phase | Auto-chains to |
|-------|---------|-------|----------------|
| **Spec** | `/hyperflow:spec` | Specify the design | `scope` → `dispatch` |
| **Scope** | `/hyperflow:scope` | Decompose the work | `dispatch` |
| **Dispatch** | `/hyperflow:dispatch` | Execute the batches | endpoint — fires audit + deploy gates |

### Standalone skills

| Skill | Command | Purpose |
|-------|---------|---------|
| **Scaffold** | `/hyperflow:scaffold` | Analyze project · build `.hyperflow/` cache · install provider auto-detection shims |
| **Trace** | `/hyperflow:trace` | Systematic root-cause: 5 Whys + hypothesis testing — never blind-patches symptoms |
| **Audit** | `/hyperflow:audit` | Multi-level review (L1 quick → L5 exhaustive) on uncommitted changes, a file/range, or a PR |
| **Deploy** | `/hyperflow:deploy` | Lint + typecheck + build + tests + security sweep + commit + release.sh + push |
| **Cache** | `/hyperflow:cache` | Memory CRUD: `show`, `search`, `add`, `edit`, `prune`, `archive`, `clear`, `stats`, `migrate`, `off`, `compact` |
| **Status** | `/hyperflow:status` | Read-only one-screen view: version · profile freshness · memory count + live per-task progress (sub-tasks done/pending, tokens, wall-clock, ETA) |

**Reuse architecture:** every skill is 80–200 lines and references shared protocol files in `skills/hyperflow/` — `DOCTRINE.md` (autonomy + model routing + iron rules), `worker-prompt.md`, `reviewer-prompt.md`, `review-levels.md`, `memory-system.md`, `security.md`, `git-workflow.md`, `output-style.md`. No content duplication.

**Typical chains:**

- Ambiguous feature → `/hyperflow:spec` → (auto) `scope` → `dispatch` → audit gate → deploy gate
- Clear spec → `/hyperflow:scope` → (auto) `dispatch` → audit gate → deploy gate
- Bug fix → `/hyperflow:trace` → fix dispatched inline → deploy gate
- New project → `/hyperflow:scaffold` → stop; user picks next entry point

**Model routing:** Reviewer/Debugger agents use the thinking-tier model (Opus 4.7 in Claude Code by default); Implementer/Searcher/Writer agents use the worker-tier (Sonnet 4.6). Configurable via `~/.hyperflow/config.json`.

**Output style:** elegant, no decorative icons. Agent labels use `Role — short description`; `**Reviewer**` and `**Debugger**` are bold. Full spec in [`skills/hyperflow/output-style.md`](skills/hyperflow/output-style.md).

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

There is no always-on activation. Each slash command runs its skill and (for chain-starters) auto-advances. The user is asked **once** at Step 0 whether to advance in auto or manual mode.

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
| L6 | Project memory | Persistent learnings in `.hyperflow/memory/` (tagged, tiered, compactable) |
| L7 | Task templates | Pre-built decomposition (CRUD, API, UI, migration, refactor, bug fix) |
| L8 | Git workflow | Auto-branch, auto-commit per chosen cadence, never auto-push without consent |
| L9 | Security | Prompt-injected blocklists for sensitive files and dangerous commands |

### How the layers map onto the chain

| Phase | Skill | Layers exercised | Review levels | Approval gates |
|---|---|---|---|---|
| Setup | `/hyperflow:scaffold` | L0 | — | None |
| Spec | `/hyperflow:spec` | L0.5, L4 | — | Chain-mode (Step 0) · Smart Questions (floor 2, post-analysis) · Section approval (×5) · Phase advance (manual) |
| Scope | `/hyperflow:scope` | L0, L6, L7 | — | Chain-mode (if direct) · Post-research clarify (if ambiguity) · **Operational pre-elections (auto mode: commit/branch/push batched)** |
| Dispatch | `/hyperflow:dispatch` | L2, L3, L5, L6, L8, L9 | L1–L5 per profile (fast=L1 · standard=L1–2 · deep/scientific=L1–5) | Inter-batch (manual) · `SECURITY_VIOLATION` halt · **Audit + Deploy gates batched at Step 5** |
| Audit | `/hyperflow:audit` | L9 | L1–L5 explicit | **Fix gate (NEEDS_FIX → Fix all / Crit+Imp / Crit only / No)** |
| Trace | `/hyperflow:trace` | L3, L6, L9 | L1–L3 on fix | None |
| Deploy | `/hyperflow:deploy` | L5, L8, L9 | — | Commit-inclusion (binary) · Push (honors scope `push=ask/auto/never` pre-election) |
| Cache | `/hyperflow:cache` | L6 | — | Confirm-on-clear |
| Status | `/hyperflow:status` | — | — | None — read-only, no dispatch |

L1 syntax/format · L2 spec/naming/edges · L3 integration/security · L4 perf/scale · L5 a11y/UX. Full checklist in [`skills/hyperflow/review-levels.md`](skills/hyperflow/review-levels.md).

### Gate behaviour (DOCTRINE rule 8)

- **Clarification is mandatory, confirmation is banned.** Auto vs manual differs in **exactly one place**: inter-phase / inter-batch pauses. Every clarification stage fires in both modes.
- **Clarification fires AFTER analysis, never before.** Spec runs Triage → Searcher → Analyst → THEN questions. Scope runs Route → Searcher → THEN clarify. Asking before research wastes the user's time on questions the codebase already answers.
- **Binary action gates carry no recommendation marker.** `Yes/No`, `Approve/Revise`, `Push/Hold`, `Include/Exclude` are presented as neutral two-outcome choices. Multi-option choices (3+) and named workflow paths (`Auto/Manual`, `Create new/Stay on current`) keep the `(Recommended)` marker.
- **Invented gates are forbidden.** "Transparency checkpoint", "midway sanity check", "scope re-confirmation", "cost heads-up" — all banned in auto mode. Status prints are fine; status *questions* are not.

---

## Examples

<details open>
<summary><strong>Implementation</strong> — clear approach, just build it</summary>

```
You: /hyperflow:scope "Add a search bar to the dashboard with debounced input"

  Triage      classifies: standard flow, 2 files, ambiguity 0.1
  Scope       Searchers map dashboard + hooks surface
              Operational pre-elections (auto mode):
                commit=per-task · branch=new feat/search-bar · push=ask
              Decompose: SearchBar + useDebounce + wire into Dashboard
  Dispatch    Implementer — builds SearchBar          ─┐
              Implementer — creates useDebounce        ├── parallel
                                                       ─┘
  **Reviewer** batched review (L1-L2)
  Implementer wires SearchBar into Dashboard (with learnings)
  **Reviewer** final integration review (conditional — skipped if all batches PASS first try)
  Audit gate? Deploy gate?
```
</details>

<details>
<summary><strong>Design</strong> — ambiguous scope, spec first</summary>

```
You: /hyperflow:spec "I need a notification system for the app"

  Triage     classifies: deep flow, ambiguity 0.7
  Spec       Context Searcher + 6-dim Analyst run first
             THEN Smart Questions (floor 2, targeted at unknowns the analysis surfaced)
             Proposes 2 approaches with trade-offs → you pick
             Presents design section by section → you approve/revise per section
  Scope      (auto) Searchers map · post-research clarify · operational pre-elections
  Dispatch   (auto) workers + per-batch reviews + conditional final integration
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

**What you'll notice in auto mode** — only structural gates fire:

1. **Step 0** chain-mode (auto/manual), once per chain
2. **Smart Questions** in spec (post-analysis, floor 2)
3. **Section approval** (`Approve / Revise`, no marker — binary)
4. **Post-research clarify** in scope (only if research left ambiguity)
5. **Operational pre-elections** in scope (commit cadence · branch · push — batched into one ask)
6. **End-of-chain audit + deploy** gates (batched into one ask at dispatch Step 5)
7. **Push** in deploy (skipped silently if `push=auto`/`never` was pre-elected)
8. **`SECURITY_VIOLATION`** — hard halt at any reviewer, no auto-continue

Want a live look at what's running? Run `/hyperflow:status` — progress bar per task with tokens used and ETA, read straight from each task file's `## Status` block that dispatch keeps updated.

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

## Providers + configuration

| Provider | Thinking model | Worker model |
|----------|---------------|--------------|
| Claude Code | Opus 4.7 | Sonnet 4.6 |
| OpenCode | Claude Opus 4.7 | Sonnet 4.6 |

Provider is auto-detected at session start. Override any model in `~/.hyperflow/config.json` or switch mid-session with `hyperflow: thinking <model>`. See [Provider Setup](docs/providers.md).

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
  },
  "memory": {
    "compactionThreshold": 300
  }
}
```

Runtime switching: `hyperflow: thinking opus-4-7` · `hyperflow: worker haiku-4-5` · `hyperflow: models` (show current). Full schema at [`config/schema.json`](config/schema.json).

---

## Project memory

Memory lives at `.hyperflow/memory/` — project-scoped, plain markdown, version-controllable, never mixed across repos. Hyperflow reads only tag-matched entries at session start and injects them into worker prompts automatically.

| Tier | Tag | Behaviour |
|------|-----|-----------|
| Hot | `#hot` | Always injected at session start |
| Warm | any topic tag | Injected when a task matches the tag |
| Cold | none | Available on demand; never auto-injected |

When a memory file crosses the configured line-count threshold (default 300), the session-start hook prints a one-line non-blocking advisory. Run `/hyperflow:cache compact` to summarise entries older than 7 days into stub lines and archive the full text to `.hyperflow/memory/archive/YYYY-MM.md`. Full protocol: [`skills/cache/references/compaction.md`](skills/cache/references/compaction.md) · memory system: [`skills/hyperflow/session-memory.md`](skills/hyperflow/session-memory.md).

---

## Plugin behavior & permissions

| Surface | What happens | Code |
|---|---|---|
| **`SessionStart` hook** | On `startup`, `clear`, and `compact` events, runs `hooks/session-start` (bash). Emits a welcome message listing the available `/hyperflow:*` entry skills and (when over threshold) a non-blocking memory-compaction advisory. Does **not** inject an always-on orchestrator. | [`hooks/session-start`](hooks/session-start), [`hooks/hooks.json`](hooks/hooks.json) |
| **Skill content** | Each `skills/<name>/SKILL.md` is loaded only when the user invokes that slash command. Chain-starters ask at Step 0 whether to auto-advance or pause between phases. Shared rules live in [`skills/hyperflow/DOCTRINE.md`](skills/hyperflow/DOCTRINE.md). | [`skills/hyperflow/DOCTRINE.md`](skills/hyperflow/DOCTRINE.md) |
| **Session memory** | Reads and appends to `.hyperflow/memory/` (project-scoped) to persist learnings across conversations. No data leaves your machine. | [`skills/hyperflow/session-memory.md`](skills/hyperflow/session-memory.md) |
| **Config** | Optional `~/.hyperflow/config.json` for model selection, security overrides, and memory compaction threshold. Created only if you run the installer wizard; not required. | [`config/schema.json`](config/schema.json) |
| **Network access** | None at runtime. The plugin makes no outbound network calls. The optional `install.sh` setup wizard clones the repo and writes config locally. | — |
| **File writes** | `.hyperflow/` (project-scoped session memory, task files, specs) and, if you run the installer, `~/.hyperflow/config.json` and tool shim files (`CLAUDE.md`, `AGENTS.md`). | — |
| **Worker containment** | Workers are constrained by prompt-injected blocklists for sensitive files (`.env`, `*.pem`, `*.key`, `~/.ssh/*`, cloud creds) and destructive commands (`rm -rf`, `git push --force` to main, `sudo`, `chmod 777`). See Layer 9 above. | [`skills/hyperflow/security.md`](skills/hyperflow/security.md) |
| **Dependencies** | The hook script requires `bash`, `python3`, and standard POSIX tools — all available by default on macOS and Linux. No Node, no package installs. | — |

---

## Update + uninstall

```bash
claude plugin update hyperflow@hyperflow-marketplace      # update to latest
claude plugin uninstall hyperflow@hyperflow-marketplace   # remove plugin (memory at .hyperflow/memory/ is kept)
```

See [CHANGELOG](CHANGELOG.md) for what's new in each release.

---

## Project structure

```
hyperflow/
├── skills/
│   ├── hyperflow/                # Shared doctrine + reference docs (not a skill itself)
│   │   ├── DOCTRINE.md           #   Layers 0–9: autonomy, model routing, orchestrator, gates, memory, security
│   │   ├── task-triage.md        #   Layer 0.5 triage prompt + JSON schema
│   │   ├── flow-profiles.md      #   6 flow profiles + pipelines + skip/upgrade conditions
│   │   ├── adaptive-brainstorming.md  # Depth modes, question framework, section-approval
│   │   ├── brainstorming-advanced.md
│   │   ├── escalation.md         #   Mid-flight escalation paths, token accounting
│   │   ├── personas-A.md         #   Personas 1–8 (security, scientific, architect, …)
│   │   ├── personas-B.md         #   Personas 9–15 (research, refactor, bugfix, …)
│   │   ├── output-style.md       #   Elegant label/status style (no icons, em-dash, bold-for-thinking)
│   │   ├── model-config.md       #   Model configuration reference
│   │   ├── worker-prompt.md      #   Worker dispatch template
│   │   ├── worker-prompt-lean.md #   P5 lean variant (memory references not inlined)
│   │   ├── reviewer-prompt.md    #   Review template
│   │   ├── reviewer-prompt-batched.md  # P2 batched review variant
│   │   ├── review-levels.md      #   L1–L5 review checklists
│   │   ├── quality-gates.md      #   Automated checks
│   │   ├── memory-system.md      #   Cross-session learnings (with compaction protocol)
│   │   ├── session-memory.md     #   Session-scoped memory protocol
│   │   ├── task-templates.md     #   Decomposition patterns
│   │   ├── task-tracking.md      #   Task-file format and lifecycle
│   │   ├── git-workflow.md       #   Branching + commit cadence options + no AI attribution
│   │   ├── security.md           #   Worker containment
│   │   └── project-analysis.md   #   .hyperflow/ cache spec
│   ├── scaffold/SKILL.md         # /hyperflow:scaffold — project setup (standalone)
│   ├── spec/SKILL.md             # /hyperflow:spec     — specify the design (chain-starter)
│   ├── scope/SKILL.md            # /hyperflow:scope    — decompose into task file (chain-starter)
│   ├── dispatch/SKILL.md         # /hyperflow:dispatch — dispatch workers + reviews (chain-endpoint)
│   ├── trace/SKILL.md            # /hyperflow:trace    — root-cause a bug
│   ├── audit/SKILL.md            # /hyperflow:audit    — multi-level code review
│   ├── deploy/SKILL.md           # /hyperflow:deploy   — pre-push gates + commit + push
│   ├── cache/
│   │   ├── SKILL.md              # /hyperflow:cache    — memory CRUD + compact subcommand
│   │   └── references/compaction.md  # Compaction protocol reference
│   └── status/SKILL.md           # /hyperflow:status   — read-only project snapshot
├── scripts/
│   ├── release.sh                # Auto-release with changelog generation
│   └── bump-version.sh           # Sync version across all manifests
├── config/
│   ├── defaults.json             # Default model catalogs
│   └── schema.json               # Config JSON Schema
├── hooks/
│   ├── hooks.json                # Session startup config
│   └── session-start             # Welcome injection + memory-compaction advisory (bash + python3)
├── docs/                         # Guides and references
├── .claude-plugin/plugin.json    # Claude Code plugin manifest
├── install.sh                    # Installer + setup wizard
├── package.json
├── CHANGELOG.md                  # Version history
├── PRIVACY.md                    # Privacy + data handling
├── LICENSE                       # MIT
└── README.md
```

---

## Contributing

Contributors keep `README.md` in sync with shipped features on every push. `scripts/release.sh` warns if README has not been updated since the last release tag. See `CLAUDE.md` for the full contributor guide. All commits must follow [Conventional Commits](https://www.conventionalcommits.org/) — the release script reads these to determine the version bump and generate CHANGELOG entries automatically.

**Release a new version:**

```bash
./scripts/release.sh          # auto-detect bump type from commits (feat→minor, fix→patch, BREAKING→major)
./scripts/release.sh minor    # force a minor bump
./scripts/release.sh patch    # force a patch bump
```

After running, push with `git push && git push --tags`.

---

## Documentation

- [Installation Guide](docs/installation.md) — setup, recommended settings, security config
- [Provider Setup](docs/providers.md) — per-platform model catalogs
- [Model Routing](docs/model-routing.md) — resolution priority, role overrides, runtime switching
- [Orchestration Pattern](docs/orchestration.md) — decomposition, review, learning injection

---

## License

MIT
