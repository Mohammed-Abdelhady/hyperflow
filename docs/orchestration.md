# Orchestration

How one request becomes a coordinated multi-agent run — and why you can trust the output. This guide walks the chain end to end: triage, per-phase agent dispatch, parallelism accounting, commit cadence, and failure handling.

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

Start with anything from a rough idea to a clear task. **`plan`** sharpens the prompt, designs the approach, and decomposes it into a task file — bouncing straight to decomposition when the approach is already clear. `plan → dispatch` are **chain-starters**: invoking either auto-advances forward through the rest. `audit` and `deploy` are **gates** — never auto-invoked, they fire only on an explicit user `Yes` to a gate question. `scaffold` is a one-time project setup (run once per repo to build the `.hyperflow/` cache), so it sits before the flow rather than inside it.

Auto-routed implementation requests first run a deterministic preflight. Only an observed, clear, reversible change in exactly 1–2 ordinary files can take the foreground **inline-fast** branch; gated, generated, migration, ambiguous, or explicitly thorough work keeps the normal `plan → dispatch` path.

Four skills sit outside the chain:

| Skill | Purpose |
|---|---|
| `workflow` | Big-task workflow lane for deep/system-wide tasks, large migrations, repo-wide audits, and high-confidence verification |
| `trace` | Root-cause analysis — 5-whys + hypothesis testing for bugs and test failures |
| `status` | Read-only one-screen view of project state and live in-flight progress |
| `cache` | CRUD on persistent project memory |

---

## Layer 0.5 — triage

Auto-routed implementation requests begin with a deterministic preflight. It can prove the narrow inline-fast case without dispatching an agent; everything else proceeds to the normal **Classifier** dispatch (Layer 0.5 in the doctrine). Explicit `plan`, `mode=default`, and `--thorough` requests always keep the normal path. The classifier returns:

```json
{
  "types":      ["api", "security", "frontend"],
  "complexity": "moderate",
  "risk":       "reversible",
  "scope":      "multi-file",
  "ambiguity":  0.4,
  "flow":       "standard",
  "personas":   ["security", "api", "frontend"]
}
```

That JSON drives every downstream decision:

| Triage field | What it picks |
|---|---|
| `flow` | Flow profile for `dispatch` — `fast` / `standard` / `deep` / `research` / `creative` / `scientific` (see `flow-profiles.md`) |
| `ambiguity` | Spec depth — grounded, clear work invents zero questions; only material ambiguity triggers questions, with 5 maximum. |
| `personas[]` | Which persona blocks are stitched into each worker's prompt — composed in priority order: security first, creative last |
| `complexity` + `scope` | Number of parallel workers per batch; review level cap (L1–L5) for the per-batch reviewer |

Triage can route big tasks to `/hyperflow:workflow` instead of `plan → dispatch`. The route applies to `flow=deep`, `flow=scientific`, `scope=system-wide`, large migrations, repo-wide audits, high-confidence verification, and prompts that explicitly say `run a workflow` or `dynamic workflow`. Claude Code v2.1.154+ uses native dynamic workflows. Codex, OpenCode, and Grok use the portable workflow adapter (Codex support is **preview / uncertified** until [docs/codex.md](codex.md) lanes go green). Antigravity, Desktop/web bridge mode, and runtimes that cannot preserve the adapter phases keep using the normal `plan → dispatch` route.

Flow budgets are hard ceilings, not targets:

| Profile | Hard ceiling |
|---|---:|
| `fast` | 10k tokens |
| `standard` | 50k tokens |
| `deep` | 200k tokens |
| `research` | 60k tokens |
| `creative` | 100k tokens |
| `scientific` | 200k tokens |

The guard checks totals at natural phase and batch boundaries. It may continue, degrade the remaining work, or halt before another dispatch; it never interrupts an agent already in flight.

---

## Plan → dispatch

### Plan — design phase

The chain starts in **lean mode** unless the request explicitly supplies `mode=default` or `--thorough`. Lean mode loads only phase-relevant context; the explicit full modes restore the established full-context, full-ceremony path. Structural build-location, audit, deploy, and push gates remain intact in either mode.

**Codex interaction contract** (capability-driven; full matrix in [docs/codex.md](codex.md)):

| Need | Preferred | Fallback (required) |
|---|---|---|
| Skill entry | Textual `hyperflow <verb>` / `/hyperflow:<skill>` **aliases** (not native Codex slash commands) | Load the target `skills/<name>/SKILL.md` completely and continue inline — never stop with “Skill tool unavailable” |
| Structural gates (`structured_question`) | Host `request_user_input` when callable in the current mode | Exact `Hyperflow Question` chat block with numbered options, optional safe checkpoint under `.hyperflow/`, **end the turn** — never skip or silent-default |
| Worker / reviewer agents | Live inventory: prefer `collaboration.*` spawn/wait/message tools, then bare names, then legacy `multi_agent_v1.*` only if callable | Labelled **inline worker** phase, then **separate labelled inline reviewer** phase; batch order and gates preserved; workers never self-review |
| Metrics | Host-reported tokens when exposed | Print `unavailable` or estimators with `estimated=true` — never fabricate observed parallelism/tokens |
| Hooks | SessionStart / PreCompact when the host fires them | Explicit unsupported-event status only; no invented recovery content |

The gate fallback applies to Plan questions, Plan ambiguity, Dispatch audit/deploy gates, Audit fix gates, Deploy commit-inclusion, and push confirmation.

Then:

1. **Classifier** — triage JSON (see above; skipped only by a proven inline-fast route)
2. **Searcher** (worker) + **Reviewer** — context exploration
3. **Analyst** — 6-dimension brief: intent, technical fit, scope, constraints, risks, alternatives
4. **`AskUserQuestion`** ×N — only material design questions, scaled by ambiguity and capped at 5; grounded, clear work asks zero
5. **Writer** + **Reviewer** — requirement synthesis
6. **Writer** + **Reviewer** — 2–3 alternative approaches with trade-offs
7. **Writer** + **Reviewer** per design section — 5 sections, each approved by the user
8. **Writer** + **Reviewer** — final spec file at `.hyperflow/specs/<slug>.md`
9. Advance to decomposition

Every step that produces output dispatches at least one Agent (DOCTRINE rule 12) **when the host can spawn children**. On Codex, Hyperflow maps those dispatches to collaboration (or legacy) subagents **only when exposed in the live inventory**; otherwise the single foreground agent runs labelled worker then labelled reviewer phases inline and continues. Pure user-interaction steps (`AskUserQuestion` / structured gate, skill hand-off) are exempt from agent spawn but never drop structural gates.

### Plan — decompose phase

1. Chain-mode check (skipped when the design phase already set the arg)
2. **Searcher × 2** (parallel) + **Reviewer** — research: affected files, related tests, conventions
3. **Planner** — produces the batch graph
4. **Brief Writers** (one per non-trivial sub-task) + **Reviewer** — author a full, build-ready brief per sub-task (Task / Why / Scope / exact changes / acceptance criteria / a realistic test set incl. an end-to-end case) into `.hyperflow/tasks/<slug>/T<id>.md`. The strong planning model pays the authoring cost once; `dispatch` loads each brief verbatim, so the build runs faithfully on a cheaper model or a second session. Trivial sub-tasks stay terse.
5. **Writer** + **Reviewer** — emits the terse roster `.hyperflow/tasks/<slug>.md` (with `Brief:` pointers) + the `## Status` block that `dispatch` keeps updating and `status` reads
6. **Writer** + **Reviewer** — appends decisions to `.hyperflow/memory/`
7. Hand off to `dispatch`

### Dispatch

The workhorse has two paths. A deterministic inline-fast route is available only after inspection observes all of these facts: the task is clear, reversible, limited to exactly 1–2 ordinary files, and outside security/integration gates, generated surfaces, migrations, explicit Hyperflow routing, and thorough mode. It inspects and edits in the foreground, runs affected checks, reviews the diff inline, and creates one conventional commit. It dispatches zero agents. If read-only discovery invalidates any eligibility fact, Hyperflow switches to the normal path before writing; it never escalates after a partial inline edit.

Every other task uses the normal orchestrated workhorse. Per batch:

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

`/hyperflow:workflow <task>` is the big-task path (on Codex this is a **textual alias**, not a native host slash command). In Claude Code, it asks the host dynamic workflow runtime to create a background workflow that keeps large orchestration state outside the conversation while preserving Hyperflow's doctrine inside the workflow prompt. In Codex, OpenCode, and Grok, it runs a custom Hyperflow workflow adapter with the same phase shape. Codex lanes remain **preview / uncertified** until [docs/codex.md](codex.md) certificates exist.

The generated workflow must include:

1. Research and planning over project profile, architecture, conventions, tests, memory, and affected files.
2. Parallel implementation or investigation agents with specific objectives, file scopes, constraints, acceptance criteria, and test expectations.
3. Adversarial verification agents that check findings or implementation slices before anything is reported.
4. Quality gates and a focused repair loop using the detected lint, typecheck, build, and test commands.
5. Final synthesis with evidence, changed files, unresolved risks, and next actions.

Native dynamic workflows require Claude Code v2.1.154+ and can be disabled by `/config`, managed settings, `~/.claude/settings.json`, or `CLAUDE_CODE_DISABLE_WORKFLOWS=1`. Hyperflow does not enable `/effort ultracode` or `xhigh`; users can opt into `/effort ultracode` manually when they want Claude Code to make session-wide workflow choices. Successful runs can be saved from `/workflows` with `s` into `.claude/workflows/` or `~/.claude/workflows/`; Hyperflow does not ship saved workflow scripts directly because plugin packaging does not expose `.claude/workflows/` as a first-class component.

Codex, OpenCode, and Grok adapters are not saved through `/workflows`. They use provider subagents/tasks when available, fall back to inline worker/reviewer phases, track durable work in `.hyperflow/tasks/` when needed, run quality gates, and keep per-task commit expectations. On Codex, background agent lifecycle is **foreground-only** when the host has no true background support — no fake notifications.

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

On any `Fix …` choice, audit builds a spec file at `.hyperflow/specs/audit-<timestamp>.md` from the chosen findings and continues via `skill_continuation` into **`plan`** with `session=one spec=<path>` (or loads `skills/plan/SKILL.md` completely when native Skill is absent). Plan still owns the build-location gate — `scope` is retired and never re-entered.

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

## Parallelism and usage — provable from the numbers

Parallel dispatch is a prompt-discipline property — multiple `Agent` calls in Claude Code, or multiple Codex subagent calls when exposed, should be issued together so independent work runs concurrently; the same calls across separate messages run serial. When Codex (or any host) has no spawn tools, work is **sequenced inline** — never claim concurrent subagents or invent agent counts. The doctrine mandates parallel-when-possible (rule 2), but enforcement is at the prompt layer.

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
Workers                         8 agents   66.0k tokens  (4 implementer · 3 searcher · 1 writer)
Wall-clock                      3m 47s
Cumulative                     14m 22s    (ratio 0.26 — parallel)
Escalations                     0
Duplicate context                         8.4k tokens  (ratio 0.07)
Retry cost                                4.2k tokens
Cache hit rate                            0.31
Accepted commits                          6            (20.52k tokens/commit)
Estimated records                         0
Total                          14 agents  123.1k tokens
────────────────────────────────────────────────────────────
```

Normal-flow agent calls append metadata-only ledger records: chain, phase, batch, task, attempt, role, token counts, cache/context metadata, estimate status, accepted-commit status, and timestamp. The ledger never stores prompts, responses, file contents, patches, or secrets. Inline-fast has no agent result to record, so its usage block reports zero dispatched agents and creates no ledger records; Hyperflow does not invent foreground token counts.

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

## Hygiene — cleanup config, daily sweep, and post-completion reap

`.hyperflow/{tasks,audits,specs,features}/` would grow forever if every run left its files behind. Hyperflow keeps the tree healthy with **two complementary paths**:

1. **Daily session-start sweep** — mtime-driven safety net for leftovers and interrupted runs (`archive-artefacts.py`).
2. **Post-completion reap** — slug-scoped, terminal-gated pass that fires when a lifecycle truly ends (`reap.py`), archive-first and memory-preserving.

Both read the same `cleanup` block from `~/.hyperflow/config.json` (schema: `config/schema.json`). Missing keys fall back to the defaults below.

### `cleanup.*` config reference

| Key | Type | Default | Effect |
|---|---|---:|---|
| `auto` | boolean | `true` | Master switch for the **daily** session-start archive/prune sweep. Does not disable slug-scoped reap. |
| `staleDays` | integer ≥ 1 | `7` | Age (days) after which tasks/audits/specs (and completed features) are archived by the daily sweep. |
| `pruneDays` | integer ≥ 1 | `30` | Age (days) after which entries under `.hyperflow/archive/` are deleted; empty dirs collapse. |
| `reapOnComplete` | boolean | `true` | Fire slug-scoped **reap** at lifecycle termini (dispatch wrap-up, deploy end, handoff `complete`). When `false`, lifecycle skills skip reap with an explicit notice; the daily sweep remains the safety net. |
| `usageRetentionDays` | integer ≥ 1 | `30` | Retention for `.hyperflow/usage/*.jsonl` ledgers. Reap hard-deletes older files; the active chain ledger (`.active-chain-id`) is never deleted while in flight. |
| `logMaxLines` | integer ≥ 100 | `2000` | Max lines kept in `.hyperflow/.session-start.log` after reap truncation (tail retained). |
| `dryRun` | boolean | `false` | Global dry-run override for reap (and archive when honored): report the plan, **mutate nothing**. CLI `--dry-run` ORs with this flag. |

Full example:

```json
{
  "cleanup": {
    "auto": true,
    "staleDays": 7,
    "pruneDays": 30,
    "reapOnComplete": true,
    "usageRetentionDays": 30,
    "logMaxLines": 2000,
    "dryRun": false
  }
}
```

### Daily session-start sweep

When `cleanup.auto` is true, a daily-gated session-start step keeps the project tidy:

- For each artefact older than `cleanup.staleDays` (default **7**), the archiver extracts the `## Learnings` / `## Decisions` / `## Anti-patterns` (or `## Pitfalls`) sections and appends them — whole-line de-duped — to `.hyperflow/memory/learnings.md` / `decisions.md` / `anti-patterns.md`. Only **then** is the source moved to `.hyperflow/archive/<type>/YYYY-MM/`.
- Anything under `.hyperflow/archive/**` older than `cleanup.pruneDays` (default **30**) gets deleted; empty directories collapse.
- A marker (`.hyperflow/.last-cleanup`) gates the walk to once per 24h per project — repeat session-starts are free.

Force a sweep on demand:

```bash
python3 <plugin-root>/scripts/archive-artefacts.py /path/to/project/.hyperflow --force
```

Archive **one specific file** (on-completion helper used by lower-level callers, bypassing staleness):

```bash
python3 <plugin-root>/scripts/archive-artefacts.py /path/to/project/.hyperflow --file .hyperflow/tasks/<slug>.md
```

### Post-completion reap lifecycle

When a chain **actually finishes**, ad-hoc deletes are not the disposition path. Lifecycle skills run a **reap phase** that calls `scripts/reap.py` for the finished slug:

| Call site | When | Gate |
|---|---|---|
| `dispatch` | Step 4 wrap-up (after terminal status + memory + Evidence freeze) | `cleanup.reapOnComplete`; **skip** when `on_complete=deploy` (deploy owns terminal reap); skip partial/halted builds |
| `deploy` | End of successful deploy for a scoped slug | `cleanup.reapOnComplete` |
| `handoff` | `complete <slug>` after the handoff package is archived under `.hyperflow-handoff/` | `cleanup.reapOnComplete`; package archive stays handoff-owned — reap only touches `.hyperflow/` |
| Manual | `/hyperflow:reap <slug> [--dry-run] [--force]` | Operator; `--force` requires interactive confirmation on non-terminal slugs |

Exact invocation (first arg is always the **`.hyperflow` directory**):

```bash
python3 <plugin-root>/scripts/reap.py /path/to/project/.hyperflow --slug <slug> [--dry-run] [--force] [--json]
```

**Terminal gate:** flat task `Status`/`State` must be `complete`/`completed`, or `features/<slug>/feature.md` `Status` `completed`. Non-terminal → no-op with `skipped: non-terminal` (exit 0) unless `--force`.

**Disposition policy** (what one reap does for `<slug>`):

| Class | Members | Action |
|---|---|---|
| **Archive** (reversible) | `tasks/<slug>.md`, `tasks/<slug>/` brief dir, `specs/<slug>.md`, `specs/<slug>.draft.md`, `features/<slug>/`, `artefacts/*/<slug>.json` twins | Promote learnings → durable memory, then **move** to `.hyperflow/archive/<type>/YYYY-MM/` via `archive-artefacts.py --slug` |
| **Ephemeral** (hard-delete) | Stale `usage/*.jsonl` past `usageRetentionDays`; `.session-start.log` over `logMaxLines`; terminal `background/bg-*.md` older than 7d; empty/settled `commits-queue/` | Delete or truncate (regenerable) |
| **Memory** (preserve + optimize) | Durable `memory/*.md` categories | **Never** wipe category files; drop orphaned Evidence refs, rebuild `memory/index.md`, flag oversized files for `/hyperflow:cache compact` |
| **Never touch** | `.version`, `.last-cleanup`, `.active-chain-id`, `.chain-base`, active usage ledger, in-flight work, `.hyperflow-handoff/**`, application source | Skipped |

**Report:** JSON on stdout (`slug`, `dryRun`, `archived[]`, `deleted[]`, `bytesFreed`, `memory{indexRebuilt,orphansDropped,compacted[]}`, `skipped[]`). Lifecycle skills print a Reap Report block and append one JSON line to `.hyperflow/archive/.reap-log.jsonl`. Reap is **idempotent** — a second pass on the same completed slug is a clean no-op. Path safety: slug must match `^[a-z0-9-]+$`; every target is resolved under `.hyperflow/` (traversal refused).

Net effect: durable insight compounds in memory, working folders only hold work still in flight, finished scopes leave a recoverable archive trail, and ephemeral session bloat is bounded.

---

## Visual artefacts — model / view split

By default Hyperflow separates an artefact's **model** from its **view**. Instead of hand-writing status tables, ASCII dependency diagrams, and progress bars into `.hyperflow/*.md`, each artefact-producing skill emits a compact validated JSON payload via `scripts/artefact.py`, which stamps it, validates it against `config/artefact.schema.json`, writes `.hyperflow/artefacts/<type>/<slug>.json`, and leaves a ≤6-line greppable stub at the canonical path. A self-contained local viewer renders the JSON.

- **`hyperflow view [slug]`** (`scripts/view.py`) serves the viewer on `127.0.0.1` (loopback only — never `0.0.0.0`) and opens the artefact, or a gallery of every template. Architecture / data-flow diagrams, batch execution graphs, and feature-phase graphs render as real node/edge canvases with drawn connectors; nothing is uploaded and no external asset is fetched (works offline).
- **The saving is on presentation, not substance.** Decisions, briefs, and acceptance criteria are still written — they are information. What agents stop writing is layout. `scripts/render-artefact.py <slug>` regenerates the full markdown on demand.
- **Optional and reversible.** `viewer.enabled=false` returns every skill to full-markdown output (classic mode) with no migration. Two-session handoff packages carry the JSON so a build or review session can `hyperflow view --artefacts-dir <pkg>/artefact/artefacts`.
- **Contract:** [`skills/hyperflow/artefact-data.md`](../skills/hyperflow/artefact-data.md).

---

## References

| File | Contents |
|---|---|
| `skills/hyperflow/DOCTRINE.md` | Full rule set — Layers 0–9, 12 numbered rules, red flags |
| `skills/hyperflow/artefact-data.md` | Viewer-mode emit contract — envelope, per-type payloads, mode switch, `hyperflow view` |
| `skills/hyperflow/flow-profiles.md` | The 6 flow profiles and escalation paths |
| `skills/hyperflow/personas-A.md`, `personas-B.md` | All 15 persona definitions |
| `skills/hyperflow/review-levels.md` | L1–L5 checklist |
| `skills/hyperflow/git-workflow.md` | Per-sub-task commit cadence and audit/deploy gate spec |
| `skills/hyperflow/output-style.md` | Visual language — no decorative icons; em-dash separators; bold for decision/review roles; wall-clock / cumulative / ratio formatting |
