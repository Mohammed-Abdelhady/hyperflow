# Quality Gates

Automated checks that must pass before a worker's output is approved. Layer 5 of the doctrine.

Large / multi-batch ("full") changes must get a thorough lint + test pass — **once at chain end**, not a full-project suite on every batch. Small changes stay cheap (affected files only).

## Flow

```
Per batch (Step 2c) — always LIGHT
  Worker output PASSed review
      │
      ▼
  Lint + typecheck + tests on *affected files only*
      │
  fail → fix loop (max 3) → re-run
      │
  pass → commit / next batch

After final integration review (Step 3.5) — by tier
  tier = light     → skip chain-end suite (one status line)
  tier = standard  → FULL suite once (lint + typecheck + full tests + build if present)
  tier = full      → same FULL suite, fail-fast order, richer Evidence detail

Deploy (later, independent)
  Always full pre-push suite — does NOT trust-skip because dispatch already ran
```

## Checks (auto-detect)

Scan the project's `package.json` scripts and config files:

| Check | Detection | Light (affected) | Full (chain-end / deploy) |
|-------|-----------|------------------|---------------------------|
| Lint | `eslint.config.*` or `scripts.lint` | lint paths/files touched | full project lint |
| Typecheck | `tsconfig.json` / `scripts.typecheck` | tsc on project or affected packages | full typecheck |
| Tests | vitest/jest/pytest/cargo test / `scripts.test` | tests for touched modules | full unit suite (+ integration when configured) |
| Build | `scripts.build` | skip | run once at chain-end (standard+) and deploy |

If **no** detectors fire (docs-only plugin repos, pure markdown): print `Gates n/a — no project gate scripts` and continue. Optional project add-ons (e.g. `python3 scripts/validate-plugin.py`) via CLAUDE.md `add:`.

## Tiers

Resolve **once** at dispatch Step 1 (after the task file loads). Print:

```
Gates tier: <light|standard|full> · per-batch affected · chain-end <full suite|skipped>
```

Override with chain arg `gates=light|standard|full` when present (wins over auto).

### Selection (highest match wins)

| Tier | Signals (any) |
|------|----------------|
| **full** | profile ∈ {`deep`, `scientific`} · OR ≥ 16 files in roster · OR ≥ 3 batches · OR multi-subsystem · OR triage `security: true` · OR `--thorough` |
| **standard** | multi-batch · OR 4–15 files · OR complexity medium · OR default when not light |
| **light** | single batch ∧ ≤ 3 sub-tasks ∧ ≤ 5 files ∧ profile ∈ {`fast`, `standard`} ∧ no security/integration_risk flags |

File count = planned files from the task roster (union of sub-task `files`), not only batch 1.

### What runs

| Moment | light | standard | full |
|--------|-------|----------|------|
| Per-batch Step 2c | affected lint+typecheck+tests | same | same |
| Chain-end Step 3.5 | **skip** | full lint + typecheck + full tests (+ build if any) | same + fail-fast lint→typecheck→tests→build |
| Deploy | full pre-push (always) | always | always |

## Mid-batch ban

On multi-batch runs, or whenever tier is `standard` or `full`:

- **Do not** run full-project `lint` / full test suite in Step 2c.
- **Do not** invent "run the whole CI" after every sub-task.

That is a doctrine violation — it is the "a lot of lint and test checks" failure mode on large changes.

Light single-batch work may still prefer affected-only (not full suite) unless `gates=full` was forced.

## Chain-end suite (dispatch Step 3.5)

Runs **after** Step 3 final integration review (or D7 skip line) and **before** Step 4 Evidence/Usage.

- Independent of D7: skipping final *review* does **not** skip chain-end *gates* when tier ≥ standard.
- Worker runs the full suite; Reviewer judges output (`PASS` / `NEEDS_FIX`).
- On fail: fix loop max 3; land additional conventional commits (never amend history).
- Feature mode `--phases=next`: run chain-end for the completed phase only.

## Failure handling

1. Gate fails → Reviewer extracts the error
2. Worker fixes → gates re-run
3. Max 3 retry loops per gate phase (2c or 3.5)
4. After 3 failures → escalate / surface to the user

Never `--no-verify`. Never skip a red gate silently.

## Configuration

Project `CLAUDE.md` (or session say):

```markdown
## Hyperflow Quality Gates
- skip: typecheck
- add: pnpm format --check
```

Or: `hyperflow: skip typecheck for this session` · `gates=full` as chain arg.

## Worker prompt addition

When quality gates are active, append:

```
## Quality Requirements
- Pass lint and typecheck on files you touch
- Pass tests for modules you touch (affected-only mid-batch)
- Do NOT run the full project test suite mid-batch on multi-batch work
- Chain-end full suite is orchestrator Step 3.5, not your job unless you are the chain-end Worker
```

## Evidence

The Evidence `Gates` row must include tier + summary, e.g.:

```
Gates      tier standard · B1–B3 affected pass · chain-end full pass (lint · tsc · test 42 · build)
```

## Dispatch wiring

- Tier resolve: dispatch Step 1
- Light gates: Step 2c every batch
- Chain-end full suite: Step 3.5 (see `skills/dispatch/SKILL.md`)

