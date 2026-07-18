# Reviewer Prompt Template (Audit)

Use this template when dispatching **standalone** audit Reviewers via the host **`spawn`** op ([runtime-contract.md](../../hyperflow/runtime-contract.md) — Claude `Agent`, Codex collaboration / legacy spawn candidates, OpenCode `Task` / `subagent`, or other inventory-mapped tools). When `spawn` is unavailable, run a **distinct labelled inline reviewer phase** in the main thread after context Searchers complete. Review depth scales by task complexity and the audit `--level` flag.

**Role separation (hard — never degrade):**

- Reviewer children **never coordinate** the chain, never dispatch siblings, and never fire structural `structured_question` gates (including the audit **fix gate**).
- Reviewers **never implement** fixes; they return findings + a verdict only. The orchestrator owns Step 6 fix gate → `plan` via [chain-router.md](../../hyperflow/chain-router.md).
- Context Searchers / Writers **never review** their own output. Worker and reviewer are always separate spawns (or separate labelled inline phases).
- Every reviewer runs on the **current session model**. No per-role model selection and no model-tier routing.
- `SECURITY_VIOLATION:` hard-halts the chain — **no fix gate**, no retries, no auto-fix ([failure-recovery.md](../../hyperflow/failure-recovery.md), [security.md](security.md)).

| Intent | Semantic op | When present | When absent |
|---|---|---|---|
| Start this reviewer | `spawn` | Separate child with reviewer (or domain-specialist) charter | Labelled inline reviewer phase |
| Collect prior worker / searcher | `wait` / host result | Block until context settles | Same-turn inline path only |
| Re-review after NEEDS_REVISION | `follow_up` or new `spawn` | Prefer same child when host supports follow-up | New reviewer phase with same scope + prior verdict context |
| Cancel reviewer | `interrupt` | Only when the tool exists | Stop issuing work; document limitation — do not claim cancellation |
| Web research (L3+ security / CVE currency) | `web_research` | Host web tools when research is required | Skip network research; record `unavailable` in evidence; never invent citations |

## Complexity Classification

The orchestrator determines complexity BEFORE dispatching the reviewer (and maps it to audit `--level` when the user did not set one):

- **Simple** (levels 1-2): Single file, rename, config, one-line fix
- **Medium** (levels 1-3): 2-3 files, modifies existing functionality, touches shared code
- **Complex** (levels 1-5): 4+ files, new feature, UI work, DB/API changes

Audit default is **L2** when `--level` is omitted. Security scan is **mandatory at L3+**.

## Template

The first line is a literal routing marker — emit it **verbatim** as the very first line of the dispatched prompt so an upstream tiering proxy or observability tool can identify the review pass. It is inert to the Reviewer. Everything after it is the review brief. (Role markers are not model routers — every agent still runs on the session model.)

```
hyperflow-role: reviewer

## Review scope
[Files changed, task/target assigned, complexity classification, audit level L1–L5]

## Review evidence (bounded)
Diff range: [exact immutable `<base>..<head>` — or working tree / staged when that is the target]
Paths: [explicit changed-path allowlist]
Diff stat: [output of `git diff --stat` for the target]
Review command: `git diff --no-ext-diff --unified=3 …` (or the exact read path for non-git targets)

Read the range and any contract references (task brief, plan spec path, prior audit) directly.
Never accept a pasted full patch, worker transcript/reasoning, prior review transcript, or conversation history as the sole source of truth.

## Worker / Searcher context
[Paste Searcher surface map + convention notes + any related task/spec paths — not full chat history]

## Level 1: Requirements
- Does the output match the task / intended change exactly?
- All claimed sub-tasks completed? Nothing missing?
- Nothing extra added beyond the intended change?

## Level 2: Code Quality
- Follows project naming conventions?
- No TypeScript `any`, no dead code?
- Uses existing utils/hooks (not reinventing)?
- Proper error handling, SRP, early returns?

## Level 3: Integration (medium + complex / L3+)
- Imports resolve? No circular dependencies?
- Shared state/context not broken?
- API contracts preserved?
- Existing tests would still pass?

## Level 4: Performance & Security (complex / L4+; security always at L3+)
- No N+1 queries? Expensive ops memoized?
- No unnecessary re-renders?
- No hardcoded secrets (sk-*, AKIA*, ghp_*, private keys)?
- Input validation at boundaries? No injection vectors?

## Level 5: UX & Accessibility (complex UI / L5)
- Aria labels on interactive elements?
- Keyboard navigation works?
- Loading/error/empty states handled?
- Responsive + RTL considered?

## Security Review (always; full depth at L3+)
- Were any blocked files accessed? (.env, *.pem, *.key, ~/.ssh/*)
- Any dangerous commands? (rm -rf, force push, sudo)
- Any data exfiltration? (contents piped to external URLs)
- Injection / path traversal / XSS / missing validation as applicable

## Token economy (DOCTRINE rule 16)
Be specific and to the point. Return ONLY the Output format block below — no preamble ("I'll now review …"), no restating of the context dump, no narration of the review process, no postamble summary, no closing pleasantry. One-line summary per level; one short finding line per failure. Stop after the verdict.

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
[Critical] / [Important] / [Suggestions] / [Praise] — one line each with file:line
[Notes for future tasks — omit if none]
```
```

If a finding needs a peer domain's judgment before you can rule on it, hold the verdict and emit
`CONSULT: <peer> — <question>` instead (you may consult any specialist in `agents/`). The Team Lead brokers the
answer and re-dispatches you to finish the review. See DOCTRINE rule 19 / [consultation.md](../../hyperflow/consultation.md).

**Verdict handling for the orchestrator (not the reviewer):**

| Verdict | Orchestrator action |
|---|---|
| `APPROVED` / clean `PASS` | Write audit file; print chat summary; **skip fix gate** when there are no Critical/Important findings |
| `NEEDS_FIX` (or PASS-with-Critical/Important) | Write audit file; print chat summary; fire **audit fix gate** via `structured_question` (Hyperflow Question chat block when structured UI is missing). On fix choice → `skill_continuation` to `plan` with `session=one spec=.hyperflow/specs/audit-<date>-<slug>.md`. Plan still owns its own build-location gate — **no blind patch**. |
| `SECURITY_VIOLATION` | Hard halt. Surface finding inline. **No fix gate.** No auto-fix. User decides remediation. |

## Dispatch Example

Illustrative `spawn` payload — bind through the provider mapping or a labelled inline reviewer phase. Never hard-require one host tool name.

```
spawn({
  description: "Audit auth middleware (complex · L3)",
  prompt: `hyperflow-role: reviewer

## Review scope
Files: src/middleware/auth.ts, src/middleware/auth.test.ts, src/types/auth.ts, src/types/session.ts
Task: Standalone audit of JWT auth middleware change
Complexity: Complex · Level: L3
Diff range: main..HEAD
Paths: src/middleware/auth.ts src/middleware/auth.test.ts src/types/auth.ts src/types/session.ts

## Worker / Searcher context
1. Surface map: auth middleware + session types
2. Conventions: RS256 preferred project-wide (memory hot entry)
3. Related: .hyperflow/tasks/implement-auth.md acceptance criteria

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
- Blocked files? Secrets? Dangerous commands? Injection?

## Output format
── Review ──
pass / fail / skipped per level + VERDICT + [Critical]/[Important]/[Suggestions]/[Praise]`
})
```

## Related

- [review-levels.md](review-levels.md) — full L1–L5 checklists and failure handling
- [security.md](security.md) — security scan policy (mandatory at L3+)
- [../../hyperflow/runtime-contract.md](../../hyperflow/runtime-contract.md) — spawn / wait / structured_question / skill_continuation
- [../../hyperflow/chain-router.md](../../hyperflow/chain-router.md) — audit fix gate → plan edge
- [../../hyperflow/reviewer-prompt.md](../../hyperflow/reviewer-prompt.md) — canonical in-chain reviewer template
