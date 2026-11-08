# Installation and migration

## Native plugin install

Install Hyperflow through the native plugin workflow for the host you use. This registers the packaged skills and commands supported by that host. Native discovery, provider model resolution, runtime execution, and stop/resume behavior are separate compatibility checks.

## Source install

`./install.sh` validates the local Hyperflow source checkout and registers four skills in detected global directories for the six listed hosts. For Codex, it makes owned copies because Codex discovery does not include the source installer's symlinked skill directories. Codex copy registration requires Node.js 24 or newer before it can change registrations. It creates four native `/hyperflow-*` command files for OpenCode only. The source installer prepares skill discovery; it does not certify invocation, workflow execution, or delegate support.

| Host | Global skill directory | Discovery source |
|---|---|---|
| Claude Code | `~/.claude/skills` | [Claude Code skills](https://code.claude.com/docs/en/skills) |
| Codex | `${CODEX_HOME:-~/.codex}/skills` (owned copies) | [Codex skills](https://developers.openai.com/blog/eval-skills) |
| Antigravity | `~/.gemini/config/skills` | [Antigravity skills](https://antigravity.google/docs/skills?app=antigravity-ide) |
| Cursor | `~/.cursor/skills` | [Cursor skills](https://cursor.com/docs/skills) |
| OpenCode | `${XDG_CONFIG_HOME:-~/.config}/opencode/skills` | [OpenCode skills](https://opencode.ai/docs/skills/) |
| Pi | `${PI_CODING_AGENT_DIR:-~/.pi/agent}/skills` | [Pi skills](https://pi.dev/docs/latest/skills) |

`OPENCODE_CONFIG_DIR` can override the OpenCode root. A shared `~/.agents/skills` directory is supported by several hosts but is not linked automatically, which avoids duplicate same-named skills when a user has multiple hosts installed.

Use `--link-only` to skip fetching. `--status [--json]` is read only; `--check` adds a health exit status. `--uninstall` removes links only when they resolve to this checkout, Codex copies only when their source marker and contents are unchanged, and command files only when their ownership marker names this checkout. Foreign links, command files, directories, modified copies, provider configuration, and project data are preserved. A conflict is reported before that host's registrations are changed. Claude Code and Codex use their native skill discovery; this installer does not create unsupported command directories for them.

For hosts other than OpenCode, skills use each host's own invocation and discovery behavior. This installer does not create command directories for Claude Code, Codex, Antigravity, Cursor, or Pi.

Install performs no workflow execution and does not access or edit provider credentials. It does not download the optional delegate relay. To bootstrap that pinned upstream adapter, invoke `node <plugin-root>/runtime/cli.mjs setup-delegates` explicitly after installation.

## Migration

The new public names are `hyperflow-plan`, `hyperflow-smash`, `hyperflow-crash`, and `hyperflow-agents-skill`. The installer may remove obsolete skill links only when they resolve to the retired Hyperflow skill directories in this checkout. It will not remove shared skills or registrations from another checkout.

Existing `.hyperflow` plans, handoffs, memories, archives, and credentials remain untouched. Migration reads legacy material only to offer a non-destructive conversion to a new workflow. Unresolved approvals, questions, and model choices remain pending.

## Host compatibility evidence

Host support is checked per surface and version. Claude Code, Codex, Antigravity, Cursor, OpenCode, and Pi expose different command discovery, execution, model, and lifecycle capabilities. A plugin manifest or installed skill does not certify any of them.

Portable validation checks files, contracts, static command templates, links, and shell syntax. It does not run a real provider, execute a workflow, or prove live host compatibility. Do not transfer evidence between different surfaces or versions of a host. Use only tools exposed by the active host.

## Verification limits

Installation validates package contents, not live host support. Check exact command discovery and execution on the target host/version before making a compatibility claim.
