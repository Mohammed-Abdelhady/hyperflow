#!/usr/bin/env python3
"""Detect conflicts and stale patterns in .hyperflow/memory (read-only by default)."""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


def find_conflicts(decisions: str) -> list[str]:
    titles: dict[str, list[str]] = {}
    for line in decisions.splitlines():
        m = re.match(r"^#{2,3}\s+(.+)$", line.strip())
        if not m:
            continue
        title = m.group(1).strip().lower()
        titles.setdefault(title, []).append(line.strip())
    conflicts = []
    for title, lines in titles.items():
        if len(lines) > 1:
            conflicts.append(f"duplicate decision heading ({len(lines)}x): {title}")
    return conflicts


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--memory-dir",
        type=Path,
        default=Path(".hyperflow/memory"),
        help="Path to project memory dir",
    )
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    mem: Path = args.memory_dir
    report: dict = {
        "memory_dir": str(mem),
        "exists": mem.is_dir(),
        "conflicts": [],
        "warnings": [],
        "files": [],
    }
    if not mem.is_dir():
        report["warnings"].append("memory dir missing (ok if project not scaffolded)")
        if args.json:
            import json

            print(json.dumps(report, indent=2))
        else:
            print("PASS (no memory dir)")
        return 0
    for name in (
        "decisions.md",
        "project-decisions.md",
        "learnings.md",
        "pitfalls.md",
        "anti-patterns.md",
    ):
        p = mem / name
        report["files"].append(
            {"name": name, "exists": p.is_file(), "bytes": p.stat().st_size if p.is_file() else 0}
        )
    dec = mem / "decisions.md"
    if dec.is_file():
        report["conflicts"] = find_conflicts(dec.read_text(encoding="utf-8", errors="replace"))
    pd = mem / "project-decisions.md"
    if pd.is_file() and dec.is_file():
        d_titles = set(
            re.findall(r"(?m)^#{2,3}\s+(.+)$", dec.read_text(encoding="utf-8", errors="replace"))
        )
        p_titles = set(
            re.findall(r"(?m)^#{2,3}\s+(.+)$", pd.read_text(encoding="utf-8", errors="replace"))
        )
        both = {t.lower() for t in d_titles}.intersection({t.lower() for t in p_titles})
        for t in sorted(both):
            report["warnings"].append(
                f"title in both decisions.md and project-decisions.md: {t}"
            )
    if args.json:
        import json

        print(json.dumps(report, indent=2))
    else:
        print(f"memory_dir={mem} exists={report['exists']}")
        for c in report["conflicts"]:
            print(f"CONFLICT {c}")
        for w in report["warnings"]:
            print(f"WARN {w}")
        if not report["conflicts"]:
            print("PASS no decision heading conflicts")
    return 0


if __name__ == "__main__":
    sys.exit(main())
