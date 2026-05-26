# Privacy

Hyperflow is a local-only Codex, Claude Code, and OpenCode plugin. It makes no outbound network calls at runtime, has no analytics, has no telemetry, and never proxies or intercepts the data that flows between your editor and your configured LLM provider.

This page documents exactly what the plugin reads, writes, and exposes on your machine. If anything below is inaccurate, please open an issue: <https://github.com/Mohammed-Abdelhady/hyperflow/issues>.

## TL;DR

| Question | Answer |
|---|---|
| Does the plugin phone home? | No. Zero outbound network calls at runtime. |
| Does the plugin collect analytics or telemetry? | No. |
| Does the plugin send my code, prompts, or memory anywhere? | No. The plugin runs inside your editor's process and writes only to your local filesystem. |
| Where does my project data live? | `.hyperflow/` inside your project (gitignored by default) and `~/.hyperflow/config.json` (optional, written only if you run the installer wizard). |
| What about my LLM provider? | Your editor talks to its configured LLM provider (Anthropic, etc.) exactly as it would without the plugin. The plugin does not intercept, proxy, or modify that traffic. |

## What the plugin reads

| Surface | What it reads | When |
|---|---|---|
| `SessionStart` hook | The plugin's own files under `skills/hyperflow/` and `~/.hyperflow/config.json` (if you created one). Reads `.hyperflow/profile.md`, `architecture.md`, `conventions.md`, and `memory/index.md` from the current project if they exist. | On every session start and after `/clear` |
| Skill bodies | The contents of each invoked skill file (e.g., `skills/spec/SKILL.md`) | When you invoke `/hyperflow:<slug>` |
| Project files | Standard files in your project — same scope as the editor itself reads (i.e., subject to your editor's permission model). Workers receive the file paths and contents the orchestrator decides are relevant for the task. | During `/hyperflow:dispatch`, `/hyperflow:trace`, `/hyperflow:audit` |
| Git history | `git log`, `git diff`, `git status`. Read-only commands, run locally. | During `/hyperflow:audit`, `/hyperflow:deploy` |

## What the plugin writes

| Path | Contents | Created by |
|---|---|---|
| `.hyperflow/profile.md`, `architecture.md`, `conventions.md`, `dependencies.md`, `testing.md`, `git-workflow.md` | Analysis cache — facts about your tech stack and conventions | `/hyperflow:scaffold` |
| `.hyperflow/.checksums` | SHA256 of tracked config files (to detect when analysis is stale) | `/hyperflow:scaffold` |
| `.hyperflow/tasks/<slug>.md` | Decomposed task graph for an in-flight chain | `/hyperflow:scope` |
| `.hyperflow/specs/<slug>.md` | Approved design specs | `/hyperflow:spec` |
| `.hyperflow/memory/{learnings,decisions,pitfalls,patterns,conventions,index}.md` | Project-scoped learnings that accumulate across sessions | `/hyperflow:spec`, `/hyperflow:scope`, `/hyperflow:dispatch`, `/hyperflow:trace`, `/hyperflow:cache` |
| `.hyperflow/memory/archive/YYYY-MM.md` | Append-only cold-tier archive of compacted memory entries; one file per calendar month | `/hyperflow:cache compact` |
| `.gitignore` (one-line append) | Adds `.hyperflow/` if not already present | `/hyperflow:scaffold` |
| `~/.hyperflow/config.json` | Optional model + security configuration | The installer wizard, if you run it |
| `CLAUDE.md`, `AGENTS.md` | Provider auto-detection shims pointing at the installed plugin | `/hyperflow:scaffold` if you opt in |

Everything in `.hyperflow/` is **project-local** and **gitignored by default** — it never leaves your machine via git unless you explicitly remove it from `.gitignore`.

## What the plugin does NOT do

- ❌ No outbound HTTP, WebSocket, or DNS lookups from the plugin's runtime code
- ❌ No analytics SDK (no PostHog, Mixpanel, Sentry, etc.)
- ❌ No phone-home for "usage stats", "crash reports", or "feature usage"
- ❌ No background processes, daemons, or scheduled tasks
- ❌ No reads of credentials, SSH keys, AWS configs, or other sensitive files (the **security blocklist** in `skills/hyperflow/security.md` actively blocks these — see below)
- ❌ No writes outside `.hyperflow/`, `~/.hyperflow/`, the multi-tool shim files, and whatever a task explicitly asks for

## Security blocklist (what workers cannot touch)

The Hyperflow doctrine injects a blocklist into every worker prompt. Workers that try to read or modify a blocked file return `BLOCKED:` instead of completing the task, and reviewers that detect a violation return `SECURITY_VIOLATION:` and halt the chain.

**Blocked files** (default):

- `.env`, `.env.*`
- `*.pem`, `*.key`, `*.crt`
- `~/.ssh/*`
- `~/.aws/credentials`, `~/.aws/config`
- `~/.config/gcloud/*`
- `~/.kube/config`
- Any path matching custom patterns in `~/.hyperflow/config.json` → `security.blockedFiles`

**Blocked commands** (default):

- `rm -rf` (destructive)
- `git push --force` to `main` / `master`
- `sudo` (privilege escalation)
- `chmod 777` (over-permissive)
- Package publish commands (`npm publish`, `cargo publish`, etc.) unless explicitly invoked

You can extend or override these in `~/.hyperflow/config.json`. See `skills/hyperflow/security.md` for the full spec.

## LLM provider traffic

The plugin runs **inside your editor's existing LLM session**. Your editor (Codex, Claude Code, or OpenCode) sends prompts to its configured provider; the plugin influences the *content* of those prompts (system-prompt injection, worker prompt templates, persona stitching) but does not act as a proxy.

**Concretely:**

- When you invoke `/hyperflow:spec`, the worker/reviewer prompts that the plugin assembles are sent to your provider via your editor's normal API client.
- The plugin sees the responses inside your editor's process and orchestrates the next step; it does **not** ship those responses anywhere else.
- Cache files (`.hyperflow/memory/`) are written from those responses locally only.

If you are bound by a data-residency or no-third-party-data agreement, the plugin's behaviour is identical to using your editor without the plugin — your data crosses the same boundary that your editor's existing provider client crosses, no more, no less.

## Installer wizard

The optional installer (`curl … | bash` from the README's Quick Start) is a one-time setup utility. It:

- Clones the public Hyperflow repository from `https://github.com/Mohammed-Abdelhady/hyperflow.git` to `~/.hyperflow/repo`
- Writes `~/.hyperflow/config.json` based on your menu choices
- Generates multi-tool shim files in your project (only the ones you opted in to)

After running, the installer **does not stay resident** and makes no further network calls.

You can skip the installer entirely if you install via `codex plugin add hyperflow@hyperflow-marketplace` or `claude plugin install hyperflow@hyperflow-marketplace` — those paths use the editor's own plugin manager.

## What you can audit yourself

| To verify | Read |
|---|---|
| Plugin behaviour at session start | [`hooks/session-start`](hooks/session-start) — bash, ~80 lines |
| Doctrine (rules the orchestrator follows) | [`skills/hyperflow/DOCTRINE.md`](skills/hyperflow/DOCTRINE.md) |
| Worker constraints | [`skills/hyperflow/security.md`](skills/hyperflow/security.md) |
| Memory protocol | [`skills/hyperflow/memory-system.md`](skills/hyperflow/memory-system.md) |
| Config schema | [`config/schema.json`](config/schema.json) |

Everything the plugin does is plain markdown + a single bash hook. There is no compiled binary, no opaque blob, and no obfuscated logic.

## Contact

Privacy questions or audits: open an issue at <https://github.com/Mohammed-Abdelhady/hyperflow/issues>.

## Changes to this policy

Material changes to data handling will be announced in the [`CHANGELOG`](CHANGELOG.md) under a `security:` or `privacy:` heading. This file lives at `PRIVACY.md` in the repo root — diff it against history to see what changed.

_Last updated: 2026-05-16_
