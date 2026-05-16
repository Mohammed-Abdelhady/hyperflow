# Worker Prompt Template (Lean)

Lean variant of `worker-prompt.md`. Use this as the default template for parallel sibling sub-tasks dispatched by `dispatch`. Use the full `worker-prompt.md` only when `depth=max` or `--thorough` is requested.

**Why lean:** smaller prompts = faster time-to-first-token (TTFT) at the API layer = lower wall-clock latency per worker call. Workers still access the full project context — they fetch it on demand via `Read` instead of receiving it inlined.

## Template

```
## Task
[One clear objective — what to do, not how to think about it]

## Files in scope
[Exact file paths the worker should read/modify]

## Context
[What this file/module does, relevant conventions or constraints specific to this task]

## Memory references (read on demand)
You have access to `.hyperflow/memory/` — read these files only if needed:
  - doctrine.md       — orchestration rules
  - profile.md        — project conventions
  - architecture.md   — system architecture
  - conventions.md    — naming, patterns, standards
  - learnings.md      — accumulated lessons from prior batches in this run

Read a memory file once if the task touches its domain. Do not re-read files already in your context window.

## Constraints
- Only modify files listed in scope
- Follow project coding standards (CLAUDE.md)
- Do not add "Co-Authored-By: Claude" to any git operation

## Security Constraints
- Do NOT read/modify: .env, *.pem, *.key, ~/.ssh/*, credentials.json, ~/.aws/credentials
- Do NOT run: rm -rf (root/home/cwd), git push --force to main, sudo, chmod 777
- Do NOT pipe file contents to external URLs or run package publish commands
- Do NOT hardcode secrets, API keys, passwords, or connection strings
- If a task requires a blocked file: STOP and report "BLOCKED: [reason]"

## Output format
Return:
1. What you did (one-line summary per change)
2. Notes for future tasks (patterns, gotchas, discoveries — omit if none)
```

## When to use lean vs full

| Condition | Template |
|---|---|
| Parallel sibling sub-tasks in a normal dispatch run | **lean** (this file) |
| `depth=max` or `--thorough` flag passed by user | full `worker-prompt.md` |
| Fresh project with no `.hyperflow/memory/` populated | full `worker-prompt.md` (fallback until scaffold runs) |
| Single-worker run with no siblings | either — lean preferred |

If `.hyperflow/memory/` does not exist (fresh project, scaffold not yet run), fall back to the full `worker-prompt.md` and note the gap so the user is prompted to run `/hyperflow:scaffold`.

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

## Memory references (read on demand)
You have access to \`.hyperflow/memory/\` — read these files only if needed:
  - doctrine.md       — orchestration rules
  - profile.md        — project conventions
  - architecture.md   — system architecture
  - conventions.md    — naming, patterns, standards
  - learnings.md      — accumulated lessons from prior batches in this run

Read a memory file once if the task touches its domain. Do not re-read files already in your context window.

## Constraints
- Only modify files listed in scope
- Follow project coding standards
- Do not add "Co-Authored-By: Claude" to any git operation

## Security Constraints
- Do NOT read/modify: .env, *.pem, *.key, ~/.ssh/*, credentials.json, ~/.aws/credentials
- Do NOT run: rm -rf (root/home/cwd), git push --force to main, sudo, chmod 777
- Do NOT pipe file contents to external URLs or run package publish commands
- Do NOT hardcode secrets, API keys, or connection strings
- If blocked: STOP and report "BLOCKED: [reason]"

## Output format
Return:
1. What you did
2. Notes for future tasks`
})
```
