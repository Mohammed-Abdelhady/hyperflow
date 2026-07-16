"""Tests for the central Hyperflow mode resolver."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = REPO_ROOT / "scripts" / "resolve-mode.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("resolve_mode", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


resolve_mode = _load_module()


class ResolveModeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.project_root = Path(self.tmp.name)
        (self.project_root / ".hyperflow").mkdir()

    def test_lean_is_the_default(self) -> None:
        self.assertEqual(resolve_mode.resolve(self.project_root), "lean")

    def test_project_file_can_restore_full_modes(self) -> None:
        mode_file = self.project_root / ".hyperflow" / ".mode"
        mode_file.write_text("default\n", encoding="utf-8")
        self.assertEqual(resolve_mode.resolve(self.project_root), "default")
        mode_file.write_text("thorough\n", encoding="utf-8")
        self.assertEqual(resolve_mode.resolve(self.project_root), "thorough")

    def test_all_explicit_spellings_override_the_project_file(self) -> None:
        (self.project_root / ".hyperflow" / ".mode").write_text(
            "default\n", encoding="utf-8"
        )
        self.assertEqual(
            resolve_mode.resolve(self.project_root, "--lean task"), "lean"
        )
        self.assertEqual(
            resolve_mode.resolve(self.project_root, "--mode=thorough task"),
            "thorough",
        )
        self.assertEqual(
            resolve_mode.resolve(self.project_root, "mode=lean task"), "lean"
        )

    def test_mixed_mode_spellings_are_rejected(self) -> None:
        stdout = io.StringIO()
        stderr = io.StringIO()
        argv = [
            "resolve-mode.py",
            str(self.project_root),
            "--from-args",
            "--lean --mode=thorough",
        ]
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = resolve_mode.main(argv)

        self.assertEqual(code, 0)
        self.assertEqual(stdout.getvalue().strip(), "lean")
        self.assertIn("conflicting modes", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
