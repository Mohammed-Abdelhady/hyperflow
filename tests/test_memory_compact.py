"""Tests for scripts/memory-compact.py — deterministic memory stub+archive."""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "memory-compact.py"


def _load():
    spec = importlib.util.spec_from_file_location("memory_compact", SCRIPT)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


mc = _load()


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )


class SplitAndStubTests(unittest.TestCase):
    def test_split_entries_preamble_and_blocks(self) -> None:
        text = "# Learnings\n\n### [2026-01-01] One `[api, gotcha]`\nbody1\n\n### [2026-01-02] Two `[db, pattern]`\nbody2\n"
        pre, blocks = mc.split_entries(text)
        self.assertIn("Learnings", pre)
        self.assertEqual(len(blocks), 2)
        self.assertIn("One", blocks[0][0])
        self.assertIn("body1", blocks[0][1])

    def test_format_stub(self) -> None:
        stub = mc.format_stub("###", "2026-01-01", "One", ["api", "gotcha"], "2026-01")
        self.assertIn("— summarized, see archive/2026-01.md", stub)
        self.assertIn("[api, gotcha]", stub)
        self.assertTrue(stub.startswith("### [2026-01-01] One"))


class CompactApplyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.hf = Path(self.tmp.name) / ".hyperflow"
        self.mem = self.hf / "memory"
        self.mem.mkdir(parents=True)
        self.today = date(2026, 7, 28)
        self.old = (self.today - timedelta(days=40)).isoformat()
        self.recent = (self.today - timedelta(days=2)).isoformat()

    def _write_learnings(self) -> None:
        (self.mem / "learnings.md").write_text(
            "# Learnings\n\n"
            f"### [{self.old}] Ancient gotcha `[api, gotcha]`\n"
            "**What:** old insight\n"
            "**Why it matters:** still true\n"
            "**Evidence:** src/a.ts:1\n\n"
            f"### [{self.recent}] Fresh tip `[api, pattern]`\n"
            "**What:** keep me hot\n",
            encoding="utf-8",
        )

    def test_dry_run_does_not_mutate(self) -> None:
        self._write_learnings()
        before = (self.mem / "learnings.md").read_text(encoding="utf-8")
        report = mc.run_compact(
            self.mem, mode="compact", apply=False, today=self.today, rebuild=False
        )
        self.assertTrue(report.ok)
        self.assertEqual(report.compacted, 1)
        self.assertFalse(report.applied)
        self.assertEqual((self.mem / "learnings.md").read_text(encoding="utf-8"), before)
        self.assertFalse((self.mem / "archive").exists())

    def test_apply_stubs_and_archives(self) -> None:
        self._write_learnings()
        report = mc.run_compact(
            self.mem, mode="compact", apply=True, today=self.today, rebuild=False
        )
        self.assertTrue(report.ok, report.errors)
        self.assertTrue(report.applied)
        self.assertEqual(report.compacted, 1)
        src = (self.mem / "learnings.md").read_text(encoding="utf-8")
        self.assertIn("— summarized, see archive/", src)
        self.assertIn("Fresh tip", src)
        self.assertIn("**What:** keep me hot", src)
        self.assertNotIn("**What:** old insight", src)
        month = self.old[:7]
        arch = self.mem / "archive" / f"{month}.md"
        self.assertTrue(arch.is_file())
        archived = arch.read_text(encoding="utf-8")
        self.assertIn("Ancient gotcha", archived)
        self.assertIn("**What:** old insight", archived)
        self.assertNotIn("Fresh tip", archived)

    def test_idempotent_second_apply(self) -> None:
        self._write_learnings()
        mc.run_compact(
            self.mem, mode="compact", apply=True, today=self.today, rebuild=False
        )
        src1 = (self.mem / "learnings.md").read_text(encoding="utf-8")
        arch1 = (self.mem / "archive" / f"{self.old[:7]}.md").read_text(encoding="utf-8")
        report2 = mc.run_compact(
            self.mem, mode="compact", apply=True, today=self.today, rebuild=False
        )
        self.assertEqual(report2.compacted, 0)
        self.assertEqual((self.mem / "learnings.md").read_text(encoding="utf-8"), src1)
        self.assertEqual(
            (self.mem / "archive" / f"{self.old[:7]}.md").read_text(encoding="utf-8"),
            arch1,
        )

    def test_archive_mode_keeps_warm(self) -> None:
        warm = (self.today - timedelta(days=15)).isoformat()
        (self.mem / "learnings.md").write_text(
            f"### [{warm}] Warm entry `[api, pattern]`\nbody\n\n"
            f"### [{self.old}] Cold entry `[api, gotcha]`\ncold body\n",
            encoding="utf-8",
        )
        report = mc.run_compact(
            self.mem, mode="archive", apply=True, today=self.today, rebuild=False
        )
        self.assertEqual(report.compacted, 1)
        src = (self.mem / "learnings.md").read_text(encoding="utf-8")
        self.assertIn("Warm entry", src)
        self.assertIn("body", src)  # warm body kept
        self.assertIn("Cold entry", src)
        self.assertIn("— summarized", src)
        self.assertNotIn("cold body", src)

    def test_skips_anti_patterns_by_default(self) -> None:
        (self.mem / "anti-patterns.md").write_text(
            f"### [{self.old}] Never auto `[security, pitfall]`\nkeep full\n",
            encoding="utf-8",
        )
        report = mc.run_compact(
            self.mem, mode="compact", apply=True, today=self.today, rebuild=False
        )
        self.assertEqual(report.compacted, 0)
        self.assertIn("keep full", (self.mem / "anti-patterns.md").read_text())

    def test_cli_json_and_help(self) -> None:
        help_r = _run("--help")
        self.assertEqual(help_r.returncode, 0, help_r.stderr)
        self.assertIn("--apply", help_r.stdout)
        self._write_learnings()
        r = _run(
            "--memory-dir",
            str(self.mem),
            "--json",
            "--no-rebuild-index",
        )
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        data = json.loads(r.stdout)
        self.assertGreaterEqual(data["compacted"], 1)
        self.assertFalse(data["applied"])


class PathSafetyTests(unittest.TestCase):
    def test_file_escape_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            mem = Path(td) / "memory"
            mem.mkdir()
            outside = Path(td) / "evil.md"
            outside.write_text("### [2020-01-01] x `[a, b]`\nbody\n", encoding="utf-8")
            report = mc.run_compact(
                mem,
                file_arg=str(outside),
                apply=False,
                rebuild=False,
            )
            self.assertFalse(report.ok)
            self.assertTrue(any("escape" in e.lower() or "not found" in e.lower() for e in report.errors))


if __name__ == "__main__":
    unittest.main()
