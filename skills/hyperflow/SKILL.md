---
name: hyperflow
description: "Use when applying Hyperflow's orchestration doctrine in Codex, Antigravity, or another single-agent surface. Auto-invoke for non-trivial engineering work: build, implement, add, refactor, debug, fix, review, audit, plan, scope, design, brainstorm, ship, or deploy."
---

# Hyperflow Doctrine (single-agent port)

Apply Hyperflow's behavioral floor in surfaces that load skills but do not provide the full Claude Code multi-agent runtime.

## Runtime Adaptation

Codex and Antigravity run one foreground agent. Where the full doctrine says to dispatch parallel workers under reviewers:

- Do the work yourself, one coherent batch at a time.
- Self-review each batch before moving on.
- Run a final integration self-review over the cumulative diff.
- Preserve the same autonomy, clarification, commit cadence, file-first artefact, no-attribution, and security rules.

## Codex Model Policy

- Thinking roles use `gpt-5.5`.
- Worker roles use `gpt-5.4` in fast mode.
- Resolve thinking reasoning by task/profile: `low` for trivial docs/config checks, `medium` for normal planning/review, and `high` for debugging, architecture, security, and final integration.
- Never default Codex reasoning to `xhigh`.

## Core Rules

1. Execute task-shaped requests without confirmation.
2. Clarify only after reading the relevant code and only for genuine ambiguity.
3. Keep long-form plans, specs, task decompositions, and audits under `.hyperflow/`.
4. Use conventional commits, one distinct user task per commit.
5. Never reference the model as the actor in commits, docs, comments, task files, or memory.
6. Respect the security blocklist in `security.md`.

## Workflow Routing

| Intent | Workflow |
|---|---|
| `brainstorm`, `design`, `explore`, "should we" | Research first, ask material questions, then propose approaches |
| `scope`, `decompose`, "plan out" | Map affected files, then write a task graph under `.hyperflow/tasks/` |
| `build`, `implement`, `add`, `refactor` | Decompose, execute batches, self-review, commit per task |
| `debug`, `fix it`, "why is X failing" | Root-cause before patching |
| `audit`, `review`, "check for issues" | Review findings first, then offer/apply fixes |
| `ship`, `push`, `release`, `deploy` | Run gates, commit/release, ask before push |

For full multi-agent doctrine, read `DOCTRINE.md` and the linked reference files in this directory.
