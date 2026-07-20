#!/usr/bin/env python3
"""Heuristic market-bar score from repo evidence (not vibes alone)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def has(*parts: str) -> bool:
    return (ROOT.joinpath(*parts)).exists()


def readme() -> str:
    return (ROOT / "README.md").read_text(encoding="utf-8")


def score() -> list[tuple[str, int, str]]:
    r = readme()
    out: list[tuple[str, int, str]] = []

    # 1 time to first win
    s = 2 if has("docs", "golden-path.md") and "golden-path" in r else 1 if has("docs", "getting-started.md") else 0
    out.append(("time_to_first_win", s, "golden-path + README link" if s == 2 else "partial"))

    # 2 default surface
    s = 2 if "Default skills" in r or "default skills" in r.lower() else 1 if "plan" in r and "dispatch" in r else 0
    out.append(("default_surface", s, "README default skills callout"))

    # 3 memory
    s = 2 if has("scripts", "memory-hygiene.py") and has("skills", "cache", "SKILL.md") else 1 if has("skills", "hyperflow", "memory-system.md") else 0
    out.append(("project_memory", s, "hygiene + cache skill"))

    # 4 review quality
    s = 2 if has("config", "specialist-priority.json") and has("agents", "README.md") else 1 if has("agents") else 0
    out.append(("review_quality", s, "specialist-priority.json"))

    # 5 proof
    s = 2 if has("docs", "proof.md") and "github.com" in (ROOT / "docs" / "proof.md").read_text(encoding="utf-8") else 1 if has("docs", "proof.md") else 0
    out.append(("proof", s, "proof.md with links"))

    # 6 evals
    eval_tasks = list((ROOT / "evals" / "tasks").glob("*.json")) if has("evals", "tasks") else []
    s = 2 if len(eval_tasks) >= 4 and has("scripts", "run-evals.py") else 1 if eval_tasks else 0
    out.append(("evals", s, f"{len(eval_tasks)} tasks"))

    # 7 host honesty
    s = 2 if has("config", "host-parity.json") and "preview" in r.lower() else 1 if "preview" in r.lower() else 0
    out.append(("host_honesty", s, "host-parity + preview wording"))

    # 8 monorepo
    s = 2 if has("templates", "monorepo", "AGENTS.snippet.md") else 1 if has("templates") else 0
    out.append(("monorepo_dx", s, "monorepo template"))

    # 9 failure UX
    s = 2 if has("docs", "dispatch-resume.md") and "DISPATCH_RESUME" in (ROOT / "docs" / "dispatch-resume.md").read_text(encoding="utf-8") else 1 if has("skills", "hyperflow", "failure-recovery.md") else 0
    out.append(("failure_ux", s, "dispatch-resume"))

    # 10 differentiation
    s = 2 if has("docs", "vs-superpowers.md") and has("docs", "decision-cards.md") else 1 if "memory" in r.lower() else 0
    out.append(("differentiation", s, "vs-superpowers + decision cards"))

    return out


def main() -> int:
    rows = score()
    total = sum(s for _, s, _ in rows)
    target = 16
    for name, s, note in rows:
        print(f"{s}/2  {name:18}  {note}")
    print(f"---\nTOTAL {total}/20  target>={target}  {'PASS' if total >= target else 'BELOW_BAR'}")
    # write machine snapshot
    snap = {n: s for n, s, _ in rows}
    snap["total"] = total
    (ROOT / "docs" / "market-bar-score.json").write_text(json.dumps(snap, indent=2) + "\n", encoding="utf-8")
    return 0 if total >= target else 1


if __name__ == "__main__":
    sys.exit(main())
