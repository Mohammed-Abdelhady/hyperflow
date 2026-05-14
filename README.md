# Hyperflow

**Autonomous multi-agent orchestration for Claude Code.**

Opus thinks. Sonnet executes. Everything runs in parallel.

---

## What is Hyperflow?

Hyperflow is a Claude Code plugin that transforms how Claude works on your tasks. Instead of a single agent doing everything sequentially, Hyperflow splits every task into an **Opus orchestrator** coordinating **Sonnet workers** in parallel — with automatic review after every change.

```
You: "Add user auth with login page and middleware"

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

### `/auto-pilot` — Autonomous Orchestration

- **Zero friction execution** — no confirmation prompts, no permission pauses
- **Model routing** — Opus for thinking (review, debug, decide), Sonnet for doing (implement, search, write)
- **Always-on orchestrator** — every task gets decomposed, parallelized, and reviewed
- **Learning injection** — each batch of workers benefits from discoveries of previous batches
- **Silent error recovery** — failures get fixed automatically, not reported

### `/brainstorming` — Collaborative Design

- **One question at a time** — focused dialogue, not overwhelming question dumps
- **2-3 approaches with trade-offs** — always explores alternatives before committing
- **Section-by-section approval** — incremental design validation
- **Context-aware** — explores the codebase before asking questions
- **YAGNI enforced** — ruthlessly cuts unnecessary features

## Quick Start

### Install

```bash
# As a Claude Code plugin
claude plugin add Mohammed-Abdelhady/hyperflow
```

### Or copy skills manually

```bash
cp -r skills/auto-pilot ~/.claude/skills/
cp -r skills/brainstorming ~/.claude/skills/
```

### Recommended Settings

Add to `~/.claude/settings.json`:

```json
{
  "permissions": {
    "defaultMode": "auto",
    "allow": [
      "Bash(*)", "Read(*)", "Write(*)", "Edit(*)",
      "Agent(*)", "Skill(*)", "mcp__*",
      "WebFetch(*)", "WebSearch(*)", "NotebookEdit(*)"
    ]
  },
  "model": "claude-opus-4-6",
  "effortLevel": "xhigh",
  "skipDangerousModePermissionPrompt": true,
  "skipAutoPermissionPrompt": true
}
```

## How It Works

### Model Routing

| Role | Model | When |
|------|-------|------|
| Orchestrator | **Opus** | Decomposes tasks, coordinates workers |
| Reviewer | **Opus** | Reviews every worker output |
| Debugger | **Opus** | Root cause analysis |
| Implementer | **Sonnet** | Writes code, edits files |
| Searcher | **Sonnet** | Explores codebase, finds files |
| Writer | **Sonnet** | Tests, docs, configs |

**Iron rule:** Every Sonnet output gets an Opus review.

### Orchestrator Flow

```
User request
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

## Project Structure

```
hyperflow/
├── .claude-plugin/           # Claude Code plugin manifest
│   └── plugin.json
├── skills/
│   ├── auto-pilot/           # Core orchestrator skill
│   │   ├── SKILL.md          # Main skill (3 layers)
│   │   ├── worker-prompt.md  # Sonnet dispatch template
│   │   └── reviewer-prompt.md # Opus review template
│   └── brainstorming/        # Collaborative design skill
│       └── SKILL.md
├── hooks/
│   ├── hooks.json            # Session startup config
│   └── session-start         # Auto-pilot injection script
├── docs/
│   ├── installation.md       # Setup guide
│   ├── model-routing.md      # Model assignment philosophy
│   └── orchestration.md      # Orchestrator pattern details
├── package.json
├── LICENSE                   # MIT
└── README.md
```

## Customization

### Change Model Versions

Edit the routing table in `skills/auto-pilot/SKILL.md` under "Layer 2: Model Routing".

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

The 9 autonomy rules are in `skills/auto-pilot/SKILL.md` under "Layer 1: Autonomy". Add, remove, or modify rules to match your workflow.

## Documentation

- [Installation Guide](docs/installation.md)
- [Model Routing](docs/model-routing.md)
- [Orchestration Pattern](docs/orchestration.md)

## License

MIT
