#!/usr/bin/env python3
"""Static golden-task eval harness for Hyperflow repo contracts."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TASKS = ROOT / "evals" / "tasks"


def skill_dirs() -> set[str]:
    return {p.parent.name for p in (ROOT / "skills").glob("*/SKILL.md")}


def check(name: str) -> tuple[bool, str]:
    if name.startswith("file:"):
        rel = name.split(":", 1)[1]
        ok = (ROOT / rel).is_file()
        return ok, rel
    if name.startswith("readme_contains:"):
        needle = name.split(":", 1)[1]
        text = (ROOT / "README.md").read_text(encoding="utf-8")
        ok = needle in text
        return ok, f"README contains {needle!r}"
    if name.startswith("readme_not_contains:"):
        # unused simple path; keep for extension
        needle = name.split(":", 1)[1]
        text = (ROOT / "README.md").read_text(encoding="utf-8")
        ok = needle not in text
        return ok, f"README lacks {needle!r}"
    if name == "skill_count_readme":
        actual = len(skill_dirs())
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        # e.g. Nineteen skills · 19
        m = re.search(r"(\d+)\s*\)?\s*$", "")  # placeholder
        m = re.search(r"skills[^\n]*·\s*(\d+)", readme) or re.search(
            r"\((\d+)\)\s*$", ""
        )
        m = re.search(r"## Skills \([^·]*·\s*(\d+)\)", readme)
        if not m:
            m = re.search(r"·\s*(\d+)\s*\)", readme)
        if not m:
            return False, "could not parse skill count from README"
        n = int(m.group(1))
        return n == actual, f"README {n} vs dirs {actual}"
    if name == "features_skills_match_dirs":
        data = json.loads((ROOT / "config" / "features.json").read_text(encoding="utf-8"))
        registered = set()
        for entry in data.get("skills", []):
            if isinstance(entry, str):
                registered.add(entry)
            elif isinstance(entry, dict) and "name" in entry:
                registered.add(entry["name"])
            elif isinstance(entry, dict) and "id" in entry:
                registered.add(entry["id"])
        dirs = skill_dirs()
        if registered != dirs:
            return False, f"only_in_features={sorted(registered-dirs)} only_in_dirs={sorted(dirs-registered)}"
        return True, f"{len(dirs)} skills"
    return False, f"unknown check {name}"


def load_tasks() -> list[dict]:
    tasks = []
    for path in sorted(TASKS.glob("*.json")):
        tasks.append(json.loads(path.read_text(encoding="utf-8")))
    return tasks


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()
    tasks = load_tasks()
    if args.list:
        for t in tasks:
            print(f"{t['id']}: {t.get('title','')}")
        return 0
    failed = 0
    for t in tasks:
        tid = t["id"]
        results = []
        ok_all = True
        for c in t.get("checks", []):
            ok, detail = check(c)
            results.append((ok, c, detail))
            ok_all = ok_all and ok
        status = "PASS" if ok_all else "FAIL"
        if not ok_all:
            failed += 1
        print(f"{status}  {tid}")
        for ok, c, detail in results:
            mark = "ok" if ok else "FAIL"
            print(f"    [{mark}] {c} — {detail}")
    print(f"---\n{len(tasks) - failed}/{len(tasks)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
