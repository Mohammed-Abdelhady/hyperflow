# Model Routing Guide

## Philosophy

Not every task needs the most powerful model. Hyperflow routes tasks to the right model based on what the task requires:

- **Opus** handles thinking: orchestration, review, debugging, architecture decisions
- **Sonnet** handles doing: implementation, search, writing, boilerplate

This keeps costs lower and speed higher without sacrificing quality — because Opus reviews everything Sonnet produces.

## Routing Table

| Role | Model | Examples |
|------|-------|----------|
| Orchestrator | Opus | Decomposing "build a dashboard" into 5 parallel tasks |
| Reviewer | Opus | Checking if a worker's component matches the spec |
| Debugger | Opus | Root-causing why tests fail after a refactor |
| Decision-maker | Opus | Choosing between REST vs tRPC for a new API |
| Implementer | Sonnet | Writing a React component from a clear spec |
| Searcher | Sonnet | Finding all files that import a specific module |
| Writer | Sonnet | Creating test files, config files, documentation |

## How It Works in Practice

When you give Claude a task:

1. **Opus** (the orchestrator) receives your request
2. **Opus** breaks it into sub-tasks and identifies which can run in parallel
3. **Opus** dispatches **Sonnet** workers with self-contained prompts
4. **Sonnet** workers execute and return results + notes
5. **Opus** reviews each output — approves or sends back for fixes
6. **Opus** synthesizes learnings and injects them into the next batch
7. Repeat until done

## Customization

To change model assignments, edit the routing table in `skills/auto-pilot/SKILL.md` under "Layer 2: Model Routing".

To pin specific model versions, update the text labels (e.g., "Opus 4.6") and ensure your `~/.claude/settings.json` has `"model": "claude-opus-4-6"` for the main session.
