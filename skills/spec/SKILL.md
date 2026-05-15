---
name: spec
description: Use when the user is exploring a design idea, weighing approaches, has an ambiguous request, or says "should I", "how should we", "what's the best way to". Asks structured questions, proposes 2–3 approaches, walks the design section-by-section. On approval, **auto-chains into `/hyperflow:scope`** — no manual gate.
---

# Spec

Brainstorming is **thinking, not building**. No code until the user approves a design. On approval, the chain advances to scope → dispatch. The user picks the advancement mode at Step 0.

## Flow

### Step 0 — Choose chain mode (FIRST tool call)

If invoked with a `chain-mode=<auto|manual>` arg (from a prior skill in the chain), skip this step.

Otherwise, **before any research or analysis**, ask via `AskUserQuestion` with a short explanation:

```
How should I advance through the chain after each phase?

  Auto     — chain forward through spec → scope → dispatch with no gates.
             Fewer interruptions, faster end-to-end.

  Manual   — pause between phases and ask before advancing.
             More control, more confirmations.
```

Save the chosen mode (`auto` or `manual`) and propagate it via `args: "chain-mode=<mode>"` whenever this skill invokes the next phase. Default to `auto` if the user gives no clear answer.

### Step 1 — Context Exploration (silent)

Dispatch `Searcher — mapping context relevant to <idea>`. Find existing code, patterns, similar features. Do not ask the user what you can find in the code.

### Step 2 — Multi-Dimensional Analysis (silent)

Analyze across 6 dimensions:
1. **User intent** — what is the real underlying need?
2. **Technical fit** — how does this fit existing architecture?
3. **Scope** — minimum viable vs maximum scope
4. **Constraints** — time, deps, perf, compatibility
5. **Risks** — what could go wrong, what's irreversible
6. **Alternatives** — at least 3 ways to solve this

Identify which dimensions have unknowns requiring user input.

### Step 3 — Smart Questions (`AskUserQuestion` — MANDATORY)

Use the `AskUserQuestion` tool. Never plain text questions. Ask only about unknowns from step 2.

**Question budget — 4–5 total.** Skip dimensions where the answer is obvious from context. Never stack more than 2 questions per `AskUserQuestion` call.

Question categories (in order):
1. **Intent clarification** — confirm the real goal
2. **Constraint discovery** — what must / must not happen
3. **Assumption challenging** — "you said X, did you mean Y instead?"
4. **Scope boundaries** — what's IN vs OUT

### Step 4 — Requirement Synthesis

Restate what you heard: "So the goal is X, with constraints Y, excluding Z." Get explicit confirmation.

### Step 5 — Propose 2–3 Approaches with Trade-offs

For each approach:
- **Name** — short label
- **What** — 1–2 sentence summary
- **Pros** — what this gets right
- **Cons** — what it sacrifices
- **Fit** — how well it matches the stated goal/constraints

Recommend one, but the choice is the user's.

### Step 6 — Section-by-Section Design (approval-gated within `/hyperflow:spec`)

Present design in 5 sections, **getting approval after each before moving on**:

1. **Architecture** — how components fit together
2. **Data flow** — what goes where
3. **Key decisions** — trade-offs made and why
4. **Edge cases** — what could go wrong
5. **File structure** — what gets created/modified

If user pushes back on any section → revise before continuing.

### Step 7 — Spec Output

For non-trivial features (3+ files / multiple subsystems), write the approved design to `docs/specs/<feature-slug>.md`. For simpler designs, summarize inline and pass directly to scope.

### Step 8 — Hand off to `/hyperflow:scope`

Once the design is approved:

**If `chain-mode=auto`** — immediately invoke `Skill` with `skill: scope` and `args: "chain-mode=auto <spec-ref>"`. Print:

```
Spec complete — design approved
Auto-chaining to /hyperflow:scope…
```

**If `chain-mode=manual`** — ask via `AskUserQuestion`: "Spec done. Continue to /hyperflow:scope?" → yes / no / stop. On yes, invoke `Skill` with `skill: scope` and `args: "chain-mode=manual <spec-ref>"`. Print:

```
Spec complete — design approved
Awaiting your go-ahead for /hyperflow:scope…
```

In both modes, the `scope` skill decomposes the design into worker batches; `dispatch` then picks up the task file (respecting the same chain mode).

## Anti-Patterns

- Writing code during the spec phase
- Asking more than 5 questions total (the Step 0 chain-mode question doesn't count)
- Stacking 3+ questions in one `AskUserQuestion` call
- Skipping the alternatives step (always offer 2–3)
- Asking what's discoverable from the codebase
- Adding features the user didn't request (YAGNI ruthlessly)
- Pausing for "should I proceed to plan?" when `chain-mode=auto` — that was already answered at Step 0

## Memory Integration

After design approval:
- Persist key decisions to `.hyperflow/memory/decisions.md` with tags
- Pitfalls discovered → `.hyperflow/memory/pitfalls.md`

## References

- [brainstorming-advanced.md](../hyperflow/brainstorming-advanced.md) — deeper question framework
- [memory-system.md](../hyperflow/memory-system.md) — persistence format
- [DOCTRINE.md](../hyperflow/DOCTRINE.md) — shared rules
- [output-style.md](../hyperflow/output-style.md) — elegant label format
