"""Integration tests for lean and full session-start prompt injection."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
HOOK_PATH = REPO_ROOT / "hooks" / "session-start"
VERSION = (REPO_ROOT / "skills" / "hyperflow" / "VERSION").read_text(
    encoding="utf-8"
).strip()


class SessionStartTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.project = self.root / "project"
        self.hf = self.project / ".hyperflow"
        self.memory = self.hf / "memory"
        self.home = self.root / "home"
        self.memory.mkdir(parents=True)
        (self.home / ".hyperflow").mkdir(parents=True)

        (self.hf / ".version").write_text(VERSION + "\n", encoding="utf-8")
        (self.hf / ".bridge-mode").write_text("off\n", encoding="utf-8")
        for name in ("profile.md", "architecture.md", "conventions.md"):
            (self.hf / name).write_text(
                f"# {name}\n\nproject-specific {name} body\n", encoding="utf-8"
            )
        (self.memory / "learnings.md").write_text(
            f"## Hot startup fact ({date.today().isoformat()})\n\n"
            "HOT_MEMORY_SENTINEL\n",
            encoding="utf-8",
        )
        tasks = self.hf / "tasks"
        tasks.mkdir()
        (tasks / "private-task-name.md").write_text("# Task\n", encoding="utf-8")

        # Avoid a network update check while still exercising normal hook output.
        (self.home / ".hyperflow" / ".update-check").write_text(
            VERSION, encoding="utf-8"
        )

    def run_hook(self) -> str:
        env = os.environ.copy()
        env.update(
            {
                "HOME": str(self.home),
                "CODEX_PLUGIN_ROOT": str(REPO_ROOT),
                "CODEX_SESSION_TEST": "1",
            }
        )
        result = subprocess.run(
            [str(HOOK_PATH)],
            cwd=self.project,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(result.stdout)["content"]

    def test_default_lean_is_compact_but_refreshes_on_disk_context(self) -> None:
        content = self.run_hook()

        self.assertIn("# Hyperflow v", content)
        self.assertIn("· lean", content)
        self.assertIn("Treat `/hyperflow:<name>`", content)
        self.assertIn(".hyperflow/memory/session-context.md", content)
        self.assertIn("## Hyperflow status (lean mode)", content)
        self.assertIn("1 active task", content)
        self.assertNotIn("## Canonical chain", content)
        self.assertNotIn("## Project Snapshot", content)
        self.assertNotIn("## Project Memory Index", content)
        self.assertNotIn("## Project memory — hot entries", content)
        self.assertNotIn("HOT_MEMORY_SENTINEL", content)
        self.assertNotIn("## Auto-routing status", content)
        self.assertNotIn("## Active Tasks", content)
        self.assertNotIn("private-task-name.md", content)

        session_context = self.memory / "session-context.md"
        index = self.memory / "index.md"
        self.assertTrue(session_context.is_file())
        self.assertTrue(index.is_file())
        self.assertIn("project-specific profile.md body", session_context.read_text())
        self.assertIn("Hot startup fact", index.read_text())

    def test_explicit_default_and_thorough_restore_full_output(self) -> None:
        for mode in ("default", "thorough"):
            with self.subTest(mode=mode):
                (self.hf / ".mode").write_text(mode + "\n", encoding="utf-8")
                content = self.run_hook()
                self.assertIn("## Canonical chain", content)
                self.assertIn("## Project Snapshot", content)
                self.assertIn("## Project Memory Index", content)
                self.assertIn("HOT_MEMORY_SENTINEL", content)
                self.assertIn("## Auto-routing status", content)
                self.assertIn("## Active Tasks", content)
                self.assertIn("private-task-name.md", content)
                self.assertNotIn("## Hyperflow status (lean mode)", content)

    def test_lean_preserves_recovery_compaction_and_handoff_notices(self) -> None:
        (self.hf / ".precompact.md").write_text(
            "PRECOMPACT_RECOVERY_SENTINEL\n", encoding="utf-8"
        )
        large_body = "\n".join(f"line {i}" for i in range(310))
        (self.memory / "pitfalls.md").write_text(
            f"## Large memory file ({date.today().isoformat()})\n{large_body}\n",
            encoding="utf-8",
        )
        handoff = self.project / ".hyperflow-handoff" / "demo"
        handoff.mkdir(parents=True)
        (handoff / "STATUS").write_text("planned\n", encoding="utf-8")

        content = self.run_hook()

        self.assertIn("PRECOMPACT_RECOVERY_SENTINEL", content)
        self.assertFalse((self.hf / ".precompact.md").exists())
        self.assertIn("## Memory Compaction Advisory", content)
        self.assertIn("pitfalls.md", content)
        self.assertIn("## Handoff pending", content)
        self.assertIn("`demo` awaiting build", content)

    def test_lean_preserves_bridge_and_update_notices(self) -> None:
        (self.hf / ".bridge-mode").write_text("auto\n", encoding="utf-8")
        (self.home / ".hyperflow" / ".update-check").write_text(
            "999.0.0", encoding="utf-8"
        )

        content = self.run_hook()

        self.assertIn("## CLAUDE.md auto-bridge", content)
        self.assertIn("## Hyperflow update available", content)
        self.assertIn("current=" + VERSION, content)

    def test_lean_status_counts_flat_tasks_and_active_features(self) -> None:
        feature = self.hf / "features" / "multi-phase"
        feature.mkdir(parents=True)
        (feature / "feature.md").write_text("# Feature\n", encoding="utf-8")

        content = self.run_hook()

        self.assertIn("2 active tasks", content)
        self.assertNotIn("multi-phase", content)


if __name__ == "__main__":
    unittest.main()
