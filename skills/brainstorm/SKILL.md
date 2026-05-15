---
name: brainstorm
description: Use when the user is exploring a design idea, weighing approaches, has an ambiguous request, or says "should I", "how should we", "what's the best way to". Defers implementation until the design is approved.
---

# Brainstorm

## Core Rule

Brainstorming is **thinking, not building**. Never write code until the user approves a design.

## Flow

### Step 1: Context Exploration (silent)

Dispatch `⚡ [Searcher] Mapping context relevant to <idea>` — find existing code, patterns, similar features. Do not ask the user what you can find in the code.

### Step 2: Multi-Dimensional Analysis (silent)

Analyze across 6 dimensions:
1. **User intent** — what is the real underlying need?
2. **Technical fit** — how does this fit existing architecture?
3. **Scope** — minimum viable vs maximum scope
4. **Constraints** — time, deps, perf, compatibility
5. **Risks** — what could go wrong, what's irreversible
6. **Alternatives** — at least 3 ways to solve this

Identify which dimensions have unknowns requiring user input.

### Step 3: Smart Questions (AskUserQuestion tool — MANDATORY)

Use the `AskUserQuestion` tool — never plain text questions. Ask only about unknowns from step 2.

**Question budget: 4–5 total.** Skip dimensions where the answer is obvious from context. Never stack more than 2 questions per `AskUserQuestion` call.

Question categories (in order):
1. **Intent Clarification** — confirm the real goal
2. **Constraint Discovery** — what must / must not happen
3. **Assumption Challenging** — "you said X, did you mean Y instead?"
4. **Scope Boundaries** — what's IN vs OUT

### Step 4: Requirement Synthesis

Restate what you heard: "So the goal is X, with constraints Y, excluding Z." Get explicit confirmation.

### Step 5: Propose 2–3 Approaches with Trade-offs

For each approach:
- **Name:** short label
- **What:** 1–2 sentence summary
- **Pros:** what this gets right
- **Cons:** what it sacrifices
- **Fit:** how well it matches the stated goal/constraints

Recommend one, but make it the user's choice.

### Step 6: Section-by-Section Design (approval-gated)

Present design in 5 sections, **getting approval after each before moving on**:

1. **Architecture** — how components fit together
2. **Data flow** — what goes where
3. **Key decisions** — trade-offs made and why
4. **Edge cases** — what could go wrong
5. **File structure** — what gets created/modified

If user pushes back on any section → revise before continuing.

### Step 7: Spec Output

For non-trivial features (3+ files / multiple subsystems), write the approved design to `docs/specs/<feature-slug>.md`. For simpler designs, summarize inline.

### Step 8: Hand Off

After design approval, prompt: "Ready to implement? Invoke `/hyperflow:hyperflow` or `/hyperflow:plan` to decompose into tasks." Do not auto-transition — the user owns the next step.

## Anti-Patterns

- Writing code during brainstorming
- Asking more than 5 questions total
- Stacking 3+ questions in one `AskUserQuestion` call
- Skipping the alternatives step (always offer 2–3)
- Asking what's discoverable from the codebase
- Adding features the user didn't request (YAGNI ruthlessly)

## Memory Integration

After design approval:
- Persist key decisions to `.hyperflow/memory/decisions.md` with tags
- Pitfalls discovered → `.hyperflow/memory/pitfalls.md`

## References

- [brainstorming-advanced.md](../hyperflow/brainstorming-advanced.md) — deeper question framework
- [memory-system.md](../hyperflow/memory-system.md) — persistence format
