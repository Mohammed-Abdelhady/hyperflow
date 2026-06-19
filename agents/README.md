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
2. **[Brain](brain.md)** (Opus, decision-maker tier) is consulted **once** after triage. It finalizes the
   responsible roster, decides per-specialist web-research (legal only on gated flows), and approves any fan-out.
   On `fast`/`standard` flows Brain is a thin auto-approve of the triage table (no Opus call); on
   `deep`/`research`/`scientific`/`security` it actively reasons.
3. The Brain's decision is written into the artefact (spec status block → scope task file) and **inherited
   downstream** — no skill re-derives the roster.

`amplify` / `spec` / `scope` **announce** the responsible specialists. `dispatch` / `audit` / `trace` / `deploy`
**dispatch** the named specialist as the reviewer/investigator at its tier.

## Tiers (reuse existing — no new tier semantics)

Reviewer specialists inherit the existing reviewer tiers: **per-batch → Sonnet**, **standalone / final-integration
→ Opus** (`--thorough` escalates per-batch to Opus). Security/correctness specialists default **Opus even
per-batch** (consistent with "if security present, never fast"). Investigators inherit:
`searcher` → Sonnet; `debugger` / `analyst` / `researcher` → Opus. Brain → Opus (decision-maker).

## Roster

### Reviewers
| Agent | Binds personas | Default tier | Focus |
|---|---|---|---|
| [frontend-reviewer](frontend-reviewer.md) | frontend, ui | Sonnet / Opus standalone | render, state, component correctness |
| [backend-reviewer](backend-reviewer.md) | api, architect | Sonnet / Opus | service layer + module boundaries |
| [api-reviewer](api-reviewer.md) | api | Sonnet / Opus | contract, status codes, validation |
| [database-reviewer](database-reviewer.md) | db | Sonnet / Opus | migrations, indexes, query plans |
| [security-reviewer](security-reviewer.md) | security | **Opus** | authz, secrets, OWASP; halts on violation |
| [vulnerability-reviewer](vulnerability-reviewer.md) | security, scientific | **Opus** | CVE / dependency / exploit-path |
| [devops-reviewer](devops-reviewer.md) | devops | Sonnet / Opus | CI, IaC, rollback, observability |
| [performance-reviewer](performance-reviewer.md) | performance | Sonnet / Opus | profiling, complexity, regression budgets |
| [accessibility-reviewer](accessibility-reviewer.md) | ui, frontend | Sonnet / Opus | WCAG, keyboard, screen-reader |
| [mobile-reviewer](mobile-reviewer.md) | frontend, ui, performance | Sonnet / Opus | mobile / responsive / native constraints |
| [data-ml-reviewer](data-ml-reviewer.md) | scientific, db | **Opus** | reproducibility, numerical correctness, lineage |
| [compliance-reviewer](compliance-reviewer.md) | security, docs | **Opus** | PII / GDPR / audit-trail / regulatory |

### Investigators
| Agent | Binds personas | Default tier | Focus |
|---|---|---|---|
| [searcher](searcher.md) | research | Sonnet | codebase + docs surface mapping |
| [debugger](debugger.md) | bugfix, test | **Opus** | root-cause, 5-Whys, hypothesis testing |
| [analyst](analyst.md) | architect, research | **Opus** | multi-dimensional analysis / decision synthesis |
| [researcher](researcher.md) | research | **Opus** | external evaluation, library survey, deep web research |

### Router
| Agent | Tier | Focus |
|---|---|---|
| [brain](brain.md) | **Opus** (decision-maker) | selects the responsible specialist roster; decides web-research + fan-out |

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
