# Privacy

Hyperflow is a local-first plugin for Codex, Claude Code, OpenCode, and related AI coding CLIs. It does not sell analytics, does not ship a plugin-owned telemetry SDK, and does not proxy or intercept traffic between your editor and your configured LLM provider.

This page documents what the plugin reads, writes, and exposes on your machine. The machine-readable contract used by release tests lives at [`config/privacy-contract.json`](config/privacy-contract.json). If anything below is inaccurate, open an issue: <https://github.com/Mohammed-Abdelhady/hyperflow/issues>.

## TL;DR

| Question | Answer |
|---|---|
| Does the plugin phone home for analytics? | No. No analytics SDK, crash reports, or usage telemetry owned by the plugin. |
| Does anything leave the machine automatically? | One optional daily **update check**: `git ls-remote` against the public Hyperflow GitHub repo (tag names only). Opt out with `HYPERFLOW_HOOK_OFFLINE=1`. Failures are offline and non-blocking. |
| Does the plugin send cloud analytics? | No. |
| Multi-session project memory? | Yes, under `.hyperflow/memory/` on disk (learnings, decisions, pitfalls, patterns, conventions, anti-patterns, project-decisions). Injected into later sessions on that machine. Default gitignored. |
| Cross-environment work? | Optional git-committed `.hyperflow-handoff/<slug>/` packages (plan here, build elsewhere). |
| Local usage ledger? | Metadata only for normal orchestrated runs (phase totals, cache hits, token counts). No prompts, file contents, or secrets. Powers optional local ROI tiles. |
| Where does project data live? | `.hyperflow/` in the project and optional `~/.hyperflow/config.json`. |
| What about my LLM provider? | Your editor talks to its configured provider as usual. The plugin does not intercept that traffic. |

## Automatic network (runtime)

At **SessionStart** (and after clear/compact session events), `scripts/hook-runtime.py` may perform a **daily update lookup**:

| Field | Value |
|---|---|
| When | Session start, only if `~/.hyperflow/.update-check` is missing or older than **1440 minutes** (24h) |
| Method | `git ls-remote --tags --refs --sort=-v:refname` |
| Destination | `https://github.com/Mohammed-Abdelhady/hyperflow.git` (public remote; tag filter `v*`) |
| Timeout | 4 seconds |
| Cache write | `~/.hyperflow/.update-check` — latest public semver string only |
| Payload | No project files, prompts, tokens, or credentials are sent |
| Failure | Offline, timeout, or non-zero exit → no update notice; **session continues** (non-blocking). Stale cache outside the TTL is not treated as a fresh claim when network is disabled. |
| Opt-out | Environment: `HYPERFLOW_HOOK_OFFLINE=1` (also `true` / `yes`). CLI: `hook-runtime.py session-start --offline` (used by tests). |

If a newer tag is found, the plugin injects an in-session notice and may **AskUserQuestion** whether to update. Running the suggested marketplace or `git pull` command is **user-approved**, not automatic.

There is **no** other automatic outbound HTTP, WebSocket, analytics beacon, or DNS product telemetry in plugin runtime code.

## Optional network (user- or flow-authorized)

| Path | When | What |
|---|---|---|
| Specialist web research | Flow ∈ `{deep, research, scientific}`, `security: true` triage, or audit/deploy; config `specialists.webResearch.enabled` | Host-bound `web_research` (`WebSearch` / `WebFetch` or inventory equivalents). Skip offline / disabled / cache-fresh. Not a plugin HTTP client. |
| Installer | You run `install.sh` or `curl … \| bash` | One-shot clone of the public repo to `~/.hyperflow/repo`; then exits. |
| Marketplace lifecycle | You install/update/remove via Codex/Claude plugin managers | Host marketplace network, not Hyperflow-owned. |
| Skills (`issue`, `pr`, `deploy`, `handoff`, …) | You invoke them | Local `git` and optional `gh` against **your** remotes/credentials. |
| Local artefact viewer | You run `hyperflow view` | Binds **`127.0.0.1` only** — no LAN bind, no upload. |

## What the plugin reads

| Surface | What it reads | When |
|---|---|---|
| `SessionStart` hook | The plugin's own files under `skills/hyperflow/` and `~/.hyperflow/config.json` (if you created one). Reads `.hyperflow/profile.md`, `architecture.md`, `conventions.md`, and `memory/index.md` from the current project if they exist. | On every session start and after `/clear` |
| Skill bodies | The contents of each invoked skill file (e.g., `skills/plan/SKILL.md`) | When you invoke `/hyperflow:<slug>` |
| Project files | Standard files in your project — same scope as the editor itself reads (i.e., subject to your editor's permission model). Workers receive the file paths and contents the orchestrator decides are relevant for the task. | During `/hyperflow:dispatch`, `/hyperflow:trace`, `/hyperflow:audit` |
| Git history | `git log`, `git diff`, `git status`. Read-only commands, run locally. | During `/hyperflow:audit`, `/hyperflow:deploy`, PreCompact snapshot |

## What the plugin writes

### Automatic (hooks / session-start helpers)

| Path | Contents | Created by |
|---|---|---|
| `~/.hyperflow/.update-check` | Latest public release tag string | Session-start update check (on success) |
| `.hyperflow/.session-start.log` | Helper stderr / non-fatal diagnostics | Session-start helpers |
| `.hyperflow/memory/session-context.md` | Bundled profile / architecture / conventions heads | Session-start |
| `.hyperflow/.precompact.md` | Recovery snapshot (tasks, specs, decisions, local diff stats) | PreCompact hook (consumed on next session start) |
| `.hyperflow/.version` | Plugin version last used to migrate the cache | `migrate-cache.py` |
| `.hyperflow/memory/{anti-patterns,project-decisions,doctrine}.md` | Stubs or refreshed read-only doctrine copy | `migrate-cache.py` when missing/stale |
| `.hyperflow/memory/index.md`, `.hyperflow/memory/.checksums` | Derived memory index + SHA256/line counts | `memory-index.py` |
| `.hyperflow/archive/**`, `.hyperflow/.last-cleanup` | Daily-gated archive of stale tasks/audits/specs/features; learnings promoted into memory | `archive-artefacts.py` |
| `CLAUDE.md` / `AGENTS.md` (managed doctrine block only) | Portable doctrine markers; user content outside markers is preserved | `auto-bridge.py` when `.bridge-mode` is `auto` |

### User-invoked (skills / installer)

| Path | Contents | Created by |
|---|---|---|
| `.hyperflow/profile.md`, `architecture.md`, `conventions.md`, `dependencies.md`, `testing.md`, `git-workflow.md` | Analysis cache — facts about your tech stack and conventions | `/hyperflow:scaffold` |
| `.hyperflow/.checksums` | SHA256 of tracked config files (to detect when analysis is stale) | `/hyperflow:scaffold` |
| `.hyperflow/tasks/<slug>.md` (+ `<slug>/T<id>.md` briefs) | Decomposed task graph + per-sub-task implementation briefs for an in-flight chain | `/hyperflow:plan` |
| `.hyperflow/specs/<slug>.md` | Approved design specs | `/hyperflow:plan` |
| `.hyperflow/features/**`, `.hyperflow/audits/**`, `.hyperflow/artefacts/**` | Multi-phase features, audit reports, visual artefacts | plan / dispatch / audit / workflow |
| `.hyperflow/memory/{learnings,decisions,pitfalls,patterns,conventions,index}.md` | Project-scoped learnings that accumulate across sessions | `/hyperflow:plan`, `/hyperflow:dispatch`, `/hyperflow:trace`, `/hyperflow:cache` |
| `.hyperflow/memory/archive/YYYY-MM.md` | Append-only cold-tier archive of compacted memory entries; one file per calendar month | `/hyperflow:cache compact` |
| `.hyperflow/usage/<chain-id>.jsonl` | Metadata-only usage ledger (tokens, roles, phase — no prompts/secrets) | orchestrated dispatch |
| `.gitignore` (one-line append) | Adds `.hyperflow/` if not already present | `/hyperflow:scaffold` |
| `.hyperflow-handoff/<slug>/` | Cross-environment handoff package | `/hyperflow:handoff` |
| `~/.hyperflow/config.json` | Optional model + security configuration | The installer wizard, if you run it |
| `~/.hyperflow/repo` | Cloned plugin sources | `install.sh` |
| `CLAUDE.md`, `AGENTS.md`, host skill/plugin dirs | Provider shims / marketplace install targets | `/hyperflow:scaffold` or installer if you opt in |

Everything in `.hyperflow/` is **project-local** and **gitignored by default** — it never leaves your machine via git unless you explicitly remove it from `.gitignore` or commit a handoff package.

## What the plugin does NOT do

- ❌ No plugin-owned analytics SDK (no PostHog, Mixpanel, Sentry, etc.)
- ❌ No phone-home for "usage stats", "crash reports", or "feature usage"
- ❌ No background daemons or scheduled OS tasks (hooks run only when the host fires them)
- ❌ No reads of credentials, SSH keys, AWS configs, or other sensitive files (the **security blocklist** in `skills/hyperflow/security.md` actively blocks these — see below)
- ❌ No automatic writes outside the paths disclosed above (plus whatever a user-invoked task explicitly asks for)
- ❌ No proxying or retransmit of host↔provider LLM traffic

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

- When you invoke `/hyperflow:plan`, the worker/reviewer prompts that the plugin assembles are sent to your provider via your editor's normal API client.
- The plugin sees the responses inside your editor's process and orchestrates the next step; it does **not** ship those responses anywhere else.
- Cache files (`.hyperflow/memory/`) are written from those responses locally only.
- Host or provider analytics, if any, are **not** Hyperflow-owned and are not claimed here.

If you are bound by a data-residency or no-third-party-data agreement, the plugin's behaviour is identical to using your editor without the plugin for LLM traffic — your data crosses the same provider boundary that your editor's existing client crosses, plus the disclosed public update-check remote when that check is enabled.

## Installer wizard

The optional installer (`curl … | bash` from the README's Quick Start) is a one-time setup utility. It:

- Clones the public Hyperflow repository from `https://github.com/Mohammed-Abdelhady/hyperflow.git` to `~/.hyperflow/repo`
- Writes `~/.hyperflow/config.json` based on your menu choices
- Generates multi-tool shim files in your project (only the ones you opted in to)

After running, the installer **does not stay resident**. Ongoing automatic network is limited to the SessionStart update check described above (unless you opt out).

You can skip the installer entirely if you install via `codex plugin add hyperflow@hyperflow-marketplace` or `claude plugin install hyperflow@hyperflow-marketplace` — those paths use the editor's own plugin manager.

## What you can audit yourself

| To verify | Read |
|---|---|
| Machine-readable privacy contract | [`config/privacy-contract.json`](config/privacy-contract.json) |
| Contract drift tests | [`tests/test_privacy_contract.py`](tests/test_privacy_contract.py) |
| Plugin behaviour at session start | [`hooks/session-start`](hooks/session-start) → [`scripts/hook-runtime.py`](scripts/hook-runtime.py) |
| Update check implementation | `check_update_notice` in `scripts/hook-runtime.py` |
| Doctrine (rules the orchestrator follows) | [`skills/hyperflow/DOCTRINE.md`](skills/hyperflow/DOCTRINE.md) |
| Worker constraints | [`skills/hyperflow/security.md`](skills/hyperflow/security.md) |
| Web-research protocol | [`skills/hyperflow/web-research.md`](skills/hyperflow/web-research.md) |
| Memory protocol | [`skills/hyperflow/memory-system.md`](skills/hyperflow/memory-system.md) |
| Config schema | [`config/schema.json`](config/schema.json) |

Everything the plugin does is plain markdown + Python/bash hooks. There is no compiled binary, no opaque blob, and no obfuscated logic.

## Contact

Privacy questions or audits: open an issue at <https://github.com/Mohammed-Abdelhady/hyperflow/issues>.

## Changes to this policy

Material changes to data handling will be announced in the [`CHANGELOG`](CHANGELOG.md) under a `security:` or `privacy:` heading. This file lives at `PRIVACY.md` in the repo root — diff it against history to see what changed. The machine-readable mirror is `config/privacy-contract.json`.

_Last updated: 2026-07-18_
