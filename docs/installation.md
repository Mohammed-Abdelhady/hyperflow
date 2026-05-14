# Installation

## Quick Install

### Claude Code

```bash
claude plugin install Mohammed-Abdelhady/hyperflow
```

### Cursor / OpenCode / Codex / Antigravity

```bash
curl -fsSL https://raw.githubusercontent.com/Mohammed-Abdelhady/hyperflow/main/install.sh | bash
```

The install script walks you through the full setup:

1. **Clones** the repo to `~/.hyperflow/repo/`
2. **Detects** which providers are installed (Cursor, OpenCode, Codex, Antigravity)
3. **Symlinks** the skill into each provider's skills directory
4. **Asks** you to pick thinking and worker models from your provider's catalog
5. **Asks** whether to enable the security layer
6. **Writes** your choices to `~/.hyperflow/config.json`

```
Hyperflow Installer

> Detected: Cursor

  Cursor — linked

Model Configuration — Cursor

Thinking model (orchestrator, reviewer, debugger):
  [1] Claude 4.6 Opus — Hyperflow default
  [2] Claude 4.7 Opus — Requires Max Mode
  [3] GPT-5.5 — Latest GPT
  [4] Gemini 3.1 Pro — Standard availability

  Choice [1]: 1

Worker model (implementer, searcher, writer):
  [1] Claude 4.6 Sonnet — Hyperflow default
  [2] Claude 4.5 Haiku — Fast and cheap
  [3] GPT-5.4 Mini — Cost-efficient
  [4] Gemini 3 Flash — Fast and cheap

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

  Models:    thinking=claude-4.6-opus  worker=claude-4.6-sonnet
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
ln -s ~/.hyperflow/repo/skills/hyperflow ~/.cursor/skills/hyperflow
ln -s ~/.hyperflow/repo/skills/hyperflow ~/.opencode/skills/hyperflow
ln -s ~/.hyperflow/repo/skills/hyperflow ~/.codex/skills/hyperflow
ln -s ~/.hyperflow/repo/skills/hyperflow ~/.antigravity/skills/hyperflow
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
  "model": "claude-opus-4-6",
  "effortLevel": "high",
  "skipDangerousModePermissionPrompt": true,
  "skipAutoPermissionPrompt": true
}
```

This eliminates all permission prompts and pins the main session to Opus 4.6.

## Model Configuration

The install script creates `~/.hyperflow/config.json` with your model choices. You can also edit it manually or re-run the installer at any time.

### Manual Configuration

Create or edit `~/.hyperflow/config.json` directly:

```json
{
  "defaults": {
    "thinking": "opus-4-6",
    "worker": "sonnet-4-6"
  }
}
```

### Multi-Provider Setup

If you use multiple platforms, configure each one:

```json
{
  "activeProvider": null,
  "defaults": {
    "thinking": "opus-4-6",
    "worker": "sonnet-4-6"
  },
  "providers": {
    "claude-code": {
      "thinking": "opus-4-6",
      "worker": "sonnet-4-6",
      "roles": {}
    },
    "cursor": {
      "thinking": "claude-4.6-opus",
      "worker": "claude-4.6-sonnet",
      "roles": {}
    },
    "opencode": {
      "thinking": "anthropic/claude-opus-4-6",
      "worker": "anthropic/claude-sonnet-4-6",
      "roles": {}
    },
    "antigravity": {
      "thinking": "gemini-3.1-pro",
      "worker": "gemini-3-flash",
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
    "thinking": "opus-4-6",
    "worker": "sonnet-4-6"
  },
  "providers": {
    "claude-code": {
      "thinking": "opus-4-6",
      "worker": "sonnet-4-6",
      "roles": {
        "reviewer": "opus-4-7",
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
    "thinking": "opus-4-6",
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
claude plugin uninstall Mohammed-Abdelhady/hyperflow
```

### All other providers

```bash
~/.hyperflow/repo/install.sh --uninstall
```

This removes:
- Symlinks from all detected provider skills directories
- The cloned repo at `~/.hyperflow/repo/`
- The config file at `~/.hyperflow/config.json`

Session memory at `~/.claude/hyperflow-memory.md` is preserved. Delete it manually for a clean slate.
