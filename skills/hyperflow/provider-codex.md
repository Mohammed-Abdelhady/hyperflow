# Provider reference — Codex

Thin mapping notes for Codex App and Codex CLI. Canonical ops and degraded policies live in `config/providers.json` (`key: codex`) and [runtime-contract.md](runtime-contract.md). Do not fork skill bodies for Codex.

**Signals (hints only):** env prefixes/keys `CODEX*`, `CODEX_HOME`, `CODEX_SESSION_ID`, `CODEX_PLUGIN_ROOT`; path markers `.codex/plugins`, `.codex-plugin`, `codex-marketplace`. Live tool inventory always overrides these defaults.

---

## Collaboration lifecycle (preferred)

Current multi-agent surface prefers the **collaboration** namespace. Ordered candidates for each semantic op (first live match wins):

| Canonical op | Candidate tools (in order) |
|---|---|
| `spawn` | `collaboration.spawn_agent`, then legacy `multi_agent_v1.spawn_agent` |
| `wait` | `collaboration.wait_agent`, `wait_agent`, `multi_agent_v1.wait_agent` |
| `message` | `collaboration.send_message`, `send_message`, `multi_agent_v1.send_message` |
| `follow_up` | `collaboration.followup_task`, `followup_task`, `multi_agent_v1.followup_task` |
| `interrupt` | `collaboration.interrupt_agent`, `interrupt_agent`, `multi_agent_v1.interrupt_agent` |
| `list` | `collaboration.list_agents`, `list_agents`, `multi_agent_v1.list_agents` |

**Usage rules**

- Intersect candidates with the **live** inventory and collaboration mode. A listed candidate that is not callable is unavailable.
- Prefer `collaboration.*` when present. Accept bare names (`send_message`, `wait_agent`, …) when the host exposes them without the prefix.
- Treat `multi_agent_v1.*` as **legacy candidates** only — supported when still callable, never hardcoded as the sole mapping, never invented when absent.
- Do **not** require fictional `worker` / `explorer` agent types as the only option. When spawning: embed the Hyperflow role + specialist charter in the task message (stable task name + brief). If a legacy tool still accepts `agent_type`, map implementer/writer → worker-like and searcher → explorer-like **only when that enum is real in the session**; otherwise use the generic child + charter text.
- Spawn independent sibling workers together when the host allows parallel tool calls in one turn; then wait/collect before review.
- Reviewer children get a **separate** spawn (or separate inline phase) with a reviewer charter — workers never self-review.
- Without any spawn tool: labelled inline worker then labelled inline reviewer phases ([runtime-contract.md](runtime-contract.md)).

---

## Questions (structured_question)

| Candidate | Role |
|---|---|
| `request_user_input` | Preferred structured gate when callable in the current mode |

**Fallback:** if `request_user_input` is missing or unavailable in the current mode, render the exact **Hyperflow Question** chat block from the runtime contract, persist a safe checkpoint if needed, and **end the turn**. Never skip the gate; never silently choose the recommended option.

Applies to plan build-location, dispatch operational and end-of-chain gates, audit fix gate, deploy push/commit-inclusion, PR posting/merge, design handoff, and security escalations.

---

## Skill continuation

Codex does not list a native skill handoff tool in the registry (`skill_continuation: []`).

**Required behavior:** load the target `skills/<name>/SKILL.md` completely and continue inline per [chain-router.md](chain-router.md). Do not stop with "Skill tool unavailable". Do not route to retired `spec` / `scope`.

---

## Edit, shell, web

| Op | Candidates (first live match) |
|---|---|
| `edit` | `apply_patch`, `edit_file`, `Edit` |
| `shell` | `shell`, `Bash`, `bash` |
| `web_research` | `web_search`, `web_fetch`, `WebSearch`, `WebFetch` |

Honor Codex sandbox and approval policy. Hyperflow security blocklist still applies. Missing web tools → skip research and record unavailable.

---

## Background and usage_metrics

Registry leaves both empty for Codex.

- `background`: foreground-only; no fake notifications.
- `usage_metrics`: report `unavailable` unless the host later exposes real counters; never fabricate tokens or ratios. Usage ledger may still use doctrine estimators with `estimated=true` when recording agent work.

---

## Lifecycle events and hooks encoding

Normalized Hyperflow events → Codex plugin hook names:

| Normalized event | Codex hook registration |
|---|---|
| `session.start` | `SessionStart` |
| `session.after_clear` | `SessionStart` (same host event; distinguish by payload/trigger when provided) |
| `session.before_compact` | `PreCompact` |
| `session.after_compact` | `SessionStart` (compact-completion trigger when the host fires it) |

**Encoding notes**

- Register hooks via the plugin manifest / `hooks/hooks.json` for certified Codex lanes.
- Shared hook core (session-start context, memory, update check, pre-compact snapshot) runs after event **normalization**; Codex-specific code only encodes the host response format documented for that Codex version.
- PreCompact: snapshot recovery state; never crash on absent/malformed payload; never invent recovery content.
- SessionStart after compact: re-inject snapshot when present, then consume it.
- Trust prompts for hooks are host behavior; test trust separately from test-only bypass flags.
- Do not claim a lifecycle event is supported when the host does not fire it — report explicit unsupported-event status only.

---

## Install and update selection

| Install mode | How it is decided | Update path |
|---|---|---|
| `codex-marketplace` | Marketplace metadata / plugin list entry for Hyperflow | `codex plugin marketplace upgrade hyperflow-marketplace` |
| `source-checkout` | Explicit source identification (not `.git` presence alone inside a marketplace cache) | `git pull --ff-only` only when confirmed source |
| `unknown` | Insufficient signals | Do not guess; surface manual install docs |

**Critical:** a marketplace cache that happens to contain a `.git` directory remains **marketplace**, not source. Installation metadata decides the update command. Never raw-mutate versioned Codex plugin caches as an "upgrade".

Install examples (from registry):

```text
codex plugin marketplace add Mohammed-Abdelhady/hyperflow
codex plugin add hyperflow@hyperflow-marketplace
```

---

## AGENTS.md

Codex maintains a versioned managed Hyperflow block in `AGENTS.md` (see bridge/setup scripts). Preserve all user content outside the managed block on every force/refresh path. Mixed-provider projects may also carry `CLAUDE.md`; each file keeps its own managed block from one portable doctrine source.

---

## Surface claims

CLI, app-server, and desktop App are certified **separately** (see `config/codex-compatibility.json` and release certifier when present). Plugin-list success is not workflow certification. App support is never inferred from CLI-only results.

---

## Related

- [runtime-contract.md](runtime-contract.md)
- [chain-router.md](chain-router.md)
- [provider-claude.md](provider-claude.md)
- [provider-opencode.md](provider-opencode.md)
- `config/providers.json` → provider `codex`
