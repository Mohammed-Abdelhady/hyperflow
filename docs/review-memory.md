# Review memory

Review findings belong in the audit artefact. Review memory is an optional, small Markdown pointer that helps a later session discover an accepted outcome without copying the investigation transcript.

## Opt in

Use `audit --remember` only when the user explicitly wants the accepted outcome carried forward. `handoff review <slug> --remember` forwards the same opt-in after reviewing the exact recorded Git range.

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
