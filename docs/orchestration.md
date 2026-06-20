# Orchestration

How a single user request becomes a coordinated multi-agent run — the chain, triage, per-phase agent dispatch, parallelism accounting, and failure handling.

---

## The chain

```
plan        →   dispatch        →   (suggest)   audit   /   deploy
sharpen+plan    execute              outside review        gates + push
+ decompose     with reviews         (gated)               (gated)

Big tasks can branch to:

workflow    →   workflow runtime/adapter   →   final synthesis
big task        native or portable path        checked result
```

Start with anything from a rough idea to a clear task: **`plan`** sharpens the prompt, designs the approach, and decomposes it into a task file (bouncing straight to decomposition when the approach is already clear). `plan → dispatch` are **chain-starters** — invoking either auto-advances forward through the rest. `audit` and `deploy` are **gates** — never auto-invoked; they fire only on an explicit user `Yes` to a gate question. `scaffold` is a one-time project setup (run once per repo to build the `.hyperflow/` cache), so it sits before the flow rather than inside it.

Four skills sit outside the chain:

| Skill | Purpose |
|---|---|
| `workflow` | Big-task workflow lane for deep/system-wide tasks, large migrations, repo-wide audits, and high-confidence verification |
| `trace` | Root-cause analysis — 5-whys + hypothesis testing for bugs and test failures |
| `status` | Read-only one-screen view of project state and live in-flight progress |
| `cache` | CRUD on persistent project memory |

---

## Layer 0.5 — triage

Every chain-starter begins with a **Classifier** dispatch (Layer 0.5 in the doctrine). It returns:

```json
{
  "types":      ["api", "security", "frontend"],
  "complexity": "moderate",
  "risk":       "medium",
  "scope":      "5-files",
  "ambiguity":  0.4,
  "flow":       "standard",
  "personas":   ["security", "api", "frontend"]
}
```

That JSON drives every downstream decision:

| Triage field | What it picks |
|---|---|
| `flow` | Flow profile for `dispatch` — `fast` / `standard` / `deep` / `research` / `creative` / `scientific` (see `flow-profiles.md`) |
| `ambiguity` | Spec depth — light (2 questions) / standard (3 questions + alternatives) / deep (4–5 questions + section-by-section approval). Floor: 2 questions, always. |
| `personas[]` | Which persona blocks are stitched into each worker's prompt — composed in priority order: security first, creative last |
| `complexity` + `scope` | Number of parallel workers per batch; review level cap (L1–L5) for the per-batch reviewer |

Triage can route big tasks to `/hyperflow:workflow` instead of `plan → dispatch`. The route applies to `flow=deep`, `flow=scientific`, `scope=system-wide`, large migrations, repo-wide audits, high-confidence verification, and prompts that explicitly say `run a workflow` or `dynamic workflow`. Claude Code v2.1.154+ uses native dynamic workflows. Codex and OpenCode use the portable workflow adapter. Antigravity, Desktop/web bridge mode, and runtimes that cannot preserve the adapter phases keep using the normal `plan → dispatch` route.

---

## Plan → dispatch

### Plan — design phase

The chain-starter asks at Step 0 whether to advance **auto** (no gates between phases) or **manual** (confirm before each). The choice propagates to every downstream skill via the `Skill` tool's `args` parameter. In Codex App/CLI, where that host handoff may not exist, Hyperflow treats the handoff as inline continuation and keeps running the next skill in the same thread.

On Codex App/CLI, `/hyperflow:*` messages are skill aliases rather than native slash commands. If the host does not expose a popup question UI, every required `AskUserQuestion` gate renders as a concise `Hyperflow Question` chat block with numbered options and waits for the answer. The fallback applies to Plan questions, Plan ambiguity, Dispatch audit/deploy gates, Audit fix gates, Deploy commit-inclusion, and push confirmation.

Then:

1. **Classifier** — triage JSON (see above)
2. **Searcher** (worker) + **Reviewer** — context exploration
3. **Analyst** — 6-dimension brief: intent, technical fit, scope, constraints, risks, alternatives
4. **`AskUserQuestion`** ×N — design questions, floor 2, scaled by ambiguity; every option list marks a `(Recommended)` choice
5. **Writer** + **Reviewer** — requirement synthesis
6. **Writer** + **Reviewer** — 2–3 alternative approaches with trade-offs
7. **Writer** + **Reviewer** per design section — 5 sections, each approved by the user
8. **Writer** + **Reviewer** — final spec file at `.hyperflow/specs/<slug>.md`
9. Advance to decomposition

Every step that produces output dispatches at least one Agent (DOCTRINE rule 12). In Codex, Hyperflow maps those dispatches to Codex subagents when available; when subagents are not exposed in the session, the single foreground agent runs the worker/reviewer phases inline with labels and continues. Pure user-interaction steps (`AskUserQuestion`, `Skill` hand-off) are exempt.

### Plan — decompose phase

1. Chain-mode check (skipped when the design phase already set the arg)
2. **Searcher × 2** (parallel) + **Reviewer** — research: affected files, related tests, conventions
3. **Planner** — produces the batch graph
4. **Brief Writers** (one per non-trivial sub-task) + **Reviewer** — author a full, build-ready brief per sub-task (Task / Why / Scope / exact changes / acceptance criteria / a realistic test set incl. an end-to-end case) into `.hyperflow/tasks/<slug>/T<id>.md`. The strong planning model pays the authoring cost once; `dispatch` loads each brief verbatim, so the build runs faithfully on a cheaper model or a second session. Trivial sub-tasks stay terse.
5. **Writer** + **Reviewer** — emits the terse roster `.hyperflow/tasks/<slug>.md` (with `Brief:` pointers) + the `## Status` block that `dispatch` keeps updating and `status` reads
6. **Writer** + **Reviewer** — appends decisions to `.hyperflow/memory/`
7. Hand off to `dispatch`

### Dispatch

The workhorse. Per batch:

1. Print the batch header — `Batch N — parallel:K` or `serial:K`
2. Dispatch all K sub-tasks of the batch **in a single message** with K parallel `Agent` tool calls. The runtime executes them concurrently. (Calls across separate messages run serial — see Parallelism below.)
3. As each worker returns:
   - **Reviewer** — reviews at L1–L<n> based on flow profile
   - On `PASS` → commit this sub-task immediately, then update the task file's `## Status` block (tick `[ ]` → `[x]`, increment `done/total`, add tokens, refresh wall-clock + ETA)
   - On `NEEDS_FIX` → re-dispatch worker with the fix list (max 3 retries)
   - On `SECURITY_VIOLATION` → halt the chain immediately
4. After the batch: synthesize learnings, run **Layer 5 quality gates** (lint / typecheck / tests). If a gate fixes something, it lands as a small extra commit — never amends per-sub-task commits.

After all batches complete:

5. **Final integration review** (separate from per-batch reviewers, over the cumulative diff)
6. **Writer** + **Reviewer** wrap-up — delete task file, append memory, `chore(memory):` commit
7. **`AskUserQuestion`** — *"Run /hyperflow:audit?"* (Yes/No, recommended toggles with flow profile)
8. **`AskUserQuestion`** — *"Run /hyperflow:deploy?"* (Yes/No, recommended toggles with gate state)

Both gates respect DOCTRINE rule 8 (structural gates always fire). The orchestrator never auto-invokes audit or deploy.

---

## Big-task workflows

`/hyperflow:workflow <task>` is the big-task path. In Claude Code, it asks the host dynamic workflow runtime to create a background workflow that keeps large orchestration state outside the conversation while preserving Hyperflow's doctrine inside the workflow prompt. In Codex and OpenCode, it runs a custom Hyperflow workflow adapter with the same phase shape.

The generated workflow must include:

1. Research and planning over project profile, architecture, conventions, tests, memory, and affected files.
2. Parallel implementation or investigation agents with specific objectives, file scopes, constraints, acceptance criteria, and test expectations.
3. Adversarial verification agents that check findings or implementation slices before anything is reported.
4. Quality gates and a focused repair loop using the detected lint, typecheck, build, and test commands.
5. Final synthesis with evidence, changed files, unresolved risks, and next actions.

Native dynamic workflows require Claude Code v2.1.154+ and can be disabled by `/config`, managed settings, `~/.claude/settings.json`, or `CLAUDE_CODE_DISABLE_WORKFLOWS=1`. Hyperflow does not enable `/effort ultracode` or `xhigh`; users can opt into `/effort ultracode` manually when they want Claude Code to make session-wide workflow choices. Successful runs can be saved from `/workflows` with `s` into `.claude/workflows/` or `~/.claude/workflows/`; Hyperflow does not ship saved workflow scripts directly because plugin packaging does not expose `.claude/workflows/` as a first-class component.

Codex and OpenCode adapters are not saved through `/workflows`. They use provider subagents/tasks when available, fall back to inline worker/reviewer phases, track durable work in `.hyperflow/tasks/` when needed, run quality gates, and keep per-task commit expectations.

---

## After dispatch

### Audit (gated)

If the user said `Yes` to the audit prompt — or invoked `/hyperflow:audit` directly:

1. Resolve scope (provided target, or `git diff HEAD` + `--staged`)
2. **Searcher** + **Reviewer** — context coverage
3. **Reviewer** at L1–L<n> — structured `[Critical] / [Important] / [Suggestions] / [Praise]` findings
4. **Writer** + **Reviewer** — appends durable patterns to `.hyperflow/memory/learnings.md`
5. Print the review block
6. **Fix gate** — *"Audit found N issues — apply fixes?"*

| Option | What runs |
|---|---|
| Fix all | Critical + Important + Suggestions |
| Critical + Important | — |
| Critical only | — |
| No, leave as-is | Chain ends |

On any `Fix …` choice, audit builds a spec file at `.hyperflow/specs/audit-<timestamp>.md` from the chosen findings and invokes `Skill` with `skill: scope, args: "chain-mode=auto spec=<path>"` — the chain runs again to fix what the audit caught.

### Deploy (gated)

If the user said `Yes` to the deploy prompt — or invoked `/hyperflow:deploy` directly — gates run in order, halting on first failure:

| Gate | What it checks | Auto-fix? |
|---|---|---|
| A — Lint | Code style and lint rules | Yes — once |
| B — Typecheck | Type correctness | No |
| C — Build | Production build | No |
| D — Tests | Full test suite (not just affected) | No |
| Security sweep | Staged + recent changes (Reviewer) | No |

Then:

6. **Commit** — uncommitted worker-introduced changes go in (asks before including pre-existing user changes)
7. **Release** — runs `scripts/release.sh` if present
8. **`AskUserQuestion`** — *"Push to origin/<branch>?"* (Yes/No, recommended toggles with gate state; never force-pushes to main)

---

## Parallelism — provable from the numbers

Parallel dispatch is a prompt-discipline property — multiple `Agent` calls in Claude Code, or multiple Codex subagent calls when exposed, should be issued together so independent work runs concurrently; the same calls across separate messages run serial. The doctrine mandates parallel-when-possible (rule 2), but enforcement is at the prompt layer.

To make parallelism auditable from the output alone, every batch prints a footer:

```
Batch 1 — parallel:3 · standard profile · L1–L2

Searcher       — analyse existing auth patterns
Implementer    — write middleware + route guards
Writer         — generate test suite for auth
  wall-clock: 47s · cumulative: 2m 18s · ratio 0.34 — parallel
```

And the usage summary at task end:

```
── Hyperflow Usage ─────────────────────────────────────────
Triage                          1 agent     1.8k tokens
Spec depth: standard            1 agent     3.2k tokens
Profile: deep                   —           —
Reviews                         4 agents   52.1k tokens  (3 batch · 1 final)
Workers                         8 agents  186.0k tokens  (4 implementer · 3 searcher · 1 writer)
Wall-clock                      3m 47s
Cumulative                     14m 22s    (ratio 0.26 — parallel)
Escalations                     0
Total                          14 agents  243.1k tokens
────────────────────────────────────────────────────────────
```

`ratio = wall-clock / cumulative`. Thresholds:

| Ratio | Classification |
|---|---|
| ≤ 0.5 | Parallel |
| 0.5 – 0.8 | Mixed |
| ≥ 0.8 | Serial |

If a batch is labelled `parallel:N` but the ratio lands ≥ 0.8, that is a DOCTRINE rule 2 violation — the calls went out across separate messages instead of one.

---

## Live progress

While a dispatch chain is in flight (or after it completes, while the task file still exists), `/hyperflow:status` shows:

```
── Hyperflow Status ─────────────────────────────────────────
Version       v3.1.0     (released 2026-05-16)
Profile       fresh      (analyzed 2h ago)
Memory        12 entries
Active tasks  2

── In-flight work ───────────────────────────────────────────
Task:         implement-auth
  Progress    [███████████░░░░░░░░░] 8/14  57%
  Last done   T7: Reset email worker
  Running     T8: Login UI (Implementer · 14s elapsed)
  Pending     6 sub-tasks
  Tokens      total 231.2k
  Wall-clock  4m 22s elapsed
  ETA         ~3m 16s remaining   (avg 32s/sub-task · 6 left)
─────────────────────────────────────────────────────────────
```

The data comes from the task file's `## Status` block that `dispatch` keeps updated after every sub-task PASS — no process watcher, no IPC, just markdown. ETA is `avg_per_subtask × pending` (×1.1 if the next batch is sequential); shows `(computing)` while fewer than 3 sub-tasks are done.

---

## Commit cadence — one per sub-task

Every approved sub-task produces its own conventional commit:

```
worker writes → Reviewer PASS → git add <only-this-task's-files> → commit → next sub-task
```

A batch of 3 parallel sub-tasks produces 3 commits, not one. Quality-gate fix-ups land as small extra commits on top; memory writes become a separate `chore(memory):` at wrap-up. Surgical history — bisectable, surgically revertible.

---

## Handling failures

| Signal | Behavior |
|---|---|
| `NEEDS_FIX` | Same worker re-dispatched with the reviewer's fix list — max 3 retries before escalating |
| `BLOCKED:` | Worker hit a security blocklist entry (`.env`, `*.pem`, `~/.ssh/*`, etc.); chain halts, surfaces the blocked resource, lets the user decide |
| `ESCALATE: <reason>` | Task complexity exceeded the chosen flow profile; orchestrator upgrades the profile per `escalation.md` (fast → standard → deep), re-plans with completed work preserved as context, and continues. If the escalation crosses the risk threshold, `AskUserQuestion` fires first for explicit consent. |
| `CONSULT: <peer> — <question>` | Worker (or reviewer) needs a decision outside its lane; orchestrator brokers — dispatches the named peer, injects the answer, and re-dispatches the original. Depth-1, ≤ 2 consults per worker, never overrides a halt |
| `SECURITY_VIOLATION:` | A reviewer caught a hard security issue; chain halts immediately, no auto-continue |

---

## Agent consultation

Specialists don't work blind. Any agent — current or future — can ask a peer for a focused answer mid-task, the lateral sibling of sub-agent fan-out. The capability lives in the shared prompt scaffolding (`worker-prompt.md` / `reviewer-prompt.md`), not in any charter, so the **allowlist is the `agents/` directory itself** — a new `agents/<name>.md` is consultable the moment it exists, with zero wiring.

- **Build-time workers** are orchestrator-brokered: they emit a `CONSULT:` signal and stop; the Team Lead dispatches the peer and re-dispatches the worker with the answer injected. This keeps the "workers never coordinate" rule literally true — emitting a signal is not coordinating.
- **Design-time decision agents** (`architect`, `designer`, `motion`, `mobile`, `analyst`) consult directly during `plan`'s design phase — e.g. the `architect` asks `motion` whether an interaction is feasible before committing it to the spec.

Caps mirror fan-out: depth-1 (a consulted peer can't itself consult), ≤ 2 consults per worker / ≤ 3 per decision agent, and a consult never overrides a `SECURITY_VIOLATION` / `BLOCKED:` halt. Full contract: [`consultation.md`](../skills/hyperflow/consultation.md).

---

## Surviving context compaction

Long chains will eventually approach the host context limit. Hyperflow holds automatic compaction until dispatch reaches its end-of-chain gate, then checks the current context estimate before letting the compact happen:

- Claude Code's PreCompact payload includes `transcript_path`, not a direct context percentage, so Hyperflow estimates usage from the transcript against `context.windowTokens` in `~/.hyperflow/config.json`.
- Dispatch writes a short-lived `.hyperflow/.dispatch-auto-compact-ready` marker only after wrap-up and the final usage summary. The marker expires after `context.autoCompactReadyTtlMinutes` (default **30 minutes**) and is consumed by the hook.
- Automatic compaction is allowed only at or above `context.autoCompactMinPercent` (default **72%**). If the estimate is lower, the hook blocks the auto compact and the session continues.
- Manual `/compact` always passes. If dispatch has marked readiness but the transcript or budget cannot be read, the hook stays permissive so true limit recovery is not made worse.
- A `PreCompact` hook snapshots the volatile state to `.hyperflow/.precompact.md` right before compaction — active task file(s), structural decisions, hot anti-patterns, and the uncommitted `git diff --stat`.
- The `SessionStart` hook (which also fires on the `compact` trigger) re-injects that snapshot immediately after, then consumes it. The orchestrator comes out of the compact still knowing the task, the decisions, and the quality rules.

The hook blocks automatic compaction before dispatch end or when the estimate is confidently below threshold. It does not block manual compaction or unscaffolded projects; if `.hyperflow/` isn't present the snapshot is skipped silently.

---

## Auto-archive — finished work cleans itself up

`.hyperflow/{tasks,audits,specs}/` would grow forever if every run left its files behind. A daily-gated session-start step keeps the project tidy:

- For each `*.md` in those folders older than `cleanup.staleDays` (default **7**), the archiver extracts the `## Learnings` / `## Decisions` / `## Anti-patterns` (or `## Pitfalls`) sections and appends them — whole-line de-duped — to `.hyperflow/memory/learnings.md` / `decisions.md` / `anti-patterns.md`. Only **then** is the source file moved to `.hyperflow/archive/<type>/YYYY-MM/`.
- Anything under `.hyperflow/archive/**` older than `cleanup.pruneDays` (default **30**) gets deleted; empty directories collapse.
- A marker (`.hyperflow/.last-cleanup`) gates the walk to once per 24h per project — repeat session-starts are free.

Tune or disable it in `~/.hyperflow/config.json`:

```json
{
  "cleanup": { "auto": true, "staleDays": 7, "pruneDays": 30 }
}
```

Force a sweep on demand:

```bash
python3 ~/.hyperflow/repo/scripts/archive-artefacts.py /path/to/project/.hyperflow --force
```

Or archive **one specific file immediately** (on-completion mode — what closing skills call when a chain finishes successfully, bypassing staleness):

```bash
python3 ~/.hyperflow/repo/scripts/archive-artefacts.py /path/to/project/.hyperflow --file .hyperflow/tasks/<slug>.md
```

Net effect: durable learnings compound in memory, the working folders only ever hold what's still in flight, and finished work is cleaned up the moment the chain closes.

---

## References

| File | Contents |
|---|---|
| `skills/hyperflow/DOCTRINE.md` | Full rule set — Layers 0–9, 12 numbered rules, red flags |
| `skills/hyperflow/flow-profiles.md` | The 6 flow profiles and escalation paths |
| `skills/hyperflow/personas-A.md`, `personas-B.md` | All 15 persona definitions |
| `skills/hyperflow/review-levels.md` | L1–L5 checklist |
| `skills/hyperflow/git-workflow.md` | Per-sub-task commit cadence and audit/deploy gate spec |
| `skills/hyperflow/output-style.md` | Visual language — no decorative icons; em-dash separators; bold for decision/review roles; wall-clock / cumulative / ratio formatting |
