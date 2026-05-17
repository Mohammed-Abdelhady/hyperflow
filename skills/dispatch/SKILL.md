---
name: dispatch
description: |
  Use when a task file exists in .hyperflow/tasks/ and workers need dispatching. Fans out parallel Sonnet workers under per-batch Opus reviewers, runs a final integration review, and commits per sub-task. Endpoint of the auto-chain — no auto-deploy.
  Trigger with /hyperflow:dispatch, "run the plan", "execute the task", "build it", "run the batches".
allowed-tools: Read, Write, Edit, Bash(git:*), Agent
argument-hint: "[task-file] [chain-mode=auto|manual] [--from-batch N] [--final-only] [--thorough]"
version: 3.1.2
license: MIT
compatibility: Designed for Claude Code
tags: [execution, parallel, review, multi-agent, orchestration]
---

# Dispatch

Workhorse phase. Picks up a task file from `/hyperflow:scope` and runs it through the orchestrator pattern with parallel worker dispatch and thinking-tier reviews.

This skill exercises **Layer 3 (Orchestrator)**, **Layer 5 (Quality Gates)**, **Layer 6 (Project Memory)**, **Layer 8 (Git Workflow)**, and **Layer 9 (Security)** from the doctrine. Multi-level review (L1–L5) is applied per the triage's flow profile.

## Per-Step Agent Map (DOCTRINE rule 12 — §12.1 inline-allowed for trivial steps)

Every substantive step dispatches at least one Agent. Trivial steps (≤ 2 tool calls, no content generation, no decision-making, mechanically verifiable) MAY be performed inline by the orchestrator per §12.1.

| Step | Worker tier | Thinking tier | Notes |
|---|---|---|---|
| 0 — Mode confirm | — | — | `AskUserQuestion` only (exempt) |
| 1 — Load task | — | — | File read only (exempt) |
| 2 — Per batch | Implementer / Searcher / Writer × N parallel (Sonnet) | **Reviewer** (Sonnet · worker tier) batched per batch (or per sub-task if mixed level caps) | One Reviewer call per batch · Sonnet by default · escalates to Opus with `--thorough` |
| 2b — Quality gates | Worker (Sonnet) runs lint/typecheck/tests | **Reviewer** (Sonnet · worker tier) judges gate output | Gate output is a small focused diff — Sonnet handles |
| 3 — Final integration | — | **Reviewer** (Opus · thinking tier) L1–L<n> over full diff | Conditional — see D7 skip condition below · always Opus because it sees the cumulative diff |
| 4 — Wrap up | Writer (Sonnet) — optional inline per §12.1 | — | Trivial-eligible: delete task file + memory append + chore commit is mechanical. Writer dispatch required only if memory prose generation is non-trivial. |
| 5 — End of chain | — | — | ONE `AskUserQuestion` with both audit + deploy questions (exempt — gates only) |

Iron rule — `thinking agents ≥ batches + 1` (one batched Reviewer per batch + final integration when not skipped). The batched Reviewer counts as 1 per batch regardless of how many sub-tasks are in the batch. If less, a per-step reviewer was skipped.

## Review Levels (scale by flow profile)

Every batch reviewer and the final integration reviewer uses the level set below. Profile comes from `/hyperflow:spec` triage and is propagated via the `chain-mode` args.

| Profile | Levels | Workers | Reviewers |
|---|---|---|---|
| `fast` | L1 | 1 | inline self-review only |
| `standard` | **L1–L2 default** | 1–2 | 1 per-batch reviewer |
| `deep` | L1–L5 | 3+ | per-batch + final integration |
| `research` | L1–L2 + synthesis | 3+ searchers | inline synthesis |
| `creative` | L1–L3 + UX | 1–2 | 1 reviewer |
| `scientific` | L1–L5 + TDD | 2–3 | per-batch + final |

L1 syntax/format · L2 spec/naming/edges · L3 integration/security · L4 perf/scale · L5 a11y/UX. See [review-levels.md](references/review-levels.md) for the full checklist.

**Default cap is L1-L2.** Triage may flag `security: true` or `integration_risk: true` in its output; when either is set, the cap elevates to L1-L3 for both per-batch and final integration reviewers. Workers do NOT request elevation — only the upstream triage classification can elevate. See `reviewer-prompt-batched.md` — workers must honor the cap passed to them (cap enforcement lives on the reviewer-prompt side).

## Approval Gates

| Gate | When | Format |
|---|---|---|
| Chain mode | Step 0, only if invoked directly | `AskUserQuestion` — auto / manual |
| Inter-batch (manual mode only) | After each batch's gates pass | `AskUserQuestion` — continue / stop. **Auto mode fires NO inter-batch question** — see DOCTRINE rule 8 (invented gates banned). |
| Hard halt | Any `SECURITY_VIOLATION` from a reviewer | Stop the chain, surface the finding |
| **Audit prompt** | Step 5, after wrap-up | `AskUserQuestion` — run `/hyperflow:audit`? (yes/no, recommended toggles with flow profile) |
| **Deploy prompt** | Step 5, after audit gate | `AskUserQuestion` — run `/hyperflow:deploy`? (yes/no, recommended toggles with gate state) |

## Inputs

- **Task file** — positional arg (slug or path). Default — most-recently-modified file in `.hyperflow/tasks/`.
- **`chain-mode=<auto|manual>`** — passed in by `/hyperflow:scope`. Controls whether to pause for confirmation after the final integration review. If absent, assume `auto`.
- **`--from-batch <n>`** — resume from a specific batch (skip prior batches).
- **`--final-only`** — skip batch dispatch, run only the final integration review.
- **`--thorough`** — disable P2 batched reviews; fall back to per-sub-task reviewers for every sub-task in every batch. Use when belt-and-suspenders depth is required on a high-risk run. P3 (concurrent pre-conditions) and P5 (lean worker prompts) remain on. When `--thorough` is passed, BOTH D5 (wrap-up Reviewer drop) and D7 (integration review skip) are disabled — the full pre-round-2 ceremony runs. D2 combined gate stays (no quality tradeoff), D6 default L1-L2 stays (cap can still be elevated by triage flags).

## Flow

### Step 0 — Choose mode (only if invoked directly · STRUCTURAL GATE)

This is a **structural gate** per DOCTRINE rule 8. When dispatch is invoked directly (no `chain-mode` arg from `scope`), it MUST fire. "No clarifying questions" / "auto-pilot" / any autonomy directive does NOT skip it. Defaulting silently is a doctrine violation.

If a `chain-mode` arg was passed, skip this step — the chain-starter already asked.

Otherwise, ask via `AskUserQuestion`. Per DOCTRINE rule 8, the recommended option goes first with `(Recommended)`:

```
How should I handle progress through the batches?

  Auto (Recommended)  — run all batches + final review and stop. Print next-step suggestions.
  Manual              — pause between batches and ask before continuing.
```

Wait for the user's answer. Do not proceed without it. If `AskUserQuestion` cannot be presented, print an error and stop — never silently default.

### Step 1 — Load the task

Read `.hyperflow/tasks/<slug>.md`. If absent, stop and suggest `/hyperflow:scope` first.

### Step 2 — For each batch

1. Print the batch header: `Batch <n> — <one-line description>`.
1a. **Mode resolution (one-time per chain).** At the first batch, run `python3 $PLUGIN_ROOT/scripts/resolve-mode.py $PROJECT_ROOT --from-args "$CHAIN_ARGS"` and cache the resulting word (`default` / `lean` / `thorough`) for the rest of the chain. The resolver checks args first, then `.hyperflow/.mode`, then defaults. Subsequent batches use the cached value.
2. Dispatch all sub-tasks in the batch in a **single message** with parallel `Agent` calls (one per sub-task). Use the [worker-prompt.md](references/worker-prompt.md) template. Inject `Project Context` per the resolved mode:
   - **mode = default / thorough** → inline excerpts from `.hyperflow/profile.md`, `architecture.md`, `conventions.md` matching the worker's role (unchanged behavior).
   - **mode = lean** → render the lean Project Context block: a `Project Context (load on demand):` heading + paths to `.hyperflow/memory/session-context.md`, `.hyperflow/profile.md`, `.hyperflow/architecture.md`, `.hyperflow/conventions.md`, `.hyperflow/testing.md`, `.hyperflow/memory/index.md` with one-line descriptions each. Workers read on demand. Saves ~2k tokens × N parallel workers; same content, lazy access. Persona stitching (top-3), memory injection (all tag matches), reviewer model + template, and all clarification gates remain unchanged regardless of mode.
   Inject accumulated `Learnings from prior batches` in all modes.
3. When all workers in the batch have returned — dispatch **one** batched per-batch Reviewer for the entire batch (P2 — batched single-pass review). **Model tier: Sonnet by default** (`model: "<resolved-worker>"`) — anchored to one batch's small diff, L1-L<n> work that Sonnet handles reliably and ~5× cheaper than Opus. Escalates to Opus (`model: "<resolved-thinking>"`) when `--thorough` is passed:
   - **Check level-cap homogeneity first.** Inspect the flow-profile table to confirm every sub-task in this batch shares the same review-level cap (e.g., all L1–L3). If they all match → batched review. If any sub-task carries a different cap (rare mixed profile) → fall back to per-sub-task reviewers (old pattern, same Sonnet default).
   - **Also fall back to per-sub-task reviewers** when `--thorough` was passed (and the reviewers ALSO escalate to Opus under `--thorough`).
   - **Batched reviewer dispatch:** Use the [reviewer-prompt-batched.md](../../hyperflow/reviewer-prompt-batched.md) template with `model: "<resolved-worker>"` (or `"<resolved-thinking>"` under `--thorough`). Print `**Reviewer** (Sonnet) — batched review Batch <n> (L1–L<n>, <k> sub-tasks)`. The batched Reviewer returns one verdict per sub-task.
   - **Per-sub-task fallback (mixed caps or `--thorough`):** dispatch a separate reviewer per sub-task per [reviewer-prompt.md](references/reviewer-prompt.md), same tier rules. Print `**Reviewer** (Sonnet) — reviewing <subtask> (L1–L<n>)`.
   - **Why Sonnet by default:** per-batch reviewers see one batch's diff (typically 2–8 files). L1 (syntax/format) and L2 (spec/naming/edges) are pattern-matching work that Sonnet handles at near-Opus quality. The cross-cutting concerns Sonnet might miss (L3+ integration, architectural drift) are exactly what the Opus final integration Reviewer at Step 3 catches — it sees the cumulative diff across all batches and is paid for. Two-tier review covers more ground than two-Opus review at a fraction of the cost.
   - _(Path note: `reviewer-prompt-batched.md` lives in `skills/hyperflow/` because it is a cross-skill template shared across the chain; `reviewer-prompt.md` stays in `dispatch/references/` from prior convention, pre-dating the cross-skill home. The asymmetric paths are intentional, not a typo.)_
4. Parse the per-sub-task verdicts from the batched Reviewer (or individual verdicts in fallback mode):
   - If any verdict is `SECURITY_VIOLATION` — **halt the chain** immediately and surface the finding to the user (no auto-continue). Do not commit any sub-task in the batch.
   - For each sub-task whose verdict is `NEEDS_FIX` — re-dispatch only that sub-task's Worker with the fix list. Do not re-dispatch passing sub-tasks. After the fix, dispatch a single focused reviewer for just that sub-task (not a full re-batch). Repeat until `PASS` (max 3 retries before escalating to a thinking-tier worker).
   - For each sub-task whose verdict is `PASS` — **commit that sub-task immediately** per [git-workflow.md](references/git-workflow.md) rule 2 (per-sub-task commit cadence). Stage only the files that sub-task touched, write a conventional commit (`feat(<scope>): <title>` derived from the task file), commit. One sub-task = one commit. A batch of 3 parallel sub-tasks produces 3 commits, even though they were reviewed in a single batched Reviewer call.
   - **Update the task file's `## Status` block** after each commit lands: tick the sub-task's `[ ]` → `[x]`, increment `Sub-tasks: <done>/<total>`, add this dispatch's tokens to `Tokens used:` running totals, refresh `Wall-clock:` and `Last update:`, recompute `ETA:` once ≥3 sub-tasks are done. This is what `/hyperflow:status` reads to render live progress without needing a process-level watcher.
5. After the full batch — synthesize learnings, check off the batch in the task file, run **Layer 5 quality gates** (lint / typecheck / tests on affected files) per [quality-gates.md](references/quality-gates.md). If gates fix anything, those become small additional commits on top (never amend per-sub-task commits). Print a one-line status update — *"Batch 1 done · 9/36 sub-tasks · next: B2 deps"* — but do **NOT** ask any question between batches in `auto` mode. Per DOCTRINE rule 8, "transparency checkpoints" / "midway sanity checks" / "scope re-confirmations" / "cost heads-ups" are banned — they are confirmations dressed as clarifications and they break the auto-mode contract. The only inter-batch gates are: (a) `chain-mode=manual` → pause and ask before the next batch fires; (b) `SECURITY_VIOLATION` from a reviewer → hard halt; (c) `ESCALATE: <reason>` crossing the irreversibility boundary → fire the escalation gate per [escalation.md](references/escalation.md) with the reason. If none of those apply, the next batch fires immediately.

### Step 3 — Final Integration Review

**Skip condition (D7):** if ALL of the following hold, skip the final integration review and print `Final integration review skipped — all batches PASSed first try`:
- Every per-batch Reviewer returned PASS on first try (no NEEDS_FIX retries)
- No escalations fired (no `ESCALATE:` markers during Step 2)
- No security flags raised (no triage `security: true` AND no Reviewer security warnings)
- No per-batch Reviewer surfaced `[Important]` out-of-cap notes (via the `reviewer-prompt-batched.md` "Honor the Level Cap" escape hatch — these notes signal a concern the Reviewer wanted to flag but couldn't escalate within the cap; D7 must NOT swallow them)

If ANY of these conditions fails, the final integration review runs as described below.

> **Risk note:** the skip is the riskiest D-decision in round 2 — multi-batch cross-interaction bugs could slip. The guard conditions are deliberately strict (first-try PASS + no escalations + no security flags) to keep risk low. Pass `--thorough` to disable the skip and always run the integration review.

When not skipped: **separate from batch reviews**. Dispatch a thinking-tier Reviewer (`model: "<resolved-thinking>"` — always Opus, regardless of `--thorough`) with the full set of changed files across every batch. Print `**Reviewer** (Opus) — final integration review (L1–L<n>)` using the same level cap as the batch reviewers (per flow profile). Verdict required — `PASS` / `NEEDS_FIX` / `SECURITY_VIOLATION`. Opus tier is mandatory here because the Reviewer sees the cumulative diff and is the one pass that catches cross-batch contradictions Sonnet per-batch reviewers cannot.

### Step 4 — Wrap Up

Trivial-eligible per §12.1 (D5 + D9). Wrap-up is mechanical work: delete task file + memory append + chore commit. The per-batch reviewers and final integration review (when not skipped per D7) already validated the substantive changes.

**Nominal path (inline orchestrator):** perform the following directly without an Agent dispatch wrapper:
1. Delete the completed task file from `.hyperflow/tasks/`.
2. Before appending: `grep -F` the proposed entry's first-line title against `.hyperflow/memory/*.md` files (inline dedup-check — replaces the dropped Reviewer dedup pass). If a match exists, edit the existing entry rather than append a duplicate.
3. Append durable patterns/decisions to `.hyperflow/memory/` per [memory-system.md](references/memory-system.md).
4. Commit the memory + task-file-deletion as a `chore(memory):` commit (separate from the per-sub-task commits from Step 2 — keeping memory writes out of feature commits keeps the diff clean).
5. Print the usage summary per [output-style.md](references/output-style.md).

**When the Writer dispatch IS required:** if memory append requires non-trivial prose generation (e.g., synthesizing learnings from a multi-batch run with cross-cutting patterns), dispatch `Writer — finalizing dispatch artifacts` for the memory write. At that point the step is no longer §12.1-trivial and the Writer Agent handles it. The chore commit still follows immediately; no Reviewer is dispatched for wrap-up.

> **No wrap-up Reviewer (D5):** the Reviewer that previously sanity-checked the chore commit and memory entries is dropped. Wrap-up is mechanically verifiable — `git status` clean, task file absent, memory file present. The orchestrator's direct observation is sufficient.

### Step 5 — End of Auto-Chain · Audit + Deploy gates

Dispatch is the endpoint of the auto-chain. Fire ONE `AskUserQuestion` with **both** questions in the `questions[]` array (D2 — combined gate). DOCTRINE rule 8 — structural gates always fire, never silently default. The `AskUserQuestion` tool accepts up to 4 questions per call; this combined gate uses 2 (audit + deploy). Do not cram further unrelated questions here; the gate's scope is end-of-chain disposition only.

> **DOCTRINE rule 8 preserved:** both questions still fire; they just batch into one round-trip instead of two. Combined gate cuts human-in-the-loop latency by ~half at end-of-chain.

```
?  End-of-chain gates

   [1] Run /hyperflow:audit on the cumulative diff?
       Yes — outside-eye L3 review, independent of per-batch reviewers
       No  — skip; per-batch L1–L<n> reviews were enough

   [2] Run /hyperflow:deploy now? (lint + typecheck + build + tests + security sweep, then asks before push)
       Yes — gates pass · ready to ship
       No  — keep commits local · push manually later
```

Per DOCTRINE rule 8, both questions are binary action gates — no `(Recommended)` marker on either option. Two-outcome framing is symmetric; the orchestrator's analysis is reflected in the surrounding status output (gate results, retry counts, security verdict), not in pre-marking the choice.

**Process answers in order:**

On audit `Yes` → invoke `Skill` with `skill: audit` and `args: "level=3"` (or `level=5` for scientific). Wait for it to finish. Then process the deploy answer.

Then, process the deploy answer. Option labels MUST be one short clause each (≤ 12 words) — never paragraphs of reasoning.

**Internal recommendation signal (used for status framing, NOT for marker):**

The orchestrator still computes whether the chain is in a "green" or "marginal" state — this drives the status line the user reads above the gate, not a `(Recommended)` marker on the options. A chain is **marginal** (and the status line should say so) when one of these *concrete* signals is present:

- A `SECURITY_VIOLATION` was raised (and resolved) during dispatch
- A worker `ESCALATE:` crossed the irreversibility boundary
- ≥ 2 Hyperflow batch-reviewer retries (`NEEDS_FIX` → re-dispatch) for the *same* sub-task — true repeated failure of the Layer 5 quality gates
- A flaky test failure that wasn't conclusively root-caused
- Any reviewer left a `[Critical]` finding unresolved

The following are **NOT** "marginal" signals and MUST NOT flip the recommendation to `No`:

| Signal | Why it's fine |
|---|---|
| Pre-commit hook auto-fixed style (commitlint subject-case, prettier, eslint --fix) | These are commit-time linters at the editor layer, not Hyperflow quality gates. Hooks fixing themselves is normal. |
| `/hyperflow:audit` was run and applied fixes through `/hyperflow:scope → :dispatch` | This is the audit fix-gate working as designed. The code is now *better* than before audit. Strong positive signal. |
| Quality gates passed on first try (or after one auto-fix retry) | First-pass green is the happy path. |
| Single-batch dispatch with no escalations | Simpler runs trend cleaner, not more suspect. |
| Many sub-tasks (e.g. 27 commits) without any of the concrete-signal failures above | Volume is not a risk signal on its own. |

The orchestrator is not the user's risk advisor. The user already saw every reviewer verdict, every gate result, and the audit findings in scrollback. Inventing risk narratives in the recommendation label ("eyeballing the diff before push is prudent") is paternalism, not guidance.

On deploy `Yes` → invoke `Skill` with `skill: deploy`. Deploy has its own push-confirmation gate at its Step 6.

On `No` to both gates → stop cleanly. Print one line:

```
Dispatch complete — <n> batches, <m> agents, <p> per-sub-task commits on branch <branch>.
Next: invoke /hyperflow:audit or /hyperflow:deploy manually when ready.
```

The orchestrator does **NOT** auto-invoke audit or deploy. Both gates wait for an explicit user choice. Defaulting silently is a doctrine violation.

## Agent Label Style

No icons, no brackets. Em-dash separator. Bold for thinking-tier roles:

```
Implementer — creating auth middleware
Searcher — finding related test files
Writer — generating API documentation
**Reviewer** — reviewing auth middleware output
**Debugger** — investigating test failure in auth.test.ts
```

## Operational Args (from Scope Step 2.6 · auto-mode pre-elections)

When `chain-mode=auto`, scope batches three operational pre-elections at its Step 2.6 and propagates them as chain args. Dispatch reads them at Step 1 and honors them without re-asking. Missing args fall back to the indicated defaults.

| Arg | Values | Default | Honored at |
|---|---|---|---|
| `commit` | `per-task` / `per-batch` / `single` / `none` | `per-task` | Step 2 (commit cadence after each PASS) |
| `branch` | `new` / `current` | `new` if currently on `main` or `master`, else `current` | Step 2 (before first commit) |
| `push` | `ask` / `auto` / `never` | `ask` | Forwarded to Deploy Step 6 via chain args |

**`commit=per-task`** (default) — commit after every sub-task PASS as the existing flow.
**`commit=per-batch`** — accumulate sub-task changes; commit once per batch after all sub-tasks PASS, with a message rolling up the batch (`feat(<scope>): batch <n> — <one-line summary>`). One per-batch commit per batch.
**`commit=single`** — accumulate all changes; commit once at Step 4 wrap-up with a message rolling up the whole chain (`feat(<scope>): <feature name> · <n> sub-tasks`). One commit total.
**`commit=none`** — never commit during dispatch; leave working tree dirty. Skip the per-sub-task commit step entirely. Print at Step 4: `Working tree intentionally left dirty (commit=none); review and commit manually before deploy.`

**`branch=new`** — at Step 2 before the first commit, if currently on `main` / `master` / `develop`, create `feat/<task-slug>` and switch to it. If already on a feature branch, treat as `branch=current`.
**`branch=current`** — never auto-create. All commits land on whatever branch the orchestrator was invoked on.

**`push=…`** — dispatch does NOT push. It only propagates the chosen value to Deploy Step 6 in the chain args. Deploy honors it there.

## Iron Rules

- Workers never review, never coordinate, never ask the user questions.
- Every batch produces **one** per-batch Reviewer dispatch (Sonnet · worker tier) — batched over all sub-tasks in the batch (P2), or per-sub-task when mixed level caps or `--thorough`. Either way: one Reviewer call per batch in the nominal case. Escalates to Opus under `--thorough`.
- Plus **one** final integration Reviewer at the end (Step 3 · Opus · thinking tier) **when not skipped per D7**. Always Opus regardless of flags — this is the one Reviewer that sees the cumulative diff across batches.
- **No wrap-up Reviewer at Step 4 (D5).** Wrap-up is §12.1 trivial — delete task file + memory append + chore commit is mechanical and the orchestrator performs it inline. The previous Reviewer at Step 4 is dropped.
- Therefore — `thinking agents in usage summary >= batches + 1`. Floor lowered from +2 to +1 per round 2 D5: the wrap-up Reviewer is dropped because wrap-up is §12.1 trivial. If your dispatch run includes a final integration review (conditions for D7 skip not met), the floor adapts: `>= batches + 1` still holds because the integration review is the "+1". If the integration review skips AND all batches pass, `thinking agents = batches` exactly — which satisfies the floor since the +1 was the integration review that ran implicitly. The batched Reviewer counts as **1** per batch regardless of sub-task count. If less, a per-step reviewer was skipped. The task was done wrong.
- Any `SECURITY_VIOLATION` verdict from the batched Reviewer (or a per-sub-task reviewer) halts the chain immediately — no commits, no auto-continue. Same behavior regardless of whether review is batched or per-sub-task.
- **Usage summary fires ONLY at the very end of the chain — after Step 4 wrap-up. NEVER mid-batch. NEVER after partial sub-task completion.** Printing `── Hyperflow Usage ──` with "B1W1 only" or "<n>/<m> sub-tasks completed" while sub-tasks remain pending is a doctrine violation, not a status update. In `auto` mode, a usage summary is a terminal signal — it means the chain is finished. If you printed one with sub-tasks still pending, the chain is in a broken state.
- **Auto mode must complete every sub-task in every batch before producing any summary, transition, or end-of-chain artefact.** "To resume" instructions, partial usage tables, or "stopping here for now" prose are all forbidden in `auto` mode. The only legal terminations mid-chain are: (a) `SECURITY_VIOLATION`, (b) `ESCALATE: <reason>` crossing the irreversibility boundary, (c) a per-sub-task Reviewer returning `NEEDS_FIX` after 3 worker retries (escalates to thinking-tier worker; if that also fails, surfaces ESCALATE). If none of those fired and the chain stopped, surface as `ESCALATE: dispatch halted with N/M sub-tasks remaining — root cause unknown` and ask the user — do NOT print a partial usage summary as if the chain ended cleanly.
- **If batch dispatch is interrupted (token exhaustion, runtime crash, manual abort) — leave the task file's Status block intact with the partial `[x]` checkmarks, do NOT print a usage summary, do NOT print "To resume" hand-off instructions.** The user can re-invoke `/hyperflow:dispatch --from-batch <n> <slug>` on their own; the task file already reflects which sub-tasks completed. Hand-off instructions printed by a half-finished chain are themselves the bug — they make the user think the chain self-paused cleanly when it actually broke.

## Doctrine

Full rules in [DOCTRINE.md](references/DOCTRINE.md). This skill is the execute phase invoked at the end of `/hyperflow:scope`.

## Overview

`/hyperflow:dispatch` is the workhorse phase — it reads a task file from `/hyperflow:scope` and executes it through the orchestrator pattern.

Parallel Sonnet workers dispatched in a single message, per-batch Opus reviewers that send work back with `NEEDS_FIX`, a conditional final integration review (skipped when all batches pass first-try with no escalations), inline wrap-up, and (at the end of the auto-chain) ONE combined `AskUserQuestion` gate with both audit and deploy questions.

Doctrine floor: thinking agents ≥ batches + 1 (per-batch reviewer + final integration when not skipped per D7; wrap-up Reviewer dropped per D5 / §12.1).

## Prerequisites

- A task file exists at `.hyperflow/tasks/<slug>.md` (produced by `/hyperflow:scope`).
- `.hyperflow/profile.md`, `architecture.md`, `conventions.md` populated (Layer 0 context injected into worker prompts).
- Model routing config supports both thinking (Opus) and worker (Sonnet) tiers.
- Git repository for per-sub-task commits.
- For Step 5: `AskUserQuestion` available — required for audit + deploy gates. Headless mode skips gates with explicit warning.

## Instructions

The numbered steps live in [Step 0 — Choose mode](#step-0--choose-mode-only-if-invoked-directly--structural-gate) through [Step 5 — End of Auto-Chain](#step-5--end-of-auto-chain--audit--deploy-gates) above. Summary:

1. Ask `chain-mode` (auto / manual) if invoked directly — structural gate.
2. Load task file from `.hyperflow/tasks/`.
3. Per batch: dispatch all sub-tasks in a single parallel `Agent` call; when all workers return, fire **one** batched Opus Reviewer (P2) covering all sub-tasks — unless mixed level caps or `--thorough` (fall back to per-sub-task). Parse per-sub-task verdicts: on PASS commit immediately and update the task file's Status block; on NEEDS_FIX re-dispatch only the failing sub-task's Worker; on SECURITY_VIOLATION halt immediately. After batch run Layer 5 gates.
4. Final integration review — conditional (D7): skip if all batches PASSed first try + no escalations + no security flags. Otherwise, separate Opus reviewer over the full diff.
5. Wrap-up (§12.1 inline) — orchestrator deletes task file + appends memory + makes `chore(memory):` commit. No Reviewer (D5). Writer Agent required only if memory prose generation is non-trivial.
6. ONE combined `AskUserQuestion` gate with both audit and deploy questions — process answers in order.

## Output

Per-batch and per-sub-task agent labels print as they fire (`Implementer — creating auth middleware`, `**Reviewer** — reviewing auth middleware output (L1-L3)`). After the full chain, the usage summary prints:

```
── Hyperflow Usage ──────────────────────
Thinking (Opus 4.7)     4 agents   52.3k tokens  (3 batch reviewers + 1 final)
Worker   (Sonnet 4.6)   7 agents  154.1k tokens  (5 implementers + 1 writer + 1 searcher)
Total                  11 agents  206.4k tokens
─────────────────────────────────────────
```

(Wrap-up Reviewer no longer appears in the Thinking row per D5. If the integration review skipped per D7, the Thinking count equals the batch count exactly.)

Plus the End-of-Chain block listing batches, agents, and per-sub-task commits.

## Error Handling

| Failure | Behavior |
|---|---|
| No task file at `.hyperflow/tasks/` | Stop and suggest `/hyperflow:scope` first. |
| Worker times out or returns nothing | Re-scope the sub-task into smaller pieces; redispatch. Max 2 re-scope attempts before escalating to a thinking-tier worker. |
| Reviewer returns `NEEDS_FIX` | Re-dispatch worker with the fix list. Max 3 retries before escalating reviewer + worker pair to Opus + Opus. |
| Reviewer returns `SECURITY_VIOLATION` | **Halt the chain immediately.** Print finding; do not commit, do not auto-continue. User decides remediation. |
| Layer 5 gate failure (lint/typecheck/test) | Worker fix + re-run. Max 3 gate cycles before escalating. |
| Per-sub-task commit fails (hook rejects, conflict) | Stop; surface the hook error. Do NOT use `--no-verify`. Do NOT amend per-sub-task commits. |
| Wrap-up memory append has duplicate entries (detected post-commit) | `git revert HEAD` reverts the chore(memory) commit; orchestrator rewrites and recommits. No Reviewer to catch this inline — `git log` and `git revert` are the recovery path. |
| `AskUserQuestion` unavailable for audit/deploy gates | Print end-of-chain block with `Audit/Deploy gates skipped — interactive mode required`. Do NOT silently auto-invoke either. |
| Thinking-agent count < batches + 1 at end (when integration review ran) | Print explicit doctrine violation warning in usage summary. Suggests a per-step reviewer was skipped. |

## Examples

### Single-batch task — D7 skip + §12.1 inline + D2 combined gate

```
/hyperflow:dispatch add-version-command

[chain-mode auto, propagated from scope]

Batch 1 — add /version command + smoke test (2 parallel sub-tasks, both L1-L2)
Implementer — creating /version command
Writer — adding smoke test
[both workers complete]
**Reviewer** — batched review Batch 1 (L1-L2, 2 sub-tasks)
── Batched Review ──────────────────────
/version command:  PASS
smoke test:        PASS
────────────────────────────────────────
GLOBAL VERDICT: APPROVED
[2 per-sub-task commits]

Layer 5 gates: lint pass · typecheck pass · tests pass

Final integration review skipped — all batches PASSed first try
[D7 skip conditions met: 1/1 batches first-try PASS · no escalations · no security flags]

[Wrap-up inline — §12.1: delete task file · append memory · chore(memory): commit]

── Hyperflow Usage ──────────────────────
Thinking (Opus 4.7)     1 agent    14.2k tokens  (1 batch reviewer)
Worker   (Sonnet 4.6)   2 agents   38.0k tokens  (1 implementer + 1 writer)
Total                   3 agents   52.2k tokens
─────────────────────────────────────────

? End-of-chain gates

  [1] Run /hyperflow:audit on the cumulative diff?
      Yes — outside-eye L3 review
      No  — per-batch L1-L2 reviewers already covered it (standard profile)

  [2] Run /hyperflow:deploy now?
      Yes — all gates green, ready to ship
      No  — keep local; push manually later
```

### Multi-batch with learning injection (P2 batched review)

```
/hyperflow:dispatch implement-auth

Batch 1 — schema + types (2 parallel, both L1-L3)
Implementer — creating TokenClaims schema
Implementer — creating auth type exports
[both workers complete]
**Reviewer** — batched review Batch 1 (L1-L3, 2 sub-tasks)
── Batched Review ──────────────────────
schema:  PASS
types:   PASS
────────────────────────────────────────
GLOBAL VERDICT: APPROVED
[2 per-sub-task commits]
[Synthesize: "TokenClaims uses discriminated union; downstream batches should import from src/auth/types.ts"]

Batch 2 — middleware + login route (3 parallel, all L1-L3, learning injected)
Implementer — creating auth middleware
Implementer — creating login route
Writer — creating route index
[all workers complete]
**Reviewer** — batched review Batch 2 (L1-L3, 3 sub-tasks)
── Batched Review ──────────────────────
auth middleware:  PASS
login route:      NEEDS_FIX — missing TokenClaims import from src/auth/types.ts (cross-section note from B1)
route index:      PASS
────────────────────────────────────────
GLOBAL VERDICT: NEEDS_FIX
[Commit middleware + route index immediately (2 commits). Re-dispatch login route worker only.]
Implementer — fixing login route (TokenClaims import)
**Reviewer** — reviewing login route fix (L1-L3)
[PASS — 1 additional commit]

Batch 3 — tests (4 parallel, all L1-L2)
...
**Reviewer** — batched review Batch 3 (L1-L2, 4 sub-tasks)
[all PASS — 4 per-sub-task commits]

Layer 5 gates
**Reviewer** — final integration review (L1-L3)
[D7 skip conditions NOT met: Batch 2 had a NEEDS_FIX retry — integration review runs]

[Wrap-up inline — §12.1: delete task file · synthesize multi-batch learnings via Writer · chore(memory): commit]

── Hyperflow Usage ──────────────────────
Thinking (Opus 4.7)     4 agents   58.8k tokens  (3 batch reviewers + 1 final)
Worker   (Sonnet 4.6)  11 agents  210.0k tokens  (includes re-dispatch + wrap-up Writer)
Total                  15 agents  268.8k tokens
─────────────────────────────────────────
```

### Mid-batch SECURITY_VIOLATION (batched review)

```
Batch 2 — payment processor (3 parallel, all L1-L3)
Implementer — wiring stripe webhook
Implementer — creating payment record writer
Implementer — adding payment route
[all workers complete]
**Reviewer** — batched review Batch 2 (L1-L3, 3 sub-tasks)
── Batched Review ──────────────────────
stripe webhook:        SECURITY_VIOLATION — webhook signature verified with == instead of crypto.timingSafeEqual (src/payments/webhook.ts:18)
payment record writer: PASS
payment route:         PASS
────────────────────────────────────────
GLOBAL VERDICT: SECURITY_VIOLATION

Halted chain. No commits from Batch 2. Per-sub-task commits from Batch 1 remain on branch. Do not push.
Resume with /hyperflow:dispatch --from-batch 2 after the timing-safe fix.
```

### Mixed level caps — per-sub-task fallback

```
Batch 2 — auth + analytics (mixed profile)
[auth sub-task: L1-L5 (complex, new feature) — analytics sub-task: L1-L2 (simple, config change)]
[Mixed level caps detected — falling back to per-sub-task reviewers]
Implementer — creating auth flow
Implementer — updating analytics config
**Reviewer** — reviewing auth flow (L1-L5)
**Reviewer** — reviewing analytics config (L1-L2)
[both PASS — 2 per-sub-task commits]
```

## Resources

- [DOCTRINE.md](references/DOCTRINE.md) — orchestration rules (especially #8 structural gates, #12 per-step agents).
- [worker-prompt.md](references/worker-prompt.md) — Sonnet implementer/searcher/writer template.
- [reviewer-prompt.md](references/reviewer-prompt.md) — Opus reviewer template (per-sub-task fallback).
- [reviewer-prompt-batched.md](../../hyperflow/reviewer-prompt-batched.md) — Opus batched reviewer template (P2).
- [latency-patterns.md](../spec/references/latency-patterns.md) — P1–P5 latency patterns; P2 dispatch win ~75% reviewer-phase latency.
- [review-levels.md](references/review-levels.md) — L1-L5 checklist.
- [memory-system.md](references/memory-system.md) — wrap-up memory append format.
- [quality-gates.md](references/quality-gates.md) — Layer 5 lint/typecheck/test policy.
- [git-workflow.md](references/git-workflow.md) — per-sub-task commit cadence, no AI attribution.
- [output-style.md](references/output-style.md) — agent label + usage summary format.
