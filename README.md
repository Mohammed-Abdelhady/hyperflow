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
  <img src="https://img.shields.io/badge/version-v4.18.0-blueviolet?style=flat-square" alt="version v4.18.0" />
  &nbsp;
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT license" />
  &nbsp;
  <img src="https://img.shields.io/badge/Claude%20marketplace-published-22C55E?style=flat-square" alt="Published on the official Claude plugin marketplace" />
  &nbsp;
  <img src="https://img.shields.io/badge/works%20with-Claude%20Code%20%7C%20OpenCode%20%7C%20Antigravity-2EA39F?style=flat-square" alt="works with Claude Code, OpenCode, and Antigravity" />
</p>

<p align="center">
  Accepted to the official Claude plugin marketplace — listed at <a href="https://claude.ai/settings/plugins/submissions">claude.ai/settings/plugins/submissions</a> (Published).<br/>
  CLI install via <code>hyperflow@claude-plugins-official</code> goes live once the entry lands in <a href="https://github.com/anthropics/claude-plugins-official/blob/main/.claude-plugin/marketplace.json"><code>anthropics/claude-plugins-official</code></a>. Until then, install directly from this repo (instructions below).
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

## The chain

Invoke a skill. Chain-starters auto-advance forward — no always-on orchestrator, no background process.

```
/hyperflow:spec "Add user auth with login page and middleware"
    │
    │ Step 0 — auto vs manual chain mode (once per chain)
    │ Triage classifies the task (flow profile, depth, personas)
    │ Smart Questions fire AFTER context analysis (floor 2)
    ▼
/hyperflow:scope (auto-invoked, inherits chain mode + triage)
    │
    │ Searchers map the affected surface (in parallel)
    │ Post-research clarify — fires only if ambiguity remains
    │ Operational pre-elections — commit cadence · branch · push (batched ask)
    │ Planner decomposes into batches → .hyperflow/tasks/<slug>.md
    ▼
/hyperflow:dispatch (auto-invoked, inherits chain mode + triage + ops args)
    │
    │ Batch 1 (parallel) — N workers, persona-stitched, thinking-tier reviewed
    │ Per-sub-task commit (or per-batch / single / none — from scope pre-election)
    │ Batch 2 — depends on batch 1, gets learnings injected
    │ Conditional final integration review · End-of-chain audit + deploy gates
    ▼
Done.
```

**Chain mode** is set once at Step 0: **Auto** advances through each phase without inter-phase pauses; **Manual** pauses and confirms before advancing. Clarification questions fire in both modes — always after the orchestrator has read the relevant code, never before.

**Entry points:**

| Skill | Command | When to use |
|-------|---------|-------------|
| **Spec** | `/hyperflow:spec` | Design is ambiguous — auto-chains to `scope` → `dispatch` |
| **Scope** | `/hyperflow:scope` | Spec is clear — auto-chains to `dispatch` |
| **Dispatch** | `/hyperflow:dispatch` | Task file already in `.hyperflow/tasks/` |
| **Trace** | `/hyperflow:trace` | Root-cause a bug — standalone |
| **Audit** | `/hyperflow:audit` | Code review — standalone |
| **Deploy** | `/hyperflow:deploy` | Pre-push gates + ship — standalone |
| **Scaffold** | `/hyperflow:scaffold` | First-time project setup — standalone |
| **Cache / Status / Background / Sticky / Bridge / Flush** | `/hyperflow:<skill>` | Utility — standalone |

---

## Why

Each property is enforced by a named doctrine rule, not just convention.

| Property | What it means |
|----------|---------------|
| **Triage + triage review** | A classification call picks the flow profile before any worker fires — a 5-line edit gets `fast` (≤30k tokens), not a 300k deep run. A Triage Reviewer then validates the classification before any downstream step consumes it, so a bad triage can't silently poison the chain ([DOCTRINE rule 15](skills/hyperflow/DOCTRINE.md)). |
| **15 composable personas** | `security + api + db + frontend` are stitched per task so every worker gets expert-level guidance for the exact work in front of it. |
| **Two-pass thinking-tier review** | Every worker output is reviewed by a thinking-tier model. Batch-2 workers benefit from batch-1 discoveries via automatic learning injection. Every non-trivial phase decomposes into named sub-phases, each with its own worker-tier reviewer ([DOCTRINE §12.2](skills/hyperflow/DOCTRINE.md)). |
| **Predictable failure handling** | An explicit retry → escalate → abort policy for every worker error, malformed output, and quality-gate failure, with real-time `[retry n/3 · role · error-class]` status lines ([failure-recovery.md](skills/hyperflow/failure-recovery.md)). |
| **Lower cost** | Thinking-tier models orchestrate and review; worker-tier models write the code. |
| **Parallel execution** | Independent sub-tasks run simultaneously — three files with no shared state means three workers in one batch. |
| **Multi-tool** | One config, auto-detected across Claude Code, OpenCode, and Antigravity. |
| **Compounding project memory** | Conventions, gotchas, and decisions persist in `.hyperflow/memory/` — local, version-controllable, never mixed across repos. Audits feed findings into `anti-patterns.md`; specs record answers in `project-decisions.md` so the same question is never asked twice. |

**Latency:** parallel sibling drafts (P1) + batched same-level reviews (P2) + triage-driven step skipping (P4) + lean worker prompts (P5) cut a median spec run from ~16 sequential round-trips to ~4–6. Pass `--thorough` to disable speed patterns for high-risk runs. Full pattern catalogue: [`skills/spec/references/latency-patterns.md`](skills/spec/references/latency-patterns.md).

---

## Inside a chain

<p align="center">
  <img src="docs/assets/demo.gif" alt="Hyperflow running a chain — triage, parallel dispatch, thinking-tier review, persistent memory" width="100%" />
</p>

Every chain-starter begins with a **triage call** that classifies the task into `{ types[], complexity, risk, scope, ambiguity, flow, personas[] }`. That classification picks the flow profile, the spec depth, and which persona blocks are stitched into each worker prompt.

Each **phase** (Spec / Scope / Dispatch / Audit / Deploy / Trace) decomposes into named **sub-phases** (`Step 2a`, `Step 2b`, `Step 2c`, ...) per [DOCTRINE §12.2](skills/hyperflow/DOCTRINE.md). Sub-phases fan out parallel Workers across independent angles of the same concern, then each sub-phase ends with its own worker-tier Reviewer. The per-batch worker-tier Reviewer and the final-integration thinking-tier Reviewer still run on top, at higher granularity.

```text
You: /hyperflow:spec "Build user auth with login page, middleware, and password reset"
         │
[Triage] ─ types: [api, db, security, frontend, ui]
           complexity: complex  flow: deep  ambiguity: 0.55
         │
[Spec] ─ Step 2 Research decomposes into 3 sub-phases:
         │   ├── Step 2a — Surface mapping     (Searcher ×2  · Reviewer — worker tier)
         │   ├── Step 2b — Semantic indexing   (Searcher ×2  · Reviewer — worker tier)
         │   └── Step 2c — Convention scan     (Searcher ×1  · Reviewer — worker tier)
         │ Step 3 Multi-dim analysis decomposes into 3a/3b/3c → 3d Analyst synthesis
         │ Smart questions (floor 2) → design approved
         │
[Scope] ─ Step 2 Research mirrors spec's 2a/2b/2c (canonical worked example)
         │ Step 3 Decompose → 3a batch graph · 3b sizing · 3c acceptance criteria
         │ Operational pre-elections (one batched ask): commit · branch · push
         │ Step 4 Write task file (sub-phases by document section) → .hyperflow/tasks/auth.md
         │
[Dispatch — deep flow] ─ Step 2 For each batch decomposes into 4 sub-phases:
         │   ├── Step 2a — Pre-dispatch       (Composer ×N  · Reviewer — worker tier)
         │   ├── Step 2b — Worker fan-out     (Worker ×N    · Reviewer — worker tier)
         │   ├── Step 2c — Per-batch gate     (Reviewer — thinking tier · aggregator — worker tier)
         │   └── Step 2d — Learnings + commit (Writer ×1    · Reviewer — worker tier)
         │
         │ Batch 1 workers (in parallel under 2b):
         │   ├── Worker 1  [security + api]   — Auth middleware
         │   ├── Worker 2  [db + security]    — User schema + migration
         │   └── Worker 3  [frontend + ui]    — Login + reset pages
         │
[Final integration review] ─ Step 3 thinking-tier Reviewer over cumulative diff (conditional)
         │
       Done. End-of-chain gates: audit? deploy?
```

**Sub-phase floor.** Every non-trivial Step has either 0 sub-phases (declared atomic-exempt — single `AskUserQuestion`, single mechanical decision, or single Worker → Reviewer with no parallel angles) OR ≥ 2 sub-phases. Never exactly 1. Cross-skill references like `dispatch Step 2` resolve to the sub-phase aggregate, so existing references don't break.

---

## Quick start

> **Supported environments: Claude Code CLI (terminal), OpenCode CLI, Antigravity.** Hyperflow does NOT run inside Claude Code Desktop (the GUI app) — Desktop does not load terminal-installed plugins. If you see `/hyperflow:spec isn't a recognized command here`, you're in Desktop; open a terminal in the same project and run `claude` there. See [Where it runs](#where-it-runs) below.

### Claude Code (terminal) — direct from GitHub (recommended today)

```bash
claude plugin marketplace add Mohammed-Abdelhady/hyperflow
claude plugin install hyperflow@hyperflow-marketplace
```

This path is verified working — tags ship the moment `scripts/release.sh` pushes, so you get every fix the day it lands.

### Claude Code (terminal) — official marketplace (once ingested)

Hyperflow's submission is published in the Anthropic portal but the entry has not yet propagated to the public `anthropics/claude-plugins-official` marketplace.json. Once it does, either of these will work:

```text
/plugin            # opens the marketplace UI → search "hyperflow" → Install
```

```bash
claude plugin install hyperflow@claude-plugins-official
```

Check status: `claude plugin marketplace update claude-plugins-official && claude plugin install hyperflow@claude-plugins-official` — when this stops returning `not found`, the official path is live.

Works immediately with defaults (Opus 4.7 / Sonnet 4.6, security on). To customize models or security, run the setup wizard:

```bash
curl -fsSL https://raw.githubusercontent.com/Mohammed-Abdelhady/hyperflow/main/install.sh | bash
```

### OpenCode (terminal)

```bash
curl -fsSL https://raw.githubusercontent.com/Mohammed-Abdelhady/hyperflow/main/install.sh | bash
```

The installer auto-detects your tool, symlinks the skill, and walks you through model and security configuration.

### Where it runs

| Environment | Works? | Why |
|---|---|---|
| **Claude Code CLI** (terminal `claude` command) | yes — primary target | Loads the plugin from `~/.claude/plugins/cache/`; slash commands + auto-routing + skills all active |
| **OpenCode CLI** (terminal `opencode` command) | yes | Same plugin loader convention |
| **Antigravity** (Google's agentic IDE) | yes | Same plugin loader convention |
| **Claude Code Desktop** (Mac/Windows app) | no — platform limitation | Desktop does not load terminal-installed plugins. Open a terminal in the same project and run `claude` |
| **claude.ai web app** | no | No plugin loader; skills are terminal-CLI artefacts |
| **IDE extensions** (VS Code, JetBrains) | depends | If the extension shells out to the `claude` CLI, plugins work; if it talks directly to the API, they don't |

If you primarily use Desktop or web, you have two options:

1. **Switch to the CLI for hyperflow work.** Open Terminal in the same project directory and run `claude`. Project memory at `.hyperflow/memory/` is shared across all surfaces that read from disk.
2. **Use the bridge (auto by default).** The CLI session-start hook auto-detects a missing or outdated `CLAUDE.md` doctrine block on every session and silently writes/refreshes it. From the first time you open Claude Code CLI in a project, `CLAUDE.md` gets the portable doctrine subset — autonomy, intent-routing, commit cadence, tier split, file-first artefacts, binary gates, security blocklists. Lossy (no `/hyperflow:*` slash commands, no chain-mode Step-0) but ~70% of behavioral value. Disable with `/hyperflow:bridge mode off`. See [`skills/bridge/SKILL.md`](skills/bridge/SKILL.md).

**Invoke a skill:**

```text
You: /hyperflow:scaffold                       # first-time project setup
You: /hyperflow:spec "add auth"                # design → scope → dispatch (auto-chain)
You: /hyperflow:scope "fix login bug"          # scope → dispatch
You: /hyperflow:trace                          # root-cause a failing test
You: /hyperflow:deploy                         # pre-push gates + commit + push
```

---

## Skills

Hyperflow ships **13 specialized skills**. Auto-routing is on by default — say "audit the diff", "debug this test", or any chain-starter verb and the orchestrator routes to the right skill without a `/hyperflow:*` prefix. Disable with `/hyperflow:sticky off`; upgrade to full sticky (every task-shaped message routes, even without verbs) via `/hyperflow:sticky on`.

Outside the terminal CLI (Desktop, claude.ai web, IDE extensions that don't shell out to the `claude` binary) the plugin doesn't load — run `/hyperflow:bridge generate` once to embed the portable doctrine into your project's `CLAUDE.md`.

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
| **Status** | `/hyperflow:status` | Read-only one-screen view: version · profile freshness · memory count · live per-task progress (sub-tasks, tokens, ETA) |
| **Background** | `/hyperflow:background` | List · show · cancel · prune task-level background agents fired by other skills. Read-only by default. See [`skills/hyperflow/background-agents.md`](skills/hyperflow/background-agents.md) |
| **Sticky** | `/hyperflow:sticky` | `on` / `auto` / `off` / `status` — per-project auto-routing mode. Default is `auto` |
| **Flush** | `/hyperflow:flush` | Recover a deferred-commit queue from a prior or crashed chain. Fast-forwards the staging branch, clears `.hyperflow/commits-queue/` |
| **Bridge** | `/hyperflow:bridge` | `generate` / `refresh` / `remove` / `mode` / `status` — embed portable doctrine into `CLAUDE.md` for Desktop, web, and IDE sessions |

**Reuse architecture:** every skill is 80–200 lines and references shared protocol files in `skills/hyperflow/` — `DOCTRINE.md`, `worker-prompt.md`, `reviewer-prompt.md`, `review-levels.md`, `memory-system.md`, `security.md`, `git-workflow.md`, `output-style.md`, `failure-recovery.md`. No content duplication.

**Model routing:** thinking-tier model (Opus 4.7 in Claude Code by default) handles orchestration, review, and debugging. Worker-tier (Sonnet 4.6) handles implementation, search, and writing. Configurable via `~/.hyperflow/config.json`.

**Output style:** no decorative icons. Agent labels use `Role — short description`; thinking-tier agents (**Reviewer**, **Debugger**) are bold. Full spec in [`skills/hyperflow/output-style.md`](skills/hyperflow/output-style.md).

**Typical chains:**

| Starting point | Chain |
|----------------|-------|
| Ambiguous feature | `/hyperflow:spec` → (auto) `scope` → `dispatch` → audit gate → deploy gate |
| Clear spec | `/hyperflow:scope` → (auto) `dispatch` → audit gate → deploy gate |
| Bug fix | `/hyperflow:trace` → fix dispatched inline → deploy gate |
| New project | `/hyperflow:scaffold` → stop; user picks next entry point |

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
  **Reviewer** batched review (L1-L2) — worker tier
  Implementer wires SearchBar into Dashboard (with learnings)
  **Reviewer** final integration review — thinking tier (conditional)
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

  **Debugger** identifies 3 independent broken test files — thinking tier
  Searcher    auth-middleware.test.ts    ─┐
  Searcher    login-flow.test.ts          ├── parallel — worker tier
  Searcher    session-handler.test.ts    ─┘
  Implementer applies root-cause fix
  Writer      adds regression test
  **Reviewer** validates fix + test — thinking tier
```
</details>

<details>
<summary><strong>Quick tasks</strong> — fast flow profile, still reviewed</summary>

```
You: /hyperflow:scope "Rename the Button component to PrimaryButton"

  Triage      classifies: fast flow, 1 file, ambiguity 0.0
  Dispatch    Implementer renames component + updates all imports
  **Reviewer** inline self-review (fast profile) — worker tier
```
</details>

**What fires in auto mode** — only structural gates, nothing invented:

| Gate | When |
|------|------|
| **Step 0** chain-mode (auto/manual) | Once per chain |
| **Smart Questions** | In spec, post-analysis, floor 2 minimum |
| **Section approval** (`Approve / Revise`) | Per section in spec — binary, no marker |
| **Post-research clarify** | In scope, only if research left ambiguity |
| **Operational pre-elections** | In scope — commit cadence · branch · push, batched into one ask |
| **End-of-chain gates** | Audit + deploy, batched at dispatch Step 5 |
| **Push** | In deploy (skipped silently if `push=auto`/`never` was pre-elected) |
| **`SECURITY_VIOLATION`** | Hard halt at any reviewer — no auto-continue |

Want a live view? Run `/hyperflow:status` — progress bar per task with tokens used and ETA, read from each task file's `## Status` block that dispatch keeps updated.

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

| Phase | Skill | Layers | Review levels | Approval gates |
|---|---|---|---|---|
| Setup | `/hyperflow:scaffold` | L0 | — | None |
| Spec | `/hyperflow:spec` | L0.5, L4 | — | Chain-mode (Step 0) · Smart Questions (floor 2) · Section approval (×5) · Phase advance (manual) |
| Scope | `/hyperflow:scope` | L0, L6, L7 | — | Chain-mode (if direct) · Post-research clarify · Operational pre-elections (auto: batched) |
| Dispatch | `/hyperflow:dispatch` | L2, L3, L5, L6, L8, L9 | L1–L5 per profile (fast=L1 · standard=L1–2 · deep/scientific=L1–5) | Inter-batch (manual) · `SECURITY_VIOLATION` halt · Audit + Deploy gates (batched at Step 5) |
| Audit | `/hyperflow:audit` | L9 | L1–L5 explicit | Fix gate (NEEDS_FIX → Fix all / Crit+Imp / Crit only / No) |
| Trace | `/hyperflow:trace` | L3, L6, L9 | L1–L3 on fix | None |
| Deploy | `/hyperflow:deploy` | L5, L8, L9 | — | Commit-inclusion (binary) · Push (honors scope `push` pre-election) |
| Cache | `/hyperflow:cache` | L6 | — | Confirm-on-clear |
| Status | `/hyperflow:status` | — | — | None — read-only |
| Background | `/hyperflow:background` | L3 (registry only) | — | None — read-only by default |
| Sticky | `/hyperflow:sticky` | L1 (autonomy contract) | — | None |
| Bridge | `/hyperflow:bridge` | L1 (portable doctrine subset) | — | None — writes `./CLAUDE.md` doctrine block |
| Flush | `/hyperflow:flush` | L8 (deferred-commit recovery) | — | None |

Review level scope: L1 syntax/format · L2 spec/naming/edges · L3 integration/security · L4 perf/scale · L5 a11y/UX. Full checklist in [`skills/hyperflow/review-levels.md`](skills/hyperflow/review-levels.md).

### Gate behavior (DOCTRINE rule 8)

- **Clarification is mandatory, confirmation is banned.** Auto vs manual differs in exactly one place: inter-phase / inter-batch pauses. Every clarification stage fires in both modes.
- **Clarification fires after analysis, never before.** Spec runs Triage → Searcher → Analyst → then questions. Scope runs Route → Searcher → then clarify. Asking before research wastes the user's time on questions the codebase already answers.
- **Binary action gates carry no recommendation marker.** `Yes/No`, `Approve/Revise`, `Push/Hold`, `Include/Exclude` are neutral two-outcome choices. Multi-option choices (3+) and named workflow paths keep the `(Recommended)` marker.
- **Invented gates are forbidden.** "Transparency checkpoint", "midway sanity check", "scope re-confirmation", "cost heads-up" — all banned in auto mode.

---

## Adaptive flow profiles

Triage picks the profile based on `{ complexity, scope, risk, types, ambiguity }`. Profiles upgrade mid-flight if a worker returns `ESCALATE:` — and downgrade if research shows the task is simpler than expected.

| Profile | Use when | Workers | Reviews | Budget |
|---------|----------|---------|---------|--------|
| `fast` | trivial single-file, reversible, low-ambiguity | 1 | inline self-review | ≤30k |
| `standard` | simple/moderate, 2–5 files | 1–2 | 1 batch reviewer | ≤100k |
| `deep` | complex / cross-cutting / system-wide | 3+ | per-batch + final | 300k |
| `research` | unknown territory, library/code evaluation | 3+ searchers | inline | ≤80k |
| `creative` | UI/UX exploration, design-dominant | 1–2 | 1 reviewer | ≤150k |
| `scientific` | correctness-critical, numerical/proof | 2–3 + TDD | multi-level L1–L5 | 300k |

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

Personas compose by priority: `security` is stitched first so its constraints frame every other decision; `creative` is stitched last so divergent exploration adapts to the structural choices above it.

---

## Providers + configuration

| Provider | Thinking-tier model | Worker-tier model |
|----------|---------------------|-------------------|
| Claude Code | Opus 4.7 | Sonnet 4.6 |
| OpenCode | Claude Opus 4.7 | Sonnet 4.6 |
| Antigravity | Gemini 3 Pro | Gemini 3.5 Flash |

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

| Tier | Tag | Behavior |
|------|-----|----------|
| Hot | `#hot` | Always injected at session start |
| Warm | any topic tag | Injected when a task matches the tag |
| Cold | none | Available on demand; never auto-injected |

Two memory files are written automatically by the chain:

| File | Tier | Written by | Read by |
|------|------|-----------|---------|
| `anti-patterns.md` | hot | `/hyperflow:audit` Step 4d (max 3 curated findings per run, deduped, self-compacting) | every worker, every session |
| `project-decisions.md` | spec-tier | `/hyperflow:spec` Step 4 (structural answers from Smart Questions) | `/hyperflow:spec` Step 4 (skips re-asking answered questions) |

When a memory file crosses the configured line-count threshold (default 300), the session-start hook prints a one-line non-blocking advisory. Run `/hyperflow:cache compact` to summarise entries older than 7 days and archive the full text to `.hyperflow/memory/archive/YYYY-MM.md`. `anti-patterns.md` self-compacts on the same convention (merge duplicates → archive stale singletons → cap at 50, never evicting `[Critical]`-sourced patterns). Full protocol: [`skills/cache/references/compaction.md`](skills/cache/references/compaction.md) · memory system: [`skills/hyperflow/memory-system.md`](skills/hyperflow/memory-system.md).

---

## Plugin behavior and permissions

| Surface | What happens | Code |
|---|---|---|
| **`SessionStart` hook** | On `startup`, `clear`, and `compact` events, runs `hooks/session-start` (bash). Emits a welcome message listing available entry skills and (when over threshold) a non-blocking memory-compaction advisory. Does not inject an always-on orchestrator. | [`hooks/session-start`](hooks/session-start), [`hooks/hooks.json`](hooks/hooks.json) |
| **Skill content** | Each `skills/<name>/SKILL.md` is loaded only when the user invokes that slash command. Shared rules live in [`skills/hyperflow/DOCTRINE.md`](skills/hyperflow/DOCTRINE.md). | [`skills/hyperflow/DOCTRINE.md`](skills/hyperflow/DOCTRINE.md) |
| **Session memory** | Reads and appends to `.hyperflow/memory/` to persist learnings across conversations. No data leaves your machine. | [`skills/hyperflow/session-memory.md`](skills/hyperflow/session-memory.md) |
| **Config** | Optional `~/.hyperflow/config.json` for model selection, security overrides, and memory compaction threshold. Created only if you run the installer wizard. | [`config/schema.json`](config/schema.json) |
| **Network access** | None at runtime. The optional `install.sh` setup wizard clones the repo and writes config locally. | — |
| **File writes** | `.hyperflow/` (project-scoped memory, task files, specs) and, if you run the installer, `~/.hyperflow/config.json` and tool shim files (`CLAUDE.md`, `AGENTS.md`). | — |
| **Worker containment** | Workers are constrained by prompt-injected blocklists for sensitive files (`.env`, `*.pem`, `*.key`, `~/.ssh/*`, cloud creds) and destructive commands (`rm -rf`, `git push --force` to main, `sudo`, `chmod 777`). | [`skills/hyperflow/security.md`](skills/hyperflow/security.md) |
| **Dependencies** | The hook script requires `bash`, `python3`, and standard POSIX tools — available by default on macOS and Linux. No Node, no package installs. | — |

---

## Update + uninstall

If you installed from the GitHub marketplace directly:

```bash
claude plugin update hyperflow@hyperflow-marketplace      # update to latest
claude plugin uninstall hyperflow@hyperflow-marketplace   # remove plugin (memory at .hyperflow/memory/ is kept)
```

After official marketplace ingestion:

```bash
claude plugin update hyperflow@claude-plugins-official
claude plugin uninstall hyperflow@claude-plugins-official
```

Restart Claude Code (or `/restart`) after an update to load the new version. See [CHANGELOG](CHANGELOG.md) for what's new in each release.

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
│   │   ├── output-style.md       #   Label/status style (no icons, em-dash, bold-for-thinking)
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
│   │   ├── failure-recovery.md   #   Retry/escalate/abort policy (rule 14) + observability
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

Keep `README.md` in sync with shipped features on every push. `scripts/release.sh` warns if README has not been updated since the last release tag. See `CLAUDE.md` for the full contributor guide. All commits must follow [Conventional Commits](https://www.conventionalcommits.org/) — the release script reads these to determine the version bump and generate CHANGELOG entries automatically.

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
