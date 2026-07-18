"""Tests for check-references.py — the advisory reference-drift report."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT = REPO_ROOT / "scripts" / "check-references.py"


def _load():
    spec = importlib.util.spec_from_file_location("check_references", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


cr = _load()


class ReportTests(unittest.TestCase):
    def test_report_runs_and_covers_shared_names(self) -> None:
        lines = cr.report(REPO_ROOT)
        text = "\n".join(lines)
        for name in cr.SHARED:
            self.assertIn(name, text)

    def test_flags_identical_diverged_cluster_as_drift(self) -> None:
        # the per-skill memory-system.md copies are identical to each other but
        # behind the canonical → must be reported as candidate drift.
        text = "\n".join(cr.report(REPO_ROOT))
        self.assertIn("candidate drift", text)

    def test_advisory_exit_zero(self) -> None:
        self.assertEqual(cr.main(["check-references.py", "--repo-root", str(REPO_ROOT)]), 0)


if __name__ == "__main__":
    unittest.main()
