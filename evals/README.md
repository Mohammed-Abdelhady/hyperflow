# Hyperflow eval harness

Small golden tasks to catch doctrine/process regressions. Not a full product test suite.

## Run

```bash
python3 scripts/run-evals.py
python3 scripts/run-evals.py --list
```

Exit 0 only if all tasks PASS. Tasks are static checks of repo contracts (skills exist, docs linked, router closure, privacy claims). Live multi-agent runs are optional later.

## Add a task

1. Add `evals/tasks/<id>.json`
2. Implement checker in `scripts/run-evals.py` if needed
3. Re-run harness

## Philosophy

Fail closed on **claims** (skill count, default path docs, preview honesty). Do not mock multi-hour dispatch runs in CI.
