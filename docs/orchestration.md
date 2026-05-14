# Orchestration Pattern

## Core Concept

Every task — no matter how small — goes through the orchestrator pattern:

```
Decompose -> Dispatch -> Execute -> Review -> Synthesize -> Repeat
```

This is not optional. A single file rename still gets dispatched to a Sonnet worker and reviewed by Opus.

## Why Always Multi-Agent?

1. **Consistency** — every change gets reviewed, no exceptions
2. **Context isolation** — workers start fresh, no accumulated confusion
3. **Parallel speed** — independent tasks run simultaneously
4. **Learning accumulation** — each batch's discoveries improve the next

## The Flow

### Step 1: Decompose

Opus analyzes the request and identifies independent sub-tasks:

```
"Add user authentication" ->
  Task 1: Create auth middleware (independent)
  Task 2: Create login page (independent)
  Task 3: Create user model (independent)
  Task 4: Wire up routes (depends on 1, 2, 3)
```

Tasks 1-3 run in parallel. Task 4 waits.

### Step 2: Dispatch

Opus crafts a self-contained prompt for each worker using the template in `skills/auto-pilot/worker-prompt.md`. Key principle: workers never "check the plan" — they receive everything they need in the prompt.

### Step 3: Execute

Sonnet workers run in parallel. Each returns:
- What they did (one-line summaries)
- Notes for future tasks (patterns, gotchas)

### Step 4: Review

Opus reviews each output:
- **APPROVED** — work is done
- **NEEDS_FIX** — specific issues listed, sent back to worker

### Step 5: Synthesize

Opus collects learnings from all workers and crafts context for the next batch:

```markdown
## Learnings from prior tasks
- Auth middleware uses JWT with RS256 (not HS256)
- User model has a `role` enum, not a string field
- Project uses zod for all validation schemas
```

### Step 6: Repeat

Next batch of workers receives accumulated learnings. This prevents repeated mistakes and ensures consistency across the codebase.

## Handling Failures

When a worker reports issues:

1. **Simple fix** — Opus sends specific fix instructions back to the same worker
2. **Complex issue** — Opus re-dispatches with an Opus-model agent for deeper reasoning
3. **Blocked** — Opus asks the user for clarification (this is the only time the user is interrupted)
