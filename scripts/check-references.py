#!/usr/bin/env python3
"""
check-references.py — advisory drift report for shared reference files.

Several reference docs live both canonically in skills/hyperflow/ and as
per-skill copies under skills/<skill>/references/. Some copies are deliberately
tailored SUBSETS (shorter, skill-specific) — those are fine. The bug class is a
set of copies that are byte-identical to EACH OTHER but have drifted from the
canonical: they were meant to track it and silently fell behind.

This tool reports, per shared name: the canonical hash, which copies match it,
and which copies form other identical clusters (candidate drift). It does NOT
reconcile — tailored divergence is intentional, so collapsing is a per-file
maintainer decision. Advisory: always exits 0. Stdlib only.

Usage: check-references.py [--repo-root DIR]
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from collections import defaultdict
from pathlib import Path

# Reference names that exist canonically in skills/hyperflow/ and are copied
# into per-skill references/ dirs.
SHARED = ["output-style.md", "memory-system.md", "reviewer-prompt.md"]


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:10]


def report(repo_root: Path) -> list[str]:
    lines: list[str] = []
    skills = repo_root / "skills"
    for name in SHARED:
        canonical = skills / "hyperflow" / name
        if not canonical.exists():
            continue
        can_sha = _sha(canonical)
        copies = sorted(p for p in skills.glob(f"*/references/{name}"))
        clusters: dict[str, list[str]] = defaultdict(list)
        for c in copies:
            clusters[_sha(c)].append(str(c.relative_to(repo_root)))
        lines.append(f"{name}  (canonical {can_sha}, {len(copies)} copies)")
        matches = clusters.pop(can_sha, [])
        if matches:
            lines.append(f"  match canonical: {len(matches)}")
        for sha, group in sorted(clusters.items(), key=lambda kv: -len(kv[1])):
            tag = "candidate drift (identical to each other, differ from canonical)" if len(group) > 1 else "tailored subset (unique)"
            lines.append(f"  {sha} · {len(group)} · {tag}")
            for g in group:
                lines.append(f"      {g}")
    return lines


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="check-references.py", description="Advisory drift report for shared reference files.")
    parser.add_argument("--repo-root", default=str(Path(__file__).resolve().parent.parent))
    args = parser.parse_args(argv[1:])
    for line in report(Path(args.repo_root)):
        print(line)
    return 0  # advisory only — never blocks


if __name__ == "__main__":
    sys.exit(main(sys.argv))
