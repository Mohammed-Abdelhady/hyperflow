---
description: Hyperflow planning phase — sharpen the prompt, design the approach, and decompose into a batched task graph at .hyperflow/tasks/, then hand off to /hyperflow-dispatch
---

Run the **hyperflow planning phase**. Follow the **hyperflow-plan** skill. Thinking, not building — no code is written; only `.hyperflow/` is. Each phase skips itself when the request doesn't need it.

1. **Amplify (skippable):** if the prompt is rough, rewrite it into its strongest form (role · task · context · constraints · output spec). Skip when it's already specific.
2. **Design (skippable):** for an open-ended request, research the affected surface, ask ≥2 clarifying questions (what/which/where only), propose 2–3 approaches, then design section-by-section into `.hyperflow/specs/<slug>.md` with your approval per section. On a clear request, bounce straight to decomposition.
3. **Decompose:** produce a topologically-ordered batch graph. Split any sub-task >5 files / >500 LOC / 2+ subsystems / >10-min review into smaller ones; each = one conventional-commit-sized change. Write `.hyperflow/tasks/<slug>.md` (status table → Goal → Why → scope-at-a-glance → affected files → execution plan → batches with acceptance criteria → verification plan).
4. Print `Plan ready — .hyperflow/tasks/<slug>.md (N batches, M sub-tasks)`, then:
   - **one session** (default) → hand off to `/hyperflow-dispatch`.
   - **two sessions** → write a committed handoff package `.hyperflow-handoff/<slug>/` (HANDOFF.md + STATUS=planned + a copy of the task artefact under `artefact/` + a `context/` snapshot), commit + push, and STOP. The build runs in a second session via `/hyperflow-dispatch <slug>`.

Note: large work may instead produce a multi-phase feature at `.hyperflow/features/<slug>/` (phase folders, each with their own `tasks/`). When a system, UI, motion, or mobile surface is in scope, ground the design in the matching specialist's standards (architecture decomposition + diagrams, the design system, the Motion language, the mobile platform/device matrix).

Request / arguments: $ARGS
