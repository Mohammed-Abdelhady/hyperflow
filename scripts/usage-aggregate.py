#!/usr/bin/env python3
"""
usage-aggregate.py — roll up the usage ledger into a `usage` artefact payload.

Reads every .hyperflow/usage/*.jsonl record (written by usage-ledger.py) and
computes a cross-chain rollup: totals, per-phase breakdown, and efficiency
ratios (cache-hit, duplicate-context, retry cost). Prints the `usage` payload
JSON to stdout — pipe it to artefact.py to render it in the viewer:

  usage-aggregate.py --project-root . | \\
      artefact.py write usage rollup --title "Usage" --status active --project-root .

(usage-ledger.py itself is over the source-size cap, so this rollup lives in a
sibling script rather than as a subcommand.) Stdlib only. No network.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _records(project_root: Path):
    base = project_root / ".hyperflow" / "usage"
    if not base.is_dir():
        return
    for path in sorted(base.glob("*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue  # skip a malformed line rather than abort the rollup


def aggregate(project_root: Path) -> dict:
    agents = tokens = input_tokens = cached = retry = dup = 0
    accepted = 0
    phases: dict[str, dict] = {}
    chains: dict[str, dict] = {}
    seen_ctx: set[str] = set()
    for r in _records(project_root):
        agents += 1
        tok = int(r.get("total_tokens", 0) or 0)
        tokens += tok
        input_tokens += int(r.get("input_tokens", 0) or 0)
        cached += int(r.get("cached_input_tokens", 0) or 0)
        if int(r.get("attempt", 1) or 1) > 1:
            retry += tok
        if r.get("accepted_commit"):
            accepted += 1
        ctx = r.get("context_hash")
        if ctx:
            if ctx in seen_ctx:
                dup += int(r.get("context_tokens", 0) or 0)  # repeated shared context = waste
            seen_ctx.add(ctx)
        ph = phases.setdefault(str(r.get("phase", "unknown")), {"name": str(r.get("phase", "unknown")), "agents": 0, "tokens": 0})
        ph["agents"] += 1
        ph["tokens"] += tok
        ch = chains.setdefault(str(r.get("chain_id", "?")), {"id": str(r.get("chain_id", "?")), "tokens": 0, "commits": 0})
        ch["tokens"] += tok
        ch["commits"] += 1 if r.get("accepted_commit") else 0

    ratios = {}
    if input_tokens:
        ratios["cacheHit"] = round(cached / input_tokens, 3)
    if tokens:
        ratios["duplicateContext"] = round(dup / tokens, 3)
    ratios["retryCost"] = retry
    return {
        "totals": {
            "agents": agents,
            "tokens": tokens,
            "acceptedCommits": accepted,
            "tokensPerCommit": (tokens // accepted) if accepted else 0,
        },
        "phases": [phases[k] for k in ("planning", "execution", "review", "verification") if k in phases]
        + [v for k, v in phases.items() if k not in ("planning", "execution", "review", "verification")],
        "ratios": ratios,
        "chains": list(chains.values()),
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="usage-aggregate.py", description="Roll up the usage ledger into a usage payload.")
    parser.add_argument("--project-root", default=".")
    args = parser.parse_args(argv[1:])
    payload = aggregate(Path(args.project_root).resolve())
    json.dump(payload, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
