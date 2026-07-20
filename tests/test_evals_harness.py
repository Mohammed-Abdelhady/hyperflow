"""Eval harness and host-parity must stay green."""
from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class TestEvalsHarness(unittest.TestCase):
    def test_run_evals(self) -> None:
        r = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "run-evals.py")],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        if r.returncode != 0:
            self.fail(r.stdout + "\n" + r.stderr)

    def test_host_parity(self) -> None:
        r = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "check-host-parity.py")],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        if r.returncode != 0:
            self.fail(r.stdout + "\n" + r.stderr)


if __name__ == "__main__":
    unittest.main()
