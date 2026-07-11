"""Tests for scripts/memory-index.py — the derived memory index + checksums.

Covers heading parsing across both entry formats (the documented
``### [YYYY-MM-DD] Title `[tags]` `` and the ``## Title (YYYY-MM-DD, slug)``
form writers actually emit), age tiering, the permanently-hot anti-patterns
file, the rendered hot block, checksum shape, and idempotency.

The script lives at scripts/memory-index.py (hyphenated, not a package), so it
is loaded by path via importlib. Stdlib only — no new dependencies.
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = REPO_ROOT / "scripts" / "memory-index.py"


def load_script():
    spec = importlib.util.spec_from_file_location("memory_index", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


mi = load_script()


def days_ago(n: int) -> str:
    return (date.today() - timedelta(days=n)).isoformat()


class ParseHeadingTests(unittest.TestCase):
    def test_documented_format(self):
        title, day, tags = mi.parse_heading("[2026-05-15] Zod schemas are the truth  `[api, convention]`")
        self.assertEqual(title, "Zod schemas are the truth")
        self.assertEqual(day, date(2026, 5, 15))
        self.assertEqual(tags, ["api", "convention"])

    def test_emitted_format_with_source_slug(self):
        title, day, tags = mi.parse_heading("Track naming (recorded 2026-05-26, source chain: track-rebrand)")
        self.assertEqual(title, "Track naming")
        self.assertEqual(day, date(2026, 5, 26))
        self.assertEqual(tags, [])

    def test_parenthetical_without_date_is_kept(self):
        title, day, _ = mi.parse_heading("Independent try/catch blocks (no phase-gate)")
        self.assertEqual(title, "Independent try/catch blocks (no phase-gate)")
        self.assertIsNone(day)

    def test_calendar_invalid_date_degrades_instead_of_raising(self):
        # A typo'd date must not take the whole index pass down with it.
        title, day, _ = mi.parse_heading("Broken entry (2026-13-45)")
        self.assertEqual(title, "Broken entry")
        self.assertIsNone(day)

    def test_compaction_stub_suffix_dropped(self):
        title, day, tags = mi.parse_heading(
            "[2026-04-02] Tailwind v4 tokens  [ui, dependency-quirk] — summarized, see archive/2026-04.md"
        )
        self.assertEqual(title, "Tailwind v4 tokens")
        self.assertEqual(day, date(2026, 4, 2))
        self.assertEqual(tags, ["ui", "dependency-quirk"])


class TierTests(unittest.TestCase):
    def test_age_tiers(self):
        self.assertEqual(mi.Entry("learnings.md", "t", date.today(), []).tier, "hot")
        self.assertEqual(mi.Entry("learnings.md", "t", date.today() - timedelta(days=20), []).tier, "warm")
        self.assertEqual(mi.Entry("learnings.md", "t", date.today() - timedelta(days=90), []).tier, "cold")

    def test_undated_entry_is_warm_not_hot(self):
        self.assertEqual(mi.Entry("learnings.md", "t", None, []).tier, "warm")

    def test_anti_patterns_always_hot(self):
        old = mi.Entry("anti-patterns.md", "t", date(2020, 1, 1), [])
        self.assertEqual(old.tier, "hot")


class EndToEndTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.hf = Path(self.tmp.name) / ".hyperflow"
        self.memory = self.hf / "memory"
        self.memory.mkdir(parents=True)
        self.addCleanup(self.tmp.cleanup)

        (self.memory / "index.md").write_text(
            "# Index\n\n<!-- to be populated by future runs -->\n", encoding="utf-8"
        )
        (self.memory / "learnings.md").write_text(
            f"# Learnings\n\n"
            f"## Fresh seeder learning ({days_ago(1)})\n"
            f"- Body of the fresh entry.\n\n"
            f"## Ancient learning ({days_ago(120)})\n"
            f"- Body of the ancient entry.\n",
            encoding="utf-8",
        )
        (self.memory / "anti-patterns.md").write_text(
            "# Anti-patterns\n\n"
            "## Unconditional publish\n"
            "- Publishes every lesson — frequency: 2, last seen: 2026-05-26\n",
            encoding="utf-8",
        )
        # Hook-generated and bridge-copied files are not memory entries.
        (self.memory / "session-context.md").write_text("## Profile\n## Ancient\n", encoding="utf-8")

    def run_script(self) -> str:
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            code = mi.main(["memory-index.py", str(self.hf)])
        self.assertEqual(code, 0)
        return buffer.getvalue()

    def test_index_replaces_the_scaffold_stub(self):
        self.run_script()
        index = (self.memory / "index.md").read_text(encoding="utf-8")
        self.assertNotIn("to be populated by future runs", index)
        self.assertIn("| Date | Tier | File | Title | Tags |", index)
        self.assertIn("Fresh seeder learning", index)
        self.assertIn("Ancient learning", index)
        self.assertIn("Unconditional publish", index)
        self.assertIn("3 entries", index)

    def test_excluded_files_are_not_indexed(self):
        self.run_script()
        index = (self.memory / "index.md").read_text(encoding="utf-8")
        self.assertNotIn("session-context.md", index)

    def test_hot_render_carries_hot_entries_and_anti_patterns_only(self):
        rendered = self.run_script()
        self.assertIn("Fresh seeder learning", rendered)
        self.assertIn("Body of the fresh entry.", rendered)
        self.assertIn("Known anti-patterns", rendered)
        self.assertIn("Unconditional publish", rendered)
        self.assertNotIn("Ancient learning", rendered)

    def test_checksums_shape(self):
        self.run_script()
        checksums = json.loads((self.memory / ".checksums").read_text(encoding="utf-8"))
        entry = checksums[".hyperflow/memory/learnings.md"]
        self.assertEqual(len(entry["sha256"]), 64)
        self.assertEqual(entry["lineCount"], 7)
        self.assertNotIn(".hyperflow/memory/index.md", checksums)

    def test_rerun_is_idempotent(self):
        self.run_script()
        index = self.memory / "index.md"
        before = index.stat().st_mtime_ns
        first = index.read_text(encoding="utf-8")
        # The refreshed-at stamp is minute-granular, so a same-minute rerun must
        # produce byte-identical content and leave the file untouched.
        self.run_script()
        self.assertEqual(index.read_text(encoding="utf-8"), first)
        self.assertEqual(index.stat().st_mtime_ns, before)

    def test_malformed_body_date_does_not_abort_the_pass(self):
        (self.memory / "anti-patterns.md").write_text(
            "# Anti-patterns\n\n## Typo'd entry\n- frequency: 1, last seen: 2026-13-45\n",
            encoding="utf-8",
        )
        self.run_script()
        index = (self.memory / "index.md").read_text(encoding="utf-8")
        self.assertIn("Typo'd entry", index)
        self.assertIn("Fresh seeder learning", index)

    def test_missing_memory_dir_is_a_silent_no_op(self):
        empty = Path(self.tmp.name) / "unscaffolded"
        empty.mkdir()
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            self.assertEqual(mi.main(["memory-index.py", str(empty)]), 0)
        self.assertEqual(buffer.getvalue(), "")


if __name__ == "__main__":
    unittest.main()
