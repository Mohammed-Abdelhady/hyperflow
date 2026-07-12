# Compaction protocol

## Status

| Field      | Value                                          |
|------------|------------------------------------------------|
| Status     | in_progress                                    |
| Progress   | `████████░░░░`  1 / 3 sub-tasks (33%)          |
| Branch     | `feat/compaction`                              |
| Specialists| `searcher`                                     |

## Sub-tasks

- [x] T1 — Writer · Author compaction protocol reference
       Read: spec, cache/SKILL.md · Create: skills/cache/references/compaction.md · Complexity: medium · Specialist: searcher · Brief: slug/T1.md
- [ ] T2 — Implementer · Add memory.compactionThreshold to config/schema.json
       Modify: config/schema.json · Complexity: low · Specialist: backend-reviewer
- [ ] T3 — Implementer · Wire CLI flag

## Execution plan

```
Batch 1: T1
Batch 2: T2 · T3
```

## Estimated cost

| Role | Agents | Tokens |
|------|--------|--------|
| Writer | 1 | 40k |
| Implementer | 2 | 80k |
| **Total** | 3 | 120k |
