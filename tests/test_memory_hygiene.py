from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class TestMemoryHygiene(unittest.TestCase):
    def test_missing_dir_ok(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            r = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts" / "memory-hygiene.py"),
                    "--memory-dir",
                    td + "/nope",
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_duplicate_headings(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            mem = Path(td)
            (mem / "decisions.md").write_text(
                "# Decisions\n\n## Use Hono\nwhy\n\n## Use Hono\nother\n",
                encoding="utf-8",
            )
            r = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts" / "memory-hygiene.py"),
                    "--memory-dir",
                    str(mem),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(r.returncode, 0)
            self.assertIn("CONFLICT", r.stdout)


if __name__ == "__main__":
    unittest.main()
