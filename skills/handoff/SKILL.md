---
name: handoff
description: |
  Use when managing a two-session handoff — inspecting, picking up, or reviewing a committed handoff package produced by a session=two scope run. The operator interface over the cross-environment handoff lifecycle (plan in one session, build in another, review back in the first).
  Trigger with /hyperflow:handoff, "list handoffs", "pick up the handoff", "review the handoff build".
allowed-tools: Read, Write, Edit, Bash(git:*), Bash(mv:*), Bash(python3:*), Glob, Grep, AskUserQuestion, Skill
argument-hint: "<list | status [slug] | pickup <slug> | review <slug> | complete <slug>>"
version: 1.0.2
license: MIT
compatibility: Claude Code (native Skill / AskUserQuestion); Codex / OpenCode / Antigravity / Grok via runtime-contract fallbacks
tags: [handoff, two-session, cross-environment, orchestration]
---

# Handoff

Operator interface for **two-session execution**: one session plans (`session=two` at the Step 0 gate), a second
session in another environment builds, and the first session reviews. The lifecycle and package format are defined
in [`../hyperflow/session-handoff.md`](../hyperflow/session-handoff.md); this skill is the thin set of verbs over it
(mirrors how `/hyperflow:flush` fronts the deferred-commit machinery). Cross-skill transitions follow
[chain-router.md](../hyperflow/chain-router.md); host ops follow [runtime-contract.md](../hyperflow/runtime-contract.md).

Packages live at `.hyperflow-handoff/<slug>/` (committed, so they travel via git). `STATUS` (`planned → built →
reviewed`) is the single source of truth and decides which side of the handoff you are on.

**Portable mechanics.** Prefer native Skill / `AskUserQuestion` when present. When absent: `skill_continuation`
loads the **complete** target `skills/<name>/SKILL.md` before any target action; gates use the Hyperflow Question
chat block + end turn. Never stop with "Skill tool unavailable". Never invent or widen the committed review range.

## Subcommands

### `list`
Read-only. List every `.hyperflow-handoff/*/` (excluding `.archive/`): slug · `STATUS` · `on_complete` · age. Group
by status so the user sees what is awaiting build vs awaiting review.

### `status [<slug>]`
Show the `HANDOFF.md` manifest + `STATUS` for one package (or all). Read-only.

When `STATUS=built` (or `reviewed`) and `COMPLETION.md` exists:
1. Print `Diff range`, commit count, branch, and Result from the status table.
2. Print the **Evidence** section from `COMPLETION.md` (Sub-tasks, Commits, Files, Gates, Reviews, Risks, Next)
   per [session-handoff.md](../hyperflow/session-handoff.md) / [output-style.md](../hyperflow/output-style.md) §7.
3. Legacy packages with only a thin Notes line: print diff range + commit count and
   `Evidence not available — package predates Evidence contract` (do not invent rows).

When `STATUS=planned`: print that Evidence is not available until the build completes.

### `pickup <slug>` — build side
Thin alias for starting the second-session build. Continue via `skill_continuation` to **`dispatch`** with args
`"<slug>"` (and any chain args recorded in `HANDOFF.md`):

- When native Skill is available: invoke `Skill` with `skill: dispatch` and `args: "<slug>"`.
- When Skill is unavailable: **load `skills/dispatch/SKILL.md` completely**, then continue inline with the same
  positional slug and preserved handoff context. Never stop with "Skill tool unavailable".

Dispatch's Step 1.0 rehydrates `artefact/` into `.hyperflow/`, runs `/hyperflow:scaffold` if the cache is missing,
builds the batches, writes `COMPLETION.md` (full Evidence) + `STATUS=built`, and then deploys or stops per
`on_complete`. Package `STATUS=planned` is required; the committed package remains authoritative for the build.

### `review <slug>` — planning side
1. Require `STATUS=built` (else: "handoff `<slug>` is `<status>` — nothing to review yet").
2. Read `COMPLETION.md` → extract `Diff range = <base>..<head>`. **That range is the sole review authority** —
   do not widen, rewrite, or invent commits ([session-handoff.md](../hyperflow/session-handoff.md)).
3. Print the Evidence section (or legacy fallback) so the operator sees what landed before audit runs.
4. Resolve level: default `level=3`; use `level=5` when the originating triage flow in `HANDOFF.md` was
   `scientific` or `security`.
5. Continue via `skill_continuation` to **`audit`** with exact args: `"<base>..<head> level=<n>"`.
   - When native Skill is available: invoke `Skill` with `skill: audit` and those args.
   - When Skill is unavailable: **load `skills/audit/SKILL.md` completely**, then continue inline with the same
     range + level. Never stop with "Skill tool unavailable".
6. After audit:
   - **Clean PASS** → fire optional deploy gate via `structured_question` (Claude: `AskUserQuestion`):
     `Run /hyperflow:deploy?` · `Yes` / `No` — binary, **no** `(Recommended)` marker. On Yes →
     `skill_continuation` to **`deploy`** (load `skills/deploy/SKILL.md` completely when Skill is absent); deploy
     still owns its own push gate. On No → stop.
   - **NEEDS_FIX** → the audit fix gate owns plan continuation (audit → plan with scoped fix spec); do not
     short-circuit past it.
   - **SECURITY_VIOLATION** → halt; nothing posts or deploys.
7. Set `STATUS=reviewed` once the review is accepted (PASS path or after the user declines deploy / finishes
   the fix disposition they chose).

Portable fallback for the deploy gate: if structured UI is missing, print a `Hyperflow Question` chat block and
**end the turn**. Headless with no channel → do not auto-deploy; print that confirmation is required.

### `complete <slug>`
Mark the lifecycle done:

1. Set `STATUS=reviewed` (if not already).
2. Archive the **handoff package** to `.hyperflow-handoff/.archive/<slug>/` (handoff owns this path — never delegated to reap).
3. Commit `chore(handoff): archive <slug>`.
4. **Reap phase** for the same `<slug>` — dispose the `.hyperflow/` task scope (task file · brief dir · specs/drafts · feature tree · viewer twins · ephemeral GC · memory optimize). Today only the package moved; reap also cleans the project cache for that slug. Idempotent if dispatch/deploy already reaped.

   - **Gate `cleanup.reapOnComplete`:** read from `~/.hyperflow/config.json` (default `true` when absent). When `false` → skip; print `Reap skipped — cleanup.reapOnComplete=false`.
   - **Standard contract call** (resolve `<plugin-root>` like other scripts; hf root = `$PROJECT_ROOT/.hyperflow`):

     ```bash
     python3 <plugin-root>/scripts/reap.py "$PROJECT_ROOT/.hyperflow" --slug <slug>
     ```

   - Capture stdout JSON. Print the **Reap Report**:

     ```
     ── Reap: <slug> ──
     Archived   : <n> → .hyperflow/archive/…
     Deleted    : <n> ephemeral
     Memory     : index rebuilt · <o> orphaned refs dropped · <c> compacted
     Freed      : <bytes>   Mode: live|dry-run
     ```

   - Append one JSON line of the full report to `.hyperflow/archive/.reap-log.jsonl` (create parents if needed).
   - **Never** pass `.hyperflow-handoff` paths to reap; **never** let reap move/delete under `.hyperflow-handoff/` — package archive is step 2 only. Reap is cache-scoped to `.hyperflow/`.
   - Do not pass `--force` on this auto path; engine skips non-terminal without force.

## Resolution

- Default `<slug>` = the most-recently-modified package when omitted from `status`/`pickup`/`review`.
- A package whose `STATUS=planned` is a **build-side** task (run `pickup`); `built` is a **review-side** task (run
  `review`). The session-start hook surfaces the right verb automatically.

## Iron rules

- **Committed range is authoritative.** `review` uses `COMPLETION.md` `Diff range` exactly; never amend the build
  session's commits. Fixes flow through the audit fix-gate → plan → dispatch, never by rewriting second-session history.
- **Never force-push; never `--no-verify`.** Auto-push failures surface the exact `git push -u origin <branch>`.
- **No AI attribution** in any commit or package file.
- **No premature external mutations.** `list` / `status` are read-only; `pickup` / `review` only continue into
  documented target skills; archive is a local package move + conventional commit; `complete` may also run the
  gated reap phase on `.hyperflow/` only.
- **Handoff owns `.hyperflow-handoff/`.** Reap never mutates handoff packages or `.archive/`; package archival stays in `complete` step 2.
- Honors `handoff.*` config (`autoPush`, `remote`, `packageDir`) and `cleanup.reapOnComplete` (default true) for the terminal reap.

## Doctrine

Shared rules in [`../hyperflow/DOCTRINE.md`](../hyperflow/DOCTRINE.md). Package contract + templates in
[`../hyperflow/session-handoff.md`](../hyperflow/session-handoff.md). Transitions in
[chain-router.md](../hyperflow/chain-router.md). Semantic ops in
[runtime-contract.md](../hyperflow/runtime-contract.md). Reaper engine:
[`../../scripts/reap.py`](../../scripts/reap.py).
