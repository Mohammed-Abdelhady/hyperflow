## Examples

Worked transcripts for `/hyperflow:audit`. Illustrative only — behaviour is defined by `skills/audit/SKILL.md`, [chain-router.md](../../hyperflow/chain-router.md), and [runtime-contract.md](../../hyperflow/runtime-contract.md). Examples distinguish **native** vs **fallback** mechanics without changing gate semantics.

### 1. Default — uncommitted changes at L2 · Claude (native tools)

Native `spawn` (Claude `Agent`), native `structured_question` (Claude `AskUserQuestion`), native `skill_continuation` (Claude `Skill`).

```
/hyperflow:audit

Searcher — map working-tree surface
Searcher — convention scan
**Reviewer** — aggregate context coverage
**Reviewer** — L1+L2 auth middleware group A
**Reviewer** — L1+L2 auth middleware group B
Writer — critical findings evidence
Writer — important findings fix-path
Writer — anti-pattern curation

── Audit Result ──────────────────────
Scope:    git diff HEAD + git diff --staged (3 files)
Level:    L2
Verdict:  NEEDS_FIX
Findings: 1 Critical · 1 Important · 1 Suggestions · 0 Praise
Written:  .hyperflow/audits/2026-07-18-1400-uncommitted.md
──────────────────────────────────────

── Hyperflow Usage ───────────────────
Context                        2 agents     4.1k tokens
Review                         3 agents    11.0k tokens
Synthesis                      3 agents     6.2k tokens
Total                          8 agents    21.3k tokens
──────────────────────────────────────

[ structured_question / AskUserQuestion popup ]

?  Audit findings written to .hyperflow/audits/2026-07-18-1400-uncommitted.md — apply fixes?
   Fix all (Recommended)   — Critical + Important + Suggestions via /hyperflow:plan → /hyperflow:dispatch
   Critical + Important    — skip Suggestions
   Critical only           — fix the must-haves
   No, leave as-is         — stop; handle manually

[ user picks Fix all ]

skill_continuation → plan  session=one spec=.hyperflow/specs/audit-2026-07-18-uncommitted.md
(plan still stops at its own build-location gate — no blind patch)
```

### 2. Codex — same NEEDS_FIX · chat gate fallback (no structured UI)

`spawn` may map to collaboration tools or fall back to labelled inline phases. `structured_question` is **unavailable** as a popup → exact Hyperflow Question block + **end turn**. Never silent-default a fix choice. Never invent usage tokens.

```
/hyperflow:audit

Batch 1 — serial:2 · sequenced inline · audit L2
Searcher       — map working-tree surface
Searcher       — convention scan
  wall-clock: unavailable · cumulative: unavailable — sequenced inline

**Reviewer** — L1+L2 standalone review

── Audit Result ──────────────────────
Scope:    git diff HEAD + git diff --staged (3 files)
Level:    L2
Verdict:  NEEDS_FIX
Findings: 1 Critical · 1 Important · 1 Suggestions · 0 Praise
Written:  .hyperflow/audits/2026-07-18-1405-uncommitted.md
──────────────────────────────────────

── Hyperflow Usage ───────────────────
Context                        2 agents     unavailable
Review                         1 agent      unavailable
Synthesis                      1 agent      unavailable
Estimated records                          n/a — usage_metrics unavailable
Wall-clock                      unavailable
Cumulative                      unavailable
Total                           4 agents    unavailable
──────────────────────────────────────

Hyperflow Question
Audit findings written to .hyperflow/audits/2026-07-18-1405-uncommitted.md — apply fixes?

1. Fix all (Recommended) — Critical + Important + Suggestions via /hyperflow:plan → /hyperflow:dispatch
2. Critical + Important — skip Suggestions, fix the rest
3. Critical only — fix the must-haves, defer the nice-to-haves
4. No, leave as-is — stop; handle manually

[ turn ends — wait for the user's next message ]
```

On the next turn, if the user answers `1` / `Fix all`:

1. Write `.hyperflow/specs/audit-2026-07-18-uncommitted.md` from the chosen findings.
2. `skill_continuation` → load `skills/plan/SKILL.md` **completely** (native Skill tool is often absent on Codex) and continue inline with `session=one spec=.hyperflow/specs/audit-2026-07-18-uncommitted.md`.
3. Plan still owns the **build-location** gate — no implementation in the audit turn, no blind patch.

If the user answers `4` / `No`:

```
Audit complete — 3 findings recorded, no fixes applied. Re-run /hyperflow:audit later or invoke /hyperflow:plan manually if you change your mind.
```

### 3. OpenCode — Task available · Hyperflow Question still used when structured UI missing

When OpenCode exposes `Task` / `subagent`, worker and reviewer remain **separate** roles. Fix-gate mechanics match Codex when structured question UI is absent.

```
/hyperflow:audit src/payments --level 3

spawn/Task — Searcher surface map
spawn/Task — **security-reviewer** L3
spawn/Task — **backend-reviewer** L3

── Audit Result ──────────────────────
Scope:    src/payments/** (12 files)
Level:    L3
Verdict:  PASS
Findings: 0 Critical · 0 Important · 2 Suggestions · 1 Praise
Written:  .hyperflow/audits/2026-07-18-1410-payments.md
──────────────────────────────────────
Audit clean — no fixes needed.
```

No fix gate when there are no Critical/Important findings. Suggestions remain in the file.

### 4. OpenCode inline-only · SECURITY_VIOLATION (no fix gate)

```
/hyperflow:audit --level 3

**Reviewer** — L3 security scan (inline labelled phase)

SECURITY VIOLATION — hardcoded API key in src/config.ts:42
  Pipeline halted, review required

[ no Hyperflow Question fix gate ]
[ no skill_continuation to plan ]
[ user decides remediation ]
```

### 5. PR range review · native Claude chain from `/hyperflow:pr`

```
/hyperflow:audit main..pr-145 --level 3

(reviews exactly the PR base..head range; same file-first summary + fix gate contract)
```

### 6. Hot memory injection (provider-invariant)

Given `.hyperflow/memory/anti-patterns.md` and hot learnings tagged `auth` / `security`:

```
[memory]  location: .hyperflow/memory/
  1  hot    auth uses JWT RS256, not HS256     (tags: auth, security)
  2  hot    avoid == for secrets               (tags: security, gotcha)
```

Audit Searchers and Reviewers receive the **same** scoped injection under Claude, Codex, and OpenCode. Lean mode may load by path/tag rather than full-body dump; the set of matching entries does not change by provider.

### 7. Metrics absent (Codex / empty usage_metrics)

When the host does not expose token accounting:

```
── Hyperflow Usage ───────────────────
Profile: audit L2              budget n/a
Review                         1 agent      unavailable
Estimated records                          n/a — usage_metrics unavailable
Wall-clock                      unavailable
Cumulative                      unavailable
Total                           1 agent     unavailable
──────────────────────────────────────
```

Never invent tokens, ratios, or fake cache hits.

## Gate semantics (frozen)

| Situation | Gate |
|---|---|
| NEEDS_FIX with Critical/Important | Fix gate **must** fire (`structured_question` or Hyperflow Question) |
| PASS with only Suggestions/Praise | Skip fix gate; print clean summary |
| `SECURITY_VIOLATION` | Hard halt; **skip** fix gate |
| Fix choice selected | `skill_continuation` → **plan** with scoped audit-fix spec; plan owns build-location |
| No interactive channel at fix gate | Print findings + error line; never silent auto-fix or silent exit |

## Resources

- [DOCTRINE.md](../../hyperflow/DOCTRINE.md) — orchestration rules (structural gates, per-step agents, no model-tier routing)
- [runtime-contract.md](../../hyperflow/runtime-contract.md) — spawn, structured_question, skill_continuation, usage_metrics
- [chain-router.md](../../hyperflow/chain-router.md) — audit → plan edge; retired `spec`/`scope` banned
- [review-levels.md](review-levels.md) — full checklist for L1–L5
- [reviewer-prompt.md](reviewer-prompt.md) — reviewer template
- [security.md](security.md) — security scan policy (mandatory at L3+)
- [memory-system.md](memory-system.md) — how patterns are persisted
- [output-style.md](output-style.md) — labels, usage honesty, chat gate shape
