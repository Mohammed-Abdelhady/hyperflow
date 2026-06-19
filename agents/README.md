# Specialist Agent Registry

Named, domain-specialized agents that the Hyperflow chain dispatches. Each is a real Claude Code sub-agent
(`agents/<name>.md`, auto-discovered by the plugin) with frontmatter (`name`, `description`, `model`, `tools`) and a
charter body.

This registry is a **new system that reuses and extends** the 15 personas in
[`../skills/hyperflow/personas-A.md`](../skills/hyperflow/personas-A.md) /
[`personas-B.md`](../skills/hyperflow/personas-B.md). Personas are *standards text*. Specialists are *named agents*
that **bind** persona standards and add what personas lack.

## The DRY guard (non-negotiable)

A specialist **binds** persona(s) for its domain standards and adds only these specialist-only fields:

1. **Mission** — the one thing this agent catches or produces.
2. **Web-research-first** — a one-line pointer to [`../skills/hyperflow/web-research.md`](../skills/hyperflow/web-research.md) + its source-priority scope.
3. **Sub-agent fan-out authority** — whether it may spawn sub-workers, and the limits.
4. **Strict checklist / output contract** — its PASS bar, referencing the bound persona's "Things to verify"
   rather than copying it, plus specialist-only items.

**A charter that restates its persona's objectives / conventions / anti-patterns verbatim is a doctrine
violation.** Bind by reference — exactly how `personas-B.md` references `personas-A.md`.

## How specialists are selected — the Brain

Selection is **not** free-chosen by each skill. The flow is:

1. **Triage** (Haiku) emits a candidate `specialists[]` from `types[]` via the fixed derivation table in
   [`../skills/hyperflow/task-triage.md`](../skills/hyperflow/task-triage.md).
2. **[Brain](brain.md)** (thinking-tier decision-maker) is consulted **once** after triage. It finalizes the
   responsible roster, decides per-specialist web-research (legal only on gated flows), and approves any fan-out.
   On `fast`/`standard` flows Brain is a thin auto-approve of the triage table (no thinking-tier call); on
   `deep`/`research`/`scientific`/`security` it actively reasons.
3. The Brain's decision is written into the artefact (spec status block → scope task file) and **inherited
   downstream** — no skill re-derives the roster.

`amplify` / `spec` / `scope` **announce** the responsible specialists. `dispatch` / `audit` / `trace` / `deploy`
**dispatch** the named specialist as the reviewer/investigator at its tier.

## Tiers — provider-neutral (works on every provider, not just Opus/Sonnet)

Specialists are stated in **tiers — `thinking` / `worker` — never in a hardcoded model name.** The tier resolves to
the **active provider's** model via [`../skills/hyperflow/model-config.md`](../skills/hyperflow/model-config.md) role
resolution, so the same charter runs on Claude Code, Codex, OpenCode, Antigravity, or any configured provider:

| Tier | Claude Code | Codex | OpenCode | Antigravity |
|------|-------------|-------|----------|-------------|
| `thinking` | Opus 4.8 | GPT-5.5 | per config (default Opus 4.8) | Gemini 3 Pro |
| `worker` | Sonnet 4.6 | GPT-5.4 | per config (default Sonnet 4.6) | Gemini 3.5 Flash |

Tier assignment:

- **Reviewer specialists** — `worker` per-batch, `thinking` standalone / final-integration (`--thorough` escalates
  per-batch to `thinking`). Security/correctness specialists (`security-reviewer`, `vulnerability-reviewer`,
  `data-ml-reviewer`, `compliance-reviewer`) default **`thinking` even per-batch** ("if security present, never fast").
- **Investigators** — `searcher` → `worker`; `debugger` / `analyst` / `researcher` → `thinking`.
- **Brain** → `thinking` (decision-maker), with a free cheap-path on `fast`/`standard` flows.

> The `model:` field in each agent's frontmatter is the **Claude-Code-native default alias** for that tier (the only
> field the Claude Code sub-agent loader reads). On every other provider the orchestrator dispatches the charter at
> the resolved tier via the Agent tool — the model name in frontmatter is never the source of truth; the **tier** is.

## Roster

### Reviewers
| Agent | Binds personas | Default tier | Focus |
|---|---|---|---|
| [frontend-reviewer](frontend-reviewer.md) | frontend, ui | worker / thinking | render, state, component correctness |
| [backend-reviewer](backend-reviewer.md) | api, architect | worker / thinking | service layer + module boundaries |
| [api-reviewer](api-reviewer.md) | api | worker / thinking | contract, status codes, validation |
| [database-reviewer](database-reviewer.md) | db | worker / thinking | migrations, indexes, query plans |
| [security-reviewer](security-reviewer.md) | security | **thinking** | authz, secrets, OWASP; halts on violation |
| [vulnerability-reviewer](vulnerability-reviewer.md) | security, scientific | **thinking** | CVE / dependency / exploit-path |
| [devops-reviewer](devops-reviewer.md) | devops | worker / thinking | CI, IaC, rollback, observability |
| [performance-reviewer](performance-reviewer.md) | performance | worker / thinking | profiling, complexity, regression budgets |
| [accessibility-reviewer](accessibility-reviewer.md) | ui, frontend | worker / thinking | WCAG, keyboard, screen-reader |
| [mobile-reviewer](mobile-reviewer.md) | frontend, ui, performance | worker / thinking | mobile / responsive / native constraints |
| [data-ml-reviewer](data-ml-reviewer.md) | scientific, db | **thinking** | reproducibility, numerical correctness, lineage |
| [compliance-reviewer](compliance-reviewer.md) | security, docs | **thinking** | PII / GDPR / audit-trail / regulatory |

### Investigators
| Agent | Binds personas | Default tier | Focus |
|---|---|---|---|
| [searcher](searcher.md) | research | worker | codebase + docs surface mapping |
| [debugger](debugger.md) | bugfix, test | **thinking** | root-cause, 5-Whys, hypothesis testing |
| [analyst](analyst.md) | architect, research | **thinking** | multi-dimensional analysis / decision synthesis |
| [researcher](researcher.md) | research | **thinking** | external evaluation, library survey, deep web research |

### Router
| Agent | Tier | Focus |
|---|---|---|
| [brain](brain.md) | **thinking** (decision-maker) | selects the responsible specialist roster; decides web-research + fan-out |

## Sub-agent fan-out

Only agents whose charter sets fan-out `allowed` (investigators + standalone/final reviewers) may spawn sub-workers,
**depth-capped at 1**, budget ≤ 3 (≤ 5 for `vulnerability-reviewer` / `researcher`). Full rules:
[`../skills/hyperflow/DOCTRINE.md`](../skills/hyperflow/DOCTRINE.md) Layer 3 — sub-agent fan-out.

## Agent-file template

```
---
name: <name>
description: Use when <triggering surface/condition>.
model: opus | sonnet
tools: Read, Grep, Glob, Agent, WebSearch, WebFetch
---
**Family / Binds personas / Default tier / Triggered by types:** …
**Mission:** …
**Web-research-first:** per ../skills/hyperflow/web-research.md. Scope: …
**Sub-agent fan-out:** allowed|not — limits.
**Strict checklist / output contract:** …
**Output format:** verdict block | findings block; `Sources consulted:` when research ran.
**Composes with:** …
```
