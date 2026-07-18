# Output Style Guide

Every Hyperflow output follows this visual language. Calm, elegant, no decorative icons. Em-dash, lowercase descriptions, and box-drawing rules for section separators only.

Host tools are **semantic** (`spawn`, `structured_question`, `edit`, `shell`, `usage_metrics`) — adapters map them per [runtime-contract.md](../../hyperflow/runtime-contract.md). Deploy never requires a single provider's tool string as the only valid path.

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

Print install-mode-appropriate update hints only. Never invent a provider command.

```
Hyperflow update available — v1.12.1 → v1.13.0
  run: <provider-appropriate update command>
```

| Install mode | Update hint |
|---|---|
| `claude-marketplace` | `claude plugin update hyperflow@hyperflow-marketplace` |
| `codex-marketplace` | `codex plugin marketplace upgrade hyperflow-marketplace` |
| `source-checkout` | `git pull --ff-only` (only when explicitly source) |
| unknown | omit command line; point at install docs |

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

Every agent dispatch gets a label **before** the `spawn` call (or before the labelled inline worker/reviewer phase when `spawn` is unavailable). Format:

```
<Role> — <short lowercase description>
```

**Review/decision roles** (Reviewer, Debugger) wrap the role in `**bold**`:

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

Header line declares **intent** (`parallel:N` or `serial:N`). Footer line proves **execution** (wall-clock vs cumulative · ratio).

**Parallel batch** (all N dispatches in one message when the host allows concurrent spawns):

```
Batch 1 — parallel:3 · standard profile · L1–L2

Searcher       — analyse existing auth patterns
Implementer    — write middleware + route guards
Writer         — generate test suite for auth
  wall-clock: 47s · cumulative: 2m 18s · ratio 0.34 — parallel
```

**Serial batch** (depends on a prior batch's output, or sequenced inline):

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
- `wall-clock` is elapsed real time from first spawn (or inline phase start) to last result. `cumulative` is the sum of per-agent durations from host metadata when available.
- **Never** parse a single host's UI chrome as a universal metrics source. If timings are unavailable, omit the footer or mark fields `unavailable` — never invent parallelism ratios.
- Claim `parallel:N` only when concurrent spawns actually ran; sequenced inline work is labelled `serial` or "sequenced inline".

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

## 7. Deploy push and inclusion gates

Structural gates use `structured_question` when present. Missing structured UI → exact **Hyperflow Question** chat block + end turn. Binary gates carry **no** `(Recommended)` marker.

### Push gate (`push=ask`)

```text
Hyperflow Question
Push to origin/<branch>?

1. Push — all gates pass · safe to ship
2. Hold — keep local; you can push later
```

### Commit-inclusion (pre-existing user changes)

```text
Hyperflow Question
Include uncommitted user changes in this commit?

1. Include — your local work + the pre-push fixes ship together
2. Exclude — commit only the worker fixes; user changes stay local
```

`push=auto` prints `Push: pre-elected (auto) — pushing branch + tags…` and does not re-ask.  
`push=never` / headless hold prints `Push: pre-elected (never) — branch held local` or `Push: held — interactive confirmation required` — **no** `git push`.

Never document force-push or `--no-verify` as recovery paths.

## 8. Ship Result (deploy terminal)

Printed at deploy wrap-up (success or halt). Mechanical facts only.

```
── Ship Result ───────────────────
Branch: <name>
Gates: lint pass · typecheck pass · build pass · tests pass (<n> passed)
Security: pass
Commit: <sha> <message>
Release: v<x.y.z> (or skipped)
Push: confirmed (or held)
──────────────────────────────────
```

On gate failure:

```
── Ship Result ───────────────────
Branch: <name>
Gates: lint pass · typecheck fail · build skipped · tests skipped
  typecheck: 3 errors in src/auth/middleware.ts
Halted at Step 2a
──────────────────────────────────
```

| Push field | When |
|---|---|
| `confirmed` | User chose Push, or `push=auto` completed |
| `held` | Hold / `push=never` / interactive confirmation required / non-fast-forward refuse |
| absent | Deploy halted before the push step (gate failure, security halt) |

On Hold, `Push: held` — never imply a remote update occurred.

## 9. Evidence (when chain Evidence is required)

For dispatch/handoff terminals that include deploy, Evidence still follows skills/hyperflow/output-style.md §7 (work product) and is printed **before** Usage. Deploy's Ship Result is the deploy-owned terminal block; do not invent free-form Done prose in place of either.

## 10. Usage Summary

Printed after completed agent work when cost is reported. Prefer host-reported tokens via `usage_metrics` into `scripts/usage-ledger.py`. When metrics are unavailable: print `unavailable` or mark `estimated=true` only for documented estimators — **never fabricate** tokens, durations, cache hits, agent counts, or parallelism ratios.

```
── Hyperflow Usage ─────────────────────────────────────────
Triage                          1 agent     1.8k tokens
Spec depth: standard            1 agent     3.2k tokens
Profile: deep                   —           —
Reviewers                       4 agents   52.1k tokens
Workers                         8 agents  186.0k tokens
Wall-clock                      3m 47s
Cumulative                      14m 22s    (ratio 0.26 — parallel)
Escalations                     0
Total                          14 agents  243.1k tokens
────────────────────────────────────────────────────────────
```

`ratio = wall-clock / cumulative`. Lower is better for parallelism. The annotation after the ratio is one of `parallel` (≤ 0.5) / `mixed` (0.5–0.8) / `serial` (≥ 0.8) per the table in §4. Omit ratio annotation when either duration is `unavailable`.

Backwards-compat: the shorter form (no Wall-clock / Cumulative rows) is still acceptable for tasks with a single batch or a single agent. For tasks with 2+ batches OR 2+ parallel-eligible workers, the two rows MUST appear when timings are observed; otherwise print `Wall-clock unavailable` / `Cumulative unavailable`.

Single-batch example:

```
── Usage ─────────────────────────────────────────
Reviewers                3 agents    48.1k tokens
Workers                  8 agents   186.0k tokens
Total                   11 agents   234.1k tokens
──────────────────────────────────────────────────
```

Rules:
- Top/bottom rules — `──` repeated to ~50 chars
- Role labels left-padded for columnar alignment
- Agent counts right-aligned in 3-char column
- Token counts right-aligned in 7-char column, formatted as `Xk` or `X.Xk`
- Breakdown after tokens (optional): `(3 reviewers: 38.4k · 1 final: 13.7k)` — middle dots between items
- Foreground-only work: `0 agents` when no child spawn occurred — never invent counts

## 11. Section Headers

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

## 12. Memory Output

```
[memory]  location: .hyperflow/memory/
  1  hot    auth uses JWT RS256, not HS256     (tags: auth, security)
  2  hot    zod is project-wide validation     (tags: validation, zod)
  3  warm   Postgres uses UTC timestamps       (tags: db, conventions)
```

Entry number two-space indent. Tier as plain word (`hot` / `warm` / `cold`), no brackets. Tags in parens at end.

## 13. Task File Status

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

## 14. Security Violations

```
SECURITY VIOLATION — hardcoded API key in src/config.ts:42
  Pipeline halted, review required
```

Hard halt on every host. No auto-continue into commit or push.

## 15. Blocked Resources

```
BLOCKED — worker attempted to read .env
  File is in security blocklist
```

## Formatting Rules

1. **No prose between outputs.** Status lines only. No "I'm now going to…" or "Let me…".
2. **Alignment matters.** Pad roles, model names, and counts for columnar alignment.
3. **One blank line** between different output sections (e.g., between agent labels and gates).
4. **No free-form trailing prose.** Never "Done! I completed X." For dispatch/handoff builds, work product is the structured **Evidence** block and cost is the **Usage** block (see skills/hyperflow/output-style.md §7–§8). Deploy terminals also print **Ship Result**. Never invent free-form Done prose.
5. **No decorative chars.** Em-dash for separators, middle dots for inline lists. Never `⚡`, `✓`, `✗`, `▸`, `→`, etc.
6. **Bold for review/decision roles.** Only `**Reviewer**` and `**Debugger**` are bolded. Workers stay plain.
7. **Honest metrics only.** Never present estimated values as observed; never invent push confirmation or remote state.
