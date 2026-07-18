# Output Style Guide (Audit)

Every Hyperflow output follows this visual language. Calm, elegant, no decorative icons. Em-dash, lowercase descriptions, and box-drawing rules for section separators only. Semantic ops and honest metrics come from [runtime-contract.md](../../hyperflow/runtime-contract.md); the full canonical guide lives in [../../hyperflow/output-style.md](../../hyperflow/output-style.md). This file keeps the audit-facing subset substantial so audit runs stay consistent without loading the full dispatch Evidence contract.

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

Em-dash between phrase and version delta. Install hint indented two spaces, no icon prefix. Prefer the update path from `config/providers.json` for the detected provider — do not hardcode a single host's marketplace command as universal.

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

Every agent dispatch gets a label **before** the host `spawn` (or before a labelled inline worker/reviewer phase when `spawn` is unavailable). Format:

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

Header line declares **intent** (`parallel:N` or `serial:N`). Footer line proves **execution** (wall-clock vs cumulative · ratio) **only when timings are observed**. The ratio is what catches a batch that *was supposed to* run parallel but actually ran serial.

**Parallel batch** (true concurrent spawns when the host allows):

```
Batch 1 — parallel:3 · audit L3 · L1–L3

Searcher       — map auth surface
Searcher       — convention scan
**Reviewer**   — aggregate context coverage
  wall-clock: 47s · cumulative: 2m 18s · ratio 0.34 — parallel
```

**Serial / inline fallback** (`spawn` unavailable — sequenced labelled phases):

```
Batch 2 — serial:2 · sequenced inline · depends on Batch 1

**Reviewer**   — L1+L2 file group A
**Reviewer**   — L1+L2 file group B
  wall-clock: unavailable · cumulative: unavailable — sequenced inline
```

**Ratio interpretation (only when both wall-clock and cumulative are observed):**

| Ratio | Meaning |
|---|---|
| `≤ 0.5` | True parallel — `max(t_i)` dominates `sum(t_i)` |
| `0.5 – 0.8` | Mixed — partial overlap, some serial gates |
| `≥ 0.8` | Effectively serial — if the label said `parallel:N` this is a doctrine violation |
| `1.0` | Pure serial — expected only when N = 1 or batch declared `serial:N` |

Rules:
- Role left-padded to the longest role in the block (typically 13 chars for `Implementer`).
- Description starts after the em-dash, lowercased.
- Single-agent dispatch — header still printed (`serial:1`) but the footer is optional.
- **Parallelism claims require either true concurrent `spawn`s or explicit "sequenced inline" wording** — never claim parallel subagents when work was serial ([runtime-contract.md](../../hyperflow/runtime-contract.md)).
- `wall-clock` / `cumulative` come from host-reported completion metadata, the usage ledger, or other **observed** timers. Never parse a single host's UI chrome (e.g. Claude `⎿ Done` lines) as a universal duration source. When timing is missing, print `unavailable` — do not fabricate seconds or ratios.

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

## 7. Audit Result (chat summary — file-first)

Audit is **file-first** (DOCTRINE rule 8). The chat box points at the audit file; it does **not** paste finding bodies.

```
── Audit Result ──────────────────────
Scope:    main..HEAD (13 files)
Level:    L3
Verdict:  NEEDS_FIX
Findings: 0 Critical · 4 Important · 4 Suggestions · 5 Praise
Written:  .hyperflow/audits/2026-05-16-1730-memory-compaction.md
─────────────────────────────────────
```

Clean pass (no Critical/Important):

```
Audit clean — no fixes needed.
```

Still write the audit file with Praise / Suggestions when those exist so history is preserved.

## 8. Usage Summary (honest metrics)

Semantic op: **`usage_metrics`** ([runtime-contract.md](../../hyperflow/runtime-contract.md)). Prefer host-reported input/output/cache tokens when the inventory exposes them. When estimating, set `estimated=true` and preserve `total_tokens = input_tokens + output_tokens`. **Never fabricate** tokens, durations, parallelism ratios, cache hits, or agent counts as observed data. Never parse Claude (or any host) completion UI text as a universal usage source.

Printed after the audit terminal wrap-up (after the chat summary / fix-gate prompt), not mid-review.

```
── Hyperflow Usage ─────────────────────────────────────────
Profile: audit L3              budget n/a
Context                        3 agents     8.2k tokens
Review                         4 agents    22.0k tokens
Synthesis                      3 agents     9.1k tokens
Estimated records                          0
Wall-clock                      2m 10s
Cumulative                      6m 40s    (ratio 0.33 — parallel)
Escalations                     0
Total                          10 agents   39.3k tokens
────────────────────────────────────────────────────────────
```

When host metrics are missing (common on Codex and other portable hosts with empty `usage_metrics` candidates), print explicit unavailability:

```
── Hyperflow Usage ─────────────────────────────────────────
Profile: audit L3              budget n/a
Context                        3 agents     unavailable
Review                         4 agents     unavailable
Synthesis                      2 agents     unavailable
Estimated records                          n/a — usage_metrics unavailable
Wall-clock                      unavailable
Cumulative                      unavailable
Escalations                     0
Total                           9 agents    unavailable
────────────────────────────────────────────────────────────
```

`ratio = wall-clock / cumulative` **only when both sides are observed**. If either side is `unavailable`, omit the ratio (or print `ratio unavailable`) — never invent one.

Rules:
- Top/bottom rules — `──` repeated to ~50 chars
- Agent counts right-aligned in 3-char column
- Token counts right-aligned in 7-char column, formatted as `Xk` / `X.Xk`, or the literal word `unavailable`
- Audit does not invent Evidence rows from dispatch §7 unless a build actually ran via the fix-gate → plan → dispatch path (then that skill owns Evidence)

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

When creating/updating task files (e.g. after fix-gate → plan):

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

Hard halt. **No fix gate.** Do not auto-chain to plan.

## 13. Blocked Resources

```
BLOCKED — worker attempted to read .env
  File is in security blocklist
```

## 14. Fix Gate (structural — chat form when structured UI missing)

Prefer native `structured_question` when present. When absent (Codex default, OpenCode, Grok, many portable hosts), print the exact Hyperflow Question block and **end the turn** — never silent-default a fix choice:

```
Hyperflow Question
Audit findings written to .hyperflow/audits/<timestamp>-<slug>.md — apply fixes?

1. Fix all (Recommended) — Critical + Important + Suggestions via /hyperflow:plan → /hyperflow:dispatch
2. Critical + Important — skip Suggestions, fix the rest
3. Critical only — fix the must-haves, defer the nice-to-haves
4. No, leave as-is — stop; handle manually
```

Binary action gates elsewhere (`Yes/No`, `Push/Hold`) carry **no** `(Recommended)` marker. This multi-option fix gate **does** mark a recommended option first. See [chain-router.md](../../hyperflow/chain-router.md) and audit SKILL Step 6.

## Formatting Rules

1. **No prose between outputs.** Status lines only. No "I'm now going to…" or "Let me…".
2. **Alignment matters.** Pad roles and counts for columnar alignment.
3. **One blank line** between different output sections (e.g., between agent labels and gates).
4. **No free-form trailing prose.** Never "Done! I completed X." Audit work product is the **audit file** + the short chat summary; cost is the **Usage** block. Never invent free-form Done prose.
5. **No decorative chars.** Em-dash for separators, middle dots for inline lists. Never `⚡`, `✓`, `✗`, `▸`, `→`, etc.
6. **Bold for review roles.** Only `**Reviewer**` and `**Debugger**` are bolded. Workers stay plain.
7. **Metrics honesty.** `unavailable` beats a fabricated number. Always.

## Related

- [../../hyperflow/output-style.md](../../hyperflow/output-style.md) — full Evidence + Usage contract
- [../../hyperflow/runtime-contract.md](../../hyperflow/runtime-contract.md) — usage_metrics + structured_question
- [../../hyperflow/chain-router.md](../../hyperflow/chain-router.md) — audit fix gate edge
