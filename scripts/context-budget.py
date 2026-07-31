#!/usr/bin/env python3
"""Measure and enforce Hyperflow context-surface budgets without exposing contents."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_LIMITS = {
    "skills/hyperflow/DOCTRINE.md": 100_000,
    "skills/dispatch/SKILL.md": 80_000,
    "skills/plan/SKILL.md": 50_000,
    "skills/hyperflow/worker-prompt.md": 24_000,
    "skills/hyperflow/worker-prompt-lean.md": 10_000,
    "skills/hyperflow/reviewer-prompt.md": 10_000,
    "skills/hyperflow/reviewer-prompt-batched.md": 12_000,
}


def _estimate_tokens(char_count: int) -> int:
    """Conservative guardrail estimate; provider usage remains authoritative."""
    return math.ceil(char_count / 4)


def measure(root: Path, paths: list[str] | None = None) -> dict[str, Any]:
    selected = paths or list(DEFAULT_LIMITS)
    files: list[dict[str, object]] = []
    violations: list[str] = []
    for relative in selected:
        path = root / relative
        limit = DEFAULT_LIMITS.get(relative)
        if not path.is_file():
            files.append({"path": relative, "missing": True})
            violations.append(f"missing:{relative}")
            continue
        data = path.read_bytes()
        chars = len(data.decode("utf-8", errors="replace"))
        record: dict[str, object] = {
            "path": relative,
            "bytes": len(data),
            "chars": chars,
            "words": len(data.decode("utf-8", errors="replace").split()),
            "estimated_tokens": _estimate_tokens(chars),
            "estimated": True,
        }
        if limit is not None:
            record["limit_chars"] = limit
            if chars > limit:
                violations.append(f"over_limit:{relative}:{chars}>{limit}")
        files.append(record)
    return {
        "estimated": True,
        "root": ".",
        "files": files,
        "violations": violations,
        "ok": not violations,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--json", action="store_true", dest="as_json")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--file", action="append", dest="paths")
    args = parser.parse_args(argv)

    report = measure(args.root.resolve(), args.paths)
    if args.as_json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        for record in report["files"]:
            if record.get("missing"):
                print(f"MISSING {record['path']}")
                continue
            limit = record.get("limit_chars", "unbounded")
            print(
                f"{record['path']}: {record['chars']} chars · "
                f"{record['words']} words · ~{record['estimated_tokens']} tokens "
                f"(limit {limit}, estimated=true)"
            )
        if report["violations"]:
            print("VIOLATIONS: " + ", ".join(report["violations"]), file=sys.stderr)

    return 1 if args.check and not report["ok"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
