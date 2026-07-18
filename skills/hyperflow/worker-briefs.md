# Worker briefs — detail floor & oversize splitting

Layer 3 detail referenced from [DOCTRINE.md](DOCTRINE.md) § Layer 3. DOCTRINE keeps the summaries; this file holds the full mandatory-sections table, the lean relaxation, the oversize split-signal table, the `OVERSIZE`/`SUGGESTED-SPLIT` protocol, and the anti-pattern catalogues.

## Worker brief detail floor (Team Lead contract to Workers)

Every Worker dispatch must hit a mandatory detail floor in the brief. Sparse briefs are a doctrine violation — the Worker fills gaps with assumptions; the per-batch Reviewer can only check what was asked for; the resulting commit is plausibly-right rather than actually-right. Detail isn't padding; it's the Worker's only signal about scope.

**Authored at plan time by default (`briefs=auto`).** For non-trivial sub-tasks the detail floor is met *once, on the strong planning model*, and stored as a per-sub-task brief file (`.hyperflow/tasks/<slug>/T<id>.md` flat, `phase-*/tasks/T<id>.md` feature). At dispatch the Composer **loads that brief verbatim** and only appends Project Context + learnings + the specialist output-contract — it does not re-derive the floor. This is what lets the build run faithfully on a **cheaper model or a second session**: the expensive thinking (decompose, design each change, enumerate the realistic test set + the E2E case) is paid in `plan`; `dispatch` transcribes. The Composer authors inline only when no brief exists (a trivial sub-task or a legacy terse task file).

**Mandatory sections in every brief (no exceptions):**

| Section | What it contains |
|---|---|
| **Task** | One verb-led sentence stating the objective |
| **Why** | 1-3 sentences on motivation. What changes for user/system after this lands? Quote spec/ticket if known |
| **Scope** | Explicit `IN:` list (what this brief owns) AND `OUT:` list (related work owned by other sub-tasks; don't touch even if noticed nearby) |
| **Files in scope** | Per-file lines tagged `Read:` / `Modify:` / `Create:` with the reason or change description |
| **Acceptance criteria** | High-level shape-level PASS definition — importable from X, output shape Z, commit message stub |
| **Test cases** | Concrete input → expected-output table reflecting **real domain logic + real edge cases**. Min 3 cases as a floor, but 3 is rarely enough for non-trivial tasks — aim for the realistic set: every domain edge case the feature handles + integration failure modes. Quality > arbitrary count. The decision agent writes cases by thinking through: (1) domain logic — real user inputs, real outcomes; (2) domain edges — Unicode / RTL / boundaries / currency-specific rules / business-rule corner cases; (3) system edges — races / retries / timeouts / malformed responses / concurrent updates; (4) integration surface — what callers can pass. Worker implements against the table AND, for code tasks, writes verifying test code as part of the deliverable. Per-batch Reviewer runs / verifies each case row-by-row to confirm PASS. Format: \\| # \\| Name \\| Input \\| Expected \\| Notes \\|. Omit ONLY when genuinely test-impossible (one-line README typo); state `Test cases: N/A — <why>` so omission is deliberate. |
| **Related context** | Pointers (file:line, sibling sub-task IDs, spec sections) the Worker reads ONLY if the brief becomes ambiguous — orientation, not scope |
| **Context** | Module-level explanation + project conventions + constraints. Examples with file:line citations beat abstract rules |
| **Project Context** | Inline excerpts (default mode) OR paths-only (lean mode) — see worker-prompt.md template |
| **Constraints** | No Claude-as-actor anywhere; no `--no-verify` on git commits; only modify files listed in scope |
| **Security Constraints** | Full blocklist as in worker-prompt.md template |
| **Output format** | Completed / OVERSIZE / BLOCKED contract |

**Relaxation under `mode=lean` AND `triage.complexity IN [trivial, simple]` for a planned 1–2-file scope:** Why and Scope may be compact and Related context may be omitted. Inline-fast bypasses the worker brief entirely. Planned work still keeps Task, Files, Acceptance, tests, Output, and Security constraints.

**Why this matters.** A Worker dispatched with `Task: add login` and nothing else will produce *a* login implementation that's plausibly-correct but probably wrong on scope, edge cases, or convention. A Worker dispatched with the full detail floor produces exactly what the Planner intended, with edge cases handled and the right sibling-coordination respected. The per-batch Reviewer's job is to verify the work matches the brief — if the brief was vague, the Reviewer has nothing to check against. Detail floor exists so the Reviewer has something concrete to PASS/NEEDS_FIX against.

**Anti-patterns** (each is a doctrine violation):

- "Task: add X" with no Why / Scope / Acceptance criteria / Test cases — Worker guesses scope, Reviewer has no contract to verify against
- Listing files as "Modify: src/auth/" (folder) — must be exact paths per file with per-file change description
- Skipping `OUT:` because "the Worker should figure out what not to touch" — they won't; scope creep is the result
- Skipping `Acceptance criteria` because "the test suite covers it" — Reviewer needs the explicit pass criteria, not inferred from tests
- Skipping `Test cases` because "the Worker will figure out the right tests" — they'll write tests for the obvious paths and miss the edge / error cases the brief should have specified. Minimum 3 cases (happy + edge + error) is non-negotiable unless the task is genuinely test-impossible
- Writing test cases as prose narrative instead of the structured table — table is mandatory because the Reviewer parses it row-by-row to verify each case PASSes
- **Formulaic / generic test cases that don't reflect the actual task domain** — three rows of "happy path / error / empty input" with no domain content is a template, not test cases. Every task has its own real edges: Unicode in a search bar, currency-specific decimals in money math, race conditions in concurrent writes, partial network failure in remote calls, RTL strings in UI components, schema-version mismatches in serialized payloads. The decision agent must think through what THIS task's surface actually exposes
- Test cases that just restate Acceptance criteria in table form — Acceptance is shape (`exported as X`); test cases are behavioural input→output (`render("John Doe") → "JD"`)
- Vague Expected column ("works correctly", "returns the right thing") — must be a specific value or behavior the Reviewer can check programmatically
- Padding to hit the floor with near-duplicate cases ("happy path with name=John", "happy path with name=Jane") — duplicates aren't coverage
- Copy-pasting test cases from a similar prior sub-task without rethinking the domain — every task has its own edges
- Inlining the security blocklist as a 1-line "follow security rules" — must be the full enumerated blocklist so workers can actually check
- Using "Claude will" / "the AI will" anywhere in the brief — DOCTRINE rule 9 banned narrative subject

## Oversize task splitting (decision agent — Planner mandate)

**A single Worker dispatch must never own more than one reviewable unit of work.** The decision agent splits oversized work into multiple parallel sub-tasks rather than handing one Worker a giant brief. Two enforcement points:

**1. At planning (plan Step 9 · pre-dispatch).** The Planner (decision agent — Planner) MUST split any sub-task that meets ANY of these signals:

| Signal | Threshold |
|---|---|
| File breadth | > 5 files touched |
| Change volume | > 500 LOC of expected changes |
| Subsystem cross-cut | touches 2+ distinct subsystems (auth + UI + DB, frontend + API + migration, …) |
| Complexity tag | `complexity = complex` from triage |
| Mixed concerns | one sub-task spans data-model + business-logic + UI + tests |
| Reviewability | a human reviewing the resulting commit would need > 10 minutes to grasp it |

Split target: each resulting sub-task should be (a) reviewable in under 10 minutes of human time, (b) fit comfortably in a single Worker prompt + reasonable response, (c) have a single coherent purpose nameable in one conventional-commit subject line. Aim for sub-tasks at `complexity = simple | moderate` after the split; never keep `complex`.

**2. Mid-flight (Worker `OVERSIZE` escape hatch).** If a Worker discovers during execution that its brief is bigger than the Planner estimated (e.g., the file is 5k lines instead of 500, the refactor touches more callers than expected, the test scope has cascading dependencies), the Worker returns:

```
OVERSIZE: <one-line reason>
SUGGESTED-SPLIT:
  - <sub-task A name> · <files A> · <one-line purpose>
  - <sub-task B name> · <files B> · <one-line purpose>
  - <sub-task C name> · <files C> · <one-line purpose>
```

The orchestrator (Team Lead) does NOT proceed with the oversized brief. Instead it dispatches a decision agent consultation: "given the Worker's `OVERSIZE` signal and `SUGGESTED-SPLIT`, produce the final split plan and updated batch graph." decision agent returns the canonical split; the original sub-task is removed from the batch and N new sub-tasks are dispatched as a new sub-batch in the same dispatch cycle. The user is NOT asked — this is a mechanical reshape of a too-large brief, not a decision (Worker raised it, decision agent decided it).

**Anti-patterns** (any of these is a doctrine violation):

- Letting a Worker run with an oversized brief because "it might still finish" — wastes tokens, produces unreviewable commits
- Splitting the work inline in the Team Lead's main session — splits must come from a fresh decision-agent dispatch with full context
- Firing `AskUserQuestion` to confirm the split — splitting is a mechanical reshape, not a decision the user should be paged for
- Skipping the split signals at planning time because "the Planner thought it was fine" — the signals are non-negotiable; the Planner runs them as a checklist
- Producing one giant commit at the end with all the split work merged together — splits exist precisely so each piece commits separately (per-task cadence preserved)

**Cost rationale.** Three small sub-tasks dispatched to three Workers in parallel cost less wall-clock time AND less total tokens than one Worker chewing through an oversized brief, because (a) parallelism cuts elapsed time, (b) each smaller prompt produces a focused response without context bloat, and (c) a focused Worker rarely needs retries. Splitting is a cost optimisation, not just a quality one.
