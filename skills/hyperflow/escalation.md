# Escalation and token accounting

## Why mid-flight changes happen

Triage is a forecast, not a contract. The orchestrator picks a flow profile based on the task description before any real work begins — but workers encounter ground truth: the actual files, the real dependencies, the production blast radius. A "fast" one-liner can turn out to call a shared utility touched in eight places; a "deep" refactor can resolve to a two-line patch after research. Escalation lets the flow adapt to reality without discarding completed work or restarting from scratch. The worker's partial output is always preserved as context for the next batch.

The two axes of mid-flight change are independent:

- **Complexity escalation** — scope is larger than triage predicted. More files, more subsystems, more coordination needed. The response is to move to a heavier profile.
- **Risk escalation** — consequences are more severe than triage predicted. The change now touches prod config, auth, or irreversible data. The response is always a hard stop and user confirmation, regardless of profile.

Either axis can trigger independently. A trivial one-line change can trigger risk escalation (if it touches secrets). A massive cross-cutting refactor may never trigger risk escalation (if every change is fully reversible). Treat them separately.

---

## The ESCALATE signal

Workers — especially implementers and searchers — return a special prefix when they hit unexpected complexity that exceeds what their current profile was designed to handle:

```text
ESCALATE: <reason>

<rest of normal worker output — what they DID find/do before stopping>
```

The reason must be a concrete one-liner. The output below it must describe work already completed so the orchestrator can build on it.

Example of a well-formed ESCALATE response:

```text
ESCALATE: discovered cross-cutting impact — the `userService.ts` change ripples into
6 controller files and a shared middleware layer that wasn't in scope.

Before stopping, I completed:
- Located the primary change site in `src/services/userService.ts` (line 142)
- Verified the function signature change is backward-compatible in isolation
- Identified 6 downstream callers: authController, profileController, adminController,
  sessionMiddleware, auditLogger, and the userRepository test suite

The callers need review before this change can safely land. I did not modify any files.
```

This format gives the orchestrator everything it needs: the reason for escalation, what is already known, and a clean stopping point.

**Reasons that trigger ESCALATE:**

- "discovered cross-cutting impact in 6 files, not the 2 I was given"
- "this requires a database migration that wasn't in scope"
- "the existing code doesn't match the assumed pattern; need an architectural decision"
- "this code is calling a third-party API I don't have credentials for — need design input"
- "I found a security vulnerability in the surrounding code that affects this change"
- "this requires changes to a config file that affects prod deployment"
- "scope-expansion: change touches auth layer unexpectedly"

**Reasons that do NOT trigger ESCALATE (worker should solve them locally):**

- "I needed to add an import"
- "the existing code has a minor formatting issue"
- "I made a different naming choice than suggested"
- "the file was split across two modules instead of one"

---

## The DOWNGRADE signal

Downgrade is the orchestrator's own decision, not a worker signal. Workers never return a downgrade signal — they complete their work or escalate. The orchestrator alone decides to downgrade, based on what the research or brainstorm phase revealed. When the orchestrator determines the original profile is overkill, it emits:

```text
⬇ DOWNGRADED: <from> → <to>. Reason: <reason>
```

Downgrade never requires user confirmation unless the user explicitly locked the profile at session start (e.g., "use deep profile, I want full review"). Downgrade is always optional — the orchestrator should err toward keeping the higher profile when uncertain. The savings from a downgrade are real but secondary to getting the task right.

Downgrade decisions are made at natural batch boundaries, not mid-batch. The orchestrator completes the current batch at the original profile, then re-evaluates before dispatching the next.

---

## Profile budget reference

For escalation decisions, use these approximate token budget values:

| Profile | Baseline budget |
|---|---|
| fast | 10k tokens |
| standard | 50k tokens |
| deep | 200k tokens |
| scientific | 200k tokens |
| research | 60k tokens |
| creative | 100k tokens |

Source of truth: `flow-profiles.md` — values must match.

These are the denominators used when computing the overrun multiplier. If `flow-profiles.md` defines a different value, that value takes precedence over this table.

---

## Escalation paths

| From profile | Trigger | To profile | Why |
|---|---|---|---|
| fast | scope larger than single-file | standard | needs reviewer + task file |
| fast | cross-cutting concern surfaced | deep | needs full decomposition |
| fast | risk became irreversible | standard or deep | needs explicit approval gate |
| standard | cross-cutting impact across 5+ files | deep | needs full pipeline |
| standard | security vulnerability discovered | deep + security focus | needs L1–L5 review |
| standard | scope expanded beyond initial files | deep | decomposition required |
| research | implementation needed after evaluation | standard or deep | flip from read-only to write |
| creative | implementation requires cross-cutting infra changes | deep | cross-cutting needs full pipeline |
| creative | security or scientific concerns emerge during design | deep + (security or scientific) focus | additional rigor needed |
| creative | scope exceeds 5 files | deep | decomposition needed |
| any | numerical or proof correctness emerged | scientific | TDD required |
| any | irreversible action requested by code | halt → user approval | irreversibility always requires consent |

---

## Downgrade paths

| From profile | Observation | To profile | Why |
|---|---|---|---|
| deep | research showed only 1–2 files affected | standard | save tokens, reduce overhead |
| deep | brainstorm converged fast, no cross-cutting | standard | full pipeline is overkill |
| standard | turned out to be a one-line fix after research | fast | optional — only if risk is clearly reversible |
| scientific | tests already exist and only docs changed | standard | full TDD cycle is overkill |
| creative | trivial design tweak (e.g. color change, copy edit) | fast or standard | full creative pipeline overkill |

---

## Escalation flow

When a worker returns `ESCALATE: <reason>`, the orchestrator follows this sequence:

1. Pause dispatch of any pending workers in the current batch immediately. Workers already running in parallel may finish, but do not start new ones.
2. Read the worker's full output — extract what was completed before the escalation point and what the specific blocker is.
3. Update the in-memory triage record with the new information: affected files, risk surface, actual scope, any new types discovered (e.g., `db` was not in the original triage but a migration is now needed).
4. Pick the new profile per the escalation paths table above. If multiple paths apply, take the highest profile.
5. Print to the user:
   ```text
   ESCALATED — <from> → <to> · reason: <reason>
   ```
6. Preserve the worker's partial output as input context for the next batch. Prepend it to the next batch's context as: `Prior work (before escalation): <output>`. Do not discard completed work.
7. Re-plan: generate a fresh task breakdown under the new profile. Completed sub-tasks do not need to be re-run unless the escalation reason invalidates them.
8. If the escalation crosses the irreversibility boundary (see Risk escalation below), call `AskUserQuestion` for explicit consent before step 7.
9. Log the escalation event for the usage summary: `from_profile`, `to_profile`, `reason`, `batch_number`, `tokens_at_point`.

Multiple escalations in one session are valid. Each escalation re-evaluates from the current state — a second escalation from `standard → deep` after a first `fast → standard` is normal. Log each independently.

---

## Risk escalation

Complexity escalation is about scope. Risk escalation is about consequences. They can happen independently and each requires a different response.

A task escalates risk when ANY of the following surface mid-flight:

- A change to a config file deployed to production
- A schema migration that drops or renames a column with existing data
- A new external API call to a billable or rate-limited third-party service
- A change to authentication or authorization logic
- A change to secrets handling, key rotation, key storage, or encryption algorithms
- A force-push, branch deletion, or history rewrite
- Any write operation to a production database from application code
- Disabling or weakening a security control (firewall rule, CORS policy, CSP header)

**When risk escalation occurs:**

1. Worker MUST stop immediately. Do not make the change. Return:
   ```text
   ESCALATE: risk-irreversible — <specific details of what was found>

   <description of work completed up to this point>
   ```
2. Orchestrator MUST call `AskUserQuestion` for explicit consent before any further action. The question must include: what the risky action is, what it would affect, and what happens if it goes wrong.
3. Orchestrator prints:
   ```text
   🔴 RISK ESCALATION: irreversible action detected — <details>
   Paused. Awaiting user approval before proceeding.
   ```
4. No automatic fall-through to a deeper profile without the user's explicit yes. The user must say yes to the specific risky action — generic approval of the task is not sufficient.
5. If the user declines, orchestrator marks the task blocked and surfaces a safe partial result with a clear note about what was skipped and why.
6. If the user approves, orchestrator logs the approval (user said yes at `<timestamp>` to `<action>`) and resumes at the appropriate profile.

Risk escalation always supersedes complexity escalation. A "fast" task that discovers a prod config change halts fully — there is no "fast risk escalation." The profile level is irrelevant once irreversibility is detected.

---

## Token accounting protocol

Token accounting is mandatory for every dispatched agent. Each chain writes metadata-only JSONL through `scripts/usage-ledger.py`; prompt text, response text, patches, file contents, and secrets never enter the ledger. Capture result metadata when the agent returns, then append exactly once before leaving the boundary where `accepted_commit` is known.

Canonical record fields, in order:

```text
chain_id · phase · batch · task · attempt · role
input_tokens · output_tokens · total_tokens · cached_input_tokens
context_hash · context_tokens · estimated · accepted_commit · timestamp
```

Rules:

1. `phase` is one of the budget phases: `triage`, `planning`, `execution`, `review`, `verification`.
2. `attempt` is 1-based; retries are separate records. `total_tokens` must equal input + output.
3. Use provider input/output/cache metadata when available. If unavailable, estimate conservatively as `input_tokens = ceil(prompt characters / 4)`, `output_tokens = ceil(response characters / 4)`, set `estimated=true`, and keep the raw text out of the ledger.
4. `context_hash` fingerprints only the repeated shared-context block; `context_tokens` measures that block. Repeated hashes after their first occurrence produce the duplicate-context metric.
5. `accepted_commit=true` belongs only to the producing agent result that led to one accepted commit. Failed attempts, Composer/review calls, and non-committed outputs use `false`.
6. Unknown fields are forbidden. A ledger validation/write failure stops the chain before further agent spend.

At every natural boundary run `usage-ledger.py summary --chain-id <chain-id>`. It is the source of truth for total/per-phase tokens, duplicate-context tokens/ratio, retry cost, cache-hit rate, estimated-record count, accepted commits, and tokens per accepted commit. The task-file `Tokens` row and terminal Usage block are projections of this summary, not independently maintained counters.

---

## Budget overrun handling

Hard totals and per-phase caps are enforced by `scripts/budget-guard.py`, not by narrative multipliers. Check only at natural boundaries: after triage, after planning, after each complete execution/review batch, after final review, and after verification. Do not interrupt an in-flight agent.

Pass the ledger summary's chain total and phase total to the guard with `--boundary --reserved-tokens <next-call-reservation>`. Reserve a conservative upper bound for the next agent call or concurrent wave; use `0` only when no more agent work can launch. When one boundary accumulated several phases, evaluate every phase that gained records in canonical order; checking only the last phase would hide an earlier cap. Apply each deterministic result before the next dispatch:

| Decision | Behavior |
|---|---|
| `continue` | Advance normally. |
| `degrade` | Persist the target profile, preserve completed work, and use it for remaining dispatches. Allowed only when the guard returned a target and the remaining work is safely degradable. |
| `halt` | Stop before another agent call; print exact used/cap values and Evidence + Usage for completed work. |

If a cap is reached during an in-flight wave, record the results and enforce at the immediately following boundary. Never silently continue unmetered, invent a larger budget, or ask a mid-batch cost question. Scientific/research paths that cannot safely degrade halt at their cap.

---

## Usage summary format

Print this block at the end of every task, regardless of profile. On dispatch / handoff builds it prints **after** the structured Evidence block (work product — see [output-style.md](output-style.md) §7); on other skills it remains the final block after task output. Usage is cost and process accounting only — never a replacement for Evidence or the task result itself.

```text
── Hyperflow Usage ─────────────────────────────────────────
Profile: standard              budget 50.0k
Planning                       2 agents    8.2k tokens
Execution                      3 agents   24.0k tokens
Review                         2 agents    7.5k tokens
Verification                   1 agent     3.0k tokens
Duplicate context                         5.4k · 12.7%
Cache hit                                  31.0%
Retry cost                                 2.1k tokens
Accepted commits                          2 · 21.4k tokens/commit
Estimated records                         0
Total                           8 agents   42.7k tokens
Ledger                          .hyperflow/usage/<chain-id>.jsonl
────────────────────────────────────────────────────────────
```

For tasks with escalation, add a line before Total:

```text
Escalations                    1 · fast → standard · scope-expansion
```

For a guard halt, add `Budget: halted · <phase> <used>/<cap> · total <used>/<cap>` before the Total row. For a safe degradation, add `Budget: degraded <from> → <to> at <phase> boundary`.

If the task was downgraded, the profile line reads `Profile: deep → standard · budget 200.0k → 50.0k`; the separate Budget line identifies the boundary. Never preserve the old profile's unused allowance after degradation.

---

## Anti-patterns

**Do not escalate for solvable local decisions.** Adding an import, renaming a variable, or choosing between two equivalent implementations are not escalation triggers. Workers must exhaust their own judgment first. A worker who escalates on every surprise is noise, not signal.

**Do not downgrade to save tokens if the task is risky.** Token budget is secondary to correctness and safety. Never downgrade a task touching auth, secrets, or prod config just because it is running long. When in doubt: stay at the higher profile.

**Do not swallow ESCALATE signals.** If a worker returns `ESCALATE:`, the orchestrator must surface it. Silent escalation handling (absorbing the signal and continuing at the same profile) defeats the purpose and hides scope creep from the user. The `ESCALATED —` line must always be printed.

**Do not skip risk escalation for "small" irreversible changes.** There is no such thing as a small schema drop or a minor auth bypass. The irreversibility check is binary — it either is or it isn't. Size does not factor in.

**Do not print the usage summary before work is complete.** The summary is a terminal output — it signals to the user that the task is done. Printing it mid-flight creates false closure and confusion about whether the task finished.

**Do not track tokens at task level only.** Token accounting must be per-agent, per-phase, and per-batch so the guard catches a phase/total cap at the first natural boundary, not after all batches complete.

**Do not re-run completed sub-tasks after escalation unless the escalation reason invalidates them.** If a worker found and documented 3 files correctly before escalating, those 3 files are already known — do not search them again. Escalation adds capacity, it does not reset progress.

**Do not present escalation as failure.** Escalation is the system working correctly. The user should understand it as "the task revealed itself to be larger than initially assessed" — not as an error or a mistake by the orchestrator.
