# Reviewer Prompt Template

Use this template when dispatching Reviewers via the host **`spawn`** op ([runtime-contract.md](runtime-contract.md) — Claude `Agent`, Codex collaboration / legacy spawn candidates, OpenCode `Task` / `subagent`, or other inventory-mapped tools). When `spawn` is unavailable, run a **distinct labelled inline reviewer phase** in the main thread after the worker phase completes. Review depth scales by task complexity.

**Role separation (hard — never degrade):**

- Reviewer children **never coordinate** the chain, never dispatch siblings, and never fire structural `structured_question` gates at the user.
- Reviewers **never implement** the fix they request; they return a verdict only.
- Workers **never review** their own output. Worker and reviewer are always separate spawns (or separate labelled inline phases).
- Every reviewer runs on the **current session model**. No per-role model selection.
- `SECURITY_VIOLATION:` still hard-halts the chain with no retries ([failure-recovery.md](failure-recovery.md)).

| Intent | Semantic op | When present | When absent |
|---|---|---|---|
| Start this reviewer | `spawn` | Separate child with reviewer charter | Labelled inline reviewer phase |
| Collect prior worker | `wait` / host result | Block until worker output settles | Same-turn inline path only |
| Re-review after fix | `follow_up` or new `spawn` | Prefer same child when host supports follow-up | New reviewer phase with same scope + prior verdict context |
| Cancel reviewer | `interrupt` | Only when the tool exists | Stop issuing work; document limitation — do not claim cancellation |

## Complexity Classification

The orchestrator determines complexity BEFORE dispatching the Reviewer:

- **Simple** (levels 1-2): Single file, rename, config, one-line fix
- **Medium** (levels 1-3): 2-3 files, modifies existing functionality, touches shared code
- **Complex** (levels 1-5): 4+ files, new feature, UI work, DB/API changes

## Template

The first line is a literal routing marker — emit it **verbatim** as the very first line of the dispatched prompt so an upstream tiering proxy or observability tool can identify the review pass. It is inert to the Reviewer. Everything after it is the review brief. (Role markers are not model routers — every agent still runs on the session model.)

```
hyperflow-role: reviewer

## Review scope
[Files changed, task assigned, complexity classification]

## Worker output
[Paste worker's summary]

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
[Issues per failed level — one line each]
[Notes for future tasks — omit if none]
```
```

If a finding needs a peer domain's judgment before you can rule on it, hold the verdict and emit
`CONSULT: <peer> — <question>` instead (you may consult any specialist in `agents/`). The Team Lead brokers the
answer and re-dispatches you to finish the review. See DOCTRINE rule 19 / [consultation.md](consultation.md).

**Verdict handling for the orchestrator (not the reviewer):**

| Verdict | Orchestrator action |
|---|---|
| `APPROVED` | Advance; record review line in Evidence |
| `NEEDS_FIX` / `NEEDS_REVISION` | Bounded worker retry per [failure-recovery.md](failure-recovery.md) (once with learnings; second strike surfaces partial — no third dispatch). Prefer `follow_up` on the worker child when present; otherwise new `spawn` or labelled inline resume |
| `SECURITY_VIOLATION` | Hard halt. Print security status. No retry, no auto-fix, no push |

## Dispatch Example

Illustrative `spawn` payload — bind through the provider mapping or a labelled inline reviewer phase. Never hard-require one host tool name.

```
spawn({
  description: "Review auth middleware (complex)",
  prompt: `hyperflow-role: reviewer

## Review scope
Files: src/middleware/auth.ts, src/middleware/auth.test.ts, src/types/auth.ts, src/types/session.ts
Task: Create JWT auth middleware with refresh logic
Complexity: Complex (4 files, new feature, security-sensitive)

## Worker output
1. Created auth middleware with RS256 verification
2. Added refresh token rotation
3. Tests cover valid/expired/malformed tokens

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
