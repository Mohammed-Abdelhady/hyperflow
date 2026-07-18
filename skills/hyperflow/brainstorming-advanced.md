# Advanced Brainstorming Framework

Extends Layer 4 with structured question clarification, multi-dimensional analysis, and host
`structured_question` integration ([runtime-contract.md](runtime-contract.md)). Use this as the
reference for how the orchestrator runs the brainstorming flow on every provider.

Provider-neutral ops: clarifications use `structured_question`; when that op is unavailable, emit the
exact Hyperflow Question chat block and **end the turn**. Continuation after design approval uses
`skill_continuation` (or inline load of the target skill) and worker/reviewer `spawn` with separate
roles under inline fallback. No model-tier routing — every consultation and worker runs on the
current session model.

---

## Phase 1: Multi-Dimensional Analysis (silent)

Before asking the user anything, score these 6 dimensions internally. Do not show this to the user.

| Dimension | What to evaluate | Example unknown |
|-----------|-----------------|-----------------|
| Technical | Stack fit, API design, data model | "Does this need a new DB table or extend existing?" |
| UX | User flow, interaction patterns, accessibility | "Is this a modal or a full page?" |
| Performance | Load impact, caching needs, bundle size | "Will this load data eagerly or lazily?" |
| Security | Auth boundaries, data exposure, input validation | "Should this be behind auth?" |
| Scalability | Growth patterns, multi-tenant, data volume | "Will this handle 10 or 10K items?" |
| Maintainability | Testing strategy, code ownership, extensibility | "Who maintains this long-term?" |

**Score each:** `clear` (no unknowns) / `uncertain` (some unknowns) / `blind` (critical unknowns)

Only ask questions for `uncertain` and `blind` dimensions. `blind` gets priority.

Capability-aware research: unresolved Technical/Security dimensions that need public sources use
`web_research` when present; otherwise skip network research and record the limitation.

**Dimension → technique mapping:**

| Score + Dimension | Technique to apply |
|-------------------|--------------------|
| blind Technical | Constraint Discovery |
| blind UX | Intent Clarification |
| uncertain Security | Assumption Challenging |
| Multiple blind | Scope Boundaries first to narrow |

---

## Phase 2: Smart Question Sequence

Four techniques, applied based on blind spot analysis. Max 4–5 questions total — not 4 per technique.

**1. Intent Clarification** — What problem does this actually solve?

Goes beyond the literal request to surface the underlying goal. User says "add a sidebar" → real intent might be "improve navigation for power users."

Use `structured_question` with 2–3 options showing different interpretations of the real goal.

**2. Constraint Discovery** — What limits exist that weren't mentioned?

Surfaces technical, timeline, and compatibility constraints. Check: existing tech stack, backward compatibility, performance budgets, target platforms. Skip constraints discoverable from the codebase — find those through context exploration.

**3. Assumption Challenging** — What are we both assuming that might be wrong?

After gathering initial requirements, identify 2–3 implicit assumptions and validate them explicitly. Example: "I'm assuming this needs to work offline — is that correct?" Use confirm/deny options with a preview of what changes per assumption.

**4. Scope Boundaries** — What is explicitly NOT part of this?

Prevents scope creep. Present likely adjacent features and confirm they're out of scope. Example: "Should this include [feature A] or [feature B], or just the core [X]?"

**Rules:**
- Skip any technique where the answer is already obvious from context
- Each question MUST use `structured_question` — never free-form invent-and-continue past a material unknown
- Skip questions with a single obvious answer
- When structured UI is missing: Hyperflow Question + end turn (never silent-default)

---

## Phase 3: Requirement Synthesis

After the question sequence, present this summary and get confirmation before proposing approaches:

```
## Discovered Requirements
- **Goal:** [one sentence]
- **Constraints:** [list]
- **Confirmed assumptions:** [list]
- **Out of scope:** [list]
- **Key unknowns resolved:** [list]
```

User confirms → move to approach proposals. Confirmation is a structural gate when the flow requires
it: use `structured_question` or the chat fallback + end turn; do not assume confirmation.

---

## `structured_question` Patterns

All brainstorming questions MUST use the host `structured_question` op. Semantic form below; adapters
bind to live tools (Claude: `AskUserQuestion`; others: Hyperflow Question chat block when no UI).

**Standard clarification** — multiple choice with descriptions:

```
structured_question({
  questions: [{
    question: "What's the primary goal of this feature?",
    header: "Intent",
    options: [
      { label: "Option A", description: "..." },
      { label: "Option B", description: "..." }
    ],
    multiSelect: false
  }]
})
```

**Architecture/layout comparisons** — use `preview` for side-by-side ASCII mockups:

```
structured_question({
  questions: [{
    question: "Which layout approach?",
    header: "Layout",
    options: [
      {
        label: "Sidebar",
        description: "Persistent nav panel on the left",
        preview: "┌──────┬────────┐\n│ Nav  │Content │\n│      │        │\n└──────┴────────┘"
      },
      {
        label: "Top nav",
        description: "Horizontal bar above content",
        preview: "┌────────────────┐\n│   Navigation   │\n├────────────────┤\n│    Content     │\n└────────────────┘"
      }
    ]
  }]
})
```

**Scope boundaries** — use `multiSelect: true` when excluding features:

```
structured_question({
  questions: [{
    question: "Which of these are OUT of scope for now?",
    header: "Scope",
    options: [...],
    multiSelect: true
  }]
})
```

**Chat fallback (structured UI unavailable):**

```text
Hyperflow Question
Which of these are OUT of scope for now?

1. Feature A (Recommended) — defer adjacent work
2. Feature B — include now
3. Other — I'll describe
```

Then **end the turn**. Resume only after the user answers.

**Rules:**
- Never ask more than 2 questions per `structured_question` call
- Use `preview` only for visual/structural comparisons — not text-only choices
- Always include `description` on every option when the structured UI supports it
- `header` should be 1–2 words matching the technique: Intent / Constraint / Assumption / Scope
- Binary action gates carry no `(Recommended)` marker; multi-option lists (3+) mark recommended first

---

## Full Flow

```
User shares idea
    |
Explore context — check files, docs, recent commits
    |   (web_research when public sources are required and available)
    |
Multi-Dimensional Analysis (silent)
    |   Score 6 dimensions: clear / uncertain / blind
    |   Map blind spots to question techniques
    |
Smart Question Sequence (via structured_question)
    |   1. Intent Clarification    (if UX/goal is blind)
    |   2. Constraint Discovery    (if Technical is blind)
    |   3. Assumption Challenging  (if uncertain dimensions exist)
    |   4. Scope Boundaries        (if multiple blind dimensions)
    |   Max 4-5 questions total. Skip obvious ones.
    |   Missing structured UI → Hyperflow Question + end turn
    |
Requirement Synthesis
    |   Present structured summary — user confirms before proceeding
    |
Propose 2-3 approaches with trade-offs + recommendation
    |
[User] Picks approach
    |
Present design in sections, get approval per section
    |
[User] Approves full design
    |
skill_continuation (or inline load) into Layer 3 orchestrator for implementation
    |   Workers/reviewers: separate spawn (or labelled inline phases)
```
