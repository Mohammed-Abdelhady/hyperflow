#!/usr/bin/env python3
"""
lean-summary.py — emit a single-line situational summary when mode=lean.

Reads .hyperflow/ and prints ONE compact line consolidating: plugin version,
profile/architecture/conventions freshness, memory entry count, auto-bridge
state (provider-appropriate instruction target), sticky/auto-routing state,
active-task count.

The line is always emitted for a Hyperflow project. Surfaces that need explicit
attention (memory compaction, cache migration, bridge refresh, handoff, update,
or compaction recovery) emit their own dedicated hook sections in addition to
this situational floor.

Usage:
  lean-summary.py <plugin-root> <project-root>

Always exits 0 (non-blocking). Errors go to stderr.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


# Instruction file owned per provider (mirrors scripts/auto-bridge.py).
_PROVIDER_TARGETS: dict[str, str] = {
    "codex": "AGENTS.md",
    "opencode": "AGENTS.md",
    "cursor": "AGENTS.md",
    "grok": "AGENTS.md",
    "antigravity": "AGENTS.md",
    "claude-code": "CLAUDE.md",
}


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


def _detect_provider_key() -> str | None:
    """Lightweight provider detection from environment (no filesystem secrets).

    Mirrors scripts/auto-bridge.py coarse grain for choosing the instruction
    file target. Returns None when unknown.
    """
    if os.environ.get("CODEX_PLUGIN_ROOT"):
        return "codex"
    if os.environ.get("CLAUDE_PLUGIN_ROOT"):
        return "claude-code"
    if os.environ.get("OPENCODE_PLUGIN_ROOT"):
        return "opencode"
    if os.environ.get("GROK_PLUGIN_ROOT"):
        return "grok"
    if os.environ.get("ANTIGRAVITY_PLUGIN_ROOT"):
        return "antigravity"
    if os.environ.get("CURSOR_PLUGIN_ROOT"):
        return "cursor"

    if os.environ.get("CODEX_HOME") or os.environ.get("CODEX_SESSION_ID"):
        return "codex"
    if os.environ.get("CLAUDE_CODE_ENTRYPOINT") or os.environ.get("CLAUDE_PROJECT_DIR"):
        return "claude-code"
    if os.environ.get("OPENCODE_CONFIG") or os.environ.get("OPENCODE_DATA"):
        return "opencode"
    if os.environ.get("GROK_AGENT") or os.environ.get("GROK_SUBAGENTS"):
        return "grok"
    if os.environ.get("ANTIGRAVITY_HOME"):
        return "antigravity"
    if os.environ.get("CURSOR_TRACE_ID"):
        return "cursor"

    for key, value in os.environ.items():
        if not value:
            continue
        upper = key.upper()
        if upper.startswith("CODEX"):
            return "codex"
        if upper.startswith("CLAUDE_CODE") or upper == "CLAUDE":
            return "claude-code"
        if upper.startswith("OPENCODE"):
            return "opencode"
        if upper.startswith("GROK"):
            return "grok"
        if upper.startswith("ANTIGRAVITY"):
            return "antigravity"
        if upper.startswith("CURSOR"):
            return "cursor"

    return None


def _instruction_target(project_root: Path, provider: str | None) -> str:
    """Provider-appropriate instruction filename (AGENTS.md or CLAUDE.md)."""
    if provider and provider in _PROVIDER_TARGETS:
        return _PROVIDER_TARGETS[provider]

    # Unknown: prefer an existing managed-instruction file; legacy default CLAUDE.md.
    agents = project_root / "AGENTS.md"
    claude = project_root / "CLAUDE.md"
    if agents.is_file() and not claude.is_file():
        return "AGENTS.md"
    if claude.is_file() and not agents.is_file():
        return "CLAUDE.md"
    if agents.is_file() and claude.is_file():
        return "AGENTS.md"
    return "CLAUDE.md"


def _bridge_state(project_root: Path) -> tuple[str, bool]:
    sticky = project_root / ".hyperflow" / ".bridge-mode"
    try:
        value = sticky.read_text(encoding="utf-8").strip().lower() or "auto"
    except OSError:
        value = "auto"
    if value == "off":
        return "bridge: off", False
    # Auto-bridge prints its own attention-needed line when it writes/refreshes;
    # if we're here, no attention needed. Report the provider-appropriate target.
    target = _instruction_target(project_root, _detect_provider_key())
    target_path = project_root / target
    if target_path.exists():
        return f"bridge: {value} · {target} synced", False
    return f"bridge: {value} · no {target} yet", False


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
