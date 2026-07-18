# Output Style Guide

Every Hyperflow output follows this visual language. Calm, elegant, no decorative icons. Em-dash, lowercase descriptions, and box-drawing rules for section separators only.

## Allowed Characters

| Symbol | Use |
|---|---|
| `—` | Em-dash separator between role/label and description |
| `·` | Subtle separator in inline lists (e.g. `pass · skipped · pass`) |
| `─` | Horizontal rule for top/bottom of summary blocks |
| `│├└` | Tree connectors in flow diagrams |

## Banned Characters

These must **never** appear in user-facing output:

`⚡` `✓` `✗` `▸` `→` `•` (as bullet prefix) `🚀` `📦` `⚠️` `🟢` `🔴` `*` (when used as a label prefix)

The only exception: code blocks may contain whatever the user's code contains. Banned-char rules apply to status lines, agent labels, summaries, and any text the skill outputs directly.

## 1. Session Banner

```
Hyperflow v1.12.1
```

One line. Version only.

## 2. Update Notification

```
Hyperflow update available — v1.12.1 → v1.13.0
  run: <provider-appropriate update command>
```

Em-dash between phrase and version delta. Install hint indented two spaces, no icon prefix. The concrete update command comes from the session provider (`claude plugin update …`, `codex plugin marketplace upgrade …`, source `git pull --ff-only`, etc.) — never invent a host command that is not the resolved updater.

## 3. Analysis Cache Status

### Fresh (skip)
```
Analysis cache fresh — skipping
```

### Partial refresh
```
Refreshing — profile.md, dependencies.md
```

### Full analysis
```
Analyzing project — 6 searchers in parallel
Cached — no incomplete tasks
```

### Incomplete tasks found
```
Incomplete tasks from prior session:
  implement-auth.md       3/5 sub-tasks done
  fix-login-bug.md        1/3 sub-tasks done
```

Two-space indent, no bullet prefix.

## 4. Agent Dispatch Labels

Every agent dispatch gets a label **before** the `spawn` call (or before the labelled inline phase when `spawn` is unavailable). Format:

```
<Role> — <short lowercase description>
```

**Reviewer and Debugger roles** wrap in `**bold**`:

```
**Reviewer** — reviewing auth middleware output
**Debugger** — investigating test failure in auth.test.ts
```

**Worker roles** (Implementer, Searcher, Writer) stay plain:

```
Implementer — creating auth middleware
Searcher — finding related test files
Writer — generating API documentation
```

### Parallel / serial dispatch (2+ agents in same batch)

Header line declares **intent** (`parallel:N` or `serial:N`). Footer line proves **execution** (wall-clock vs cumulative · ratio) **only when those durations are actually observed**. The ratio is what catches a batch that *was supposed to* run parallel but actually ran serial.

**Parallel batch** (true concurrent spawns when the host supports them; otherwise claim is intent-only until footer proves it):

```
Batch 1 — parallel:3 · standard profile · L1–L2

Searcher       — analyse existing auth patterns
Implementer    — write middleware + route guards
Writer         — generate test suite for auth
  wall-clock: 47s · cumulative: 2m 18s · ratio 0.34 — parallel
```

**Serial batch** (depends on a prior batch's output, or inline sequenced phases):

```
Batch 2 — serial:1 · depends on Batch 1

Implementer    — wire routes (with batch 1 learnings)
  wall-clock: 31s · cumulative: 31s · ratio 1.0 — serial (single agent)
```

**Inline fallback (no spawn):** still print distinct worker then `**Reviewer**` labels. Header may say `serial:N · inline` — never claim `parallel:N` for purely sequential inline phases.

**Ratio interpretation:**

| Ratio | Meaning |
|---|---|
| `≤ 0.5` | True parallel — `max(t_i)` dominates `sum(t_i)` |
| `0.5 – 0.8` | Mixed — partial overlap, some serial gates |
| `≥ 0.8` | Effectively serial — if the label said `parallel:N` this is a doctrine violation (see DOCTRINE red flags) |
| `1.0` | Pure serial — expected only when N = 1 or batch declared `serial:N` / inline |

Rules:
- Role left-padded to the longest role in the block (typically 13 chars for `Implementer`).
- Description starts after the em-dash, lowercased.
- Single-agent dispatch — header still printed (`serial:1`) but the footer is optional.
- **Duration sources are host-observed only.** `wall-clock` is elapsed real time from first child start (or first inline phase) to last child settle; `cumulative` is the sum of per-child durations **when the host or ledger exposes them**. Prefer ledger / provider metadata via the `usage_metrics` op ([runtime-contract.md](../../hyperflow/runtime-contract.md)).
- **Never parse a single host's UI chrome as a universal metrics source** (e.g. Claude `⎿ Done (... · Ym Zs)` lines are Claude-only UI; Codex and other hosts may report nothing). If durations or tokens are not available: omit the ratio footer, or print `wall-clock: unavailable · cumulative: unavailable` — never invent numbers to look complete.
- Parallelism claims require true concurrent spawns **or** explicit `serial:N · inline` / `sequenced inline` wording. Never claim parallel subagents when work was serial.

## 5. Agent Progress

For long batches (3+ agents, multi-minute), print a running indicator with middle dots:

```
running···  done
```

Skip for single-agent or fast dispatches.

## 6. Quality Gates

Single line, all gates separated by middle dots:

```
gates — lint: pass · typecheck: pass · tests: pass · build: pass
```

On failure:

```
gates — lint: pass · typecheck: fail · tests: skipped · build: skipped
  typecheck: 3 errors in src/auth/middleware.ts
```

Use `pass` / `fail` / `skipped` as plain words. No `✓` / `✗` / `—`. Detail lines indented two spaces.

## 7. Evidence (work product)

Printed at every **terminal** dispatch / handoff-build completion — full, partial, or halt-after-work — **immediately before** the Usage block. Evidence proves **what landed**. Usage proves **cost / parallelism**. They are not interchangeable.

Canonical field list, caps, edge rows, and timing rules: mirror of [`../../hyperflow/output-style.md`](../../hyperflow/output-style.md) §7. Keep this file aligned when that section changes.

```
── Hyperflow Evidence ──────────────────────────────────────
Result     built · 8/8 sub-tasks
Branch     feat/example-slug
Commits    8  a1b2c3d feat(x): add middleware · b2c3d4e fix(y): guard edge · …
Files      12 changed · +340/-80
  skills/dispatch/SKILL.md
  skills/hyperflow/output-style.md
  … +10 more
Sub-tasks
  T1 PASS — author Evidence section in output-style
  T2 PASS — mirror Evidence contract into dispatch references
Gates      tier standard · B1 affected pass · chain-end full pass (lint · tsc · test · build)
Reviews    batch 1 PASS L1–L2 · final PASS
Risks      none
Next       audit/deploy gates
────────────────────────────────────────────────────────────
```

### Required rows

| Row | Content |
|---|---|
| `Result` | `built` · `partial (k/n)` · or `halted · <reason>` plus done/total sub-tasks |
| `Branch` | branch at wrap-up |
| `Commits` | count, then short SHAs + subjects (cap **12** listed, then `… +N more`). `commit=none` → `none (commit=none) · working tree dirty` |
| `Files` | change count + `+ins/-del`, then paths (cap **20** listed, then `… +N more`) |
| `Sub-tasks` | every roster line: `T<id> PASS\|FAIL\|OPEN\|SKIPPED — <one-line what landed>` (one-liner from worker return, else commit subject) |
| `Gates` | lint / typecheck / tests outcomes for the chain (or last batch if only one ran) |
| `Reviews` | per-batch verdicts + levels; final integration PASS/FAIL **or** skip reason (`final skipped — first-try PASS · no escalations`) |
| `Risks` | `none` or residual Important notes / partials / escalations |
| `Next` | audit/deploy pending · handoff review instructions · remaining phases · ready-to-run recovery commands |

### Rules (dispatch-critical)

1. **Terminal only.** Never mid-batch. Never after a single sub-task while others remain.
2. **Evidence before Usage.** Always. Omitting Evidence after a terminal dispatch is a doctrine violation.
3. **Mechanical facts only.** No free-form "Done! I completed X." prose. No celebration. No AI attribution.
4. **Partial / halt still print.** Show what *did* land; mark unfinished sub-tasks `OPEN` / `FAIL` and set `Result` accordingly.
5. **Handoff builds** print this block in chat **and** write the same fields into `.hyperflow-handoff/<slug>/COMPLETION.md`.
6. **Feature `--phases=next`:** Evidence covers the completed phase only; `Next` names remaining phases.
7. **Allowed characters only** (see top of this file). Use `·` separators and `──` rules; never decorative icons.

### Edge rows

| Situation | Evidence behaviour |
|---|---|
| `commit=none` | Commits = dirty-tree note; Files from `git status` / unstaged diff |
| `commit=single` / `per-batch` | List commits that actually exist (not invented per-sub-task SHAs) |
| Zero file changes | `Files 0 changed · +0/-0`; still list Sub-tasks |
| D7 final-integration skip | Reviews includes skip reason; Evidence still required |
| SECURITY halt after some commits | `Result halted · security`; list landed commits only |
| `--final-only` | Sub-tasks may be `n/a — final-only`; Reviews carries the pass |
| Metrics unavailable | Usage says `unavailable` / `estimated`; Evidence still lists real git commits |

## 8. Usage Summary

Printed after every completed task, **after** Evidence. Usage is cost accounting only — it does **not** replace Evidence.

**Honesty rules (mandatory):**

1. Prefer host-reported input/output/cache tokens when the `usage_metrics` op exposes them; record into `.hyperflow/usage/<chain-id>.jsonl` via `scripts/usage-ledger.py`.
2. Agent/token rows come from `scripts/usage-ledger.py summary` when the ledger has records. Never reconstruct token counts from scrollback, task prose, or a single host's UI chrome.
3. When provider metadata is missing: print `unavailable` for that field, or use the doctrine estimator with `estimated=true` and never present the estimate as exact observed data. Show a non-zero `Estimated records` count when any estimate was used.
4. Never invent agent counts for foreground-only work (inline-fast shows `0 agents` plus the foreground review; tokens `n/a` / unavailable).
5. Never invent parallelism ratios, cache hits, or wall-clock numbers to fill the table.
6. Usage / Evidence print only at terminal wrap-up or hard halt — never mid-batch as a fake completion.

```
── Hyperflow Usage ─────────────────────────────────────────
Profile: standard              budget 50.0k
Triage                         1 agent      1.8k tokens
Planning                       2 agents     8.2k tokens
Execution                      3 agents    24.0k tokens
Review                         2 agents     7.5k tokens
Verification                   1 agent      3.0k tokens
Duplicate context                          5.4k · 12.7%
Cache hit                                   31.0%
Retry cost                                  2.1k tokens
Accepted commits                           2 · 21.4k tokens/commit
Estimated records                          0
Wall-clock                      3m 47s
Cumulative                      14m 22s    (ratio 0.26 — parallel)
Escalations                     0
Total                           9 agents    44.5k tokens
Ledger                          .hyperflow/usage/<chain-id>.jsonl
────────────────────────────────────────────────────────────
```

When the host returns no token metadata and estimation was not applied:

```
── Hyperflow Usage ─────────────────────────────────────────
Profile: standard
Execution                      3 agents    unavailable
Review                         1 agent     unavailable
Wall-clock                     unavailable
Cumulative                     unavailable
Estimated records              0
Total                          4 agents    unavailable
Ledger                         .hyperflow/usage/<chain-id>.jsonl
────────────────────────────────────────────────────────────
```

`ratio = wall-clock / cumulative` **only when both are observed**. Lower is better for parallelism. The annotation after the ratio is one of `parallel` (≤ 0.5) / `mixed` (0.5–0.8) / `serial` (≥ 0.8) per the table in §4. Omit ratio when either duration is unavailable.

Backwards-compat: the shorter form (no Wall-clock / Cumulative rows) is acceptable for tasks with a single batch or a single agent — there's nothing to parallelise. For tasks with 2+ batches OR 2+ parallel-eligible workers, the two rows MUST appear **or** explicitly read `unavailable`.

Rules:
- Top/bottom rules — `──` repeated to ~50 chars
- Agent counts right-aligned in 3-char column
- Token counts right-aligned in 7-char column, formatted as `Xk` or `X.Xk`, or the word `unavailable`
- Breakdown after tokens (optional): `(3 reviewers: 38.4k · 1 final: 13.7k)` — middle dots between items
- Phase names are exactly `Triage`, `Planning`, `Execution`, `Review`, `Verification`; omit only zero phases
- Duplicate-context ratio = repeated `context_tokens` (same non-empty hash after its first occurrence in that chain) ÷ total input tokens when both known; otherwise `unavailable`
- `Accepted commits` and tokens/commit come from ledger `accepted_commit`; never infer commit count from prose
- Inline-fast prints `Profile: fast · inline foreground`, `0 agents`, `Total 0 agents · tokens n/a`, affected-gate results, and the one accepted commit in Evidence. It has no ledger row because no agent call occurred

## 9. Section Headers

Lowercase bracketed labels for structured multi-line blocks only:

```
[layers]
[skills]
[detection]
[memory]
[gates]
[capabilities]
```

Use sparingly. Never use as a decorative prefix on a single status line.

## 10. Memory Output

```
[memory]  location: .hyperflow/memory/
  1  hot    auth uses JWT RS256, not HS256     (tags: auth, security)
  2  hot    zod is project-wide validation     (tags: validation, zod)
  3  warm   Postgres uses UTC timestamps       (tags: db, conventions)
```

Entry number two-space indent. Tier as plain word (`hot` / `warm` / `cold`), no brackets. Tags in parens at end.

## 11. Task File Status

When creating/updating task files:

```
Task: implement-auth (3 sub-tasks)
  Write auth middleware          pending
  Add route guards               pending
  Generate test suite            pending
```

After completion:

```
Task complete — implement-auth (3/3)
```

No bullet prefixes. Status word right-padded for column alignment.

## 12. Security Violations

```
SECURITY VIOLATION — hardcoded API key in src/config.ts:42
  Pipeline halted, review required
```

## 13. Blocked Resources

```
BLOCKED — worker attempted to read .env
  File is in security blocklist
```

## Formatting Rules

1. **No prose between outputs.** Status lines only. No "I'm now going to…" or "Let me…".
2. **Alignment matters.** Pad roles, model names, and counts for columnar alignment.
3. **One blank line** between different output sections (e.g., between agent labels and gates).
4. **No free-form trailing prose.** Never "Done! I completed X." Work product is the structured **Evidence** block (§7). Cost is the **Usage** block (§8). Both are mandatory at terminal dispatch; neither replaces the other.
5. **No decorative chars.** Em-dash for separators, middle dots for inline lists. Never `⚡`, `✓`, `✗`, `▸`, `→`, etc.
6. **Bold for Reviewer and Debugger.** Only `**Reviewer**` and `**Debugger**` are bolded. Workers stay plain.
7. **Honest metrics only.** Unavailable host metrics stay `unavailable` (or estimated + flagged) — never pad with fabricated Claude UI or Codex token counts.
