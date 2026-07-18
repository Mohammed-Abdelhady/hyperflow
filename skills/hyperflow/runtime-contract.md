# Runtime contract (provider-neutral)

Canonical semantic operations and invariants shared by every Hyperflow skill. Host adapters map these names onto live tools; skill bodies call the semantics, never a single provider's tool string.

**Sources of truth**

| Artefact | Owns |
|---|---|
| `config/providers.json` | Machine-readable candidates, lifecycle events, install/update commands, degraded policies |
| This file | Human-readable op vocabulary, precedence, role separation, metrics honesty, fallbacks |
| `chain-router.md` | Cross-skill transitions, argument propagation, structural gates |
| `provider-*.md` | Per-host mapping notes (thin; do not fork skill bodies) |

Skills and hooks must not invent op names outside this vocabulary. When a host tool is missing, follow the degraded policy for that op — never skip a structural gate, never merge worker and reviewer responsibility, never fabricate metrics.

---

## Capability precedence

Resolve effective capabilities **once per session** (or after a host mode change that alters the tool inventory):

1. **Live tool inventory and collaboration mode** — what the host currently exposes as callable. Always wins.
2. **Sandbox / approval policy** — may disable an otherwise listed tool; treat disabled as unavailable.
3. **Provider defaults from `config/providers.json`** — ordered candidate names for the detected provider key. Used only to rank known names when several match the inventory.
4. **Install mode / signals** — hint which provider and update path apply; never prove a tool is callable.

The provider registry proposes candidates. It never claims a candidate is present until inventory intersection says so. Unknown future tools in the inventory are ignored safely; they do not clear known mappings.

**Session descriptor (conceptual)** — every chain step may assume a resolved shape:

```text
provider_key · surface · install_mode ·
  ops: { <canonical_op>: selected_tool | unavailable } ·
  degraded_policy per unavailable op ·
  lifecycle events the host will fire
```

---

## Canonical operations

Vocabulary matches `config/providers.json` → `canonical_operations`. Skills express intent with these names; adapters bind them to host tools.

### Agent lifecycle

| Op | Intent | When present | When absent |
|---|---|---|---|
| `spawn` | Start a child agent with a role brief and charter | Prefer parallel sibling spawns for independent work | Distinct labelled **inline worker** and **inline reviewer** phases in the main thread; never invent host agent types that are not in inventory |
| `wait` | Block until a child finishes or report settles | Collect bounded results before review | Same-turn inline path only; do not claim async wait |
| `message` | Send coordination mail to a running child | Use host mailbox semantics | Keep coordination in the main thread |
| `follow_up` | Issue a follow-up brief to an existing child | Prefer reuse of the same child when the host supports it | New inline phase or new spawn with the follow-up brief |
| `interrupt` | Cancel or stop a child | Use only when the tool exists | Do **not** claim cancellation; stop issuing work and document limitation |
| `list` | Enumerate active children | Use for recovery / status | Track child ids only in Hyperflow artefacts (task file, evidence, usage ledger) |

**Role separation (hard):**

- Worker children **never review** their own output and **never coordinate** the chain.
- Reviewer children **never coordinate**, never dispatch siblings, and never ask the user structural questions.
- Every agent runs on the **current session model**. There is no per-role model selection and no background model router.
- Specialist charters live in `agents/*.md`. On hosts without native agent discovery, the charter is embedded in the spawn / inline brief (see specialist renderer when present).
- Frontmatter tool lists on specialists are **advisory** on non-Claude hosts; sandbox + Hyperflow security remain the enforcement boundary.

### Interaction and continuation

| Op | Intent | When present | When absent |
|---|---|---|---|
| `structured_question` | Structural gate or required clarification UI | Prefer native structured question tool | Render the exact **Hyperflow Question** chat block, persist a safe checkpoint if needed, **end the turn**. Never skip; never silently pick the recommended option |
| `skill_continuation` | Hand off to another Hyperflow skill | Prefer native skill invocation when callable | Load `skills/<name>/SKILL.md` **completely**, then continue inline with preserved chain args. Never stop with "Skill tool unavailable" |

**Hyperflow Question block (exact shape when structured UI is missing):**

```text
Hyperflow Question
<question>

1. <recommended option> (Recommended) — <short consequence>
2. <option> — <short consequence>
```

Binary action gates (`Yes/No`, `Push/Hold`, `Approve/Revise`, `Include/Exclude`) carry **no** `(Recommended)` marker. Named-workflow and multi-option lists (3+) mark a recommended option first.

Structural gates always fire when their precondition is met. Invented confirmations ("should I proceed?") never fire.

### Execution surface

| Op | Intent | When present | When absent |
|---|---|---|---|
| `edit` | Mutate project files | First available edit/patch/write tool | Refuse to invent paths; do not claim edits without a tool |
| `shell` | Run project commands | First available shell tool inside the security blocklist | Skip command; surface unavailable; never bypass security |
| `web_research` | Search or fetch the public web | Host web tools when research is required | Skip network research; record `unavailable` in evidence/context; never invent citations |
| `background` | Long-running / notify-on-complete work | Only when the host truly supports background agents | **Foreground-only**; no fake notifications, no pretend completion hooks |
| `usage_metrics` | Token / cost / cache accounting | Record actual host metadata into the usage ledger | Report `unavailable`; use the doctrine estimator only when documented and always mark `estimated=true`; **never fabricate** tokens, durations, parallelism ratios, or cache hits as observed data |

---

## Fallbacks (summary)

| Missing capability | Required behavior |
|---|---|
| Subagents (`spawn` / related lifecycle) | Labelled inline worker phase, then separate labelled inline reviewer phase. Batch order and gates preserved. |
| `wait` / `message` / `follow_up` / `interrupt` / `list` | Main-thread coordination; no claims of child mailbox, cancellation, or host-level child listing. |
| Structured question UI | Exact chat gate + end turn (+ optional pending-gate checkpoint under `.hyperflow/`). |
| Native skill handoff | Full target `SKILL.md` load, then inline continuation with the same arg and gate contract. |
| Background lifecycle | Foreground-only; honest capability report. |
| Usage metrics | `unavailable` or explicitly estimated fields — never false precision. |
| Web research tools | Skip research; state that sources were not fetched. |
| Headless + no interactive channel at a structural gate | Error and stop at that gate; never silently default a build, fix, push, or merge. |

Security and irreversibility gates are **not** degradable into silent defaults. `SECURITY_VIOLATION:` still hard-halts the chain. Blocked paths and banned commands in `security.md` apply on every host.

---

## Metrics honesty

1. Prefer host-reported input/output/cache tokens when the inventory exposes them.
2. When estimating, set `estimated=true` and preserve `total_tokens = input_tokens + output_tokens`.
3. Never report an estimate as exact observed data.
4. Never invent agent counts for foreground-only work (inline-fast shows `0 agents` plus the foreground review).
5. Usage / Evidence blocks print only at terminal wrap-up or hard halt (dispatch doctrine), never mid-batch as a fake completion.
6. Parallelism claims require either true concurrent spawns or an explicit "sequenced inline" wording — never claim parallel subagents when work was serial.

---

## Reasoning effort (not model routing)

- Resolve effort by task/profile: `low` for trivial docs/config checks, `medium` for normal planning/review, `high` for debugging, architecture, security, and final integration.
- Never default portable hosts to exotic max-effort modes (e.g. Codex `xhigh`).
- Effort is a per-call hint only when the host accepts it; it is not model selection.

---

## Related

- [chain-router.md](chain-router.md) — transitions and gates
- [provider-codex.md](provider-codex.md) · [provider-claude.md](provider-claude.md) · [provider-opencode.md](provider-opencode.md)
- [SKILL.md](SKILL.md) — portable router and interaction fallback
- [DOCTRINE.md](DOCTRINE.md) — orchestration floor
- `config/providers.json` — machine-readable candidates
