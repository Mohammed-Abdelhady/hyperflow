---
description: Hyperflow planning phase — sharpen the prompt, design the approach, and decompose into a batched task graph at .hyperflow/tasks/, then hand off to /hyperflow-dispatch
---

Run the **hyperflow planning phase**. Follow the **hyperflow-plan** skill. Thinking, not building — no code is written; only `.hyperflow/` is. Each phase skips itself when the request doesn't need it. Lean context is the default; `mode=default` or `--thorough` restores the full-context, full-ceremony path.

1. **Amplify (skippable):** if the prompt is rough, rewrite it into its strongest form (role · task · context · constraints · output spec). Skip when it's already specific.
2. **Design (skippable):** for an open-ended request, research the affected surface, ask only material clarifying questions (what/which/where, 5 maximum), propose 2–3 approaches, then design section-by-section into `.hyperflow/specs/<slug>.md` with your approval per section. Grounded, clear work invents zero questions and bounces straight to decomposition.
3. **Decompose:** produce a topologically-ordered batch graph. Split any sub-task >5 files / >500 LOC / 2+ subsystems / >10-min review into smaller ones; each = one conventional-commit-sized change. Write `.hyperflow/tasks/<slug>.md` (status table → Goal → Why → scope-at-a-glance → affected files → execution plan → batches with acceptance criteria → verification plan).
4. Print `Plan ready — .hyperflow/tasks/<slug>.md (N batches, M sub-tasks)`, then:
   - **one session** (default) → hand off to `/hyperflow-dispatch`.
   - **two sessions** → write a committed handoff package `.hyperflow-handoff/<slug>/` (HANDOFF.md + STATUS=planned + a copy of the task artefact under `artefact/` + a `context/` snapshot), commit + push, and STOP. The build runs in a second session via `/hyperflow-dispatch <slug>`.

Note: large work may instead produce a multi-phase feature at `.hyperflow/features/<slug>/` (phase folders, each with their own `tasks/`). When a system, UI, motion, or mobile surface is in scope, ground the design in the matching specialist's standards (architecture decomposition + diagrams, the design system, the Motion language, the mobile platform/device matrix).

Auto-routed implementation may skip planning only after deterministic inspection proves a clear, reversible change in exactly 1–2 ordinary files outside security/integration gates, generated surfaces, migrations, explicit Hyperflow routing, and thorough mode. All other work preserves the normal heavyweight path. Hard ceilings are fast 10k, standard 50k, deep 200k, research 60k, creative 100k, and scientific 200k. Normal agent runs use metadata-only usage records; inline-fast dispatches zero agents and creates none.

Request / arguments: $ARGS
