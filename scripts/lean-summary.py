#!/usr/bin/env python3
"""
lean-summary.py — emit a single-line situational summary when mode=lean.

Reads .hyperflow/ and prints ONE compact line consolidating: plugin version,
profile/architecture/conventions freshness, memory entry count, auto-bridge
state, sticky/auto-routing state, active-task count.

The line is always emitted for a Hyperflow project. Surfaces that need explicit
attention (memory compaction, cache migration, bridge refresh, handoff, update,
or compaction recovery) emit their own dedicated hook sections in addition to
this situational floor.

Usage:
  lean-summary.py <plugin-root> <project-root>

Always exits 0 (non-blocking). Errors go to stderr.
"""

from __future__ import annotations

import sys
from pathlib import Path


def _read_version(plugin_root: Path) -> str:
    try:
        return (plugin_root / "skills" / "hyperflow" / "VERSION").read_text(
            encoding="utf-8"
        ).strip() or "unknown"
    except OSError:
        return "unknown"


def _profile_state(hf_dir: Path) -> tuple[str, bool]:
    """Return (label, attention_needed) for the project-analysis files."""
    files = ["profile.md", "architecture.md", "conventions.md"]
    missing = [f for f in files if not (hf_dir / f).is_file()]
    if not missing:
        return "profile/architecture/conventions fresh", False
    if len(missing) == 3:
        return "profile MISSING (run /hyperflow:scaffold)", True
    return f"profile partial (missing: {', '.join(missing)})", True


def _memory_state(hf_dir: Path) -> tuple[str, bool]:
    memory_dir = hf_dir / "memory"
    if not memory_dir.is_dir():
        return "memory: not initialized", False  # not attention-worthy on its own
    try:
        entries = sum(
            1
            for f in memory_dir.iterdir()
            if f.suffix == ".md" and f.name not in {"index.md", "session-context.md"}
        )
    except OSError:
        return "memory: read-error", True
    return f"memory: {entries} files", False


def _bridge_state(project_root: Path) -> tuple[str, bool]:
    sticky = project_root / ".hyperflow" / ".bridge-mode"
    try:
        value = sticky.read_text(encoding="utf-8").strip().lower() or "auto"
    except OSError:
        value = "auto"
    if value == "off":
        return "bridge: off", False
    # Auto-bridge prints its own attention-needed line when it writes/refreshes;
    # if we're here, no attention needed.
    claude_md = project_root / "CLAUDE.md"
    if claude_md.exists():
        return f"bridge: {value} · CLAUDE.md synced", False
    return f"bridge: {value} · no CLAUDE.md yet", False


def _sticky_state(hf_dir: Path) -> tuple[str, bool]:
    path = hf_dir / ".sticky"
    if not path.exists():
        return "sticky: auto (default)", False
    try:
        state = "auto"
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("state:"):
                state = line.split(":", 1)[1].strip()
                break
        return f"sticky: {state}", False
    except OSError:
        return "sticky: read-error", True


def _tasks_state(hf_dir: Path) -> tuple[str, bool]:
    tasks_dir = hf_dir / "tasks"
    features_dir = hf_dir / "features"
    try:
        flat_count = (
            sum(1 for f in tasks_dir.iterdir() if f.is_file() and f.suffix == ".md")
            if tasks_dir.is_dir()
            else 0
        )
        feature_count = (
            sum(
                1
                for feature_dir in features_dir.iterdir()
                if feature_dir.is_dir() and (feature_dir / "feature.md").is_file()
            )
            if features_dir.is_dir()
            else 0
        )
        count = flat_count + feature_count
    except OSError:
        return "tasks: read-error", True
    label = "1 active task" if count == 1 else f"{count} active tasks"
    # Attention only when count > 5 (suggests something is stuck).
    return label, count > 5


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(
            "lean-summary: usage: lean-summary.py <plugin-root> <project-root>",
            file=sys.stderr,
        )
        return 0

    plugin_root = Path(argv[1])
    project_root = Path(argv[2])
    hf_dir = project_root / ".hyperflow"
    if not hf_dir.is_dir():
        return 0  # not a hyperflow project; emit nothing

    version = _read_version(plugin_root)
    parts: list[str] = [f"hyperflow v{version}"]
    for fn in (_profile_state, _memory_state):
        label, _ = fn(hf_dir)
        parts.append(label)
    label, _ = _bridge_state(project_root)
    parts.append(label)
    label, _ = _sticky_state(hf_dir)
    parts.append(label)
    label, _ = _tasks_state(hf_dir)
    parts.append(label)

    # Attention is intentionally reflected in the labels while the hook emits
    # any actionable detail as a separate section.
    print(" · ".join(parts))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
