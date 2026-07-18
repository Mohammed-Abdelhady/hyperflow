# Adaptive brainstorming

## Why adaptive

Grounded inspection, not mandatory questioning, prevents misalignment on clear work. Deterministic
fast-lane tasks use a silent recap after the affected surface is known. Standard tasks ask only
questions whose answers would change the implementation. Open-ended, creative, security, and
correctness-sensitive work keeps the deeper exploration and approval gates.

Capability-aware research: when a dimension needs public-web context (APIs, CVEs, framework defaults),
use `web_research` when present; when absent, skip network research, record `unavailable`, and never
invent citations ([runtime-contract.md](runtime-contract.md)).

## Depth derivation

Brainstorm depth is derived from `ambiguity`. A high-confidence deterministic fast lane uses `none`; other clear work may complete light analysis without asking. If a task type forces a higher minimum depth, the higher value wins.

| Ambiguity score | Depth    | Behavior summary                                                              |
|-----------------|----------|-------------------------------------------------------------------------------|
| 0.0 – 0.2       | none     | Grounded silent recap; no clarification question                              |
| 0.2 – 0.5       | light    | 0–2 material questions; no alternatives proposal                              |
| 0.5 – 0.8       | standard | **3 `structured_question` calls**; 2–3 alternatives proposal with trade-offs  |
| 0.8 – 1.0       | deep     | Full 6-dimension exploration; 4–5 questions; section-by-section approval      |

## The 3 depth modes

### Mode: none

**When:** deterministic fast lane, or ambiguity <0.2 with a fully grounded reversible request and no forced minimum.

**Behavior:** inspect the affected files/callers, record a one-sentence intent recap, and proceed without a user question. Any discovered ambiguity or broader scope exits this mode before mutation.

**Token cost:** no agent call.

---

### Mode: light

**When:** ambiguity 0.2–0.5, AND no type forces a higher minimum depth.

**Behavior:**

1. Orchestrator silently runs the 6-dimension analysis (see Question framework section).
2. If exactly ONE dimension is unclear and its answer would change the implementation, fire one
   `structured_question` call with that question (2-4 options plus an "Other" escape).
3. If all dimensions resolve cleanly without asking, proceed with a single-sentence recap.
4. No alternative proposal step.

**Token cost:** ~500–2k tokens.

**Example — question fired:**

```text
[silent 6-dim analysis: intent clear, constraints clear, assumptions clear, scope clear,
 trade-offs clear, edge cases: unclear whether to preserve original function for deprecated
 callers or delete immediately]
```

Then fires one `structured_question`:

```text
Question: How should existing callers of `getUser` outside this repo be handled?
Options:
  A) Delete the old function immediately — callers are all in this codebase
  B) Keep `getUser` as a deprecated alias pointing to `fetchUser` for one release cycle
  C) Other — I'll describe
```

**Example — no question needed:**

```text
[silent 6-dim analysis: all dimensions resolved from reading src/auth.ts and its 3 callers]
Intent: rename `getUser` to `fetchUser` and propagate to all callers in this repo.
[proceeds]
```

---

### Mode: standard

**When:** ambiguity 0.5–0.8, OR a task type forces this as the minimum depth.

**Behavior:**

1. Silent 6-dimension analysis.
2. 2-3 `structured_question` calls — one logical question per call, most-impactful question first.
3. Propose exactly 2 alternatives with a trade-off table (one row per dimension that differs).
4. User picks one alternative → proceed.

**Token cost:** ~3k–8k tokens.

**Trade-off table format (standard mode example):**

| Dimension        | Option A: REST endpoint  | Option B: GraphQL field   |
|------------------|--------------------------|---------------------------|
| Implementation   | 2 hours                  | 4 hours                   |
| Client changes   | None — existing shape    | Requires schema update    |
| Caching          | HTTP cache headers       | Apollo client cache       |
| Future extensibility | Harder to add filters | Flexible by design      |

---

### Mode: deep

**When:** ambiguity ≥ 0.8, OR a `creative` type is present in the triage output.

**Behavior:**

1. Silent 6-dimension analysis (verbose — all six dimensions written out internally).
2. 4-5 `structured_question` calls — one logical question per call, most-impactful first.
3. Propose 2-3 alternatives with a trade-off table.
4. After the user picks an alternative, present the design in approval-gated sections:
   - Architecture — how components fit together
   - Data flow — what data moves where and in what shape
   - Key decisions — trade-offs made and why
   - Edge cases — what could break and the mitigation plan
   - File structure — what files get created, modified, or deleted
5. Present ONE section per message. Wait for approval before the next (`structured_question` for yes / feedback when the host needs a formal gate; otherwise the same Hyperflow Question chat fallback).
6. For features touching 3+ files, write a brief spec to `.hyperflow/specs/` before dispatching workers.

**Token cost:** ~10k–40k tokens (front-loaded, preventing 10× that cost in rework).

**Section approval sequence (deep mode example):**

```text
[ARCHITECTURE]
The feature uses a provider pattern: a top-level `FeatureFlagProvider` injects a
`FlagContext` that all child components read. No prop drilling.
Flags are fetched once on mount and held in a ref — no re-render on flag reads.

Approve this section? (yes / feedback)
```

→ User: "yes"

```text
[DATA FLOW]
1. `FeatureFlagProvider` calls `GET /api/flags?userId=<id>` on mount.
2. Response `{ flags: Record<string, boolean> }` stored in `flagRef.current`.
3. `useFlag(name)` reads `flagRef.current[name] ?? false` — synchronous, no suspense.
4. Flag overrides in `.env.local` are merged before storing (local dev only).

Approve this section? (yes / feedback)
```

Each subsequent section follows the same pattern until all five are approved or the user
invokes "skip to implementation."

---

## Depth resolution algorithm

The orchestrator must apply this algorithm exactly, in order, on every task:

```text
1. Read `ambiguity` from triage output.
2. Derive base_depth from the ambiguity table above.
3. Read `types[]` from triage output.
4. For each type in the override table, determine its forced_minimum.
5. If any forced_minimum > base_depth → set depth = forced_minimum.
6. Otherwise depth = base_depth.
7. Run brainstorming at the resolved depth.
```

**Depth ordering** (from lowest to highest): none < light < standard < deep.

If multiple types appear in a single triage output and they force different minimums, take the
highest among them. Example: a task classified as both `security` and `creative` forces `deep`
(creative's minimum), even if `security` alone would only require `standard`.

---

## Depth overrides from task type

Some task types force a minimum brainstorm depth regardless of the ambiguity score. If the
forced minimum is higher than what ambiguity alone would produce, the higher depth wins.

| Type in triage output  | Minimum depth | Reason                                              |
|------------------------|---------------|-----------------------------------------------------|
| creative               | deep          | Design space needs full exploration                 |
| architect              | standard      | Architectural decisions deserve explicit discussion |
| security               | standard      | Security choices need informed user consent         |
| scientific             | standard      | Correctness assumptions must be stated explicitly   |
| research               | light         | The research itself is the brainstorming            |
| bugfix (clear repro)   | none          | Repro and affected surface can fully define the change |
| docs                   | none          | Clear audience and requested depth need no ceremony    |

**Override rule:** compare the ambiguity-derived depth to the type-forced minimum and take the deeper value. `none` is allowed only when no type forces a deeper pass.

## Section-by-section approval

Applies only in `deep` mode, after an alternative has been selected.

1. Present ONE section per message — never bundle multiple sections.
2. Wait for explicit approval before sending the next section. Valid approvals: "yes", "go",
   "next", or any substantive feedback that implies the section is understood.
3. If the user gives feedback on a section → revise that section, re-present it, and wait again
   before proceeding. Do not advance while a section is under revision.
4. If the user says "skip to implementation" → record approval-by-default for all remaining
   sections and proceed to hand-off. Log which sections were skipped.
5. Never present all sections in a single message. A wall-of-text bypasses the gate and defeats
   the purpose of section-by-section review.

## Question framework — the 6 dimensions

Silently analyze every task across these six dimensions before deciding what (if anything) to
ask. Only surface questions about dimensions that are genuinely unclear AND whose answer would
change the implementation. Never ask about a dimension the orchestrator can resolve by reading
existing code or configs.

1. **Intent** — what does the user actually want to achieve? (Not the literal request words —
   the underlying goal. A request to "add a loading spinner" may actually mean "make the UI feel
   responsive.")

2. **Constraints** — what limits the solution? (Time, stack, external deps, performance targets,
   browser/runtime compatibility, licensing, regulatory requirements.)

3. **Assumptions** — what is the orchestrator assuming that could be wrong? (About the codebase
   structure, the user's environment, data shapes, existing conventions, or API contracts.)

4. **Scope** — what is in vs. out? Scope creep is brainstorming's job to surface before
   implementation begins. Any task that could reasonably expand must have its boundary stated
   explicitly.

5. **Trade-offs** — which dimensions matter most to the user? (Speed vs. correctness, simplicity
   vs. flexibility, backward compatibility vs. clean architecture, etc.)

6. **Edge cases** — what could break? (Empty states, error paths, concurrency, scale, security
   surface area, i18n/RTL, accessibility.)

## `structured_question` rules

Material clarifications and structural gates use the host `structured_question` op
([runtime-contract.md](runtime-contract.md)). Host mapping examples: Claude `AskUserQuestion`;
hosts without structured UI use the Hyperflow Question chat fallback below.

1. ALL clarifying questions use `structured_question` — never free-form invent-and-continue questions
   that skip the gate.
2. Max 2 questions per single `structured_question` call.
3. Each call contains one logical question. A sub-question that depends on the first answer
   should be a separate call fired after the first answer is received.
4. Each question must include 2-4 concrete options plus an "Other / I'll describe" escape hatch.
5. Order questions by impact: the question whose answer most constrains the design space goes
   first.
6. Never ask "should I proceed?" — that is a confirmation request, not a clarification. Banned
   unconditionally.
7. Never ask anything the orchestrator could answer by reading existing files, configs, or
   dependency manifests.
8. **Blocking fallback:** when `structured_question` is unavailable, render the exact Hyperflow
   Question chat block, persist a safe checkpoint if the host will lose context, and **end the
   turn**. Never silent-default; never continue execution past a material unknown.

**Hyperflow Question block (when structured UI is missing):**

```text
Hyperflow Question
<question>

1. <recommended option> (Recommended) — <short consequence>
2. <option> — <short consequence>
```

Binary action gates (`Yes/No`, `Approve/Revise`, …) carry **no** `(Recommended)` marker.
Named-workflow and multi-option lists (3+) mark a recommended option first.

## Hand-off to flow

When brainstorming closes — meaning all questions are answered and
(in standard/deep mode) an alternative is approved — perform the following steps in order:

1. Update the triage output object in working memory with any new information surfaced during
   brainstorming (e.g., revised complexity estimate, newly discovered type, scope boundary
   change).
2. Print a one-line summary: `Design approved: <approach>. Proceeding with <flow> profile.`
3. Hand control to the flow profile that triage originally selected (or revised during step 1).
4. The approved design — including chosen alternative and any section approvals — becomes the
   authoritative spec passed into worker prompts. Workers must not re-derive intent independently.
   Worker/reviewer execution uses `spawn` (or labelled inline phases) on the **current session
   model** — no per-role model routing.

**Spec file format** (deep mode, 3+ files, written to `.hyperflow/specs/<slug>.md` before dispatch):

```text
# Spec: <feature name>

## Approved approach
<one paragraph from the chosen alternative>

## Architecture decisions
<bullet list of key decisions and rationale>

## Files affected
| File | Action |
|------|--------|
| src/foo.ts | Create |
| src/bar.ts | Modify — add X |
| tests/foo.test.ts | Create |

## Edge cases to handle
<bullet list from the edge-cases section approval>

## Out of scope
<explicit list of things NOT to do in this task>
```

Workers receive the spec path as part of their prompt context. They must not deviate from the
approved approach without escalating back to the orchestrator.

## Anti-patterns

The following behaviors are explicitly prohibited. The orchestrator must not exhibit any of them.

- **Skipping grounded inspection** because a task "looks small" → the `none` mode still maps callers,
  scope, and risk before mutation; it skips questions, not analysis.
- **Asking "should I X?"** — this is confirmation-seeking, not clarification. It is banned in all
  depth modes.
- **Stacking multiple questions in one message** outside of a formal `structured_question` call →
  break them up, one logical question per call, and wait for the answer (or end-turn on chat fallback).
- **Proposing only one solution** in standard or deep mode → always present 2+ alternatives with
  explicit trade-offs.
- **Writing code before design approval** in deep mode → the spec must be approved section by
  section before any file is created or modified.
- **Bundling all sections** into one message in deep mode → one section per message, full stop.
- **Asking about information available in the codebase** → read the file first; only ask if
  the answer truly cannot be found by inspection.
- **Treating brainstorming as a checklist** → it is an active reasoning phase, not a form to
  fill out. If a dimension is clearly resolved, move on silently.
- **Silent-defaulting a gate** when structured input is missing → always Hyperflow Question + end turn.
