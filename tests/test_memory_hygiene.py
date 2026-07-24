from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "memory-hygiene.py"


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        check=False,
    )


class TestMemoryHygiene(unittest.TestCase):
    def test_missing_dir_ok(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            r = _run("--memory-dir", td + "/nope")
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertIn("PASS", r.stdout)

    def test_duplicate_headings(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            mem = Path(td)
            (mem / "decisions.md").write_text(
                "# Decisions\n\n## Use Hono\nwhy\n\n## Use Hono\nother\n",
                encoding="utf-8",
            )
            r = _run("--memory-dir", str(mem))
            self.assertEqual(r.returncode, 0)
            self.assertIn("CONFLICT", r.stdout)
            self.assertIn("duplicate heading", r.stdout)

    def test_polarity_clash_use_vs_avoid(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            mem = Path(td)
            (mem / "decisions.md").write_text(
                "# Decisions\n\n## Use Postgres\nlocked\n\n## Avoid Postgres\nlegacy note\n",
                encoding="utf-8",
            )
            r = _run("--memory-dir", str(mem), "--json")
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            data = json.loads(r.stdout)
            self.assertFalse(data["ok"])
            joined = " ".join(data["conflicts"]).lower()
            self.assertIn("polarity", joined)
            self.assertIn("postgres", joined)

            strict = _run("--memory-dir", str(mem), "--strict")
            self.assertEqual(strict.returncode, 1)

    def test_cross_file_title_warning(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            mem = Path(td)
            (mem / "decisions.md").write_text(
                "## Auth via JWT\nbody\n", encoding="utf-8"
            )
            (mem / "project-decisions.md").write_text(
                "## Auth via JWT\nrecorded\n", encoding="utf-8"
            )
            r = _run("--memory-dir", str(mem))
            self.assertEqual(r.returncode, 0)
            self.assertIn("WARN", r.stdout)
            self.assertIn("both decisions.md and project-decisions.md", r.stdout)

    def test_prune_over_threshold_and_cold(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            mem = Path(td)
            old = (date.today() - timedelta(days=90)).isoformat()
            body = "\n".join(f"line {i}" for i in range(20))
            (mem / "learnings.md").write_text(
                f"### [{old}] Ancient gotcha `[api, gotcha]`\n{body}\n",
                encoding="utf-8",
            )
            # force low threshold
            r = _run("--memory-dir", str(mem), "--threshold", "5", "--json")
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            data = json.loads(r.stdout)
            self.assertGreaterEqual(data["cold_count"], 1)
            prune_text = " ".join(data["prune"]).lower()
            self.assertIn("compact", prune_text)
            self.assertIn("cold entry", prune_text)

    def test_empty_body_prune(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            mem = Path(td)
            (mem / "decisions.md").write_text(
                "## Prefer SQLite\n\n## Prefer Redis\n\n",
                encoding="utf-8",
            )
            r = _run("--memory-dir", str(mem))
            self.assertEqual(r.returncode, 0)
            self.assertIn("PRUNE", r.stdout)
            self.assertIn("empty body", r.stdout)

    def test_clean_memory_pass(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            mem = Path(td)
            today = date.today().isoformat()
            (mem / "decisions.md").write_text(
                f"### [{today}] Use Hono for edge API `[api, decision]`\n"
                f"**What:** Hono is locked for edge handlers.\n",
                encoding="utf-8",
            )
            r = _run("--memory-dir", str(mem), "--strict")
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertIn("PASS", r.stdout)
            self.assertNotIn("CONFLICT", r.stdout)


if __name__ == "__main__":
    unittest.main()
