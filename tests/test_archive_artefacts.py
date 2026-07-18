"""Tests for archive-artefacts.py — the session-start archiver that promotes
learnings to memory and moves stale artefacts. It runs unattended and mutates
user state, so these lock its risky cores against silent corruption."""

from __future__ import annotations

import importlib.util
import os
import time
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT = REPO_ROOT / "scripts" / "archive-artefacts.py"


def _load():
    spec = importlib.util.spec_from_file_location("archive_artefacts", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


aa = _load()


class ExtractSectionsTests(unittest.TestCase):
    def test_extracts_only_promotable_sections(self) -> None:
        text = "# Title\n\n## Goal\nnot promoted\n\n## Learnings\n- learned A\n- learned B\n\n## Decisions\n- decided X\n"
        out = aa.extract_sections(text)
        self.assertIn("learnings.md", out)
        self.assertIn("decisions.md", out)
        self.assertNotIn("anti-patterns.md", out)
        self.assertIn("- learned A", out["learnings.md"])
        self.assertNotIn("not promoted", out.get("learnings.md", []))

    def test_pitfalls_alias_maps_to_anti_patterns(self) -> None:
        out = aa.extract_sections("## Pitfalls\n- avoid Y\n")
        self.assertIn("anti-patterns.md", out)

    def test_no_sections_returns_empty(self) -> None:
        self.assertEqual(aa.extract_sections("# Just a title\n\nprose only\n"), {})


class AppendDedupedTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.target = Path(self.tmp.name) / "learnings.md"

    def test_appends_new_lines(self) -> None:
        n = aa.append_deduped(self.target, ["- one", "- two"], "src.md")
        self.assertEqual(n, 2)
        self.assertIn("- one", self.target.read_text())

    def test_is_idempotent_no_duplicate_on_rerun(self) -> None:
        aa.append_deduped(self.target, ["- one", "- two"], "src.md")
        added = aa.append_deduped(self.target, ["- one", "- two"], "src.md")
        self.assertEqual(added, 0)  # nothing new — must not bloat memory each session
        self.assertEqual(self.target.read_text().count("- one"), 1)

    def test_only_new_lines_added(self) -> None:
        aa.append_deduped(self.target, ["- one"], "src.md")
        added = aa.append_deduped(self.target, ["- one", "- three"], "src.md")
        self.assertEqual(added, 1)


class ArchiveFileTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.hf = Path(self.tmp.name) / ".hyperflow"
        (self.hf / "tasks").mkdir(parents=True)
        (self.hf / "memory").mkdir(parents=True)

    def _task(self, name: str) -> Path:
        p = self.hf / "tasks" / name
        p.write_text("# T\n\n## Learnings\n- reusable insight\n")
        return p

    def test_promotes_then_moves_within_hyperflow(self) -> None:
        f = self._task("done.md")
        moved, promoted = aa.archive_file(self.hf, "tasks", f)
        self.assertTrue(moved)
        self.assertEqual(promoted, 1)
        self.assertFalse(f.exists())  # original moved out
        self.assertIn("- reusable insight", (self.hf / "memory" / "learnings.md").read_text())
        archived = list((self.hf / "archive" / "tasks").rglob("done.md"))
        self.assertEqual(len(archived), 1)
        self.assertTrue(str(archived[0]).startswith(str(self.hf)))  # never escapes .hyperflow/

    def test_feature_is_completed_detection(self) -> None:
        fdir = self.hf / "features" / "f1"
        fdir.mkdir(parents=True)
        (fdir / "feature.md").write_text("## Status\n\n| Status | in_progress |\n")
        self.assertFalse(aa.feature_is_completed(fdir))
        (fdir / "feature.md").write_text("## Status\n\n| Status | completed |\n")
        self.assertTrue(aa.feature_is_completed(fdir))


class PruneTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.hf = Path(self.tmp.name) / ".hyperflow"

    def test_prune_removes_only_old_entries(self) -> None:
        arch = self.hf / "archive" / "tasks" / "2020-01"
        arch.mkdir(parents=True)
        old = arch / "old.md"; old.write_text("x")
        fresh = arch / "fresh.md"; fresh.write_text("y")
        old_time = time.time() - 40 * aa.DAY
        os.utime(old, (old_time, old_time))
        pruned = aa.prune_archive(self.hf, 30)
        self.assertGreaterEqual(pruned, 1)
        self.assertFalse(old.exists())
        self.assertTrue(fresh.exists())

    def test_prune_noop_without_archive(self) -> None:
        self.assertEqual(aa.prune_archive(self.hf, 30), 0)


if __name__ == "__main__":
    unittest.main()
