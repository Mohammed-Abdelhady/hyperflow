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

## Security Review
5. Were any blocked files read or modified? (.env, *.pem, *.key, ~/.ssh/*, credentials)
6. Any hardcoded secrets? (API keys: sk-*, AKIA*, ghp_*; private keys; connection strings with passwords)
7. Any dangerous commands? (rm -rf, force push, sudo, chmod 777)
8. Any data exfiltration? (file contents piped to external URLs)

## Output format
- APPROVED: [one-line summary]
  OR
- NEEDS_FIX: [specific issues, each on its own line]
  OR
- SECURITY_VIOLATION: [specific violation — takes priority over all other feedback]

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

## Security Review
5. Any blocked files accessed?
6. Any hardcoded secrets?
7. Any dangerous commands?
8. Any data exfiltration?

## Output format
APPROVED/NEEDS_FIX/SECURITY_VIOLATION + notes`
})
```
