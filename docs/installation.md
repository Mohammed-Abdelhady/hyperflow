# Installation

## Quick Install

### Claude Code

```bash
claude plugin add Mohammed-Abdelhady/hyperflow
```

### Cursor / OpenCode / Antigravity

```bash
curl -fsSL https://raw.githubusercontent.com/Mohammed-Abdelhady/hyperflow/main/install.sh | bash
```

The install script:
1. Clones the repo to `~/.hyperflow/repo/`
2. Auto-detects which providers are installed
3. Symlinks the skill into each provider's skills directory

**Update all providers at once:**

```bash
git -C ~/.hyperflow/repo pull
```

Because it's a symlink, every provider picks up changes immediately — no re-copying.

<details>
<summary>Manual installation (any provider)</summary>

Clone the repo and symlink to your provider's skills directory:

```bash
git clone https://github.com/Mohammed-Abdelhady/hyperflow.git ~/.hyperflow/repo

# Then symlink for your provider(s):
ln -s ~/.hyperflow/repo/skills/hyperflow ~/.claude/skills/hyperflow
ln -s ~/.hyperflow/repo/skills/hyperflow ~/.cursor/skills/hyperflow
ln -s ~/.hyperflow/repo/skills/hyperflow ~/.opencode/skills/hyperflow
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
  "effortLevel": "xhigh",
  "skipDangerousModePermissionPrompt": true,
  "skipAutoPermissionPrompt": true
}
```

This eliminates all permission prompts and pins the main session to Opus 4.6.

## Model Configuration

After installing, Hyperflow creates a config file at `~/.hyperflow/config.json` to store your model preferences.

### First-Time Setup

On first run, Hyperflow auto-detects your platform and presents a model picker:

```
Detected: Claude Code

Select thinking model (orchestrator, reviewer, debugger):
  [1] opus-4-6 (default)
  [2] opus-4-7
  [3] sonnet-4-6

Select worker model (implementer, searcher, writer):
  [1] sonnet-4-6 (default)
  [2] haiku-4-5
```

Your selections are saved to `~/.hyperflow/config.json`.

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
