# Provider Setup Guides

Hyperflow supports four platforms. Each has its own model naming, detection method, and quirks.

## Claude Code

**Detection:** `CLAUDE_CODE_*` environment variables (set automatically by the CLI).

**Default models:**
- Thinking: `opus-4-6` (Opus 4.6)
- Worker: `sonnet-4-6` (Sonnet 4.6)

**Available models:**

| Model ID | Name | Type | Notes |
|---|---|---|---|
| `opus-4-7` | Opus 4.7 | Thinking | Latest, default on Max plans |
| `opus-4-6` | Opus 4.6 | Thinking | Hyperflow default |
| `opus-4-5` | Opus 4.5 | Thinking | Legacy |
| `sonnet-4-6` | Sonnet 4.6 | Worker | Hyperflow default |
| `sonnet-4-5` | Sonnet 4.5 | Worker | Legacy |
| `haiku-4-5` | Haiku 4.5 | Worker | Fast/cheap |

**Version pinning:** Claude Code's Agent tool accepts `"opus"`, `"sonnet"`, `"haiku"` aliases that resolve to the latest version. To pin a specific version, set environment variables:

```bash
export ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-6
export ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4-6
```

**Dynamic detection:** Hyperflow reads `~/.claude/settings.json` to detect the currently configured model.

---

## Cursor

**Detection:** `CURSOR_*` environment variables (injected by the Cursor IDE).

**Default models:**
- Thinking: `claude-4.6-opus` (Claude Opus 4.6)
- Worker: `claude-4.6-sonnet` (Claude Sonnet 4.6)

**Available models:**

| Model ID | Name | Provider | Type | Notes |
|---|---|---|---|---|
| `claude-4.7-opus` | Claude 4.7 Opus | Anthropic | Thinking | Requires Max Mode |
| `claude-4.6-opus` | Claude 4.6 Opus | Anthropic | Thinking | Hyperflow default |
| `gpt-5.5` | GPT-5.5 | OpenAI | Thinking | Latest GPT |
| `gpt-5.4` | GPT-5.4 | OpenAI | Thinking | Cached input discount |
| `gemini-3.1-pro` | Gemini 3.1 Pro | Google | Thinking | Standard |
| `grok-4.3` | Grok 4.3 | xAI | Thinking | Requires Max Mode |
| `composer-2` | Composer 2 | Cursor | Thinking | Cursor's agentic model |
| `claude-4.6-sonnet` | Claude 4.6 Sonnet | Anthropic | Worker | Hyperflow default |
| `claude-4.5-haiku` | Claude 4.5 Haiku | Anthropic | Worker | Fast/cheap |
| `gpt-5.4-mini` | GPT-5.4 Mini | OpenAI | Worker | Cost-efficient |
| `gpt-5.4-nano` | GPT-5.4 Nano | OpenAI | Worker | Cheapest GPT |
| `gemini-3-flash` | Gemini 3 Flash | Google | Worker | Fast/cheap |

**BYOK:** Cursor supports Bring Your Own Key for any OpenAI-compatible endpoint (OpenRouter, local Ollama, etc.). BYOK models appear in the picker automatically.

**Dynamic detection:** Not available. Cursor doesn't expose a CLI for model listing. Uses hardcoded list only.

---

## OpenCode

**Detection:** `OPENCODE_*` environment variables or `opencode` binary in PATH.

**Default models:**
- Thinking: `anthropic/claude-opus-4-6` (Claude Opus 4.6)
- Worker: `anthropic/claude-sonnet-4-6` (Claude Sonnet 4.6)

**Available models:**

| Model ID | Name | Provider | Type | Notes |
|---|---|---|---|---|
| `anthropic/claude-opus-4-7` | Claude Opus 4.7 | Anthropic | Thinking | Latest |
| `anthropic/claude-opus-4-6` | Claude Opus 4.6 | Anthropic | Thinking | Hyperflow default |
| `openai/gpt-5.5` | GPT-5.5 | OpenAI | Thinking | Latest GPT |
| `openai/gpt-5.4` | GPT-5.4 | OpenAI | Thinking | Cached input discount |
| `google-vertex-ai/gemini-3.1-pro` | Gemini 3.1 Pro | Google | Thinking | 2M context |
| `deepseek/deepseek-v4-pro` | DeepSeek V4 Pro | DeepSeek | Thinking | Open-weight |
| `anthropic/claude-sonnet-4-6` | Claude Sonnet 4.6 | Anthropic | Worker | Hyperflow default |
| `anthropic/claude-haiku-4-5` | Claude Haiku 4.5 | Anthropic | Worker | Fast/cheap |
| `openai/gpt-5.4-mini` | GPT-5.4 Mini | OpenAI | Worker | Cost-efficient |
| `google-vertex-ai/gemini-3-flash` | Gemini 3 Flash | Google | Worker | Fast/cheap |

**Model format:** OpenCode uses `provider/model` format (e.g., `anthropic/claude-opus-4-6`).

**75+ providers:** OpenCode supports Anthropic, OpenAI, Google Vertex, Amazon Bedrock, Azure, DeepSeek, xAI, GitHub Copilot, Ollama, LM Studio, OpenRouter, Together AI, Groq, and many more via the Vercel AI SDK.

**Dynamic detection:** Hyperflow runs `opencode models list --json` (2s timeout) to get the full list of available models. This captures BYOK and custom provider models.

**OpenCode config:** Models can also be set in `opencode.json` via `"model"` and `"small_model"` fields.

---

## Antigravity

**Detection:** `ANTIGRAVITY_*` environment variables (injected by the Antigravity IDE).

**Default models:**
- Thinking: `gemini-3.1-pro` (Gemini 3.1 Pro)
- Worker: `gemini-3-flash` (Gemini 3 Flash)

**Available models:**

| Model ID | Name | Provider | Type | Notes |
|---|---|---|---|---|
| `gemini-3.1-pro` | Gemini 3.1 Pro | Google | Thinking | 2M context, Hyperflow default |
| `gemini-3.1-pro-low` | Gemini 3.1 Pro (Low) | Google | Thinking | Lighter variant |
| `claude-opus-4.6` | Claude Opus 4.6 | Anthropic | Thinking | Available on free tier |
| `gemini-3-flash` | Gemini 3 Flash | Google | Worker | Hyperflow default |
| `claude-sonnet-4.6` | Claude Sonnet 4.6 | Anthropic | Worker | Stronger for refactors |
| `gpt-oss-120b` | GPT-OSS 120B | OpenAI | Worker | Open-weight |

**Local models:** Antigravity supports Ollama and LM Studio via OpenAI-compatible API. Configure in Settings > Models > Custom Provider with a base URL (e.g., `http://localhost:11434/v1`).

**Per-mission routing:** Antigravity supports routing different missions/tasks to different models. Up to 5 parallel agents.

**Dynamic detection:** Not available. Uses hardcoded list only.

**Pricing tiers:**
- Free: All models, rate-limited (~20 requests/day)
- Pro ($20/mo): Higher limits
- Ultra ($249.99/mo): Highest limits
