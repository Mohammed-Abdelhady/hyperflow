# Dispatch resume (failure UX)

When `plan` → `dispatch` dies mid-chain, do not restart from zero.

## One-screen recovery

Prefer the deterministic script (same output the `/hyperflow:status` skill should print):

```bash
python3 scripts/status.py --resume
```

Or from a non-plugin cwd with the install root known:

```bash
python3 "$PLUGIN_ROOT/scripts/status.py" --root /path/to/project --resume
```

Agent shortcut: `/hyperflow:status` (skill runs the script when available).

Then answer:

| Question | Where to look |
|---|---|
| What feature/slug was running? | `DISPATCH_RESUME` slug / `.hyperflow/tasks/` / status output |
| Which batch finished? | `finished_batches` / task file batch checkboxes / Evidence |
| What failed? | `failed_at` + `error` / `WORKER_ABORT` line / gate log |
| What memory is trusted? | `memory_ok` (from `scripts/memory-hygiene.py`: duplicate + polarity conflicts) / `.hyperflow/memory/decisions.md` + learnings (hot tier) |

## Resume rules

1. **Do not re-plan** if the spec/tasks are still correct.  
2. **Re-dispatch from the failed batch** only (`/hyperflow:dispatch` with the same feature slug / remaining tasks).  
3. If the failure was a **gate** (lint/typecheck/test), fix forward on the worker branch, then continue review.  
4. If the failure was **worker tool crash**, follow [failure-recovery.md](../skills/hyperflow/failure-recovery.md) retry taxonomy (1 identical → 2 escalated → abort).  
5. If the user changed requirements, write a **new decision** to memory, then re-plan the remaining work only.

## Print template (agents)

When dispatch fails, run `python3 scripts/status.py --resume-only` (or print the same shape by hand):

```text
DISPATCH_RESUME
slug: <feature-slug>
finished_batches: <n>
failed_at: <batch|gate|worker|review>
error: <one line>
next: <re-dispatch batch K | fix gates | abort>
memory_ok: <yes|review memory (...conflict...)>
```

`memory_ok` is produced by the same scanner as `scripts/memory-hygiene.py` (duplicate headings + Use/Avoid polarity clashes). Run `python3 scripts/memory-hygiene.py --memory-dir .hyperflow/memory` for CONFLICT/WARN/PRUNE detail before resuming when it is not `yes`.

Then stop for structural user input only if the next step is abort, push, or deploy.

## Related

- [Failure recovery](../skills/hyperflow/failure-recovery.md)  
- [Orchestration](orchestration.md)  
- `/hyperflow:status` · `scripts/status.py`  
