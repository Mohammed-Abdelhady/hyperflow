# Worker Prompt Template

Use this template when dispatching Sonnet workers via the Agent tool.

## Template

```
## Task
[One clear objective — what to do, not how to think about it]

## Files in scope
[Exact file paths the worker should read/modify]

## Context
[What this file/module does, relevant project conventions, constraints]

## Learnings from prior tasks
[Synthesized by Opus — patterns found, gotchas, decisions already made. Omit section if first task.]

## Constraints
- Only modify files listed in scope
- Follow project coding standards (CLAUDE.md)
- Do not add "Co-Authored-By: Claude" to any git operation

## Output format
Return:
1. What you did (one-line summary per change)
2. Notes for future tasks (patterns, gotchas, discoveries — omit if none)
```

## Dispatch Example

```
Agent({
  description: "Implement user avatar component",
  model: "sonnet",
  prompt: `## Task
Create a UserAvatar component that displays user initials with a colored background.

## Files in scope
- src/components/UserAvatar.tsx (create)
- src/components/UserAvatar.test.tsx (create)

## Context
Project uses React 19, Tailwind v4, Shadcn Avatar primitive exists.
All components need data-testid attributes.

## Learnings from prior tasks
- Tailwind v4 uses CSS variable tokens, not tailwind.config
- Use logical properties (ms-, me-, ps-, pe-) for RTL safety

## Constraints
- Only modify files listed in scope
- Follow project coding standards
- Do not add "Co-Authored-By: Claude" to any git operation

## Output format
Return:
1. What you did
2. Notes for future tasks`
})
```
