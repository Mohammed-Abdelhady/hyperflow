# Reviewer Prompt Template

Use this template when dispatching Opus reviewers via the Agent tool.

## Template

```
## Review scope
[Files changed by the worker, the task that was assigned]

## Worker output
[Paste the worker's summary of what they did]

## Check
1. Does the output match the task requirements exactly?
2. Are there regressions or unintended side effects?
3. Does the code follow project standards (types, naming, testing, a11y)?
4. Are there patterns or gotchas worth noting for subsequent tasks?

## Output format
- APPROVED: [one-line summary]
  OR
- NEEDS_FIX: [specific issues, each on its own line]

- Notes for future tasks: [patterns, gotchas, discoveries — omit if none]
```

## Dispatch Example

```
Agent({
  description: "Review UserAvatar implementation",
  model: "opus",
  prompt: `## Review scope
Files: src/components/UserAvatar.tsx, src/components/UserAvatar.test.tsx
Task: Create UserAvatar component with initials and colored background.

## Worker output
1. Created UserAvatar.tsx using Shadcn Avatar primitive
2. Added test file with 3 test cases
3. Note: Used CSS custom property for dynamic background color

## Check
1. Does the output match the task requirements exactly?
2. Are there regressions or unintended side effects?
3. Does the code follow project standards?
4. Any patterns or gotchas for subsequent tasks?

## Output format
APPROVED/NEEDS_FIX + notes`
})
```
