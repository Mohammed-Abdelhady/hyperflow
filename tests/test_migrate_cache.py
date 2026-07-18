"""Tests for migrate-cache.py — the session-start cache migrator. It runs
unattended and mutates the .hyperflow/ cache across versions; a bad migration
corrupts a user's cache with no signal, so these lock its behavior."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT = REPO_ROOT / "scripts" / "migrate-cache.py"


def _load():
    spec = importlib.util.spec_from_file_location("migrate_cache", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


mc = _load()


class VersionTests(unittest.TestCase):
    def test_parse_and_order(self) -> None:
        self.assertEqual(mc.parse_version("v5.14.0"), (5, 14, 0))
        self.assertEqual(mc.parse_version("4.29"), (4, 29, 0))
        self.assertLess(mc.parse_version("4.29.0"), mc.parse_version("5.14.0"))
        self.assertGreater(mc.parse_version("5.14.1"), mc.parse_version("5.14.0"))


class MarkerTests(unittest.TestCase):
    def test_round_trip(self) -> None:
        with TemporaryDirectory() as tmp:
            hf = Path(tmp) / ".hyperflow"; hf.mkdir()
            self.assertIsNone(mc.read_marker(hf))
            mc.write_marker(hf, "5.14.0")
            self.assertEqual(mc.read_marker(hf), "5.14.0")


class StubTests(unittest.TestCase):
    def test_creates_only_when_missing_and_never_clobbers(self) -> None:
        with TemporaryDirectory() as tmp:
            hf = Path(tmp) / ".hyperflow"; (hf / "memory").mkdir(parents=True)
            self.assertTrue(mc._ensure_memory_stub(hf, "anti-patterns.md"))
            existing = hf / "memory" / "decisions.md"; existing.write_text("USER DATA")
            self.assertFalse(mc._ensure_memory_stub(hf, "decisions.md"))  # exists → no-op
            self.assertEqual(existing.read_text(), "USER DATA")           # never clobbered
    def test_no_memory_dir_is_noop(self) -> None:
        with TemporaryDirectory() as tmp:
            hf = Path(tmp) / ".hyperflow"; hf.mkdir()
            self.assertFalse(mc._ensure_memory_stub(hf, "x.md"))


class MainTests(unittest.TestCase):
    def _run(self, hf: Path, version: str) -> None:
        old = __import__("sys").argv
        __import__("sys").argv = ["migrate-cache.py", str(hf), version]
        try:
            mc.main()
        finally:
            __import__("sys").argv = old

    def test_noop_when_cache_already_current(self) -> None:
        with TemporaryDirectory() as tmp:
            hf = Path(tmp) / ".hyperflow"; (hf / "memory").mkdir(parents=True)
            (hf / ".version").write_text("9.9.9\n")
            self._run(hf, "5.14.0")
            self.assertEqual(mc.read_marker(hf), "9.9.9")  # ahead cache untouched
            self.assertFalse((hf / "memory" / "anti-patterns.md").exists())

    def test_legacy_cache_migrates_and_stamps(self) -> None:
        with TemporaryDirectory() as tmp:
            hf = Path(tmp) / ".hyperflow"; (hf / "memory").mkdir(parents=True)
            self._run(hf, "5.14.0")  # no .version → legacy → all steps apply
            self.assertEqual(mc.read_marker(hf), "5.14.0")
            self.assertTrue((hf / "memory" / "anti-patterns.md").exists())
            self.assertTrue((hf / "memory" / "project-decisions.md").exists())

    def test_idempotent_second_run_is_noop(self) -> None:
        with TemporaryDirectory() as tmp:
            hf = Path(tmp) / ".hyperflow"; (hf / "memory").mkdir(parents=True)
            self._run(hf, "5.14.0")
            (hf / "memory" / "anti-patterns.md").write_text("EDITED BY USER")
            self._run(hf, "5.14.0")  # marker now current → early return
            self.assertEqual((hf / "memory" / "anti-patterns.md").read_text(), "EDITED BY USER")

    def test_guard_rejects_non_hyperflow_dir(self) -> None:
        with TemporaryDirectory() as tmp:
            other = Path(tmp) / "notcache"; other.mkdir()
            self._run(other, "5.14.0")
            self.assertFalse((other / ".version").exists())  # guard: only operates on .hyperflow/


if __name__ == "__main__":
    unittest.main()
