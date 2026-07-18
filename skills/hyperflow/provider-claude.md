# Provider reference — Claude Code

Native Hyperflow host. Canonical ops live in `config/providers.json` (`key: claude-code`) and [runtime-contract.md](runtime-contract.md). This file documents the native mapping and **regression invariants** so portable adapters cannot break Claude behavior when Codex/OpenCode support lands.

**Signals (hints only):** `CLAUDE_CODE*`, `CLAUDE*`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`; path markers `.claude/plugins`, `.claude-plugin`, `hyperflow-marketplace`. Live inventory still wins over defaults.

---

## Native operation mapping

| Canonical op | Claude Code tools |
|---|---|
| `spawn` | `Agent` |
| `wait` | _(none — Agent returns in-session; no separate wait tool)_ |
| `message` | _(none — main-thread / next Agent call)_ |
| `follow_up` | _(none — new Agent call or follow-up prompt)_ |
| `interrupt` | _(none — do not claim child cancellation without a tool)_ |
| `list` | _(none — track children in Hyperflow artefacts)_ |
| `structured_question` | `AskUserQuestion` |
| `skill_continuation` | `Skill` |
| `edit` | `Edit`, `Write` |
| `shell` | `Bash` |
| `web_research` | `WebSearch`, `WebFetch` |
| `background` | `Agent` (background mode when the host exposes it) |
| `usage_metrics` | _(none in registry — report unavailable rather than fabricate)_ |

### Agent (spawn)

- Dispatch workers and reviewers as separate `Agent` calls with role labels and specialist charters from `agents/*.md`.
- Prefer parallel sibling `Agent` calls in one message when work is independent (dispatch Step 2b pattern).
- **Claude-native agent discovery remains intact** — registered agents and specialist frontmatter continue to work; do not replace them with Codex collaboration-only paths on this host.
- When `Agent` is unavailable: labelled inline worker and reviewer phases (same degraded policy as other providers).

### Skill (skill_continuation)

- Prefer `Skill` with `skill: <name>` and `args: "…"` exactly as skill bodies specify.
- Transition table and gates in [chain-router.md](chain-router.md) still apply; `Skill` is the transport, not a license to skip gates.
- If `Skill` is missing in a degraded session: full target `SKILL.md` load + inline continuation (same as portable hosts).

### AskUserQuestion (structured_question)

- Required for structural gates on Claude Code when the tool is present.
- Multi-option lists (3+) mark `(Recommended)`; binary action gates do not.
- Cap questions per call per skill doctrine (e.g. dispatch end-of-chain batches audit + deploy + optional PR).
- If unavailable: Hyperflow Question chat block + end turn — never silent default.

---

## Lifecycle events and hooks

| Normalized event | Claude registration |
|---|---|
| `session.start` | `SessionStart` |
| `session.after_clear` | `SessionStart` |
| `session.before_compact` | `PreCompact` |
| `session.after_compact` | `SessionStart` |

Shared hook core (memory, resume, update disclosure, pre-compact snapshot / post-compact reinject) is provider-neutral after normalization. Claude keeps its transcript_path-based context estimation and `.hyperflow/.dispatch-auto-compact-ready` automatic-compact contract.

---

## Install and update

| Mode | Update |
|---|---|
| `claude-marketplace` | `claude plugin update hyperflow@hyperflow-marketplace` |
| `source-checkout` | `git pull --ff-only` when explicitly source |
| Install | `claude plugin marketplace add Mohammed-Abdelhady/hyperflow` then `claude plugin install hyperflow@hyperflow-marketplace` |

Do not apply Codex marketplace upgrade commands on Claude installs. Installation metadata selects the updater.

---

## CLAUDE.md managed block

Claude maintains a versioned managed Hyperflow block in `CLAUDE.md`. Preserve user content outside the block. Nested nearest-file precedence follows host rules. Mixed projects may also maintain `AGENTS.md` for Codex without overwriting either side's user sections.

---

## Regression invariants (must not break)

These are the Claude golden contracts portable work must preserve:

1. **Native dynamic workflows** — Claude Code workflow skill path remains valid; portable adapters must not rewrite Claude sessions into the Codex/OpenCode envelope when Claude tools are present.
2. **Agent discovery** — `Agent` + `agents/*.md` specialist registration and Brain roster selection keep working without requiring collaboration.* tool names.
3. **Skill handoffs** — `Skill` invocations for plan ↔ dispatch ↔ audit ↔ deploy ↔ issue/pr/design/handoff edges remain first-class; chain-router semantics unchanged.
4. **AskUserQuestion gates** — structural gates still fire through `AskUserQuestion` when available; recommended-marker rules unchanged.
5. **No provider fork of skill bodies** — one `skills/*/SKILL.md` tree; Claude-specific behavior is capability selection, not a second skill copy.
6. **No model-tier routing** — every agent on the current session model; effort hints only, never model switches by role.
7. **Security halt** — `SECURITY_VIOLATION:` still hard-stops; no auto-continue.
8. **File-first artefacts** — `.hyperflow/tasks`, specs, audits, handoffs, memory schemas unchanged.
9. **No AI attribution** in commits, PR bodies, memory, or task files.
10. **PreCompact / SessionStart** recovery and dispatch auto-compact readiness marker behavior preserved.
11. **Provider regression tests** — Claude hook/skill/chain/inline-fallback goldens stay green when Codex fixtures are added (`tests/test_provider_regressions.py` and related).
12. **Retired targets** — validation continues to reject `spec` / `scope` as chain targets on all providers, including Claude.

When a change would alter Claude golden output, block the migration until the change is intentional and independently reviewed.

---

## Degraded Claude session

If a Claude Code session loses `Agent`, `Skill`, or `AskUserQuestion`, apply the same runtime-contract fallbacks as portable hosts. Do not assume marketplace install implies every tool is callable in every mode.

---

## Related

- [runtime-contract.md](runtime-contract.md)
- [chain-router.md](chain-router.md)
- [provider-codex.md](provider-codex.md)
- [provider-opencode.md](provider-opencode.md)
- `config/providers.json` → provider `claude-code`
