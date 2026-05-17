# Provider Setup Guides

Hyperflow supports two platforms. Each has its own model naming, detection method, and quirks.

## Claude Code

**Detection:** `CLAUDE_CODE_*` environment variables (set automatically by the CLI).

**Default models:**
- Thinking: `opus-4-7` (Opus 4.7)
- Worker: `sonnet-4-6` (Sonnet 4.6)

**Available models:**

| Model ID | Name | Type | Notes |
|---|---|---|---|
| `opus-4-7` | Opus 4.7 | Thinking | Latest, Hyperflow default |
| `opus-4-6` | Opus 4.6 | Thinking | Previous Opus |
| `opus-4-5` | Opus 4.5 | Thinking | Legacy |
| `sonnet-4-6` | Sonnet 4.6 | Worker | Hyperflow default |
| `sonnet-4-5` | Sonnet 4.5 | Worker | Legacy |
| `haiku-4-5` | Haiku 4.5 | Worker | Fast/cheap |

**Version pinning:** Claude Code's Agent tool accepts `"opus"`, `"sonnet"`, `"haiku"` aliases that resolve to the latest version. To pin a specific version, set environment variables:

```bash
export ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-7
export ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4-6
```

**Dynamic detection:** Hyperflow reads `~/.claude/settings.json` to detect the currently configured model.

---

## OpenCode

**Detection:** `OPENCODE_*` environment variables or `opencode` binary in PATH.

**Default models:**
- Thinking: `anthropic/claude-opus-4-7` (Claude Opus 4.7)
- Worker: `anthropic/claude-sonnet-4-6` (Claude Sonnet 4.6)

**Available models:**

| Model ID | Name | Provider | Type | Notes |
|---|---|---|---|---|
| `anthropic/claude-opus-4-7` | Claude Opus 4.7 | Anthropic | Thinking | Hyperflow default |
| `anthropic/claude-opus-4-6` | Claude Opus 4.6 | Anthropic | Thinking | Previous Opus |
| `openai/gpt-5.5` | GPT-5.5 | OpenAI | Thinking | Latest GPT |
| `openai/gpt-5.4` | GPT-5.4 | OpenAI | Thinking | Cached input discount |
| `deepseek/deepseek-v4-pro` | DeepSeek V4 Pro | DeepSeek | Thinking | Open-weight |
| `anthropic/claude-sonnet-4-6` | Claude Sonnet 4.6 | Anthropic | Worker | Hyperflow default |
| `anthropic/claude-haiku-4-5` | Claude Haiku 4.5 | Anthropic | Worker | Fast/cheap |
| `openai/gpt-5.4-mini` | GPT-5.4 Mini | OpenAI | Worker | Cost-efficient |

**Model format:** OpenCode uses `provider/model` format (e.g., `anthropic/claude-opus-4-7`).

**75+ providers:** OpenCode supports Anthropic, OpenAI, Amazon Bedrock, Azure, DeepSeek, xAI, Ollama, LM Studio, OpenRouter, Together AI, Groq, and many more via the Vercel AI SDK.

**Dynamic detection:** Hyperflow runs `opencode models list --json` (2s timeout) to get the full list of available models. This captures BYOK and custom provider models.

**OpenCode config:** Models can also be set in `opencode.json` via `"model"` and `"small_model"` fields.
