# Memory contracts

Planning decisions normally stay in the task or spec that established them. An explicit, bounded decision ledger lets a later session reuse an approved choice without copying the investigation transcript.

## Opt in

Record a decision only when the user explicitly wants an approved planning choice carried forward. The plan must have explicit user participation. For a plan-and-build request, record decisions from the approved plan; implementation output does not belong in this ledger.

Review outcomes are separate and recorded only after an independent review of the exact candidate. Neither memory pointer changes the review status or activates startup.

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

---

# Review memory

Review findings belong in the audit artefact. Review memory is an optional, small Markdown pointer that helps a later session discover an accepted outcome without copying the investigation transcript.

## Opt in

Record an accepted outcome only when the user explicitly wants the bounded pointer carried forward, after independent review of the exact recorded Git range.

The memory write is eligible only after a final `PASS`. A `NEEDS_FIX` result is not eligible until the fixes are committed and the exact target is reviewed again. `SECURITY_VIOLATION` never writes review memory.

## File and entry contract

Append to:

```text
.hyperflow/memory/review-outcomes.md
```

Each entry has at most eight non-empty lines and contains only these fields:

```markdown
## <YYYY-MM-DD> — <scope>
- Verdict: PASS
- Target: `<exact Git range or paths>`
- Audit: `.hyperflow/audits/<timestamp>-<scope>.md`
- Decision: <one durable acceptance or constraint sentence>
- Follow-up: `none` | <one concrete next action>
```

Keep at most 20 entries. If the ledger is full, stop and report that it needs an explicit user-directed compaction; do not prune, rewrite, or create an index automatically. Do not copy findings, transcripts, implementation output, secrets, or speculative concerns. The linked audit remains the authoritative evidence and can be read by a later session when the target is relevant.

## Separation rule

Review memory is not a new review status and never turns `NEEDS_FIX` into `PASS`. The audit records independent evidence; the memory ledger records only the user's explicit request to carry an accepted result forward.
