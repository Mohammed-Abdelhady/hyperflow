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
  run: claude plugin update hyperflow@hyperflow-marketplace
```

Em-dash between phrase and version delta. Install hint indented two spaces, no icon prefix.

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

Every agent dispatch gets a label **before** the Agent tool call. Format:

```
<Role> — <short lowercase description>
```

**Reviewer and Debugger roles** wrap the role in `**bold**`:

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

Header line declares **intent** (`parallel:N` or `serial:N`). Footer line proves **execution** (wall-clock vs cumulative · ratio). The ratio is what catches a batch that *was supposed to* run parallel but actually ran serial.

**Parallel batch** (all N dispatches in one message):

```
Batch 1 — parallel:3 · standard profile · L1–L2

Searcher       — analyse existing auth patterns
Implementer    — write middleware + route guards
Writer         — generate test suite for auth
  wall-clock: 47s · cumulative: 2m 18s · ratio 0.34 — parallel
```

**Serial batch** (depends on a prior batch's output):

```
Batch 2 — serial:1 · depends on Batch 1

Implementer    — wire routes (with batch 1 learnings)
  wall-clock: 31s · cumulative: 31s · ratio 1.0 — serial (single agent)
```

**Ratio interpretation:**

| Ratio | Meaning |
|---|---|
| `≤ 0.5` | True parallel — `max(t_i)` dominates `sum(t_i)` |
| `0.5 – 0.8` | Mixed — partial overlap, some serial gates |
| `≥ 0.8` | Effectively serial — if the label said `parallel:N` this is a doctrine violation (see DOCTRINE red flags) |
| `1.0` | Pure serial — expected only when N = 1 or batch declared `serial:N` |

Rules:
- Role left-padded to the longest role in the block (typically 13 chars for `Implementer`).
- Description starts after the em-dash, lowercased.
- Single-agent dispatch — header still printed (`serial:1`) but the footer is optional.
- `wall-clock` is the elapsed real time from first `Agent()` call to last `⎿ Done`. `cumulative` is the sum of the individual agent durations reported in each `⎿ Done (... · Ym Zs)`.

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
Gates      lint pass · typecheck pass · tests pass (12)
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

### Rules

1. **Terminal only.** Never mid-batch. Never after a single sub-task while others remain. Same timing discipline as Usage.
2. **Evidence before Usage.** Always. Omitting Evidence after a terminal dispatch is a doctrine violation.
3. **Mechanical facts only.** No free-form "Done! I completed X." prose. No celebration. No AI attribution.
4. **Partial / halt still print.** Show what *did* land; mark unfinished sub-tasks `OPEN` / `FAIL` and set `Result` accordingly.
5. **Handoff builds** print this block in chat **and** write the same fields into `.hyperflow-handoff/<slug>/COMPLETION.md` (see [session-handoff.md](session-handoff.md)).
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

## 8. Usage Summary

Printed after every completed task, **after** Evidence. The summary surfaces `Wall-clock` and `Cumulative` rows so parallelism is provable from the numbers alone — without trusting the dispatch labels. Usage is cost accounting only — it does **not** replace Evidence.

```
── Hyperflow Usage ─────────────────────────────────────────
Triage                          1 agent     1.8k tokens
Spec depth: standard            1 agent     3.2k tokens
Profile: deep                   —           —
Wall-clock                      3m 47s
Cumulative                      14m 22s    (ratio 0.26 — parallel)
Escalations                     0
Total                          14 agents  243.1k tokens
────────────────────────────────────────────────────────────
```

`ratio = wall-clock / cumulative`. Lower is better for parallelism. The annotation after the ratio is one of `parallel` (≤ 0.5) / `mixed` (0.5–0.8) / `serial` (≥ 0.8) per the table in §4.

Backwards-compat: the shorter form (no Wall-clock / Cumulative rows) is acceptable for tasks with a single batch or a single agent. For tasks with 2+ batches OR 2+ parallel-eligible workers, the two rows MUST appear.

Rules:
- Top/bottom rules — `──` repeated to ~50 chars
- Agent counts right-aligned in 3-char column
- Token counts right-aligned in 7-char column, formatted as `Xk` or `X.Xk`
- Breakdown after tokens (optional): `(3 reviewers: 38.4k · 1 final: 13.7k)` — middle dots between items

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

## 13. Retry / Escalate / Abort Status Lines

Every failure-recovery transition (retry, escalation, abort) emits exactly one status line. Brackets delimit the status code — acceptable here because these are structured machine-readable tags, not decorative prefixes (same rationale as `── Hyperflow Usage ──`). No icons inside.

**Formats:**

```
[retry 1/3 · <role> · <error-class>]
[escalate → standalone review · <role> · <error-class>]
[abort · <role> · <error-class> · chain budget N/3]
```

**Examples:**

```
[retry 1/3 · Implementer · tool-error]
[escalate → standalone review · Writer · malformed-output]
[abort · Reviewer · timeout · chain budget 2/3]
```

`<error-class>` values: `tool-error` · `malformed-output` · `needs-revision` · `gate-failure` · `timeout` · `oom` · `5xx`

One line per event. Fires at the moment of transition. Full policy in [failure-recovery.md § Observability](failure-recovery.md).

## 14. Blocked Resources

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
6. **Bold for review roles.** Only `**Reviewer**` and `**Debugger**` are bolded. Workers stay plain.
