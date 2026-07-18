# Chain router

Provider-neutral transition contract for Hyperflow skills. The router preserves cross-skill edges, argument propagation, and structural gate checkpoints without depending on a native `Skill` tool.

**Rules**

1. Every continuation uses `skill_continuation`: native invoke when available, otherwise load the target `skills/<name>/SKILL.md` **completely** before any target action.
2. Live skills only. **Retired targets `spec` and `scope` are forbidden** — never route to them, never document them as live chain edges.
3. Structural gates always fire at the documented checkpoint. Autonomy directives do not skip them.
4. Missing structured input → Hyperflow Question chat block + end turn (see [runtime-contract.md](runtime-contract.md)). Never silent-default a gate answer.
5. No model routing. Role separation and security halts follow the runtime contract.

---

## Live public skills (continuation targets)

| Skill | Path | Notes |
|---|---|---|
| `plan` | `skills/plan/SKILL.md` | Planning endpoint; owns build-location gate |
| `dispatch` | `skills/dispatch/SKILL.md` | Build endpoint; owns operational + end-of-chain gates |
| `audit` | `skills/audit/SKILL.md` | Review; owns fix gate → plan |
| `deploy` | `skills/deploy/SKILL.md` | Ship gates + push confirmation |
| `issue` | `skills/issue/SKILL.md` | GitHub outbound chain starter → plan |
| `pr` | `skills/pr/SKILL.md` | GitHub inbound review → audit → comment/merge |
| `design` | `skills/design/SKILL.md` | Design system + spec → plan |
| `handoff` | `skills/handoff/SKILL.md` | Two-session package verbs → dispatch / audit |
| `workflow` | `skills/workflow/SKILL.md` | Portable multi-unit envelope (not a chain edge to retired skills) |
| `trace` | `skills/trace/SKILL.md` | Debug entry; may continue into plan/dispatch per its own flow |
| `scaffold` | `skills/scaffold/SKILL.md` | Setup only; does not start the plan→dispatch chain |
| Others (`cache`, `status`, `sticky`, `bridge`, `flush`, `background`, `hyperflow`) | matching `skills/<name>/SKILL.md` | Operator / support skills; not primary auto-chain edges |

Alias entry points (`/hyperflow:<name>`, `hyperflow <name>`, natural-language function aliases) resolve through [SKILL.md](SKILL.md) portable function router, then load the skill above. Unknown-command replies for `/hyperflow:*` on portable hosts are banned.

---

## Transition table

Every live cross-skill edge. `Target` is a skill name or a non-skill package action.

| From | Decision / trigger | Target | Args / artefacts propagated | Structural gate / checkpoint |
|---|---|---|---|---|
| `issue` | Actionable code issue (feature/bug after triage) | `plan` | `spec=.hyperflow/specs/issue-<n>-<slug>.md`, `gh_issue=<n>`, `pr=<pr-arg>`, `comment=<comment-arg>` | Closed-issue intent gate (binary) before synthesis when needed; plan still owns build-location |
| `design` | **Build now** | `plan` | `session=one`, `spec=.hyperflow/specs/<slug>.md` | Step 6 handoff gate (named-workflow: build now / plan first / stop) |
| `design` | **Plan first** | `plan` | `spec=.hyperflow/specs/<slug>.md` (no auto-dispatch intent) | Same gate; plan still stops at build-location |
| `design` | **Stop** | _(none)_ | Spec remains on disk | End after gate answer |
| `plan` | **This session** (build here) | `dispatch` | Positional `<slug>`, `triage=…`, `mode=…`, `briefs=…`, plus pass-through `gh_issue` / `pr` / `comment` when present. **Do not** pre-pass `commit` / `branch` / `push` — dispatch Step 0.5 owns them | Step 12 build-location gate **always** fires first; artefacts written before the gate |
| `plan` | **Another session** | handoff package (not a skill) | Writes `.hyperflow-handoff/<slug>/` (`HANDOFF.md`, `STATUS=planned`, artefact copy, context copies, `on_complete` from Q2) | Build-location gate Q2 selects `on_complete=review|deploy`; **no implementation** in the planning session |
| `plan` | **Stop** | _(none)_ | Task file remains | Build-location gate; print keep path |
| `dispatch` | End-of-chain audit **Yes** | `audit` | `level=3` (or `level=5` scientific); cumulative diff context | Step 5 combined gate (audit + deploy [+ PR when `pr=ask`]) |
| `dispatch` | End-of-chain deploy **Yes** | `deploy` | Propagated `push=` and chain context; deploy owns push gate | Same Step 5 gate; process after audit answer |
| `dispatch` | PR **Yes** / `pr=auto` | PR exit (dispatch-owned) | Branch, `gh_issue`, `comment`, `pr_images` | Step 5 question [3] or auto; visual PRs require screenshots before create |
| `dispatch` | Handoff build `on_complete=deploy` | `deploy` | Handoff `HANDOFF.md` args; COMPLETION written first | **Skip** normal audit/deploy AskUserQuestion — disposition already encoded |
| `dispatch` | Handoff build `on_complete=review` | _(stop)_ | COMPLETION + `STATUS=built`; range for later audit | Operator returns to session 1 (`handoff review` or `audit <base>..<head>`) |
| `audit` | Fix gate **Fix all** / **Criticals…** | `plan` | `session=one`, `spec=.hyperflow/specs/audit-<YYYY-MM-DD>-<scope-slug>.md` (scoped fix plan) | Step 6 fix gate after findings; plan then stops at **its own** build-location gate — no blind patch |
| `audit` | Fix gate **No** | _(none)_ | Audit file remains | End after gate |
| `audit` | `SECURITY_VIOLATION` | _(halt)_ | Finding surfaced inline; no fix gate | Hard halt; user decides remediation |
| `pr` | Review level selected | `audit` | `"<baseRefName>..pr-<n> level=<L>"` exact range + level | Preflight (auth, closed-PR intent); untrusted-code boundary before audit |
| `pr` | Posting gate | comment / local / skip | Audit verdict + findings; one batched review call | Posting gate (multi-option; `comment=never` → local-only) |
| `pr` | Fix approved + maintainer can modify | `plan` → later `dispatch` on `pr-<n>` | Scoped fix via audit fix path | Standard audit fix gate; never force-push contributor branch |
| `pr` | Merge gate **Yes** | merge (pr-owned) | Method from repo history | Binary merge gate; no `merge=auto` |
| `handoff` | `pickup <slug>` | `dispatch` | Positional handoff slug; Step 1.0 rehydrates artefact | Package `STATUS=planned`; committed range remains authoritative |
| `handoff` | `review <slug>` | `audit` | `"<base>..<head> level=3"` (or `level=5` from originating triage in `HANDOFF.md`) | Require `STATUS=built`; print Evidence from `COMPLETION.md` first |
| `handoff` | After audit clean on review path | optional deploy gate | — | Binary `Run /hyperflow:deploy?`; on NEEDS_FIX the audit fix-gate owns plan continuation |
| `workflow` | Portable adapter units | inline phases / spawn | Progress under `.hyperflow/tasks/` when needed | Adapter-defined gates; **never** falls through to retired `scope` |
| Any chain-starter | `.hyperflow/` missing | `scaffold` then continue | — | Auto-scaffold is mechanical setup, not a user confirmation |

Edges not listed (e.g. `trace` → plan when a fix is planned) follow the owning skill body and still use this continuation + gate discipline.

---

## Argument propagation

Chain args are opaque `key=value` tokens (plus flags like `--thorough`, `--phases=…`). Upstream skills record and forward; downstream skills honor without re-asking when already set.

| Arg family | Typical keys | Producer | Consumer rules |
|---|---|---|---|
| Triage / mode | `triage=`, `mode=`, `briefs=`, `gates=`, `--thorough` | plan / classifier | dispatch / reviewers honor caps and mode |
| Operational git | `commit=`, `branch=`, `push=` | dispatch Step 0.5 (or handoff package) | Skip re-ask when present; push honored by deploy |
| GitHub outbound | `gh_issue=`, `pr=`, `comment=`, `pr_images=` | issue → plan → dispatch | plan does not act on them; dispatch PR exit uses them |
| Session split | `session=one|two`, handoff `on_complete=review|deploy` | plan build-location / HANDOFF.md | dispatch resolves; no second session question at build endpoint |
| Spec / range | `spec=<path>`, git range `<base>..<head>`, `level=<n>` | issue, design, audit, pr, handoff | plan loads `spec=`; audit uses range + level exactly |
| Feature control | `--phases=all|next`, `--from-batch`, `--final-only` | user / prior dispatch | dispatch phase loop |

**Invariants**

- Plan **never** silently starts a build; only the build-location answer does.
- Dispatch **never** silently starts audit/deploy; only Step 5 answers (or handoff `on_complete`) do.
- Audit fixes **never** patch without plan decomposition when the user chose a fix path.
- PR review ranges and handoff `COMPLETION.md` ranges propagate **exactly** — do not widen or invent commits.
- Handoff committed range remains authoritative for second-session review.

---

## Structural gates (checkpoints)

| Gate | Owning skill | Precondition | Skip only when |
|---|---|---|---|
| Closed issue / closed PR intent | issue, pr | Issue or PR not open | User already answered this turn |
| Design handoff | design | Spec written | Never skip when ending a successful design run |
| Build location | plan | Task artefact written | **Never** — always ask |
| Operational choices | dispatch | Build starts; `commit`/`branch`/`push` not propagated | Args already present |
| Phase-dispatch scope | dispatch | Feature mode, ≥2 incomplete phases | Single phase left, `--phases=` set, or `on_complete=deploy` autonomy |
| End-of-chain audit/deploy/PR | dispatch | Normal single-session wrap-up complete | Handoff `on_complete` encodes disposition; `pr=never|auto` adjusts PR question only |
| Audit fix | audit | Findings exist (NEEDS_FIX / suggestions path) | `SECURITY_VIOLATION` (halt, no fix gate) |
| PR posting | pr | Audit finished | `comment=never` → local-only |
| PR merge | pr | PASS / fixes green | `merge=never` |
| Deploy push / commit-inclusion | deploy | Deploy flow reached ship step | Documented deploy skill rules only |
| Security / irreversibility | any | `SECURITY_VIOLATION` or escalation boundary | Never auto-continue |

Portable surfaces without structured UI use the runtime-contract chat fallback for **every** row above. Headless with no channel at a required gate → error and stop (except where a skill documents an explicit non-interactive default for a **non-build** choice, e.g. phase scope `all` when no channel exists).

---

## Inline continuation procedure

When `skill_continuation` has no native tool:

1. Resolve target skill name from the transition table (never `spec` / `scope`).
2. **Read the entire** `skills/<target>/SKILL.md` (and required references it names before acting).
3. Carry forward chain args, artefact paths, and the user's latest gate answer.
4. If a gate answer is still required and structured UI is missing: print Hyperflow Question, write a safe pending-gate checkpoint if the host will lose context across turns, **end the turn**.
5. On the next user message, resume from the checkpoint / last gate — do not re-run completed phases without need.
6. Preserve security blocklist, no-attribution commits, and Evidence/Usage timing of the target skill.

Native `Skill` (Claude Code) still follows the same transition table and gates; only the load mechanism differs.

---

## Resume and pending gates

Optional checkpoint (when cross-turn chat gates need durable state):

- Prefer existing artefacts (task file, audit file, handoff package, chain args in memory).
- If a dedicated pending-gate file is used, keep it under `.hyperflow/`, provider-neutral, and small (question id, options, next skill, args). Do not change task/spec/audit schemas for this.

Dispatch resume: `--from-batch N` / feature `--phases=next` remain the build resume surface; do not invent alternate resume protocols in adapters.

---

## Banned / retired

| Target | Status |
|---|---|
| `spec` as a skill chain target | **Retired** — reject in validation and runtime |
| `scope` as a skill chain target | **Retired** — reject; plan owns decomposition |
| Silent auto-dispatch after plan | **Banned** |
| Silent auto-fix after audit | **Banned** |
| Silent auto-push / auto-merge | **Banned** (deploy/PR gates own consent) |
| "Skill tool unavailable" stop | **Banned** — use inline continuation |
| Provider-specific forks of skill bodies | **Banned** — map via runtime + provider refs only |

---

## Related

- [runtime-contract.md](runtime-contract.md)
- [session-handoff.md](session-handoff.md)
- [SKILL.md](SKILL.md)
- Public skill bodies under `skills/*/SKILL.md`
