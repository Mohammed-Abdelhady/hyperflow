# Dispatch usage ledger and budget boundaries

This contract applies to all normal-flow agent calls. Load it when dispatch enters the first normal agent flow, before the first worker, Composer, Reviewer, or gate dispatch.

## Ledger creation and recording

Create one chain ID and ledger path `.hyperflow/usage/<chain-id>.jsonl` before the first agent dispatch. Capture every agent result's usage metadata immediately and append it exactly once with `scripts/usage-ledger.py record` before leaving the natural boundary where its verdict is known. The canonical fields are: `chain_id`, `phase`, `batch`, `task`, `attempt`, `role`, `input_tokens`, `output_tokens`, `total_tokens`, `cached_input_tokens`, `context_hash`, `context_tokens`, `estimated`, `accepted_commit`, `timestamp`. Unknown/raw fields are forbidden. Never store prompt text, response text, secrets, file contents, or patches. `context_hash` is a SHA-256-style fingerprint of the repeated shared-context block only, and `context_tokens` is that block's measured/estimated size.

Use actual input/output/cache metadata when exposed. When unavailable, use the conservative estimator defined in [escalation.md](../../hyperflow/escalation.md), set `estimated=true`, preserve `total_tokens=input_tokens+output_tokens`, and never report an estimate as exact. Set `attempt` to the real 1-based attempt. Set `accepted_commit=true` only on the producing agent result that led to one accepted commit; hold the record in memory until the review/commit outcome is known so the append-only ledger is not rewritten. Failed, retried, and review-only results use `accepted_commit=false` and are still recorded.

Map phases consistently: batch Composer → `planning`; implementer/searcher/writer output → `execution`; batch/final Reviewer → `review`; gate worker + gate Reviewer → `verification`. Triage and upstream planning calls use `triage` / `planning` in their owning skills.

## Budget boundaries

At each natural boundary, after a complete batch, after final integration review, and after chain-end verification, run `usage-ledger.py summary --chain-id <chain-id>`. For every phase that gained records since the prior boundary, in order (`planning`, `execution`, `review`, `verification`), call `scripts/budget-guard.py --profile <profile> --phase <phase> --total-used <chain-total> --phase-used <phase-total> --boundary --reserved-tokens <next-call-reservation>`.

Add `--allow-degrade` only when remaining work can safely use the lower profile. Reserve a conservative upper bound for the next agent call or concurrent wave; use `0` only when the chain is ending and no further agent can launch. Do not check only the last phase in a mixed batch. Apply `continue|degrade|halt` before dispatching the next phase or batch. Never interrupt an in-flight agent, and never delay a hard decision past the next natural boundary. A ledger or guard error is an accounting failure: stop before more agent spend rather than silently continuing unmetered.
