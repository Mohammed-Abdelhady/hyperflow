"""Tests for hard token budgets and boundary decisions."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "budget-guard.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("budget_guard", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


guard = _load_module()


class BudgetGuardTests(unittest.TestCase):
    def evaluate(self, **kwargs):
        defaults = {
            "profile": "standard",
            "phase": "execution",
            "total_used": 10_000,
            "phase_used": 5_000,
            "at_boundary": True,
        }
        defaults.update(kwargs)
        return guard.evaluate_budget(**defaults)

    def test_hard_totals_match_contract(self):
        self.assertEqual(
            guard.HARD_TOTALS,
            {
                "fast": 10_000,
                "standard": 50_000,
                "deep": 200_000,
                "research": 60_000,
                "creative": 100_000,
                "scientific": 200_000,
            },
        )
        for profile, caps in guard.PHASE_CAPS.items():
            self.assertLessEqual(sum(caps.values()), guard.HARD_TOTALS[profile])

    def test_continues_within_budget(self):
        result = self.evaluate()
        self.assertEqual(result["decision"], "continue")
        self.assertEqual(result["reason"], "within_budget")

    def test_hard_total_halts_at_boundary(self):
        result = self.evaluate(total_used=50_000)
        self.assertEqual(result["decision"], "halt")
        self.assertEqual(result["reason"], "hard_total_reached")

    def test_reserved_launch_is_refused_before_total_or_phase_overrun(self):
        total = self.evaluate(
            total_used=49_000, phase_used=20_000, reserved_tokens=1_001
        )
        self.assertEqual(total["decision"], "halt")
        self.assertEqual(total["reason"], "hard_total_would_be_exceeded")
        phase = self.evaluate(
            total_used=30_000, phase_used=24_000, reserved_tokens=1_001
        )
        self.assertEqual(phase["decision"], "halt")
        self.assertEqual(phase["reason"], "phase_cap_would_be_exceeded")
        exact = self.evaluate(
            total_used=49_000, phase_used=24_000, reserved_tokens=1_000
        )
        self.assertEqual(exact["decision"], "continue")

    def test_phase_usage_cannot_exceed_total_usage(self):
        with self.assertRaises(ValueError):
            self.evaluate(total_used=1_000, phase_used=1_001)

    def test_phase_cap_can_degrade_at_boundary(self):
        result = self.evaluate(
            profile="deep",
            phase="review",
            total_used=40_000,
            phase_used=35_000,
            allow_degrade=True,
        )
        self.assertEqual(result["decision"], "degrade")
        self.assertEqual(result["target_profile"], "standard")

    def test_phase_cap_halts_when_degrade_is_not_safe(self):
        result = self.evaluate(
            total_used=30_000, phase_used=25_000, allow_degrade=False
        )
        self.assertEqual(result["decision"], "halt")
        scientific = self.evaluate(
            profile="scientific",
            total_used=95_000,
            phase_used=90_000,
            allow_degrade=True,
        )
        self.assertEqual(scientific["decision"], "halt")

    def test_overrun_does_not_interrupt_in_flight_work(self):
        result = self.evaluate(total_used=55_000, at_boundary=False)
        self.assertEqual(result["decision"], "continue")
        self.assertEqual(result["pending_decision"], "halt")

    def test_auto_config_loads_repo_defaults_and_user_overrides(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as home:
            root = Path(tmp)
            (root / "config").mkdir()
            (root / "config" / "defaults.json").write_text(
                json.dumps(
                    {
                        "budgets": {
                            "hardTotals": {"fast": 9_000},
                            "phaseCaps": {"fast": {"execution": 5_000}},
                        },
                        "unrelated": {"preserved": True},
                    }
                ),
                encoding="utf-8",
            )
            user_dir = Path(home) / ".hyperflow"
            user_dir.mkdir()
            (user_dir / "config.json").write_text(
                json.dumps(
                    {
                        "budgets": {
                            "hardTotals": {"standard": 40_000},
                            "phaseCaps": {"fast": {"execution": 4_000}},
                        }
                    }
                ),
                encoding="utf-8",
            )
            loaded = guard.load_runtime_config(repo_root=root, home=home)
        self.assertEqual(loaded["budgets"]["hardTotals"]["fast"], 9_000)
        self.assertEqual(loaded["budgets"]["phaseCaps"]["fast"]["execution"], 4_000)
        self.assertNotIn("standard", loaded["budgets"]["phaseCaps"])
        totals, phases = guard.load_limits(loaded)
        self.assertEqual(totals["standard"], 40_000)
        self.assertEqual(sum(phases["standard"].values()), 40_000)
        self.assertTrue(loaded["unrelated"]["preserved"])

    def test_explicit_config_bypasses_auto_sources(self):
        with tempfile.TemporaryDirectory() as tmp:
            explicit = Path(tmp) / "explicit.json"
            explicit.write_text(
                json.dumps({"budgets": {"hardTotals": {"fast": 8_000}}}),
                encoding="utf-8",
            )
            loaded = guard.load_runtime_config(explicit, repo_root="/missing")
        self.assertEqual(loaded["budgets"]["hardTotals"]["fast"], 8_000)

    def test_partial_config_override_is_scaled_and_validated(self):
        totals, phases = guard.load_limits(
            {"budgets": {"hardTotals": {"fast": 8_000}}}
        )
        self.assertEqual(totals["fast"], 8_000)
        self.assertEqual(sum(phases["fast"].values()), 8_000)
        with self.assertRaises(ValueError):
            guard.load_limits(
                {"budgets": {"phaseCaps": {"fast": {"execution": 11_000}}}}
            )
        with self.assertRaises(ValueError):
            guard.load_limits({"budgets": {"hardTotal": {"fast": 8_000}}})

    def test_combined_user_total_and_partial_phase_override_scales_unspecified_caps(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as home:
            root = Path(tmp)
            (root / "config").mkdir()
            (root / "config" / "defaults.json").write_text(
                json.dumps(
                    {
                        "budgets": {
                            "hardTotals": guard.HARD_TOTALS,
                            "phaseCaps": guard.PHASE_CAPS,
                        }
                    }
                ),
                encoding="utf-8",
            )
            user_dir = Path(home) / ".hyperflow"
            user_dir.mkdir()
            (user_dir / "config.json").write_text(
                json.dumps(
                    {
                        "budgets": {
                            "hardTotals": {"fast": 8_000},
                            "phaseCaps": {"fast": {"execution": 4_000}},
                        }
                    }
                ),
                encoding="utf-8",
            )
            loaded = guard.load_runtime_config(repo_root=root, home=home)
        self.assertEqual(loaded["budgets"]["phaseCaps"]["fast"], {"execution": 4_000})
        totals, phases = guard.load_limits(loaded)
        self.assertEqual(totals["fast"], 8_000)
        self.assertEqual(phases["fast"]["triage"], 800)
        self.assertEqual(phases["fast"]["planning"], 800)
        self.assertEqual(phases["fast"]["execution"], 4_000)
        self.assertEqual(phases["fast"]["review"], 800)
        self.assertEqual(phases["fast"]["verification"], 800)

    def test_cli_loads_config_and_prints_valid_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / "config.json"
            config.write_text(
                json.dumps({"budgets": {"hardTotals": {"fast": 8_000}}}),
                encoding="utf-8",
            )
            completed = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--profile",
                    "fast",
                    "--phase",
                    "execution",
                    "--total-used",
                    "8000",
                    "--phase-used",
                    "4000",
                    "--boundary",
                    "--config",
                    str(config),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
        self.assertEqual(completed.returncode, 0)
        self.assertEqual(json.loads(completed.stdout)["decision"], "halt")


if __name__ == "__main__":
    unittest.main()
