# Provider reference — OpenCode

Capability-driven portable host. Canonical ops live in `config/providers.json` (`key: opencode`) and [runtime-contract.md](runtime-contract.md). OpenCode behavior is selected by **live inventory**, not by requiring Codex tool names.

**Signals (hints only):** `OPENCODE*`, `OPENCODE_CONFIG`, `OPENCODE_DATA`, `OPENCODE_PLUGIN_ROOT`; path markers `.opencode`, `opencode`. Live tools always override defaults.

---

## Principle: capability first

- Do **not** require `collaboration.*`, `multi_agent_v1.*`, `request_user_input`, or other Codex-specific names for OpenCode to be considered working.
- Do **not** require Claude Code `Agent` / `Skill` / `AskUserQuestion` names either — use them only if they actually appear in the inventory.
- Discover Task / subagent / edit / shell / web tools from what the session exposes; map onto canonical ops via registry candidates + intersection.
- Fixtures and tests for OpenCode assert capability sets and fallbacks, not Codex string equality.

---

## Operation candidates

Ordered candidates from the registry (first **live** match wins):

| Canonical op | Candidates | Typical degraded path |
|---|---|---|
| `spawn` | `Task`, `task`, `subagent` | Distinct labelled inline worker phase, then distinct labelled inline reviewer phase |
| `wait` | _(none listed)_ | Collect only on the inline / same-turn path |
| `message` | _(none)_ | Main-thread coordination |
| `follow_up` | _(none)_ | New Task call or new inline phase with the follow-up brief |
| `interrupt` | _(none)_ | Do not claim child cancellation |
| `list` | _(none)_ | Track work ids in Hyperflow artefacts only |
| `structured_question` | _(none listed)_ | Hyperflow Question chat block + end turn |
| `skill_continuation` | _(none listed)_ | Full target `SKILL.md` load + inline continuation |
| `edit` | `edit`, `Edit`, `write`, `Write` | First available edit/write tool |
| `shell` | `bash`, `Bash`, `shell` | First available shell tool within security blocklist |
| `web_research` | `websearch`, `webfetch`, `WebSearch`, `WebFetch` | Skip research; record unavailable |
| `background` | _(none)_ | Foreground-only; no fake notifications |
| `usage_metrics` | _(none)_ | Report unavailable; never fabricate tokens or ratios |

If a future OpenCode build exposes additional tools that match the semantic intent of a canonical op, the resolver may select them through inventory matching without renaming the op in skill bodies.

---

## Task / subagent or inline

### When Task or subagent is callable

1. Map Hyperflow worker roles (implementer, searcher, writer) to Task/subagent dispatches with the role brief and specialist charter embedded.
2. Map reviewers to **separate** Task/subagent calls (or a clearly separated second phase) with reviewer charters — never the same child reviewing its own worker output.
3. Fan out independent sibling tasks when the host allows parallel calls; otherwise sequence while keeping labels honest.
4. Every child uses the **current session model** — no per-role model selection.
5. Prefer bounded results back to the main coordinator before the next batch gate.

### When Task / subagent is absent

Run the portable single-agent port:

1. **Inline worker phase** — visible label (`Implementer — …`, `Searcher — …`, `Writer — …`).
2. **Inline reviewer phase** — bold reviewer label (`**Reviewer** — …`), separate responsibility, same review levels and security halt rules.
3. Final integration self-review over the cumulative diff when doctrine requires it.
4. Preserve autonomy, clarification, commit cadence, file-first artefacts, no-attribution, and security blocklist.

Missing subagents never merge worker and reviewer into one undifferentiated blob of work.

---

## Questions and skill continuation

OpenCode registry leaves `structured_question` and `skill_continuation` empty.

| Need | Behavior |
|---|---|
| Structural gate | Exact Hyperflow Question chat block; end turn; optional pending-gate checkpoint |
| Skill handoff | Read entire target `skills/<name>/SKILL.md`; continue inline with chain args ([chain-router.md](chain-router.md)) |
| Headless, no channel | Error at first required gate; never silent-build or silent-fix |

Workflow skill: use the **OpenCode branch of the portable workflow adapter** (Task/subagent when exposed, else inline phases). Do not describe OpenCode as Claude dynamic workflows and do not require Codex collaboration APIs.

---

## Lifecycle events

Registry lists no OpenCode lifecycle event bindings (`session.start` / compact events empty).

- Do not invent SessionStart/PreCompact handlers for OpenCode unless the host later documents them and the registry is updated.
- Session memory and handoff packages remain file-based and work without host lifecycle hooks.
- Compaction recovery that depends on PreCompact is **unsupported-event** on OpenCode until wired — report honestly; do not fake hook execution.

---

## Install and update

| Path | Command / action |
|---|---|
| Install | Install Hyperflow skills into the OpenCode skills path (see `docs/installation.md`) |
| Source update | `git pull --ff-only` for source checkouts |
| Managed sync | Re-run install for managed skill sync |

No Codex or Claude marketplace upgrade commands on OpenCode installs unless the user is dual-homed and those tools manage a different install root.

---

## Regression / fixture expectations

OpenCode provider tests should prove:

1. Spawn selected only when Task/subagent (or future equivalent) is in inventory.
2. Without spawn, inline worker/reviewer separation still holds.
3. Gates use chat fallback without Codex `request_user_input`.
4. Chain transitions resolve to live skills only (no `spec` / `scope`).
5. No skill body contains hard dependencies on Codex collaboration tool strings for the OpenCode path.

---

## Related

- [runtime-contract.md](runtime-contract.md)
- [chain-router.md](chain-router.md)
- [provider-codex.md](provider-codex.md)
- [provider-claude.md](provider-claude.md)
- [SKILL.md](SKILL.md) — portable router and auto-chain
- `config/providers.json` → provider `opencode`
