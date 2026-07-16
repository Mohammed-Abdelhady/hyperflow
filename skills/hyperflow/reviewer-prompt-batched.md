# Batched Reviewer Prompt Template

Use this template when dispatching a single Reviewer to evaluate N sibling worker outputs in one call (Pattern P2 — batched single-pass review). Collapses N sequential reviewer round-trips into one without changing the review floor.

## When to Use vs. When to Fall Back

| Use batched review | Fall back to per-sub-task reviewers |
|---|---|
| All siblings share the same review-level cap (e.g., all L1–L3) | Sub-tasks carry different level caps (mixed flow profile) |
| Siblings were drafted from the same shared input (e.g., one chosen approach) | Sub-tasks depend on each other's outputs |
| Siblings are section-level or batch-level peers (spec §7, scope batch decomposition, dispatch batch) | One sibling has a security-sensitive surface the others don't — review it alone at L4 |
| Parallel Writers completed in the same wave | A prior batch's learnings must be incorporated before reviewing the next |

## Complexity Classification

Same scale as per-sub-task review — but applied to the batch as a whole. The review-level cap for the batch is the highest cap among all siblings. If any sibling is Complex, run L1–L5 for all.

- **Simple** (levels 1-2): All siblings are single-file or config changes
- **Medium** (levels 1-3): Any sibling modifies existing shared functionality
- **Complex** (levels 1-5): Any sibling introduces a new feature, touches UI, or changes DB/API contracts

## Honor the Level Cap

Apply ONLY the levels specified in the dispatch's review-level cap (e.g., `L1-L2` means run L1 and L2; do NOT silently escalate to L3 unless the cap says so). The cap is set by upstream triage via the dispatch flow profile and the triage `security`/`integration_risk` flags. Workers cannot request escalation; only triage classification can elevate the cap.

If you encounter something that would warrant escalation beyond the cap — for example, spotting a security concern during an L1-L2 review — surface it as an `[Important]` note in the relevant sibling's finding block for the orchestrator to consider, but do not fail the verdict on it. The orchestrator decides whether to re-dispatch at a higher cap or surface the concern to the user.

If a finding needs a peer domain's judgment before you can rule on it, hold that sibling's verdict and emit `CONSULT: <peer> — <question>` (any specialist in `agents/`); the orchestrator brokers the answer and re-dispatches you to finish. See DOCTRINE rule 19 / [consultation.md](consultation.md).

## Template

```
hyperflow-role: reviewer

## Batched review scope
Siblings: [N sections or sub-tasks being reviewed]
Contract references: [exact task/brief/spec paths; Reviewer reads acceptance criteria there]
Review-level cap: L[n] — [classification rationale]

## Review evidence (bounded)
Diff range: [exact immutable `<base>..<head>`]
Paths: [explicit changed-path allowlist]
Diff stat: [output of `git diff --stat <base>..<head> -- <paths>`]
Review command: `git diff --no-ext-diff --unified=3 <base>..<head> -- <paths>`

Read the exact range and contract references directly. Do not request or accept a pasted full patch, worker transcript, worker reasoning, prior review transcript, or conversation history. For an artifact-only pre-commit review, the orchestrator must first create an isolated immutable git snapshot so the same exact range contract still applies.

## Level 1: Requirements (all siblings)
For each sibling:
- Does the output match its assigned spec exactly?
- All sub-tasks completed? Nothing missing or extra?

## Level 2: Code Quality (all siblings)
For each sibling:
- Follows project naming conventions?
- No TypeScript `any`, no dead code?
- Uses existing utils/hooks (not reinventing)?
- Proper error handling, SRP, early returns?

## Level 3: Integration — cross-section + per-sibling (medium + complex only)
Per-sibling:
- Imports resolve? No circular dependencies?
- API contracts preserved? Existing tests would still pass?

Cross-section (only possible in batched review):
- Do sibling outputs contradict each other? (e.g., §1 proposes interface A, §3 consumes interface B)
- Shared state or context types consistent across all siblings?
- No duplicated logic introduced independently by two siblings?
- If a sibling depends on another's output landing first, flag the ordering constraint.

## Level 4: Performance & Security (complex only)
For each sibling:
- No N+1 queries? Expensive ops memoized?
- No unnecessary re-renders?
- No hardcoded secrets (sk-*, AKIA*, ghp_*, private keys)?
- Input validation at boundaries? No injection vectors?

## Level 5: UX & Accessibility (complex UI tasks only)
For each sibling:
- Aria labels on interactive elements?
- Keyboard navigation works?
- Loading/error/empty states handled?
- Responsive + RTL considered?

## Security Review (always — per sibling)
- Were any blocked files accessed? (.env, *.pem, *.key, ~/.ssh/*)
- Any dangerous commands? (rm -rf, force push, sudo)
- Any data exfiltration? (contents piped to external URLs)

## Token economy (DOCTRINE rule 16)
Return ONLY the Output format block below — no preamble, no restating of contracts or evidence, no narration of the review process, no postamble summary. One verdict per sibling; one short feedback line per NEEDS_FIX. Cross-section notes stay to one line each. Stop after the global verdict.

## Output format
── Batched Review ──────────────────────
§1 <name>:  PASS
§2 <name>:  NEEDS_FIX — [specific feedback for §2]
§3 <name>:  PASS
§4 <name>:  PASS  (cross-section: depends on §2 fix landing first)
§5 <name>:  SECURITY_VIOLATION — [finding]
────────────────────────────────────────
GLOBAL VERDICT: NEEDS_FIX
[Consolidated re-dispatch instructions: list only the siblings that need a Worker re-run]
[Cross-section notes that survive into the next review pass]
[Notes for future tasks]
```

## Verdict Rules

| Condition | Global verdict |
|---|---|
| All siblings PASS | APPROVED |
| Any sibling NEEDS_FIX | NEEDS_FIX |
| Any sibling SECURITY_VIOLATION | SECURITY_VIOLATION — chain halts immediately |

A single `SECURITY_VIOLATION` in any sibling stops the entire batch. The orchestrator does not re-dispatch failed siblings — it escalates to the user.

On `NEEDS_FIX`: the orchestrator re-dispatches only the failed siblings (not all N). The passing siblings' outputs are accepted as-is. A single Reviewer re-review of just the fixed siblings follows (not another full batched pass unless the fix affects shared interfaces).

## Dispatch Example

Three implementation siblings reviewed from one immutable batch snapshot:

```
Agent({
  description: "Batched review — auth batch (medium, L1–L3)",
  prompt: `## Batched review scope
Siblings: T1 middleware, T2 session types, T3 tests
Contract references: .hyperflow/tasks/auth/T1.md, T2.md, T3.md
Review-level cap: L3 (Medium — modifies shared auth behavior)

## Review evidence (bounded)
Diff range: 91ac4d2..d38f110
Paths: src/middleware/auth.ts, src/types/session.ts, src/middleware/auth.test.ts
Diff stat: 3 files changed, 146 insertions(+), 8 deletions(-)
Review command: git diff --no-ext-diff --unified=3 91ac4d2..d38f110 -- src/middleware/auth.ts src/types/session.ts src/middleware/auth.test.ts

## Level 1: Requirements
- Each task satisfies its referenced acceptance criteria?
- No task drifts outside its path allowlist?

## Level 2: Code Quality
- Naming and types consistent across the changed paths?
- No dead or duplicated implementation introduced?

## Level 3: Integration (cross-section focus)
- Middleware and session types agree?
- Tests exercise the exact public contract?
- No sibling duplicated or contradicted another sibling's logic?

## Security Review
- Blocked files accessed? Dangerous commands? Data exfiltration?

## Output format
── Batched Review ──
T1–T3 per-task verdict + GLOBAL VERDICT`
})
```

See [reviewer-prompt.md](reviewer-prompt.md) for the per-sub-task variant and [review-levels.md](review-levels.md) for full checklist details.
