# Provider Setup Guides

Model naming, detection, and configuration quirks for each platform Hyperflow supports.

See [model-routing.md](model-routing.md) for how Hyperflow selects between thinking and worker tiers at runtime, and [installation.md](installation.md) for the initial setup flow.

---

## Claude Code

**Detection:** `CLAUDE_CODE_*` environment variables, set automatically by the CLI.

**Default models:**

| Tier | Model ID | Name |
|---|---|---|
| Thinking | `opus-4-7` | Opus 4.7 |
| Worker | `sonnet-4-6` | Sonnet 4.6 |

**Available models:**

| Model ID | Name | Tier | Notes |
|---|---|---|---|
| `opus-4-7` | Opus 4.7 | Thinking | Latest — Hyperflow default |
| `opus-4-6` | Opus 4.6 | Thinking | Previous Opus |
| `opus-4-5` | Opus 4.5 | Thinking | Legacy |
| `sonnet-4-6` | Sonnet 4.6 | Worker | Hyperflow default |
| `sonnet-4-5` | Sonnet 4.5 | Worker | Legacy |
| `haiku-4-5` | Haiku 4.5 | Worker | Fast and cheap |

**Version pinning:** Claude Code's Agent tool accepts `"opus"`, `"sonnet"`, `"haiku"` aliases that resolve to the latest version. To pin a specific version:

```bash
export ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-7
export ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4-6
```

**Dynamic detection:** Hyperflow reads `~/.claude/settings.json` to detect the currently configured model.

---

## OpenCode

**Detection:** `OPENCODE_*` environment variables or `opencode` binary in PATH.

**Default models:**

| Tier | Model ID | Name |
|---|---|---|
| Thinking | `anthropic/claude-opus-4-7` | Claude Opus 4.7 |
| Worker | `anthropic/claude-sonnet-4-6` | Claude Sonnet 4.6 |

**Available models:**

| Model ID | Name | Provider | Tier | Notes |
|---|---|---|---|---|
| `anthropic/claude-opus-4-7` | Claude Opus 4.7 | Anthropic | Thinking | Hyperflow default |
| `anthropic/claude-opus-4-6` | Claude Opus 4.6 | Anthropic | Thinking | Previous Opus |
| `openai/gpt-5.5` | GPT-5.5 | OpenAI | Thinking | Latest GPT |
| `openai/gpt-5.4` | GPT-5.4 | OpenAI | Thinking | Cached input discount |
| `deepseek/deepseek-v4-pro` | DeepSeek V4 Pro | DeepSeek | Thinking | Open-weight |
| `anthropic/claude-sonnet-4-6` | Claude Sonnet 4.6 | Anthropic | Worker | Hyperflow default |
| `anthropic/claude-haiku-4-5` | Claude Haiku 4.5 | Anthropic | Worker | Fast and cheap |
| `openai/gpt-5.4-mini` | GPT-5.4 Mini | OpenAI | Worker | Cost-efficient |

**Model format:** OpenCode uses `provider/model` format — e.g. `anthropic/claude-opus-4-7`.

**75+ providers:** OpenCode supports Anthropic, OpenAI, Amazon Bedrock, Azure, DeepSeek, xAI, Ollama, LM Studio, OpenRouter, Together AI, Groq, and many more via the Vercel AI SDK.

**Dynamic detection:** Hyperflow runs `opencode models list --json` (2s timeout) to get the full list of available models. This captures BYOK and custom provider models.

**OpenCode config:** Models can also be set in `opencode.json` via `"model"` and `"small_model"` fields.

---

## Codex

**Detection:** `CODEX_*` environment variables or the `codex` binary in PATH.

**Default models:**

| Tier | Model ID | Name | Reasoning |
|---|---|---|---|
| Thinking | `gpt-5.5` | GPT-5.5 | Adaptive by task |
| Worker | `gpt-5.4` | GPT-5.4 | Fast mode (`low`) |

**Available models:**

| Model ID | Name | Provider | Tier | Notes |
|---|---|---|---|---|
| `gpt-5.5` | GPT-5.5 | OpenAI | Thinking | Codex default for orchestrator, reviewer, debugger, decision-maker, brainstormer |
| `gpt-5.4` | GPT-5.4 | OpenAI | Worker | Codex fast worker default; can be used as thinking fallback |
| `gpt-5.4-mini` | GPT-5.4 Mini | OpenAI | Worker | Lower-cost worker fallback |

**Reasoning policy:** Thinking roles use task-adaptive reasoning: `low` for trivial docs/config checks, `medium` for normal planning/review, and `high` for debugging, architecture, security, and final integration. Worker roles stay on `low` reasoning for fast mode unless explicitly overridden. Codex defaults never use `xhigh`.

**Installing into Codex:** Codex App and Codex CLI share the plugin marketplace/cache flow:

```bash
codex plugin marketplace add Mohammed-Abdelhady/hyperflow
codex plugin add hyperflow@hyperflow-marketplace
```

Codex reads project instructions from `AGENTS.md`; run `scripts/setup-detection.sh --tools codex <project>` to generate the project shim.

---

## Antigravity

Antigravity is Google's agent-first IDE — a VS Code fork announced November 2025 alongside Gemini 3. It runs agents on Gemini natively and also supports Claude and the open-weights GPT-OSS model.

**Detection:** `ANTIGRAVITY_*` environment variables or `antigravity` binary in PATH.

**Default models:**

| Tier | Model ID | Name |
|---|---|---|
| Thinking | `gemini-3-pro` | Gemini 3 Pro |
| Worker | `gemini-3.5-flash` | Gemini 3.5 Flash |

**Available models:**

| Model ID | Name | Provider | Tier | Notes |
|---|---|---|---|---|
| `gemini-3-pro` | Gemini 3 Pro | Google | Thinking | Antigravity default |
| `gemini-3.1-pro` | Gemini 3.1 Pro | Google | Thinking | 2M context window |
| `claude-opus-4-6` | Claude Opus 4.6 | Anthropic | Thinking | Antigravity also supports Claude |
| `gpt-oss-120b` | GPT-OSS-120B | OpenAI | Thinking | Open-weights variant |
| `gemini-3.5-flash` | Gemini 3.5 Flash | Google | Worker | Antigravity default |
| `gemini-3-flash` | Gemini 3 Flash | Google | Worker | Stable Flash |
| `claude-sonnet-4-6` | Claude Sonnet 4.6 | Anthropic | Worker | Antigravity also supports Claude |

**Model format:** Model IDs are bare slugs — e.g. `gemini-3-pro`. The per-agent model picker in Antigravity's Manager surface shows display names.

**Dynamic detection:** Hyperflow reads `~/.gemini/antigravity/settings.json` to detect the configured model.

**Installing into Antigravity:** Antigravity loads agent skills from `~/.gemini/antigravity/skills/` as directory packages with a `SKILL.md` — the same format Hyperflow already uses. Symlink or copy Hyperflow's `skills/*` into that directory and they're available across every Antigravity project. Antigravity also merges a global `~/.gemini/AGENTS.md` and a per-workspace `AGENTS.md` at session start — the Hyperflow bridge doctrine subset can live there (the AGENTS.md analogue of `CLAUDE.md`).
