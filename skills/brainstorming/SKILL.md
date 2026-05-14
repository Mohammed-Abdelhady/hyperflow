---
name: brainstorming
description: Use before any creative work — creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements, and design through collaborative dialogue before implementation.
---

# Brainstorming

Turn ideas into validated designs through focused dialogue before writing code.

## When to Use

- User says "build X", "add Y", "create Z" — anything that creates new functionality
- User describes a problem without a clear solution
- Task involves multiple possible approaches
- Scope is ambiguous or could be interpreted different ways

## When NOT to Use

- Bug fixes with clear reproduction steps
- Direct instructions ("rename X to Y", "delete this file")
- Tasks where the user has already provided a complete spec

## The Process

```
User shares idea
    |
[Opus] Explore context — check files, docs, recent commits
    |
[Opus] Ask ONE clarifying question (prefer multiple choice)
    |
... repeat until requirements are clear ...
    |
[Opus] Propose 2-3 approaches with trade-offs + recommendation
    |
[User] Picks approach
    |
[Opus] Present design in sections, get approval per section
    |
[User] Approves full design
    |
[Opus] Transition to implementation
```

### Rules

1. **One question at a time.** Never stack multiple questions in one message.
2. **Multiple choice preferred.** Easier to answer than open-ended. Include 2-4 options with descriptions.
3. **Always propose alternatives.** 2-3 approaches with trade-offs before settling on one.
4. **Section-by-section approval.** Present design incrementally. Get approval after each section.
5. **YAGNI ruthlessly.** Cut features that aren't essential to the core ask.
6. **Context first.** Explore the codebase before asking questions — don't ask what you can find.

### Design Sections

Scale each section to its complexity. A few sentences if straightforward, more detail if nuanced.

1. **Architecture** — how components fit together
2. **Data flow** — what goes where
3. **Key decisions** — trade-offs made and why
4. **Edge cases** — what could go wrong
5. **File structure** — what gets created/modified

### After Approval

Transition directly to implementation. The design is the spec — no separate spec document needed for simple features.

For complex features (3+ files, multiple subsystems), write a brief spec to `docs/specs/` before implementing.

## Red Flags — You Are Violating This Skill If You:

- Write code before the user approves a design
- Ask more than one question per message
- Skip the alternatives step and jump to a single solution
- Present the entire design at once instead of section by section
- Add features the user didn't ask for
- Start implementing without exploring the codebase first
