# Dispatch resume (failure UX)

When `plan` → `dispatch` dies mid-chain, do not restart from zero.

## One-screen recovery

Run:

```text
/hyperflow:status
```

Then answer:

| Question | Where to look |
|---|---|
| What feature/slug was running? | `.hyperflow/` tasks / artefacts / status output |
| Which batch finished? | Task file batch checkboxes / Evidence |
| What failed? | Last worker error, gate log, `WORKER_ABORT` line |
| What memory is trusted? | `.hyperflow/memory/decisions.md` + learnings (hot tier) |

## Resume rules

1. **Do not re-plan** if the spec/tasks are still correct.  
2. **Re-dispatch from the failed batch** only (`/hyperflow:dispatch` with the same feature slug / remaining tasks).  
3. If the failure was a **gate** (lint/typecheck/test), fix forward on the worker branch, then continue review.  
4. If the failure was **worker tool crash**, follow [failure-recovery.md](../skills/hyperflow/failure-recovery.md) retry taxonomy (1 identical → 2 escalated → abort).  
5. If the user changed requirements, write a **new decision** to memory, then re-plan the remaining work only.

## Print template (agents)

When dispatch fails, print exactly:

```text
DISPATCH_RESUME
slug: <feature-slug>
finished_batches: <n>
failed_at: <batch|gate|worker|review>
error: <one line>
next: <re-dispatch batch K | fix gates | abort>
memory_ok: <yes|review decisions.md>
```

Then stop for structural user input only if the next step is abort, push, or deploy.

## Related

- [Failure recovery](../skills/hyperflow/failure-recovery.md)  
- [Orchestration](orchestration.md)  
- `/hyperflow:status`  
