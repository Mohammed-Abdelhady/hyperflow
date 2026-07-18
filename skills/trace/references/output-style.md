# Output Style Guide (trace)

Every Hyperflow output follows this visual language. Calm, elegant, no decorative icons. Em-dash, lowercase descriptions, and box-drawing rules for section separators only.

Provider-neutral: labels apply before `spawn` or before a labelled inline phase. Metrics come from host `usage_metrics` / the usage ledger only — never from parsing one host's UI chrome, never fabricated.

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
  run: <install-mode updater from session descriptor>
```

Em-dash between phrase and version delta. Install hint indented two spaces, no icon prefix. Use the updater selected for the session install mode (Claude marketplace, Codex marketplace, source checkout, etc.) — never print another host's update command as universal.

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

Every worker or reviewer step gets a label **before** `spawn` (or before the labelled inline phase). Format:

```
<Role> — <short lowercase description>
```

**Reviewer and Debugger roles** wrap the role in `**bold**`:

```
**Reviewer** — confirming re-evaluation verdict is sound
**Debugger** — 5 Whys + hypothesis ranking: auth.test.ts refresh
```

**Worker roles** (Implementer, Searcher, Writer) stay plain:

```
Searcher — reading error stack traces and logs
Implementer — verifying hypothesis 1: refresh token TTL
Writer — adding regression test for TTL drift
```

### Parallel / serial dispatch (2+ agents in same batch)

Header line declares **intent** (`parallel:N` or `serial:N`). Footer line proves **execution** (wall-clock vs cumulative · ratio) **only when timings are observed**. The ratio is what catches a batch that *was supposed to* run parallel but actually ran serial.

**Parallel batch** (independent sibling spawns in one turn when the host allows):

```
Batch 1 — parallel:3 · standard profile · evidence

Searcher       — reading error stack traces and logs
Searcher       — mapping the code paths involved
Searcher       — finding related tests (passing and failing)
  wall-clock: 47s · cumulative: 2m 18s · ratio 0.34 — parallel
```

**Serial batch** (depends on a prior batch's output, or inline-only host):

```
Batch 2 — serial:1 · depends on Batch 1

**Debugger**   — 5 Whys + hypothesis ranking
  wall-clock: 31s · cumulative: 31s · ratio 1.0 — serial (single agent)
```

**Inline fallback** (no `spawn`): use the same labels; declare `serial:N` or `sequenced inline:N`. Never claim parallel subagents when work was sequential.

**Ratio interpretation:**

| Ratio | Meaning |
|---|---|
| `≤ 0.5` | True parallel — `max(t_i)` dominates `sum(t_i)` |
| `0.5 – 0.8` | Mixed — partial overlap, some serial gates |
| `≥ 0.8` | Effectively serial — if the label said `parallel:N` this is a doctrine violation (see DOCTRINE red flags) |
| `1.0` | Pure serial — expected when N = 1, batch declared `serial:N`, or inline-only |

Rules:
- Role left-padded to the longest role in the block (typically 13 chars for `Implementer`).
- Description starts after the em-dash, lowercased.
- Single-agent dispatch — header still printed (`serial:1`) but the footer is optional.
- `wall-clock` is elapsed real time from first child start (or inline phase start) to last child completion. `cumulative` is the sum of individual phase durations when the host reports them.
- If timings or agent counts are unavailable: omit the footer or print `wall-clock: unavailable · cumulative: unavailable` — never invent numbers.

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

## 7. Debug Result (trace terminal work product)

Printed at end of a successful or halted trace chain **before** Usage. Mechanical facts only.

```
── Debug Result ─────────────────────
Bug: <one-line>
Reproducible: yes / no / intermittent
Root cause: <one-line>
Fix: <one-line summary>
Files changed: <list>
Regression test: <path or skipped · reason>
─────────────────────────────────────
```

Rules:
1. Terminal only — not mid-hypothesis.
2. No free-form "Done!" prose; no AI attribution.
3. If blocked (cannot reproduce, all hypotheses falsified after cycles): still print with honest fields; Next/Risks may live in chat status lines.
4. Symptom-patch refusal: print the refuse line, then continue full root-cause flow — never skip diagnosis.

## 8. Usage Summary

Printed after every completed task, **after** Debug Result. Agent/token rows come from the usage ledger or host `usage_metrics` when present. Prefer `scripts/usage-ledger.py summary` when available. **Never** reconstruct tokens from scrollback prose. **Never** fabricate Codex/Claude/OpenCode counters.

```
── Hyperflow Usage ─────────────────────────────────────────
Triage                          1 agent     1.8k tokens
Reviewers                       4 agents   52.1k tokens
Workers                         8 agents  186.0k tokens
Wall-clock                      3m 47s
Cumulative                      14m 22s    (ratio 0.26 — parallel)
Escalations                     0
Total                          14 agents  243.1k tokens
────────────────────────────────────────────────────────────
```

When metrics are missing:

```
── Hyperflow Usage ─────────────────────────────────────────
Agents                          unavailable
Tokens                          unavailable
Wall-clock                      unavailable
Cumulative                      unavailable
Estimated records               n/a
────────────────────────────────────────────────────────────
```

Or mark partial estimates with `estimated=true` only when doctrine estimators run — never present estimates as observed data.

`ratio = wall-clock / cumulative`. Annotation: `parallel` (≤ 0.5) / `mixed` (0.5–0.8) / `serial` (≥ 0.8). Omit ratio when either side is unavailable.

Backwards-compat: the shorter form (no Wall-clock / Cumulative rows) is acceptable for single-agent traces. For 2+ parallel-eligible workers, print the two rows when timings exist; otherwise print `unavailable`.

Rules:
- Top/bottom rules — `──` repeated to ~50 chars
- Role labels left-aligned, counts right-aligned in 3-char column
- Token counts right-aligned in 7-char column, formatted as `Xk` or `X.Xk`
- Breakdown after tokens (optional): `(3 reviewers: 38.4k · 1 final: 13.7k)` — middle dots between items
- Inline-only diagnosis: agent count may be `0 agents` for spawn children plus explicit foreground phases — never invent parallel child counts

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
4. **No free-form trailing prose.** Never "Done! I completed X." Trace work product is the **Debug Result** block; cost is the **Usage** block. Neither invents missing data.
5. **No decorative chars.** Em-dash for separators, middle dots for inline lists. Never `⚡`, `✓`, `✗`, `▸`, `→`, etc.
6. **Bold for decision roles.** Only `**Reviewer**` and `**Debugger**` are bolded. Workers stay plain.
