# Session Memory

Persist learnings across conversations so future sessions benefit from past discoveries.

## Storage

File: `~/.claude/hyperflow-memory.md` (auto-created on first write)

## How It Works

### Writing memories

After each batch completes, Opus evaluates the synthesized learnings:

- **Ephemeral** (task-specific, not reusable) -> discard after session
- **Reusable** (project patterns, gotchas, conventions) -> append to memory file

Only reusable learnings get persisted. The test: "Would a new worker on this project benefit from knowing this next week?"

### Reading memories

At session start, Opus reads the memory file and filters entries by the current project path. Relevant entries are injected into the first worker prompt's "Learnings from prior tasks" section.

### Pruning

Opus prunes entries that are:
- Older than 30 days
- Contradicted by newer entries (e.g., "uses Express" superseded by "migrated to Fastify")
- No longer accurate (file/pattern no longer exists in the codebase)

Pruning happens at session start, not during active work.

## Entry Format

```markdown
## [2026-05-14] /path/to/project
- Tailwind v4 uses CSS variable tokens, not tailwind.config
- All validation goes through zod schemas in src/shared/validation/
- Use logical properties (ms-, me-, ps-, pe-) for RTL safety
- Auth middleware is at src/domains/auth/server/auth.ts (singleton)

## [2026-05-13] /path/to/other-project
- Uses Express 5 with async error handling
- Database is MongoDB with Mongoose ODM
```

## Rules

1. **One project per section.** Entries are grouped by project path.
2. **No code snippets.** Learnings are patterns and facts, not code blocks.
3. **No duplicates.** Before writing, check if the learning already exists.
4. **Project-scoped.** Only inject learnings from the current project into workers.
5. **User can edit.** The memory file is plain markdown — users can edit it directly.

## Disabling

Say in conversation: "hyperflow: memory off" to disable for the current session.

To clear all memories: delete `~/.claude/hyperflow-memory.md`.
