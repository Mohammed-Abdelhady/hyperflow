# Hyperflow eval harness

The eval harness is a small, dependency-free set of golden tasks for the portable core. It catches claim and contract regressions that unit tests alone may miss: surface registration, host wording, inert startup, current Markdown links, handoff round trips, and bounded review memory.

## Run

```bash
npm run validate-plugin
npm run unittest
npm run evals
node scripts/run-evals.mjs --list
node scripts/run-evals.mjs --json
```

All checks are local and read-only. Evals do not simulate multi-agent runs or claim host certification. A task fails closed when its check type is unknown, a path escapes the repository, or a required file/claim is missing.

## Add a task

1. Add `evals/tasks/<id>.json` with an `id`, `title`, and one or more supported checks. Handoff fixtures may use `handoff_round_trip` to verify a reviewed Markdown package, its exact `task_pointer`, and resolvable Git `base_ref`/`head_ref` values. Review-memory fixtures may use `review_memory` to verify accepted-only, bounded entries with an audit pointer.
2. Extend `scripts/run-evals.mjs` only when the contract cannot be expressed by an existing check.
3. Run the three maintainer gates from the repository root.
