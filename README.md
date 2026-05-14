# Hyperflow

**Multi-agent orchestration for AI coding tools.**

The thinking model thinks. The worker model executes. Everything runs in parallel.
Every output gets reviewed. You ship faster, cheaper, and better.

---

## Why Hyperflow?

### Higher Quality Output

Every piece of code gets a two-pass review: the worker writes it, a stronger model reviews it.
No single-agent shortcuts — decompose, implement, review, synthesize.
Workers learn from each other. Batch 2 benefits from Batch 1's discoveries.

### Lower Cost

Expensive thinking models only do what they're good at — orchestration, review, debugging.
Cheap worker models handle the volume — writing code, searching files, running tests.
You stop paying Opus prices for tasks Sonnet handles perfectly.

### Faster Execution

Independent tasks run in parallel, not sequentially.
3 files that don't share state? 3 workers, simultaneously.
The orchestrator doesn't wait — it dispatches, reviews, and moves on.

### Works Everywhere

Not just Claude Code. Hyperflow runs on **Cursor**, **OpenCode**, and **Antigravity** too.
Each platform gets its own model catalog with sensible defaults.
One config file. Auto-detection. Switch platforms without reconfiguring.

## What is Hyperflow?

Hyperflow is a plugin that transforms how AI coding tools work on your tasks. Instead of a single agent doing everything sequentially, Hyperflow splits every task into a **thinking-model orchestrator** coordinating **worker-model agents** in parallel — with automatic review after every change. When a task needs design decisions, Hyperflow switches to a collaborative brainstorming flow before dispatching workers.

```
You: "Add user auth with login page and middleware"

[Thinking] Brainstorms -> proposes 2 approaches -> you pick one
[Thinking] Decomposes into 3 independent tasks
    |
    |-- [Worker] Creates auth middleware     --|
    |-- [Worker] Builds login page           --|--> parallel
    |-- [Worker] Sets up user model          --|
    |
[Thinking] Reviews all 3 outputs
[Thinking] Synthesizes learnings
[Thinking] Dispatches worker to wire up routes (with context from prior tasks)
[Thinking] Final integration review
    |
Done.
```

## Supported Platforms

| Platform | Default Thinking | Default Worker | Detection |
|----------|-----------------|----------------|-----------|
| **Claude Code** | Opus 4.6 | Sonnet 4.6 | Auto |
| **Cursor** | Claude 4.6 Opus | Claude 4.6 Sonnet | Auto |
| **OpenCode** | Claude Opus 4.6 | Claude Sonnet 4.6 | Auto |
| **Antigravity** | Gemini 3.1 Pro | Gemini 3 Flash | Auto |

All models are configurable. See [Provider Setup](docs/providers.md) for available models per platform.

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

Type `/hyperflow` to activate the skill. Once loaded, it runs for the entire conversation.

```
You: /hyperflow
[Hyperflow loaded — autonomous orchestration active]
```

You can also trigger it naturally — the AI will detect the skill and ask to use it when a task matches.

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

- **No permission prompts** — just executes
- **No "should I proceed?" questions** — it proceeds
- **No walls of explanation** — just status updates and code
- **Parallel execution** — independent work happens simultaneously
- **Design questions only when needed** — brainstorming kicks in for ambiguous tasks

## How It Works

### The 9 Layers

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
| **9. Security** | Blocked files, blocked commands, secret detection | Always |

### Model Routing

Models are configurable per provider. Defaults shown for Claude Code:

| Role | Default Model | Tier | When |
|------|--------------|------|------|
| Orchestrator | **Opus 4.6** | Thinking | Decomposes tasks, coordinates workers |
| Reviewer | **Opus 4.6** | Thinking | Reviews every worker output |
| Debugger | **Opus 4.6** | Thinking | Root cause analysis |
| Decision-maker | **Opus 4.6** | Thinking | Architecture, approach selection |
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

### Security

Workers are contained by prompt-injected blocklists:

- **Blocked files** — `.env`, `*.pem`, `*.key`, `~/.ssh/*`, `~/.aws/credentials`, cloud configs
- **Blocked commands** — `rm -rf` (destructive), `git push --force` to main, `sudo`, `chmod 777`, package publish
- **Secret detection** — Reviewer checks for API key patterns (`sk-*`, `AKIA*`, `ghp_*`), private keys, connection strings

Workers that need a blocked resource report `BLOCKED:` and stop. Reviewers that find violations report `SECURITY_VIOLATION:` which halts the task and surfaces to the user.

Customize via `~/.hyperflow/config.json`:

```json
{
  "security": {
    "enabled": true,
    "blockedFiles": { "add": ["*.vault"], "remove": [] },
    "blockedCommands": { "add": ["docker rm -f"], "remove": [] }
  }
}
```

Disable per-session: say "hyperflow: security off"

## Project Structure

```
hyperflow/
├── .claude-plugin/             # Claude Code plugin manifest
│   └── plugin.json
├── skills/
│   └── hyperflow/              # The unified skill (9 layers)
│       ├── SKILL.md            # Core skill (layers 1-4 inline, 5-9 referenced)
│       ├── model-config.md     # Model configuration reference
│       ├── worker-prompt.md    # Sonnet dispatch template
│       ├── reviewer-prompt.md  # Opus review template
│       ├── quality-gates.md    # Layer 5: automated checks
│       ├── session-memory.md   # Layer 6: cross-session learnings
│       ├── task-templates.md   # Layer 7: decomposition patterns
│       ├── git-workflow.md     # Layer 8: branching + auto-commit
│       └── security.md         # Layer 9: worker containment blocklists
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
