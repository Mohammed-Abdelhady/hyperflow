# Installation

Getting Hyperflow installed into Codex, terminal CLIs, and supported IDE surfaces — covering quick install, platform compatibility, model configuration, security, and verification.

---

## Where it runs

Hyperflow loads as a plugin into Codex App/CLI and terminal CLI environments. It does not run inside web-only surfaces.

| Environment | Works? | Notes |
|---|---|---|
| Claude Code CLI (`claude` binary) | yes — primary target | Loads plugins from `~/.claude/plugins/cache/`; slash commands, auto-routing, and skills are all active |
| Codex App / Codex CLI (`codex` binary) | yes | Loads plugins from Codex marketplaces into `~/.codex/plugins/cache/`; skills, hooks, AGENTS.md instructions, Codex skill aliases, subagent mapping, inline auto-chain fallback, and provider-aware model config are active |
| OpenCode CLI (`opencode` binary) | yes | Same plugin loader convention |
| Antigravity IDE | yes | Loads global skills from `~/.gemini/config/skills/` (legacy: `~/.antigravity/skills/`). `install.sh` links the single-agent-adapted `hyperflow*` skill set there; project slash commands (`/hyperflow*`) come from `.agent/workflows/` via `setup-detection.sh --tools antigravity`. No sub-agent dispatch or tier split — the single agent runs every phase and self-reviews |
| Claude Code Desktop (Mac/Windows GUI) | no — platform limitation | Does not load terminal-installed plugins; `/hyperflow:*` returns `isn't a recognized command here` |
| claude.ai web | no | No plugin loader; skills are terminal-CLI artefacts |
| IDE extensions (VS Code, JetBrains, Cursor) | depends | Works if the extension shells out to the `claude` binary; not if it talks directly to the API |

If `/hyperflow:spec` returns `isn't a recognized command here. Some commands only work in the Claude Code terminal.`, you are in Desktop or web — open a terminal in the same project directory and run `claude`.

In Codex App/CLI, `/hyperflow:*` is a Hyperflow alias rather than a native host slash command. `hyperflow spec`, `hyperflow amplify`, and similar text invocations are the most portable form; the plugin still recognizes `/hyperflow:*` aliases when the session-start hook is loaded.

**Workarounds for Desktop / web users:**

1. Switch to the CLI for hyperflow work. Open Terminal in the same project directory and run `claude`. Project memory at `.hyperflow/memory/` is shared between CLI and any surface that reads from disk.
2. Hand-write the autonomy rules, commit-cadence rule, and no-AI-attribution rule into the project's root `CLAUDE.md` — those rules are loaded by Desktop, web, and API. This is a lossy fallback: no auto-routing, no skill dispatch, no per-step Worker → Reviewer pattern — but useful for the simpler behavioral constraints.

---

## Quick install

### Claude Code

```bash
claude plugin marketplace add Mohammed-Abdelhady/hyperflow
claude plugin install hyperflow@hyperflow-marketplace
```

Works immediately with defaults (Opus 4.8 / Sonnet 4.6, security on). To customize models or security, run the setup wizard:

```bash
curl -fsSL https://raw.githubusercontent.com/Mohammed-Abdelhady/hyperflow/main/install.sh | bash
```

### Codex App / CLI

```bash
codex plugin marketplace add Mohammed-Abdelhady/hyperflow
codex plugin add hyperflow@hyperflow-marketplace
```

Codex defaults to GPT-5.5 for thinking roles with task-adaptive reasoning and GPT-5.4 for workers in fast mode.

### OpenCode

```bash
curl -fsSL https://raw.githubusercontent.com/Mohammed-Abdelhady/hyperflow/main/install.sh | bash
```

### What the installer does

1. Clones the repo to `~/.hyperflow/repo/`
2. Detects which providers are installed (Codex, OpenCode, Antigravity)
3. Installs or links the provider integration where needed
4. Asks you to pick thinking and worker models from your provider's catalog, or applies provider defaults where the host owns model selection
5. Asks whether to enable the security layer
6. Writes your choices to `~/.hyperflow/config.json`

```
Hyperflow Installer

> Detected: OpenCode

  OpenCode — linked

Model Configuration — OpenCode

Thinking model (orchestrator, reviewer, debugger):
  [1] Claude Opus 4.8 — Hyperflow default
  [2] Claude Opus 4.7 — Previous Opus
  [3] Claude Opus 4.6 — Legacy Opus

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

  Models:    thinking=anthropic/claude-opus-4-8  worker=anthropic/claude-sonnet-4-6
  Security:  enabled
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

---

## Recommended settings

Add these to `~/.claude/settings.json` for the full auto-pilot experience:

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
  "model": "claude-opus-4-8",
  "effortLevel": "high",
  "skipDangerousModePermissionPrompt": true,
  "skipAutoPermissionPrompt": true
}
```

This eliminates all permission prompts and pins the main session to Opus 4.8.

---

## Model configuration

The install script creates `~/.hyperflow/config.json` with your model choices. Edit it manually or re-run the installer at any time.

See [model-routing.md](model-routing.md) for how Hyperflow decides which model handles which role, and [providers.md](providers.md) for the full model list per platform.

### Manual configuration

```json
{
  "defaults": {
    "thinking": "opus-4-8",
    "worker": "sonnet-4-6"
  }
}
```

### Multi-provider setup

If you use more than one platform, configure each one:

```json
{
  "activeProvider": null,
  "defaults": {
    "thinking": "opus-4-8",
    "worker": "sonnet-4-6"
  },
  "providers": {
    "codex": {
      "thinking": "gpt-5.5",
      "worker": "gpt-5.4",
      "reasoning": {
        "thinking": "adaptive",
        "worker": "low"
      },
      "roles": {}
    },
    "claude-code": {
      "thinking": "opus-4-8",
      "worker": "sonnet-4-6",
      "roles": {}
    },
    "opencode": {
      "thinking": "anthropic/claude-opus-4-8",
      "worker": "anthropic/claude-sonnet-4-6",
      "roles": {}
    }
  }
}
```

Set `activeProvider` to force a specific platform, or leave `null` for auto-detection.

For Codex, `reasoning.thinking: "adaptive"` resolves to `low` for trivial docs/config checks, `medium` for normal planning/review, and `high` for debugging, architecture, security, and final integration. Worker fast mode stays `low`; Hyperflow never defaults Codex to `xhigh`.

### Role overrides

Override the model for a specific role within a provider:

```json
{
  "defaults": {
    "thinking": "opus-4-8",
    "worker": "sonnet-4-6"
  },
  "providers": {
    "claude-code": {
      "thinking": "opus-4-8",
      "worker": "sonnet-4-6",
      "roles": {
        "reviewer": "opus-4-7",
        "searcher": "haiku-4-5"
      }
    }
  }
}
```

### Environment variable overrides

Override models per-session without editing config:

```bash
# Force a specific provider
HYPERFLOW_PROVIDER=claude-code claude

# Override models for this session
HYPERFLOW_THINKING_MODEL=opus-4-8 claude
HYPERFLOW_WORKER_MODEL=haiku-4-5 claude
```

### Runtime switching

Change models during a conversation:

```
hyperflow: thinking opus-4-8     # Switch thinking model
hyperflow: worker haiku-4-5      # Switch worker model
hyperflow: models                # Show current config
hyperflow: reset models          # Revert to config defaults
```

---

## Security configuration

The security layer is enabled by default. It prevents workers from accessing sensitive files, running dangerous commands, and hardcoding secrets.

### Customize blocked patterns

Add project-specific patterns or remove defaults that don't apply:

```json
{
  "defaults": {
    "thinking": "opus-4-8",
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

The `add`/`remove` pattern extends the built-in defaults — you cannot accidentally remove critical rules by setting your own list.

### Disable security

Per-session:
```
hyperflow: security off
```

Permanently:
```json
{
  "security": {
    "enabled": false
  }
}
```

---

## Optional: CLAUDE.md reinforcement

Add this to `~/.claude/CLAUDE.md` as a portable fallback for surfaces that don't load plugins:

```markdown
## Auto-Pilot Mode (Always On)

- Never ask for confirmation — execute immediately
- Minimal text output — code over commentary
- Make decisions autonomously — only ask if truly ambiguous and irreversible
- Maximum parallel execution at all times
```

---

## Verify installation

Start a new Codex or Claude Code session. Hyperflow should appear in the available skills list and trigger automatically on matching task intents.

---

## Updates

Hyperflow checks for a newer release at session start (once per 24h, non-blocking). When one is available it tells you the version jump and asks — via a prompt — whether to update now; on **Update now** it runs the right command for your install and continues on the new version.

To update manually:

```bash
git -C ~/.hyperflow/repo pull                          # installer / git install
claude plugin update hyperflow@hyperflow-marketplace   # marketplace install
codex plugin marketplace upgrade hyperflow-marketplace  # Codex marketplace snapshot
```

Because the installer path installs via symlink, every provider picks up changes immediately — no re-copying.

To change models or security settings, re-run the installer:

```bash
~/.hyperflow/repo/install.sh
```

---

## Uninstall

### Claude Code

```bash
claude plugin uninstall hyperflow@hyperflow-marketplace
```

### Codex / OpenCode / Antigravity

```bash
codex plugin remove hyperflow@hyperflow-marketplace
~/.hyperflow/repo/install.sh --uninstall
```

This removes:
- Symlinks from all detected provider skills directories
- The cloned repo at `~/.hyperflow/repo/`
- The config file at `~/.hyperflow/config.json`

Session memory at `~/.claude/hyperflow-memory.md` is preserved. Delete it manually for a clean slate.
