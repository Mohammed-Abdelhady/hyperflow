"""Tests for migrate-cache.py — the session-start cache migrator. It runs
unattended and mutates the .hyperflow/ cache across versions; a bad migration
corrupts a user's cache with no signal, so these lock its behavior."""

from __future__ import annotations

import hashlib
import importlib.util
import re
import unittest
from unittest import mock
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
    def _run(self, hf: Path, version: str, plugin_root: Path | None = None) -> None:
        old = __import__("sys").argv
        args = ["migrate-cache.py", str(hf), version]
        if plugin_root is not None:
            args.extend(["--plugin-root", str(plugin_root)])
        __import__("sys").argv = args
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

    def test_doctrine_index_cache_is_navigable(self) -> None:
        with TemporaryDirectory() as tmp:
            hf = Path(tmp) / ".hyperflow"; (hf / "memory").mkdir(parents=True)
            self._run(hf, "5.28.0", REPO_ROOT)
            cached = hf / "memory" / "doctrine-index.md"
            self.assertTrue(cached.is_file())
            text = cached.read_text(encoding="utf-8")
            hrefs = re.findall(r"\[[^\]]+\]\(([^)]+)\)", text)
            self.assertGreater(len(hrefs), 20)
            self.assertTrue(all(href.startswith("file://") for href in hrefs))
            for href in hrefs:
                target = Path(href.removeprefix("file://"))
                self.assertTrue(target.is_file(), href)

    def test_current_cache_reconciles_missing_generated_index(self) -> None:
        with TemporaryDirectory() as tmp:
            hf = Path(tmp) / ".hyperflow"; (hf / "memory").mkdir(parents=True)
            (hf / ".version").write_text("5.28.0\n")
            self._run(hf, "5.28.0", REPO_ROOT)
            self.assertTrue((hf / "memory" / "doctrine-index.md").is_file())

    def test_current_cache_reconciles_doctrine_pointer(self) -> None:
        with TemporaryDirectory() as tmp:
            hf = Path(tmp) / ".hyperflow"; memory = hf / "memory"; memory.mkdir(parents=True)
            (hf / ".version").write_text("5.28.0\n")
            (memory / "doctrine.md").write_text(
                mc.DOCTRINE_COPY_MARKER + "\n\nOLD DOCTRINE", encoding="utf-8"
            )
            self._run(hf, "5.28.0", REPO_ROOT)
            expected = mc.DOCTRINE_COPY_MARKER + "\n\n" + (
                REPO_ROOT / "skills" / "hyperflow" / "DOCTRINE.md"
            ).read_text()
            self.assertEqual((memory / "doctrine.md").read_text(), expected)

    def test_previous_cache_converts_pristine_legacy_doctrine(self) -> None:
        legacy = "# Legacy generated doctrine fixture\n\n## Layer 0\nRules\n"
        with mock.patch.object(
            mc,
            "LEGACY_DOCTRINE_SHA256",
            hashlib.sha256(legacy.encode()).hexdigest(),
        ):
            with TemporaryDirectory() as tmp:
                hf = Path(tmp) / ".hyperflow"; memory = hf / "memory"; memory.mkdir(parents=True)
                (hf / ".version").write_text("5.27.0\n")
                (memory / "doctrine.md").write_text(legacy, encoding="utf-8")
                self._run(hf, "5.28.0", REPO_ROOT)
                self.assertTrue(
                    (memory / "doctrine.md").read_text().startswith(mc.DOCTRINE_COPY_MARKER)
                )

    def test_unexpected_and_symlink_destinations_are_preserved(self) -> None:
        with TemporaryDirectory() as tmp:
            hf = Path(tmp) / ".hyperflow"; memory = hf / "memory"; memory.mkdir(parents=True)
            existing = memory / "doctrine-index.md"
            existing.write_text("USER CONTENT")
            (hf / ".version").write_text("5.27.0\n")
            self._run(hf, "5.28.0", REPO_ROOT)
            self.assertEqual(existing.read_text(), "USER CONTENT")

            target = Path(tmp) / "outside.md"
            target.write_text("OUTSIDE CONTENT")
            existing.unlink()
            existing.symlink_to(target)
            self._run(hf, "5.28.0", REPO_ROOT)
            self.assertTrue(existing.is_symlink())
            self.assertEqual(target.read_text(), "OUTSIDE CONTENT")

    def test_symlinked_memory_parent_is_rejected(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            hf = root / ".hyperflow"; hf.mkdir()
            outside_memory = root / "outside-memory"; outside_memory.mkdir()
            (hf / "memory").symlink_to(outside_memory, target_is_directory=True)
            (hf / ".version").write_text("5.28.0\n")
            self._run(hf, "5.28.0", REPO_ROOT)
            self.assertFalse((outside_memory / "doctrine-index.md").exists())

    def test_parent_symlinked_cache_is_rejected(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            real_parent = root / "real"; real_parent.mkdir()
            linked_parent = root / "linked"
            linked_parent.symlink_to(real_parent, target_is_directory=True)
            hf = linked_parent / ".hyperflow"; (hf / "memory").mkdir(parents=True)
            (hf / ".version").write_text("5.28.0\n")
            self._run(hf, "5.28.0", REPO_ROOT)
            self.assertEqual(list((real_parent / ".hyperflow" / "memory").iterdir()), [])

        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            hf = root / ".hyperflow"; hf.mkdir()
            outside_memory = root / "outside-memory"; outside_memory.mkdir()
            (hf / "memory").symlink_to(outside_memory, target_is_directory=True)
            (hf / ".version").write_text("4.28.0\n")
            self._run(hf, "5.28.0", REPO_ROOT)
            self.assertEqual(list(outside_memory.iterdir()), [])

            real_hf = root / "real" / ".hyperflow"; (real_hf / "memory").mkdir(parents=True)
            linked_hf = root / "linked" / ".hyperflow"; linked_hf.parent.mkdir()
            linked_hf.symlink_to(real_hf, target_is_directory=True)
            self._run(linked_hf, "5.28.0", REPO_ROOT)
            self.assertEqual(list((real_hf / "memory").iterdir()), [])

    def test_legacy_doctrine_symlink_is_preserved(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            hf = root / ".hyperflow"; memory = hf / "memory"; memory.mkdir(parents=True)
            outside = root / "outside-doctrine.md"; outside.write_text("OUTSIDE CONTENT")
            (memory / "doctrine.md").symlink_to(outside)
            (hf / ".version").write_text("4.28.0\n")
            self._run(hf, "5.28.0", REPO_ROOT)
            self.assertEqual(outside.read_text(), "OUTSIDE CONTENT")
            self.assertTrue((memory / "doctrine.md").is_symlink())

    def test_marker_and_broken_stub_symlinks_are_preserved(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            hf = root / ".hyperflow"; memory = hf / "memory"; memory.mkdir(parents=True)
            outside_marker = root / "outside-version"; outside_marker.write_text("4.28.0\n")
            (hf / ".version").symlink_to(outside_marker)
            self._run(hf, "5.28.0", REPO_ROOT)
            self.assertEqual(outside_marker.read_text(), "4.28.0\n")

            (hf / ".version").unlink()
            (hf / ".version").write_text("4.28.0\n")
            broken = root / "missing-stub-target"
            (memory / "anti-patterns.md").symlink_to(broken)
            self._run(hf, "5.28.0", REPO_ROOT)
            self.assertTrue((memory / "anti-patterns.md").is_symlink())
            self.assertFalse(broken.exists())

    def test_future_cache_is_a_true_noop(self) -> None:
        with TemporaryDirectory() as tmp:
            hf = Path(tmp) / ".hyperflow"; memory = hf / "memory"; memory.mkdir(parents=True)
            (hf / ".version").write_text("9.9.9\n")
            index = memory / "doctrine-index.md"; index.write_text("FUTURE GENERATED CONTENT")
            self._run(hf, "5.28.0", REPO_ROOT)
            self.assertEqual(index.read_text(), "FUTURE GENERATED CONTENT")

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
