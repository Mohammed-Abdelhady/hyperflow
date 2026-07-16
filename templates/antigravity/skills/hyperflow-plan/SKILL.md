---
name: hyperflow-plan
description: Hyperflow planning phase. Use when a request needs shaping before code — a rough prompt to sharpen, an ambiguous idea to design, or a clear-enough task to decompose. Verbs like plan, design, brainstorm, explore, "should we", "what's the best way to", scope, decompose, "plan out", "break down", "enhance this prompt". Thinking, not building. Writes an optional spec to .hyperflow/specs/<slug>.md and a task file to .hyperflow/tasks/<slug>.md, then hands off to hyperflow-dispatch.
---

# hyperflow-plan — planning phase (Antigravity single-agent)

Thinking, not building. The only writes are to `.hyperflow/`. Each phase skips itself when the request doesn't need it. Follow the `hyperflow` doctrine (autonomy, file-first, AskUserQuestion gates). Lean context is the default; `mode=default` or `--thorough` restores the full-context, full-ceremony path.

## Steps

1. **Amplify (skippable).** If the prompt is rough, rewrite it into its strongest form — role · task · context · constraints · output spec. Skip when it's already specific. Never inflate a one-line ask into a spec.
2. **Research first.** Read the relevant code, `AGENTS.md`, and `.hyperflow/memory/*`. Map the affected surface yourself — do not ask what the code answers.
3. **Design (skippable).** For an open-ended request: ask only material clarifying questions (what/which/where, 5 maximum), propose 2–3 approaches, then design section-by-section into `.hyperflow/specs/<slug>.md` with approval per section. Grounded, clear work invents zero questions and bounces straight to decomposition. When a system, UI, motion, or mobile surface is in scope, ground the design in the matching standards (architecture decomposition + a diagram, the design system, the Motion language, the mobile platform/device matrix).
4. **Decompose.** Produce a topologically-ordered batch graph; each sub-task = one conventional-commit-sized change. **Split any sub-task** touching >5 files, >500 LOC, 2+ subsystems, or >10-min review. Write `.hyperflow/tasks/<slug>.md`: status table → Goal → Why → Scope-at-a-glance → Affected files → Execution plan → Batches (role, files, complexity, acceptance criteria, commit stub) → Verification plan.
5. **Print** `Plan ready — .hyperflow/tasks/<slug>.md (N batches, M sub-tasks)`.
6. **Hand off**: invoke the `hyperflow-dispatch` skill with the task slug — or, in two-session mode, write a committed handoff package and stop.

## Rules

- No implementation code; no source edits.
- Zero invented questions for grounded, clear work; ask only material questions, with 5 maximum.
- Auto-routed implementation may skip planning only after deterministic inspection proves a clear, reversible change in exactly 1–2 ordinary files outside security/integration gates, generated surfaces, migrations, explicit Hyperflow routing, and thorough mode. All other work preserves the normal heavyweight path.
- Hard ceilings: fast 10k, standard 50k, deep 200k, research 60k, creative 100k, scientific 200k. Normal agent runs use metadata-only usage records; inline-fast dispatches zero agents and creates none.
- Single-batch plans for multi-file work are an anti-pattern — decompose.
- Always include a concrete verification plan.
