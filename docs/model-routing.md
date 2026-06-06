# Model Routing

How Hyperflow assigns models to roles — the thinking/worker split, resolution priority, per-provider defaults, and runtime customization.

---

## The thinking/worker split

Not every task needs the most powerful model. Hyperflow routes work to the right tier based on what the task requires:

- **Thinking models** — orchestration, review, debugging, architecture decisions. Reasoning over ambiguity.
- **Worker models** — implementation, search, writing, boilerplate. Execution against a clear spec.

This keeps costs lower and speed higher without sacrificing quality — because every worker output gets a thinking-model review before it lands.

---

## Role routing table

| Role | Tier | Default (Claude Code) | Examples |
|---|---|---|---|
| Orchestrator | Thinking | Opus 4.8 | Decomposing "build a dashboard" into 5 parallel tasks |
| Reviewer | Thinking | Opus 4.8 | Checking if a worker's component matches the spec |
| Debugger | Thinking | Opus 4.8 | Root-causing why tests fail after a refactor |
| Decision-maker | Thinking | Opus 4.8 | Choosing between REST vs tRPC for a new API |
| Brainstormer | Thinking | Opus 4.8 | Exploring 2–3 approaches with trade-offs |
| Implementer | Worker | Sonnet 4.6 | Writing a React component from a clear spec |
| Searcher | Worker | Sonnet 4.6 | Finding all files that import a specific module |
| Writer | Worker | Sonnet 4.6 | Creating test files, config files, documentation |

---

## Per-provider defaults

Each supported platform has its own model naming and defaults:

| Provider | Default Thinking | Default Worker |
|---|---|---|
| Claude Code | `opus-4-8` | `sonnet-4-6` |
| OpenCode | `anthropic/claude-opus-4-8` | `anthropic/claude-sonnet-4-6` |
| Codex | `gpt-5.5` with adaptive reasoning | `gpt-5.4` with fast/low reasoning |
| Antigravity | `gemini-3-pro` | `gemini-3.5-flash` |

See [providers.md](providers.md) for the full model list per platform, including version pinning and dynamic detection.

---

## How it works in practice

When you give Hyperflow a task:

1. **Config loaded** — reads `~/.hyperflow/config.json` and auto-detects the active provider
2. **Models resolved** — thinking and worker models determined via the priority chain (see below)
3. **Thinking model** (orchestrator) receives your request
4. **Thinking model** breaks it into sub-tasks and identifies which can run in parallel
5. **Thinking model** dispatches **worker model** agents with self-contained prompts
6. **Worker model** agents execute and return results + notes
7. **Thinking model** reviews each output — approves or sends back for fixes
8. **Thinking model** synthesizes learnings and injects them into the next batch
9. Repeat until done

For the full chain mechanics, see [orchestration.md](orchestration.md).

---

## Model resolution priority

When Hyperflow needs to determine which model to use for a role, it walks this chain — first match wins:

| Priority | Source | Scope | Example |
|---|---|---|---|
| 1 | Per-task inline request | Single task | "Fix this bug using opus-4-8" |
| 2 | Session command | Current session | `hyperflow: thinking opus-4-8` |
| 3 | Environment variable | Current session | `HYPERFLOW_THINKING_MODEL=opus-4-8` |
| 4 | Role override | Persistent | `providers.claude-code.roles.reviewer: "opus-4-8"` |
| 5 | Provider tier | Persistent | `providers.claude-code.thinking: "opus-4-8"` |
| 6 | Global default | Persistent | `defaults.thinking: "opus-4-8"` |

---

## Customization

### Generated config (what the installer writes)

The installer detects every provider on your machine and writes a full block for each one in `~/.hyperflow/config.json` — not just the active provider. Each block carries the canonical model list, a default `thinking` / `worker`, and the role mapping. You can edit any field; missing fields fall back to the per-provider defaults.

```json
{
  "activeProvider": "claude-code",
  "defaults": { "thinking": "opus-4-8", "worker": "sonnet-4-6" },
  "providers": {
    "claude-code": {
      "thinking": "opus-4-8",
      "worker":   "sonnet-4-6",
      "models": {
        "thinking": ["opus-4-8", "opus-4-7", "opus-4-6", "opus-4-5", "sonnet-4-6"],
        "worker":   ["sonnet-4-6", "sonnet-4-5", "haiku-4-5"]
      },
      "roles": {
        "orchestrator": "opus-4-8", "reviewer": "opus-4-8",
        "debugger": "opus-4-8", "decision-maker": "opus-4-8", "brainstormer": "opus-4-8",
        "implementer": "sonnet-4-6", "searcher": "sonnet-4-6", "writer": "sonnet-4-6"
      }
    },
    "codex": {
      "thinking": "gpt-5.5",
      "worker": "gpt-5.4",
      "models": {
        "thinking": ["gpt-5.5", "gpt-5.4"],
        "worker": ["gpt-5.4", "gpt-5.4-mini"]
      },
      "roles": {
        "orchestrator": "gpt-5.5", "reviewer": "gpt-5.5",
        "debugger": "gpt-5.5", "decision-maker": "gpt-5.5", "brainstormer": "gpt-5.5",
        "implementer": "gpt-5.4", "searcher": "gpt-5.4", "writer": "gpt-5.4"
      },
      "reasoning": {
        "thinking": "adaptive",
        "worker": "low"
      }
    },
    "opencode":    { "thinking": "anthropic/claude-opus-4-8", "worker": "anthropic/claude-sonnet-4-6", "models": { … }, "roles": { … } },
    "antigravity": { "thinking": "gemini-3-pro",              "worker": "gemini-3.5-flash",           "models": { … }, "roles": { … } }
  },
  "security": { "enabled": true },
  "memory":   { "compactionThreshold": 300 },
  "context":  { "windowTokens": 200000, "autoCompactMinPercent": 72, "autoCompactReadyTtlMinutes": 30 }
}
```

`context.windowTokens`, `context.autoCompactMinPercent`, and `context.autoCompactReadyTtlMinutes` drive the smart PreCompact hook. Automatic compaction is blocked until dispatch writes a fresh end-of-chain readiness marker, then blocked again when the transcript estimate is confidently below the threshold. Manual `/compact` still passes.

### Codex reasoning

Codex keeps model choice and reasoning effort separate. Hyperflow uses `gpt-5.5` for thinking roles and resolves reasoning by task: `low` for trivial docs/config checks, `medium` for normal planning/review, and `high` for debugging, architecture, security, and final integration. Worker roles use `gpt-5.4` with `low` reasoning for fast mode. Codex defaults never use `xhigh`.

### Change default models

The minimal override — works if you only care about thinking / worker globally:

```json
{
  "defaults": {
    "thinking": "opus-4-8",
    "worker": "sonnet-4-6"
  }
}
```

### Override a specific role

Drop the reviewer to the previous Opus to save cost while keeping orchestration on the latest:

```json
{
  "providers": {
    "claude-code": {
      "thinking": "opus-4-8",
      "worker": "sonnet-4-6",
      "roles": {
        "reviewer": "opus-4-7"
      }
    }
  }
}
```

### Use a cheaper worker for search tasks

```json
{
  "providers": {
    "claude-code": {
      "thinking": "opus-4-8",
      "worker": "sonnet-4-6",
      "roles": {
        "searcher": "haiku-4-5"
      }
    }
  }
}
```

### Switch models mid-session

```
hyperflow: thinking opus-4-8
hyperflow: worker haiku-4-5
hyperflow: models          # verify current config
hyperflow: reset models    # revert to config.json defaults
```

### Per-session via environment

```bash
HYPERFLOW_THINKING_MODEL=opus-4-8 HYPERFLOW_WORKER_MODEL=haiku-4-5 claude
```

For initial setup and the full model catalog, see [installation.md](installation.md) and [providers.md](providers.md).
