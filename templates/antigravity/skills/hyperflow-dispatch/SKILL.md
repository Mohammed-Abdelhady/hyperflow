---
name: hyperflow-dispatch
description: Hyperflow execution phase. Use when a task file exists in .hyperflow/tasks/ and the work needs building — verbs like build, implement, add, refactor, "wire up", "run the plan", "execute the task". Works batches sequentially with self-review and per-task commits. In Antigravity there is no sub-agent fan-out — the single agent does each batch itself.
---

# hyperflow-dispatch — execution phase (Antigravity single-agent)

Execute the task file from `hyperflow-plan`. **No sub-agent dispatch and no model tiers in Antigravity** — you do each batch yourself, then self-review before committing. Follow the `hyperflow` doctrine.

## Per batch

1. **Implement** every sub-task in the batch (sequentially; they were planned as small, independent units).
2. **Self-review** the batch diff against the level checklist:
   - **L1** syntax/format/obvious bugs · **L2** spec compliance, naming, edge cases · **L3** cross-file integration + security (secrets, injection, validation).
   - Elevate to L3 when the change touches auth, data, or external input. Fix anything found before committing.
3. **Quality gates (light only):** run the project's lint, typecheck, and tests on **files this batch touched** — not the full suite. On multi-batch / large work, full-project lint/test mid-batch is forbidden (see `skills/hyperflow/quality-gates.md` tiers). Fix failures (never `--no-verify`).
4. **Commit per sub-task** — one sub-task = one conventional commit (respect commitlint: lowercase subject, allowed scope). Stage only that sub-task's files; never commit files you didn't change.
5. **Update the task file's status block** (tick the sub-task, bump progress) and append any durable learning to `.hyperflow/memory/`.

## After all batches

6. **Final integration self-review** over the cumulative diff — catch cross-batch contradictions, scope leaks, and `any`/type regressions.
7. **Chain-end quality gates** when the change is multi-batch, large (≥16 files), deep/scientific, or otherwise tier `standard`/`full`: run **full** lint + typecheck + full tests (+ build if present) **once**. Skip on tiny single-batch light work. Record results for Evidence.
8. **Print Evidence then Usage** (terminal only — never mid-batch). Evidence is mandatory work-product proof; Usage is cost only. Gates row includes tier + chain-end. Full field contract: `skills/hyperflow/output-style.md` §7–§8.

```
── Hyperflow Evidence ──────────────────────────────────────
Result     built · <done>/<total> sub-tasks
Branch     <branch>
Commits    <n>  <sha> <subject> · …
Files      <n> changed · +ins/-del
  <paths…>
Sub-tasks
  T1 PASS — <one-line what landed>
Gates      lint pass · typecheck pass · tests pass
Reviews    self-review L1–L<n> · final PASS
Risks      none | <residual>
Next       audit/deploy gates
────────────────────────────────────────────────────────────
── Hyperflow Usage ─────────────────────────────────────────
…
────────────────────────────────────────────────────────────
```

On handoff builds, also write the same Evidence fields into `.hyperflow-handoff/<slug>/COMPLETION.md`.
9. **End gate** via AskUserQuestion (binary, no recommended marker):
   - Run `hyperflow-audit`?
   - Run `hyperflow-deploy`? (never auto-push; deploy has its own push gate)
   - **Open a pull request?** (default ask on every build — not only issue chains)
10. **If opening a PR** and the work is frontend / UI / mobile / creative (or UI files changed): **screenshots are required**. Try auto-capture; if that fails, ask the user for image paths. Commit under `docs/pr-media/<slug>/`, push the feature branch, embed images in the PR body. **Do not** `gh pr create` without ≥1 image on visual work. Full contract: `skills/dispatch/references/pr-exit.md`. Non-visual PRs need no Screenshots section. Add `Closes #<n>` only when the chain came from an issue.

## Rules

- A `SECURITY_VIOLATION` halts immediately — no commit, no continue. Still print Evidence for commits that already landed (`Result halted · security`).
- If the working tree is dirty with files you didn't create (concurrent work), never stage them; re-check `git status` before each commit.
- Auto mode completes every sub-task before any summary — no partial "to resume" hand-offs. Omitting Evidence after a terminal build is a doctrine violation.
- Free-form "Done! I completed X." prose is banned; structured Evidence replaces it.
- Never force-push; never push to `main`/`master` directly — PR is from the feature branch only.
