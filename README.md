# Hyperflow

**Autonomous multi-agent orchestration for Claude Code.**

Opus thinks. Sonnet executes. Everything runs in parallel.

---

## What is Hyperflow?

Hyperflow is a Claude Code plugin that transforms how Claude works on your tasks. Instead of a single agent doing everything sequentially, Hyperflow splits every task into an **Opus orchestrator** coordinating **Sonnet workers** in parallel — with automatic review after every change. When a task needs design decisions, Hyperflow switches to a collaborative brainstorming flow before dispatching workers.

```
You: "Add user auth with login page and middleware"

[Opus] Brainstorms -> proposes 2 approaches -> you pick one
[Opus] Decomposes into 3 independent tasks
    |
    |-- [Sonnet] Creates auth middleware     --|
    |-- [Sonnet] Builds login page           --|--> parallel
    |-- [Sonnet] Sets up user model          --|
    |
[Opus] Reviews all 3 outputs
[Opus] Synthesizes learnings
[Opus] Dispatches Sonnet to wire up routes (with context from prior tasks)
[Opus] Final integration review
    |
Done.
```

## Features

### Autonomous Orchestration (Layer 1-3)

- **Zero friction execution** — no confirmation prompts, no permission pauses
- **Model routing** — Opus for thinking (review, debug, decide), Sonnet for doing (implement, search, write)
- **Always-on orchestrator** — every task gets decomposed, parallelized, and reviewed
- **Learning injection** — each batch of workers benefits from discoveries of previous batches
- **Silent error recovery** — failures get fixed automatically, not reported

### Collaborative Brainstorming (Layer 4)

- **One question at a time** — focused dialogue, not overwhelming question dumps
- **2-3 approaches with trade-offs** — always explores alternatives before committing
- **Section-by-section approval** — incremental design validation
- **Context-aware** — explores the codebase before asking questions
- **YAGNI enforced** — ruthlessly cuts unnecessary features
- **Seamless transition** — approved design flows directly into the orchestrator for implementation

## Quick Start

### Install

```bash
# As a Claude Code plugin
claude plugin add Mohammed-Abdelhady/hyperflow
```

### Or copy the skill manually

```bash
cp -r skills/hyperflow ~/.claude/skills/
```

### Configure Models

On first run, Hyperflow detects your platform and lets you choose models:

```
Detected: Claude Code

Select thinking model: [opus-4-6 (default)] [opus-4-7] [sonnet-4-6]
Select worker model:   [sonnet-4-6 (default)] [haiku-4-5]
```

Or create `~/.hyperflow/config.json` manually:

```json
{
  "defaults": {
    "thinking": "opus-4-6",
    "worker": "sonnet-4-6"
  }
}
```

Supports **Claude Code**, **Cursor**, **OpenCode**, and **Antigravity** — each with their own model catalog. See [Provider Setup](docs/providers.md) for all available models.

## Usage

### Activate

Type `/hyperflow` in Claude Code to activate the skill. Once loaded, it runs for the entire conversation.

```
You: /hyperflow
Claude: [Hyperflow loaded — autonomous orchestration active]
```

You can also trigger it naturally — Claude will detect the skill and ask to use it when a task matches.

### Implementation tasks

Ask Claude to build something where the approach is clear:

```
You: "Add a search bar to the dashboard with debounced input"

What happens:
  [Opus] Decomposes into: SearchBar component + useDebounce hook + wire into Dashboard
  [Sonnet] Builds SearchBar component          --|
  [Sonnet] Creates useDebounce hook             --|--> parallel
  [Opus] Reviews both outputs
  [Sonnet] Wires SearchBar into Dashboard (with learnings from prior tasks)
  [Opus] Final review
```

### Design tasks

Ask Claude to build something where the approach is unclear or there are multiple valid options:

```
You: "I need a notification system for the app"

What happens:
  [Opus] Explores your codebase for existing patterns
  [Opus] Asks: "Real-time (WebSocket) or polling-based?"
  You: "Real-time"
  [Opus] Asks: "Toast notifications, notification center, or both?"
  You: "Both"
  [Opus] Proposes 2 approaches with trade-offs
  You: Pick one
  [Opus] Presents design section by section
  You: Approve
  [Opus] Transitions to orchestrator -> dispatches workers -> builds it
```

### Debugging

```
You: "Tests are failing after the auth refactor"

What happens:
  [Opus] Analyzes failures, identifies 3 independent broken test files
  [Sonnet] Investigates auth-middleware.test.ts    --|
  [Sonnet] Investigates login-flow.test.ts         --|--> parallel
  [Sonnet] Investigates session-handler.test.ts    --|
  [Opus] Reviews each fix
  [Opus] Runs full test suite to verify
```

### Quick tasks

Even small tasks go through the pattern:

```
You: "Rename the Button component to PrimaryButton"

What happens:
  [Sonnet] Renames component + updates all imports
  [Opus] Reviews for missed references
```

### What you'll notice

- **No permission prompts** — Claude just executes
- **No "should I proceed?" questions** — it proceeds
- **No walls of explanation** — just status updates and code
- **Parallel execution** — independent work happens simultaneously
- **Design questions only when needed** — brainstorming kicks in for ambiguous tasks

## How It Works

### The 8 Layers

| Layer | What | When |
|-------|------|------|
| **1. Autonomy** | Zero confirmations, minimal output, auto-accept | Always |
| **2. Model Routing** | Configurable thinking/worker models per provider | Always |
| **3. Orchestrator** | Decompose, dispatch parallel, review, synthesize | Implementation tasks |
| **4. Brainstorming** | Explore, question, propose, approve | Design/creative tasks |
| **5. Quality Gates** | Lint, typecheck, tests must pass before approval | After every worker review |
| **6. Session Memory** | Persist learnings across conversations | Session start + end |
| **7. Task Templates** | Pre-built decomposition for CRUD, API, UI, migrations | Auto-selected by Opus |
| **8. Git Workflow** | Auto-branch, auto-commit, squash option | Throughout session |

### Model Routing

Models are configurable per provider. Defaults shown for Claude Code:

| Role | Default Model | Tier | When |
|------|--------------|------|------|
| Orchestrator | **Opus 4.6** | Thinking | Decomposes tasks, coordinates workers |
| Reviewer | **Opus 4.6** | Thinking | Reviews every worker output |
| Debugger | **Opus 4.6** | Thinking | Root cause analysis |
| Brainstormer | **Opus 4.6** | Thinking | Design exploration, proposals |
| Implementer | **Sonnet 4.6** | Worker | Writes code, edits files |
| Searcher | **Sonnet 4.6** | Worker | Explores codebase, finds files |
| Writer | **Sonnet 4.6** | Worker | Tests, docs, configs |

**Iron rule:** Every worker output gets a thinking-model review.

**Other providers:** Cursor defaults to Claude 4.6 Opus / Sonnet. OpenCode defaults to anthropic/claude-opus-4-6 / sonnet-4-6. Antigravity defaults to Gemini 3.1 Pro / Flash. See [Model Routing Guide](docs/model-routing.md).

### Orchestrator Flow

```
User request
  -> [Opus] Design or implementation?
  -> Design: Brainstorm (Layer 4) -> get approval -> then orchestrate
  -> Implementation:
      -> [Opus] Decompose into sub-tasks
      -> [Opus] Dispatch Sonnet workers (parallel)
      -> [Sonnet] Execute + return results & notes
      -> [Opus] Review each output
      -> [Opus] Synthesize learnings for next batch
      -> Repeat until done
      -> [Opus] Final integration review
```

### Learning Injection

Workers don't start from scratch. After each batch, Opus synthesizes patterns, gotchas, and decisions into a "learnings" block that gets injected into subsequent worker prompts:

```markdown
## Learnings from prior tasks
- Auth uses JWT with RS256, not HS256
- All validation goes through zod schemas
- CSS uses logical properties for RTL support
```

### Quality Gates

After Opus reviews a worker's output, automated checks must pass:

- **Lint** — `pnpm lint` / `npm run lint`
- **Typecheck** — `tsc --noEmit`
- **Tests** — affected files only (full suite on final review)

Fails? Worker fixes and re-runs. Max 3 retries before escalating.

### Session Memory

Learnings persist across conversations in `~/.claude/hyperflow-memory.md`:

```markdown
## [2026-05-14] /path/to/project
- Tailwind v4 uses CSS variable tokens, not tailwind.config
- All validation goes through zod schemas
- Auth middleware is a singleton at src/domains/auth/server/auth.ts
```

Tomorrow's workers automatically benefit from today's discoveries.

### Task Templates

Opus auto-selects decomposition patterns:

| Template | Trigger |
|----------|---------|
| CRUD Feature | "add X management" |
| API Endpoint | "create API for X" |
| UI Component | "build X component" |
| DB Migration | "add X column" |
| Refactor | "extract X into Y" |
| Bug Fix | "fix X" |

### Git Workflow

- Auto-creates feature branches (never commits to main)
- Auto-commits after each approved task
- Follows project commit conventions
- Asks to squash or keep at the end
- Never pushes — waits for you

Disable auto-commit: say "hyperflow: auto-commit off"

## Project Structure

```
hyperflow/
├── .claude-plugin/             # Claude Code plugin manifest
│   └── plugin.json
├── skills/
│   └── hyperflow/              # The unified skill (8 layers)
│       ├── SKILL.md            # Core skill (layers 1-4 inline, 5-8 referenced)
│       ├── model-config.md     # Model configuration reference
│       ├── worker-prompt.md    # Sonnet dispatch template
│       ├── reviewer-prompt.md  # Opus review template
│       ├── quality-gates.md    # Layer 5: automated checks
│       ├── session-memory.md   # Layer 6: cross-session learnings
│       ├── task-templates.md   # Layer 7: decomposition patterns
│       └── git-workflow.md     # Layer 8: branching + auto-commit
├── config/
│   ├── defaults.json           # Per-provider model catalogs (fallback)
│   └── schema.json             # JSON Schema for config.json
├── hooks/
│   ├── hooks.json              # Session startup config
│   └── session-start           # Hyperflow injection script
├── docs/
│   ├── installation.md         # Setup guide
│   ├── model-routing.md        # Model routing + resolution priority
│   ├── orchestration.md        # Orchestrator pattern details
│   └── providers.md            # Per-provider setup guides
├── package.json
├── LICENSE                     # MIT
└── README.md
```

## Customization

### Change Model Versions

Edit `~/.hyperflow/config.json` to change thinking/worker models per provider. See [Model Routing Guide](docs/model-routing.md) for all options, role overrides, and runtime commands.

### Add Your Own Skills

Create a new folder under `skills/` with a `SKILL.md`:

```markdown
---
name: my-skill
description: Use when [specific triggering conditions]
---

# My Skill

[Your skill content here]
```

### Modify Autonomy Rules

The 9 autonomy rules are in `skills/hyperflow/SKILL.md` under "Layer 1: Autonomy". Add, remove, or modify rules to match your workflow.

## Documentation

- [Installation Guide](docs/installation.md)
- [Model Routing](docs/model-routing.md)
- [Provider Setup](docs/providers.md)
- [Orchestration Pattern](docs/orchestration.md)

## License

MIT
