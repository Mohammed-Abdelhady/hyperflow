# Planning decision memory

Planning decisions normally stay in the task or spec that established them. An explicit, bounded decision ledger lets a later session reuse an approved choice without copying the investigation transcript.

## Opt in

Use `plan <request> --remember` only when the user explicitly wants approved planning decisions carried forward. The plan must pass its lane review first. For a plan-and-build request, record decisions from the approved plan; implementation output does not belong in this ledger.

This option is separate from `audit --remember`, which records accepted review outcomes in `review-outcomes.md`. Neither option changes the review status or makes startup active.

## File and entry contract

Append to:

```text
.hyperflow/memory/decisions.md
```

Record one durable decision per entry, using only this shape:

```markdown
## <YYYY-MM-DD> — <slug>
- Status: APPROVED
- Decision: <one durable choice>
- Reason: <short evidence-backed reason>
- Constraint: `none` | <one constraint that must remain true>
- Source: `.hyperflow/tasks/<slug>.md`
```

Keep at most 20 entries. Each entry has six non-empty lines including its heading. If the ledger is full, report that it needs explicit user-directed compaction; do not prune, rewrite, or create an index automatically. Do not copy transcripts, alternatives, implementation output, secrets, or speculative concerns. The task or spec remains the detailed source.

Do not append an exact duplicate of an existing source-and-decision pair. Read only entries relevant to the current request; the ledger is not an automatic session-start context bundle.