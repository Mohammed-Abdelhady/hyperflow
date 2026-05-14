# Installation

## Quick Install

### Option 1: Claude Code Plugin (Recommended)

```bash
# Install from GitHub
claude plugin add Mohammed-Abdelhady/hyperflow
```

### Option 2: Manual Installation

Clone the repo and symlink to your Claude Code skills directory:

```bash
git clone https://github.com/Mohammed-Abdelhady/hyperflow.git ~/.claude/plugins/hyperflow

# Or copy skills directly
cp -r hyperflow/skills/auto-pilot ~/.claude/skills/
cp -r hyperflow/skills/brainstorming ~/.claude/skills/
```

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

Start a new Claude Code session. You should see `auto-pilot` and `brainstorming` in the available skills list. The auto-pilot skill triggers automatically on every task.
