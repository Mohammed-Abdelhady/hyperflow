# Installation

Get from zero to a reviewed pull request in two commands. This guide covers the quick install per tool, where Hyperflow runs, the security configuration it ships with, and how to verify it's active.

---

## Where it runs

Hyperflow loads as a plugin into terminal CLI environments (and related host plugin loaders). It does not run inside Claude Desktop or claude.ai web without the portable bridge fallback.

| Environment | Works? | Notes |
|---|---|---|
| Claude Code CLI (`claude` binary) | yes — primary certified target | Loads plugins from `~/.claude/plugins/cache/`; slash commands, auto-routing, skills, and Claude Code dynamic workflow routing are active |
| Codex CLI (`codex` binary) | **preview / not certified** | Marketplace install, skills, hooks, AGENTS.md, textual aliases, collaboration-mapped subagents, portable workflow adapter, and inline worker/reviewer fallbacks **ship** in-repo. Certificate lanes (`minimum` / `currentStable` / `latestStable`) are still **uncertified** — see [Codex support matrix](codex.md) |
| Codex app-server | **preview / not certified** | Certified **independently** of CLI when certificates exist. Not claimed from CLI plugin-list alone |
| Codex desktop App | **pending / uncertified** | Requires CI App attestation for an exact build. Never inferred from CLI or app-server PASS |
| OpenCode CLI (`opencode` binary) | yes | Same plugin loader convention; portable workflow adapter uses task/subagent support when available and inline phases otherwise |
| Grok CLI / Grok Build (`grok` binary) | yes | Loads skills from `~/.grok/skills/` (and project `.grok/skills/`). `install.sh` links the full `skills/*` tree there. Project rules via `AGENTS.md` and `.grok/rules/` (`setup-detection.sh --tools grok`). Uses `spawn_subagent` when enabled; portable function router + workflow adapter; native structured questions when available |
| Antigravity IDE | yes | Loads global skills from `~/.gemini/config/skills/` (legacy: `~/.antigravity/skills/`). `install.sh` links the single-agent-adapted `hyperflow*` skill set there; project slash commands (`/hyperflow*`) come from `.agent/workflows/` via `setup-detection.sh --tools antigravity`. No sub-agent dispatch — the single agent runs every phase and self-reviews |
| Claude Code Desktop (Mac/Windows GUI) | no — platform limitation | Does not load terminal-installed plugins; `/hyperflow:*` returns `isn't a recognized command here` |
| claude.ai web | no | No plugin loader; skills are terminal-CLI artefacts |
| Cursor | yes | Reads `AGENTS.md` natively for project conventions; `setup-detection.sh --tools cursor` writes it. Sub-agent dispatch depends on whether Cursor shells out to the `claude` binary; the portable single-agent doctrine applies otherwise |
| Other IDE extensions (VS Code, JetBrains) | depends | Works if the extension shells out to the `claude` binary; not if it talks directly to the API |
| Windows / WSL (Codex lanes) | **unsupported** until certified | Linux/macOS are the only OS classes eligible for Codex lane claims; empty until certificates fill `osArch` |

If `/hyperflow:plan` returns `isn't a recognized command here. Some commands only work in the Claude Code terminal.`, you are in Claude Desktop or web — open a terminal in the same project directory and run `claude`.

**Codex invocation:** `/hyperflow:*` is a **textual Hyperflow alias**, not a native Codex slash command. Prefer `hyperflow plan` (and similar) as the portable form; aliases are recognized when session-start context/skills are loaded. Full matrix, OS policy, and certificate dates: [docs/codex.md](codex.md). Policy source: [`config/codex-compatibility.json`](../config/codex-compatibility.json) (`updated`: 2026-07-18).

Claude Code dynamic workflow support requires Claude Code v2.1.154 or later with workflows enabled. `/hyperflow:workflow` routes big tasks to the host dynamic workflow runtime; workflows may be disabled by `/config`, managed settings, `~/.claude/settings.json`, or `CLAUDE_CODE_DISABLE_WORKFLOWS=1`. Hyperflow never enables `/effort ultracode` or `xhigh` automatically; set `/effort ultracode` manually if you want session-wide automatic workflow selection.

Codex, OpenCode, and Grok do not get native Claude Code dynamic workflows. The same `/hyperflow:workflow` textual entry runs Hyperflow's portable adapter: research and planning, provider subagents/tasks where available, inline worker/reviewer phases otherwise, adversarial verification, quality gates, per-task commits, and final synthesis.

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

Works immediately out of the box (security on). Hyperflow runs on whatever model your agent session uses — there is no model configuration. To customize security, run the setup wizard:

```bash
curl -fsSL https://raw.githubusercontent.com/Mohammed-Abdelhady/hyperflow/main/install.sh | bash
```

### Codex CLI (preview)

```bash
codex plugin marketplace add Mohammed-Abdelhady/hyperflow
codex plugin add hyperflow@hyperflow-marketplace
```

| Step | Detail |
|---|---|
| Update | `codex plugin marketplace upgrade hyperflow-marketplace` (marketplace installs). Source checkouts only: `git pull --ff-only` when install mode is confirmed source — never upgrade by mutating a marketplace cache because it contains `.git` |
| Remove | `codex plugin remove hyperflow@hyperflow-marketplace` |
| Verify | **Fresh session** after install: skills visible when the host lists them; session-start context when hooks are trusted. Listed in plugin list ≠ certificate-certified workflow support |
| Big tasks | Textual `/hyperflow:workflow` / `hyperflow workflow` runs the portable adapter: Codex collaboration subagents when inventory exposes them; otherwise labelled inline worker then separate inline reviewer |
| Surfaces | CLI, app-server, and desktop App are **separate** claim rows — current state **uncertified**; see [Codex support matrix](codex.md) |
| Privacy | Same contract as other hosts: [PRIVACY.md](../PRIVACY.md), [`config/privacy-contract.json`](../config/privacy-contract.json) |

### OpenCode

```bash
curl -fsSL https://raw.githubusercontent.com/Mohammed-Abdelhady/hyperflow/main/install.sh | bash
```

For big tasks, `/hyperflow:workflow` uses the OpenCode portable workflow adapter. It uses task/subagent dispatch when available and otherwise runs the same phases inline.

### Grok CLI / Grok Build

```bash
curl -fsSL https://raw.githubusercontent.com/Mohammed-Abdelhady/hyperflow/main/install.sh | bash
```

When `~/.grok` is present, the installer links **every** skill under `skills/` into `~/.grok/skills/` (not only `hyperflow`). Project shims:

```bash
./scripts/setup-detection.sh --tools grok
# → AGENTS.md + .grok/rules/hyperflow.md
```

For big tasks, `hyperflow workflow` uses the Grok portable workflow adapter (`spawn_subagent` when enabled, inline phases otherwise). Treat `/hyperflow:*` and `hyperflow <verb>` as skill aliases — Grok does not need Claude Code slash-command registration.

### What the installer does

1. Clones the repo to `~/.hyperflow/repo/`
2. Detects which providers are installed (Claude Code, Codex, OpenCode, Antigravity, Cursor, Grok)
3. Installs or links the provider integration where needed
4. Asks whether to enable the security layer
5. Writes your choices to `~/.hyperflow/config.json`

Hyperflow runs on whatever model your agent session uses — there is no model configuration step.

```
Hyperflow Installer

> Detected: OpenCode

  OpenCode — linked

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

# Grok — link the full skills tree (plan, dispatch, hyperflow, …)
for d in ~/.hyperflow/repo/skills/*/; do
  [ -f "${d}SKILL.md" ] || continue
  ln -sfn "${d%/}" "$HOME/.grok/skills/$(basename "$d")"
done
```
</details>

---

## Recommended settings — do this right after install

**This is part of setup, not an optional extra.** The "whole engineering team" auto-pilot experience assumes the permissions block below; without it, an autonomous multi-agent chain hits a permission prompt on nearly every step — the opposite of the promise. Add it once, right after installing. (The installer will offer to write it for you in a future version; for now, add it manually — you approve exactly what it grants.)

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
  "effortLevel": "high",
  "skipDangerousModePermissionPrompt": true,
  "skipAutoPermissionPrompt": true
}
```

This eliminates all permission prompts. Hyperflow runs on whatever model your agent session uses — there is no model configuration.

---

## Security configuration

The security layer is enabled by default and ships with real teeth: **25 blocked file patterns** (keys, secrets, cloud credentials), **15 blocked commands** (`rm -rf`, force-push to main, `sudo`, unsolicited publish), and **11 secret patterns** scanned in diffs. It prevents workers from accessing sensitive files, running dangerous commands, and hardcoding secrets.

### Customize blocked patterns

Add project-specific patterns or remove defaults that don't apply:

```json
{
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

Start a **fresh** Claude Code or Codex session after install.

| Check | Expected |
|---|---|
| Skills list / discovery | Hyperflow skills appear when the host exposes a skill list |
| Intent routing | Matching task language routes into Hyperflow skills when sticky/auto-routing is on |
| Codex aliases | Textual `hyperflow <verb>` and `/hyperflow:<skill>` aliases resolve only after session-start/skill load — not as native Codex slash commands |
| Codex certification | Do not treat a successful install as a certified support lane; check [docs/codex.md](codex.md) and `./scripts/certify-codex.sh --status` |

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

To change security settings, re-run the installer:

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
