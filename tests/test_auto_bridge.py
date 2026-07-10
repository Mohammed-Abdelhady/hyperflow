"""Tests for scripts/auto-bridge.py — the session-start doctrine-block bridge.

Covers the four ``_write_claude_md`` paths (generate into a missing file,
generate into a block-less file, refresh an existing stale block, manual-mode
dry run) plus an end-to-end ``main()`` run against a stale-block fixture.

The script lives at scripts/auto-bridge.py (hyphenated, not a package), so it
is loaded by path via importlib. Stdlib only — no new dependencies.
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = REPO_ROOT / "scripts" / "auto-bridge.py"

STALE_MARKER = (
    "<!-- hyperflow:doctrine:start version=4.16.2 "
    "generated=2025-01-01T00:00:00Z body-sha=deadbeef "
    "source=https://github.com/Mohammed-Abdelhady/hyperflow -->"
)
END_MARKER = "<!-- hyperflow:doctrine:end -->"

PREFIX = "# My Project\n\nHand-written intro that must survive.\n\n"
SUFFIX = "\n## Trailing Section\n\nAlso hand-written, also must survive.\n"


def _load_module():
    """Load scripts/auto-bridge.py by path (scripts/ is not a package)."""
    spec = importlib.util.spec_from_file_location("auto_bridge", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


auto_bridge = _load_module()


def _stale_block() -> str:
    """A doctrine block whose body-sha can never match a real template hash."""
    return f"{STALE_MARKER}\n\nStale doctrine body.\n\n{END_MARKER}\n"


class WriteClaudeMdTests(unittest.TestCase):
    """Unit tests for the four _write_claude_md paths."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.project_root = Path(self._tmp.name)
        self.claude_md = self.project_root / "CLAUDE.md"
        self.new_block = (
            "<!-- hyperflow:doctrine:start version=9.9.9 "
            "generated=2026-01-01T00:00:00Z body-sha=0123456789ab "
            "source=https://github.com/Mohammed-Abdelhady/hyperflow -->\n\n"
            "Fresh doctrine body.\n\n"
            f"{END_MARKER}\n"
        )

    def test_generates_when_claude_md_missing(self) -> None:
        action = auto_bridge._write_claude_md(
            self.project_root, self.new_block, "auto"
        )
        self.assertEqual(action, "generated")
        content = self.claude_md.read_text(encoding="utf-8")
        self.assertIn(self.new_block, content)
        self.assertTrue(content.endswith("\n"))

    def test_appends_when_no_block_present(self) -> None:
        original = "# Existing Project\n\nNo doctrine block here.\n"
        self.claude_md.write_text(original, encoding="utf-8")
        action = auto_bridge._write_claude_md(
            self.project_root, self.new_block, "auto"
        )
        self.assertEqual(action, "generated")
        content = self.claude_md.read_text(encoding="utf-8")
        self.assertTrue(content.startswith(original))
        self.assertIn(self.new_block, content)
        # Separator: original ends with a single newline, so exactly one blank
        # line is inserted between existing content and the block.
        self.assertEqual(content, original + "\n" + self.new_block)

    def test_refreshes_existing_stale_block_in_place(self) -> None:
        """Regression: refresh path crashed unpacking the 4-tuple as 3 values."""
        original = PREFIX + _stale_block() + SUFFIX
        self.claude_md.write_text(original, encoding="utf-8")
        action = auto_bridge._write_claude_md(
            self.project_root, self.new_block, "auto"
        )
        self.assertEqual(action, "refreshed")
        content = self.claude_md.read_text(encoding="utf-8")
        self.assertTrue(content.startswith(PREFIX))
        self.assertTrue(content.endswith(SUFFIX))
        self.assertIn(self.new_block, content)
        self.assertNotIn(STALE_MARKER, content)
        self.assertNotIn("Stale doctrine body.", content)
        self.assertEqual(content.count(END_MARKER), 1)

    def test_manual_mode_reports_without_writing(self) -> None:
        original = PREFIX + _stale_block() + SUFFIX
        self.claude_md.write_text(original, encoding="utf-8")
        action = auto_bridge._write_claude_md(
            self.project_root, self.new_block, "manual"
        )
        self.assertEqual(action, "would-refreshed")
        self.assertEqual(
            self.claude_md.read_text(encoding="utf-8"), original
        )


class MainEndToEndTests(unittest.TestCase):
    """End-to-end: main() refreshes a stale block against the real template."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.project_root = Path(self._tmp.name)
        (self.project_root / ".hyperflow").mkdir()
        self.claude_md = self.project_root / "CLAUDE.md"

    def test_refreshes_stale_block_via_main(self) -> None:
        self.claude_md.write_text(
            PREFIX + _stale_block() + SUFFIX, encoding="utf-8"
        )
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            exit_code = auto_bridge.main(
                [str(SCRIPT_PATH), str(REPO_ROOT), str(self.project_root)]
            )
        self.assertEqual(exit_code, 0)
        self.assertIn("refreshed", stdout.getvalue())
        content = self.claude_md.read_text(encoding="utf-8")
        template = auto_bridge._read_template(REPO_ROOT)
        self.assertIsNotNone(template)
        expected_sha = auto_bridge._body_hash(template)
        self.assertIn(f"body-sha={expected_sha}", content)
        self.assertNotIn("body-sha=deadbeef", content)
        self.assertTrue(content.startswith(PREFIX))
        self.assertTrue(content.endswith(SUFFIX))


class ForceRestampTests(unittest.TestCase):
    """--force re-stamps a version label; without it, matching content is a no-op."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.project_root = Path(self.tmp.name)
        (self.project_root / ".hyperflow").mkdir()
        template = auto_bridge._read_template(REPO_ROOT)
        current_sha = auto_bridge._body_hash(template)
        # A block whose CONTENT is current but whose version label is behind.
        marker = (
            f"<!-- hyperflow:doctrine:start version=0.0.1 "
            f"generated=2025-01-01T00:00:00Z body-sha={current_sha} "
            "source=https://github.com/Mohammed-Abdelhady/hyperflow -->"
        )
        self.claude_md = self.project_root / "CLAUDE.md"
        self.claude_md.write_text(f"{marker}\n\nbody\n\n{END_MARKER}\n", encoding="utf-8")

    def _run(self, *extra):
        with contextlib.redirect_stdout(io.StringIO()):
            return auto_bridge.main(
                [str(SCRIPT_PATH), str(REPO_ROOT), str(self.project_root), *extra]
            )

    def test_without_force_a_stale_label_is_left_alone(self):
        before = self.claude_md.read_text(encoding="utf-8")
        self.assertEqual(self._run(), 0)
        self.assertEqual(self.claude_md.read_text(encoding="utf-8"), before)
        self.assertIn("version=0.0.1", before)

    def test_force_restamps_the_version_label(self):
        self.assertEqual(self._run("--force"), 0)
        content = self.claude_md.read_text(encoding="utf-8")
        self.assertNotIn("version=0.0.1", content)
        self.assertIn(f"version={auto_bridge._read_version(REPO_ROOT)}", content)


class BodyShaQueryTests(unittest.TestCase):
    """--body-sha is the hash contract other tools read; it must match the stamp."""

    def _run(self, argv):
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            code = auto_bridge.main(argv)
        return code, stdout.getvalue().strip()

    def test_prints_the_hash_that_gets_stamped_into_the_marker(self):
        code, out = self._run([str(SCRIPT_PATH), "--body-sha", str(REPO_ROOT)])
        template = auto_bridge._read_template(REPO_ROOT)
        self.assertEqual(code, 0)
        self.assertEqual(out, auto_bridge._body_hash(template))

    def test_missing_plugin_root_argument_is_a_usage_error(self):
        code, _ = self._run([str(SCRIPT_PATH), "--body-sha"])
        self.assertEqual(code, 2)

    def test_unreadable_template_is_a_usage_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, _ = self._run([str(SCRIPT_PATH), "--body-sha", tmp])
        self.assertEqual(code, 2)


if __name__ == "__main__":
    unittest.main()
