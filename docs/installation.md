# Installation

> **Hyperflow runs in the Claude Code CLI (terminal) and OpenCode CLI only.** It does NOT run inside Claude Code Desktop (the Mac/Windows GUI app) or claude.ai web. If `/hyperflow:spec` returns `isn't a recognized command here. Some commands only work in the Claude Code terminal.`, you're in Desktop or web — open a terminal and run `claude` in the same project. See [Where it runs](#where-it-runs) for the full matrix and workarounds.

## Quick Install

### Claude Code (terminal)

```bash
claude plugin marketplace add Mohammed-Abdelhady/hyperflow
claude plugin install hyperflow@hyperflow-marketplace
```

Works immediately with defaults (Opus 4.7 / Sonnet 4.6, security on). To customize models or security, run the setup wizard:

```bash
curl -fsSL https://raw.githubusercontent.com/Mohammed-Abdelhady/hyperflow/main/install.sh | bash
```

### OpenCode (terminal)

```bash
curl -fsSL https://raw.githubusercontent.com/Mohammed-Abdelhady/hyperflow/main/install.sh | bash
```

## Where it runs

| Environment | Hyperflow works? | Notes |
|---|---|---|
| **Claude Code CLI** (terminal `claude` binary) | yes — primary target | Loads plugins from `~/.claude/plugins/cache/`; slash commands + auto-routing + skills all active |
| **OpenCode CLI** (terminal `opencode` binary) | yes | Same plugin loader convention |
| **Claude Code Desktop** (Mac/Windows GUI app) | **no — platform limitation** | Desktop does not load terminal-installed plugins. `/hyperflow:*` returns `isn't a recognized command here. Some commands only work in the Claude Code terminal.` Auto-routing + intent detection are inert because the DOCTRINE/skills aren't loaded |
| **claude.ai web app** | no | Same reason — no plugin loader; hyperflow's skills are terminal-CLI artefacts |
| **IDE extensions** (VS Code, JetBrains, Cursor, Antigravity) | depends | If the extension shells out to the `claude` CLI under the hood, plugins work; if it talks directly to the API without the CLI, they don't. Check the extension docs |

**Workarounds if you primarily use Desktop / web:**

1. **Switch to the CLI for hyperflow work.** Open Terminal / iTerm in the same project directory and run `claude`. Your project memory at `.hyperflow/memory/` is shared between CLI and any other surface that reads from disk.
2. **Use `CLAUDE.md` for portable rules.** Hyperflow's full doctrine is too rich to fit a `CLAUDE.md`, but you can hand-write the autonomy rules + commit-cadence rule + no-AI-attribution rule into the project's root `CLAUDE.md` — those rules ARE loaded by Desktop / web / API. This is a lossy fallback (no auto-routing, no skill dispatch, no per-step Worker→Reviewer pattern) but useful for the simpler behavioral constraints.

The install script walks you through the full setup:

1. **Clones** the repo to `~/.hyperflow/repo/`
2. **Detects** which providers are installed (OpenCode)
3. **Symlinks** the skill into each provider's skills directory
4. **Asks** you to pick thinking and worker models from your provider's catalog
5. **Asks** whether to enable the security layer
6. **Writes** your choices to `~/.hyperflow/config.json`

```
Hyperflow Installer

> Detected: OpenCode

  OpenCode — linked

Model Configuration — OpenCode

Thinking model (orchestrator, reviewer, debugger):
  [1] Claude Opus 4.7 — Hyperflow default
  [2] Claude Opus 4.6 — Previous Opus

  Choice [1]: 1

Worker model (implementer, searcher, writer):
  [1] Claude Sonnet 4.6 — Hyperflow default
  [2] Claude Haiku 4.5 — Fast and cheap

  Choice [1]: 1

Security

  Hyperflow's security layer prevents workers from:
    - Accessing sensitive files (.env, *.pem, ~/.ssh/*, ...)
    - Running dangerous commands (rm -rf, sudo, force push, ...)
    - Hardcoding secrets in source code

Enable security layer? [Y/n]: y
> Security enabled

> Config saved to ~/.hyperflow/config.json

Hyperflow installed

  Location:  ~/.hyperflow/repo
  Config:    ~/.hyperflow/config.json
  Update:    git -C ~/.hyperflow/repo pull

  Models:    thinking=anthropic/claude-opus-4-7  worker=anthropic/claude-sonnet-4-6
  Security:  enabled
```

**Update all providers at once:**

```bash
git -C ~/.hyperflow/repo pull
```

Because it's a symlink, every provider picks up changes immediately — no re-copying.

**Re-run setup** to change models or security:

```bash
~/.hyperflow/repo/install.sh
```

<details>
<summary>Manual installation (any provider)</summary>

Clone the repo and symlink to your provider's skills directory:

```bash
git clone https://github.com/Mohammed-Abdelhady/hyperflow.git ~/.hyperflow/repo

# Then symlink for your provider(s):
ln -s ~/.hyperflow/repo/skills/hyperflow ~/.claude/skills/hyperflow
ln -s ~/.hyperflow/repo/skills/hyperflow ~/.opencode/skills/hyperflow
```
</details>

## Recommended Settings

Add these to your `~/.claude/settings.json` for the full auto-pilot experience:

```json
{
  "permissions": {
    "defaultMode": "auto",
    "allow": [
      "Bash(*)",
      "Read(*)",
      "Write(*)",
      "Edit(*)",
      "Agent(*)",
      "Skill(*)",
      "NotebookEdit(*)",
      "WebFetch(*)",
      "WebSearch(*)",
      "mcp__*"
    ]
  },
  "model": "claude-opus-4-7",
  "effortLevel": "high",
  "skipDangerousModePermissionPrompt": true,
  "skipAutoPermissionPrompt": true
}
```

This eliminates all permission prompts and pins the main session to Opus 4.7.

## Model Configuration

The install script creates `~/.hyperflow/config.json` with your model choices. You can also edit it manually or re-run the installer at any time.

### Manual Configuration

Create or edit `~/.hyperflow/config.json` directly:

```json
{
  "defaults": {
    "thinking": "opus-4-7",
    "worker": "sonnet-4-6"
  }
}
```

### Multi-Provider Setup

If you use both platforms, configure each one:

```json
{
  "activeProvider": null,
  "defaults": {
    "thinking": "opus-4-7",
    "worker": "sonnet-4-6"
  },
  "providers": {
    "claude-code": {
      "thinking": "opus-4-7",
      "worker": "sonnet-4-6",
      "roles": {}
    },
    "opencode": {
      "thinking": "anthropic/claude-opus-4-7",
      "worker": "anthropic/claude-sonnet-4-6",
      "roles": {}
    }
  }
}
```

Set `activeProvider` to force a specific platform, or leave `null` for auto-detection.

### Role Overrides

Override the model for specific roles within a provider:

```json
{
  "defaults": {
    "thinking": "opus-4-7",
    "worker": "sonnet-4-6"
  },
  "providers": {
    "claude-code": {
      "thinking": "opus-4-7",
      "worker": "sonnet-4-6",
      "roles": {
        "reviewer": "opus-4-6",
        "searcher": "haiku-4-5"
      }
    }
  }
}
```

### Environment Variable Overrides

Override models per-session without editing config:

```bash
# Force a specific provider
HYPERFLOW_PROVIDER=claude-code claude

# Override models for this session
HYPERFLOW_THINKING_MODEL=opus-4-7 claude
HYPERFLOW_WORKER_MODEL=haiku-4-5 claude
```

### Runtime Switching

Change models during a conversation:

```
hyperflow: thinking opus-4-7     # Switch thinking model
hyperflow: worker haiku-4-5      # Switch worker model
hyperflow: models                # Show current config
hyperflow: reset models          # Revert to config defaults
```

See [providers.md](providers.md) for the full list of available models per platform.

## Security Configuration

Hyperflow's security layer is enabled by default. It prevents workers from accessing sensitive files, running dangerous commands, and hardcoding secrets.

### Customize Blocked Patterns

Add project-specific patterns or remove defaults that don't apply:

```json
{
  "defaults": {
    "thinking": "opus-4-7",
    "worker": "sonnet-4-6"
  },
  "security": {
    "enabled": true,
    "blockedFiles": {
      "add": ["internal/secrets/**", "*.vault"],
      "remove": []
    },
    "blockedCommands": {
      "add": ["docker rm -f"],
      "remove": []
    },
    "secretPatterns": {
      "add": ["MYAPP_KEY_[A-Z0-9]{32}"],
      "remove": []
    }
  }
}
```

The `add`/`remove` pattern extends the built-in defaults — you can't accidentally remove critical rules by setting your own list.

### Disable Security

Per-session (conversation command):
```
hyperflow: security off
```

Permanently (config):
```json
{
  "security": {
    "enabled": false
  }
}
```

## Optional: CLAUDE.md Reinforcement

Add this to your global `~/.claude/CLAUDE.md` as a fallback:

```markdown
## Auto-Pilot Mode (Always On)

- Never ask for confirmation — execute immediately
- Minimal text output — code over commentary
- Make decisions autonomously — only ask if truly ambiguous and irreversible
- Maximum parallel execution at all times
```

## Verify Installation

Start a new Claude Code session. You should see `hyperflow` in the available skills list. It triggers automatically on every task.

## Uninstall

### Claude Code

```bash
claude plugin uninstall hyperflow@hyperflow-marketplace
```

### OpenCode

```bash
~/.hyperflow/repo/install.sh --uninstall
```

This removes:
- Symlinks from all detected provider skills directories
- The cloned repo at `~/.hyperflow/repo/`
- The config file at `~/.hyperflow/config.json`

Session memory at `~/.claude/hyperflow-memory.md` is preserved. Delete it manually for a clean slate.
