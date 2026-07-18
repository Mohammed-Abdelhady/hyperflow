"""Tests for archive-artefacts.py — the session-start archiver that promotes
learnings to memory and moves stale artefacts. It runs unattended and mutates
user state, so these lock its risky cores against silent corruption.

Security-sensitive: slug validation, path-under-.hyperflow assertions, and
atomic moves are covered for the --slug / twin / brief-dir extensions.
"""

from __future__ import annotations

import importlib.util
import io
import json
import os
import sys
import time
import unittest
from contextlib import redirect_stderr, redirect_stdout
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


class ArchiveDirTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.hf = Path(self.tmp.name) / ".hyperflow"
        (self.hf / "tasks").mkdir(parents=True)
        (self.hf / "memory").mkdir(parents=True)

    def test_brief_dir_promotes_then_moves(self) -> None:
        brief = self.hf / "tasks" / "demo"
        brief.mkdir()
        (brief / "T1.md").write_text("# T1\n\n## Learnings\n- brief learning\n")
        (brief / "T2.md").write_text("# T2\n\n## Decisions\n- brief decision\n")
        moved, promoted = aa.archive_dir(self.hf, "tasks", brief)
        self.assertTrue(moved)
        self.assertEqual(promoted, 2)
        self.assertFalse(brief.exists())
        self.assertIn("- brief learning", (self.hf / "memory" / "learnings.md").read_text())
        self.assertIn("- brief decision", (self.hf / "memory" / "decisions.md").read_text())
        archived = list((self.hf / "archive" / "tasks").rglob("T1.md"))
        self.assertEqual(len(archived), 1)
        self.assertTrue(aa.is_under(self.hf, archived[0]))

    def test_archive_dir_refuses_path_outside_hf(self) -> None:
        outside = Path(self.tmp.name) / "escape-dir"
        outside.mkdir()
        (outside / "x.md").write_text("## Learnings\n- no\n")
        moved, promoted = aa.archive_dir(self.hf, "tasks", outside)
        self.assertFalse(moved)
        self.assertEqual(promoted, 0)
        self.assertTrue(outside.exists())


class TwinTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.hf = Path(self.tmp.name) / ".hyperflow"
        (self.hf / "tasks").mkdir(parents=True)
        (self.hf / "artefacts" / "task").mkdir(parents=True)
        (self.hf / "memory").mkdir(parents=True)

    def test_archive_twin_moves_under_archive_artefacts(self) -> None:
        twin = self.hf / "artefacts" / "task" / "demo.json"
        twin.write_text('{"type":"task","slug":"demo"}\n')
        dest = aa.archive_twin(self.hf, twin)
        self.assertIsNotNone(dest)
        self.assertFalse(twin.exists())
        self.assertTrue(dest.is_file())
        self.assertTrue(str(dest.resolve()).startswith(str(self.hf.resolve())))
        self.assertIn("archive", dest.parts)
        self.assertIn("artefacts", dest.parts)

    def test_find_twins_lists_matching_slug_only(self) -> None:
        (self.hf / "artefacts" / "task" / "demo.json").write_text("{}")
        (self.hf / "artefacts" / "spec").mkdir()
        (self.hf / "artefacts" / "spec" / "demo.json").write_text("{}")
        (self.hf / "artefacts" / "task" / "other.json").write_text("{}")
        found = aa.find_twins(self.hf, "demo")
        names = sorted(p.name for p in found)
        self.assertEqual(names, ["demo.json", "demo.json"])
        self.assertEqual(len(found), 2)


class SlugModeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.hf = Path(self.tmp.name) / ".hyperflow"
        (self.hf / "tasks").mkdir(parents=True)
        (self.hf / "specs").mkdir(parents=True)
        (self.hf / "memory").mkdir(parents=True)
        (self.hf / "artefacts" / "task").mkdir(parents=True)

    def test_slug_archives_task_brief_and_twin(self) -> None:
        task = self.hf / "tasks" / "demo.md"
        task.write_text("# Demo\n\n## Learnings\n- slug learning\n")
        brief = self.hf / "tasks" / "demo"
        brief.mkdir()
        (brief / "T1.md").write_text("# T1\n\n## Learnings\n- from brief\n")
        twin = self.hf / "artefacts" / "task" / "demo.json"
        twin.write_text('{"type":"task","slug":"demo"}\n')

        summary = aa.archive_slug(self.hf, "demo")
        self.assertEqual(len(summary["archived"]), 3)
        paths = {e["path"] for e in summary["archived"]}
        self.assertIn("tasks/demo.md", paths)
        self.assertIn("tasks/demo", paths)
        self.assertIn("artefacts/task/demo.json", paths)
        for e in summary["archived"]:
            self.assertTrue(e["dest"].startswith("archive/"))
            self.assertFalse((self.hf / e["path"]).exists())
            self.assertTrue((self.hf / e["dest"]).exists())

        mem = (self.hf / "memory" / "learnings.md").read_text()
        self.assertIn("- slug learning", mem)
        self.assertIn("- from brief", mem)
        self.assertGreaterEqual(sum(r["count"] for r in summary["promoted"]), 2)

    def test_slug_includes_spec_draft_and_feature(self) -> None:
        (self.hf / "specs" / "demo.md").write_text("# Spec\n")
        (self.hf / "specs" / "demo.draft.md").write_text("# Draft\n")
        fdir = self.hf / "features" / "demo"
        fdir.mkdir(parents=True)
        (fdir / "feature.md").write_text(
            "## Status\n\n| Status | completed |\n\n## Learnings\n- feat learning\n"
        )
        summary = aa.archive_slug(self.hf, "demo")
        paths = {e["path"] for e in summary["archived"]}
        self.assertIn("specs/demo.md", paths)
        self.assertIn("specs/demo.draft.md", paths)
        self.assertIn("features/demo", paths)
        self.assertIn("- feat learning", (self.hf / "memory" / "learnings.md").read_text())

    def test_invalid_slug_traversal_refused(self) -> None:
        with self.assertRaises(aa.ArchiveError):
            aa.archive_slug(self.hf, "../../etc")
        with self.assertRaises(aa.ArchiveError):
            aa.archive_slug(self.hf, "foo/bar")
        with self.assertRaises(aa.ArchiveError):
            aa.archive_slug(self.hf, "HasCaps")
        with self.assertRaises(aa.ArchiveError):
            aa.archive_slug(self.hf, "dot.name")

    def test_slug_cli_json_stdout_and_exit_codes(self) -> None:
        (self.hf / "tasks" / "demo.md").write_text("# D\n\n## Learnings\n- c\n")
        brief = self.hf / "tasks" / "demo"
        brief.mkdir()
        (brief / "T1.md").write_text("# T1\n")
        (self.hf / "artefacts" / "task" / "demo.json").write_text("{}")

        # Success path
        argv = ["archive-artefacts.py", str(self.hf), "--slug", "demo"]
        old = sys.argv
        try:
            sys.argv = argv
            out, err = io.StringIO(), io.StringIO()
            with redirect_stdout(out), redirect_stderr(err):
                aa.main()
            payload = json.loads(out.getvalue().strip())
            self.assertEqual(len(payload["archived"]), 3)
            self.assertIn("archived", payload)
            self.assertIn("promoted", payload)
        finally:
            sys.argv = old

        # Traversal refuse → exit ≠ 0, nothing moved from a fresh fixture piece
        sentinel = self.hf / "tasks" / "keep.md"
        sentinel.write_text("stay\n")
        argv = ["archive-artefacts.py", str(self.hf), "--slug", "../../etc"]
        try:
            sys.argv = argv
            out, err = io.StringIO(), io.StringIO()
            with self.assertRaises(SystemExit) as cm:
                with redirect_stdout(out), redirect_stderr(err):
                    aa.main()
            self.assertNotEqual(cm.exception.code, 0)
            self.assertTrue(sentinel.exists())
            self.assertEqual(out.getvalue().strip(), "")
        finally:
            sys.argv = old

    def test_slug_name_clash_gets_suffix(self) -> None:
        (self.hf / "tasks" / "demo.md").write_text("# first\n")
        # Pre-seed archive destination so the second move must suffix
        bucket = aa.month_bucket(self.hf / "tasks" / "demo.md")
        clash_dir = self.hf / "archive" / "tasks" / bucket
        clash_dir.mkdir(parents=True)
        (clash_dir / "demo.md").write_text("already here\n")
        summary = aa.archive_slug(self.hf, "demo")
        self.assertEqual(len(summary["archived"]), 1)
        dest = summary["archived"][0]["dest"]
        self.assertNotEqual(dest, f"archive/tasks/{bucket}/demo.md")
        self.assertTrue(dest.startswith(f"archive/tasks/{bucket}/demo-"))
        self.assertTrue((self.hf / dest).is_file())
        self.assertEqual((clash_dir / "demo.md").read_text(), "already here\n")


class DailySweepDirTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.hf = Path(self.tmp.name) / ".hyperflow"
        (self.hf / "tasks").mkdir(parents=True)
        (self.hf / "memory").mkdir(parents=True)
        (self.hf / "artefacts" / "task").mkdir(parents=True)

    def _age(self, path: Path, days: float) -> None:
        ts = time.time() - days * aa.DAY
        os.utime(path, (ts, ts))

    def test_daily_sweep_archives_stale_brief_dir(self) -> None:
        brief = self.hf / "tasks" / "orphan-brief"
        brief.mkdir()
        (brief / "T1.md").write_text("# T1\n\n## Learnings\n- orphan insight\n")
        self._age(brief, 10)
        self._age(brief / "T1.md", 10)

        argv = ["archive-artefacts.py", str(self.hf), "--force"]
        old = sys.argv
        try:
            sys.argv = argv
            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                aa.main()
        finally:
            sys.argv = old

        self.assertFalse(brief.exists())
        self.assertIn(
            "- orphan insight",
            (self.hf / "memory" / "learnings.md").read_text(),
        )
        archived = list((self.hf / "archive" / "tasks").rglob("T1.md"))
        self.assertEqual(len(archived), 1)

    def test_daily_sweep_archives_md_with_twin_and_brief(self) -> None:
        task = self.hf / "tasks" / "paired.md"
        task.write_text("# P\n\n## Learnings\n- paired\n")
        brief = self.hf / "tasks" / "paired"
        brief.mkdir()
        (brief / "T1.md").write_text("# T1\n")
        twin = self.hf / "artefacts" / "task" / "paired.json"
        twin.write_text("{}")
        for p in (task, brief, brief / "T1.md", twin):
            self._age(p, 10)

        argv = ["archive-artefacts.py", str(self.hf), "--force"]
        old = sys.argv
        try:
            sys.argv = argv
            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                aa.main()
        finally:
            sys.argv = old

        self.assertFalse(task.exists())
        self.assertFalse(brief.exists())
        self.assertFalse(twin.exists())
        self.assertTrue(list((self.hf / "archive" / "tasks").rglob("paired.md")))
        self.assertTrue(list((self.hf / "archive" / "artefacts").rglob("paired.json")))

    def test_daily_gate_skips_without_force(self) -> None:
        task = self.hf / "tasks" / "fresh.md"
        task.write_text("# F\n")
        self._age(task, 10)
        marker = self.hf / ".last-cleanup"
        marker.write_text("recent\n")
        # marker mtime is now → gate should skip
        argv = ["archive-artefacts.py", str(self.hf)]
        old = sys.argv
        try:
            sys.argv = argv
            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                aa.main()
        finally:
            sys.argv = old
        self.assertTrue(task.exists())  # not archived — daily gate

    def test_file_mode_still_archives_immediately(self) -> None:
        task = self.hf / "tasks" / "done.md"
        task.write_text("# D\n\n## Learnings\n- file mode\n")
        twin = self.hf / "artefacts" / "task" / "done.json"
        twin.write_text("{}")
        argv = [
            "archive-artefacts.py",
            str(self.hf),
            "--file",
            str(task),
        ]
        old = sys.argv
        try:
            sys.argv = argv
            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                aa.main()
        finally:
            sys.argv = old
        self.assertFalse(task.exists())
        self.assertFalse(twin.exists())
        self.assertIn("- file mode", (self.hf / "memory" / "learnings.md").read_text())


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


class PathSafetyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.hf = Path(self.tmp.name) / ".hyperflow"
        self.hf.mkdir()

    def test_is_under_accepts_descendant(self) -> None:
        child = self.hf / "tasks" / "x.md"
        child.parent.mkdir(parents=True)
        child.write_text("x")
        self.assertTrue(aa.is_under(self.hf, child))
        self.assertTrue(aa.is_under(self.hf, self.hf))

    def test_is_under_rejects_sibling(self) -> None:
        sibling = Path(self.tmp.name) / "other" / "x.md"
        sibling.parent.mkdir(parents=True)
        sibling.write_text("x")
        self.assertFalse(aa.is_under(self.hf, sibling))

    def test_atomic_move_refuses_escape_dest(self) -> None:
        src = self.hf / "tasks" / "x.md"
        src.parent.mkdir(parents=True)
        src.write_text("body")
        outside = Path(self.tmp.name) / "outside.md"
        result = aa.atomic_move(self.hf, src, outside)
        self.assertIsNone(result)
        self.assertTrue(src.exists())


if __name__ == "__main__":
    unittest.main()
