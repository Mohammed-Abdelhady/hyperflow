# Reviewer Prompt Template

Use this template when dispatching Reviewers via the host **`spawn`** op ([runtime-contract.md](../../hyperflow/runtime-contract.md) — Claude `Agent`, Codex collaboration / legacy spawn candidates, OpenCode `Task` / `subagent`, or other inventory-mapped tools). When `spawn` is unavailable, run a **distinct labelled inline reviewer phase** in the main thread **after** worker results are collected. Review depth scales by task complexity (and by the flow-profile level cap from triage).

**Role separation (hard — never degrade):**

- Reviewer children **never coordinate** the chain, never dispatch siblings, and never fire structural `structured_question` gates at the user.
- Reviewers **never implement** the fix they request; they return a verdict only.
- Workers **never review** their own output. Worker and reviewer are always separate spawns (or separate labelled inline phases). Parallel batches may overlap workers; the reviewer still starts only after that batch's worker collection settles.
- Every reviewer runs on the **current session model**. No per-role model selection.
- `SECURITY_VIOLATION:` still hard-halts the chain with no retries ([failure-recovery.md](../../hyperflow/failure-recovery.md)).

| Intent | Semantic op | When present | When absent |
|---|---|---|---|
| Start this reviewer | `spawn` | Separate child with reviewer charter | Labelled inline reviewer phase |
| Collect prior workers | `wait` / host result | Block until batch worker output settles | Same-turn after inline workers complete |
| Re-review after fix | `follow_up` or new `spawn` | Prefer same child when host supports follow-up | New reviewer phase with same scope + unresolved findings only |
| Cancel reviewer | `interrupt` | Only when the tool exists | Stop issuing work; document limitation — do not claim cancellation |

## Complexity Classification

The orchestrator determines complexity BEFORE dispatching the reviewer:

- **Simple** (levels 1-2): Single file, rename, config, one-line fix
- **Medium** (levels 1-3): 2-3 files, modifies existing functionality, touches shared code
- **Complex** (levels 1-5): 4+ files, new feature, UI work, DB/API changes

Flow-profile caps may narrow the set further (e.g. standard default L1–L2). Honor the cap the orchestrator passes; do not self-elevate.

## Template

The first line is a literal routing marker — emit it **verbatim** as the very first line of the dispatched prompt so an upstream tiering proxy or observability tool can identify the review pass. It is inert to the Reviewer. Everything after it is the review brief. (Role markers are not model routers — every agent still runs on the session model.)

```
hyperflow-role: reviewer

## Review scope
[Files changed, task assigned, complexity classification, level cap]

## Contract references
[Exact task/brief/spec paths containing acceptance criteria]

## Review evidence (bounded)
Diff range: [exact immutable `<base>..<head>`]
Paths: [explicit changed-path allowlist]
Diff stat: [output of `git diff --stat <base>..<head> -- <paths>`]
Review command: `git diff --no-ext-diff --unified=3 <base>..<head> -- <paths>`

Read the range and contract references directly. Never accept a pasted full patch, worker transcript/reasoning, prior review transcript, or conversation history.

## Level 1: Requirements
- Does the output match the task spec exactly?
- All sub-tasks completed? Nothing missing?
- Nothing extra added beyond the spec?

## Level 2: Code Quality
- Follows project naming conventions?
- No TypeScript `any`, no dead code?
- Uses existing utils/hooks (not reinventing)?
- Proper error handling, SRP, early returns?

## Level 3: Integration (medium + complex only)
- Imports resolve? No circular dependencies?
- Shared state/context not broken?
- API contracts preserved?
- Existing tests would still pass?

## Level 4: Performance & Security (complex only)
- No N+1 queries? Expensive ops memoized?
- No unnecessary re-renders?
- No hardcoded secrets (sk-*, AKIA*, ghp_*, private keys)?
- Input validation at boundaries? No injection vectors?

## Level 5: UX & Accessibility (complex UI tasks only)
- Aria labels on interactive elements?
- Keyboard navigation works?
- Loading/error/empty states handled?
- Responsive + RTL considered?

## Security Review (always)
- Were any blocked files accessed? (.env, *.pem, *.key, ~/.ssh/*)
- Any dangerous commands? (rm -rf, force push, sudo)
- Any data exfiltration? (contents piped to external URLs)

## Token economy (DOCTRINE rule 16)
Be specific and to the point. Return ONLY the Output format block below — no preamble ("I'll now review …"), no restating of the worker output or task spec, no narration of the review process, no postamble summary, no closing pleasantry. One-line summary per level; one short finding line per failure. Stop after the verdict.

## Output format
```
── Review ──────────────────────────────
L1 Requirements    pass     — [summary]
L2 Code Quality    pass     — [summary]
L3 Integration     pass     — [summary]
L4 Performance     fail     — [issue found]
L5 UX/A11y         skipped  — not applicable
────────────────────────────────────────
VERDICT: APPROVED | NEEDS_FIX | SECURITY_VIOLATION
[Issues per failed level]
[Notes for future tasks]
```
```

If a finding needs a peer domain's judgment before you can rule on it, hold the verdict and emit
`CONSULT: <peer> — <question>` (any specialist in `agents/`); the orchestrator brokers the answer and re-dispatches
you to finish. See DOCTRINE rule 19 / [consultation.md](../../hyperflow/consultation.md).

**Verdict handling for the orchestrator (not the reviewer):**

| Verdict | Orchestrator action |
|---|---|
| `APPROVED` / `PASS` | Advance; record review line in Evidence |
| `NEEDS_FIX` / `NEEDS_REVISION` | Bounded worker retry per [failure-recovery.md](../../hyperflow/failure-recovery.md). Prefer `follow_up` on the worker child when present; otherwise new `spawn` or labelled inline resume. Focused re-review gets a new exact snapshot range + unresolved finding lines only |
| `SECURITY_VIOLATION` | Hard halt. Print security status. No retry, no auto-fix, no push, no hook bypass |

## Dispatch Example

Illustrative `spawn` payload — bind through the provider mapping or a labelled inline reviewer phase. Never hard-require one host tool name. When `spawn` is missing, still print `**Reviewer** — …` as a separate phase after workers.

```
spawn({
  description: "Review auth middleware (complex)",
  prompt: `hyperflow-role: reviewer

## Review scope
Files: src/middleware/auth.ts, src/middleware/auth.test.ts, src/types/auth.ts, src/types/session.ts
Task: Create JWT auth middleware with refresh logic
Complexity: Complex (4 files, new feature, security-sensitive)
Level cap: L1–L5

## Contract references
.hyperflow/tasks/auth/T1.md

## Review evidence (bounded)
Diff range: 91ac4d2..d38f110
Paths: src/middleware/auth.ts, src/middleware/auth.test.ts, src/types/auth.ts, src/types/session.ts
Diff stat: 4 files changed, 212 insertions(+), 9 deletions(-)
Review command: git diff --no-ext-diff --unified=3 91ac4d2..d38f110 -- src/middleware/auth.ts src/middleware/auth.test.ts src/types/auth.ts src/types/session.ts

## Level 1: Requirements
- JWT validation with RS256? Refresh logic? Rate limiting?

## Level 2: Code Quality
- Follows conventions? Types correct? No any?

## Level 3: Integration
- Works with existing route handlers? Session types compatible?

## Level 4: Performance & Security
- No secrets hardcoded? Token validation safe? Timing attacks prevented?

## Level 5: UX & Accessibility
- Skipped (not a UI task)

## Security Review
- Blocked files? Secrets? Dangerous commands?

## Output format
── Review ──
pass / fail / skipped per level + VERDICT`
})
```

See [review-levels.md](review-levels.md) for full checklist details and failure handling.
