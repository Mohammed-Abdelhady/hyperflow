"""Tests for the metadata-only context budget probe."""

from __future__ import annotations

import importlib.util
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "context-budget.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("context_budget", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


budget = _load_module()
REFERENCE_CHECK = ROOT / "scripts" / "check-prompt-references.py"


def _load_reference_checker():
    spec = importlib.util.spec_from_file_location("prompt_references", REFERENCE_CHECK)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


references = _load_reference_checker()


class ContextBudgetTests(unittest.TestCase):
    def test_estimate_is_explicitly_marked(self) -> None:
        report = budget.measure(ROOT, ["skills/hyperflow/worker-prompt-lean.md"])
        self.assertTrue(report["estimated"])
        record = report["files"][0]
        self.assertTrue(record["estimated"])
        self.assertGreater(record["estimated_tokens"], 0)

    def test_json_output_contains_metadata_only(self) -> None:
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--json", "--file", "skills/hyperflow/worker-prompt-lean.md"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        payload = json.loads(result.stdout)
        self.assertTrue(payload["ok"])
        self.assertNotIn("Token economy", result.stdout)
        self.assertNotIn("## Task", result.stdout)

    def test_check_fails_for_a_file_over_its_explicit_limit(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            path = root / "fixture.md"
            path.write_text("x" * 20, encoding="utf-8")
            original = budget.DEFAULT_LIMITS.get("fixture.md")
            budget.DEFAULT_LIMITS["fixture.md"] = 10
            self.addCleanup(
                lambda: (
                    budget.DEFAULT_LIMITS.__setitem__("fixture.md", original)
                    if original is not None
                    else budget.DEFAULT_LIMITS.pop("fixture.md", None)
                )
            )
            report = budget.measure(root, ["fixture.md"])
            self.assertFalse(report["ok"])
            self.assertIn("over_limit:fixture.md:20>10", report["violations"])

    def test_dispatch_usage_contract_is_lazy_and_resolves(self) -> None:
        dispatch_path = ROOT / "skills" / "dispatch" / "SKILL.md"
        dispatch = dispatch_path.read_text(encoding="utf-8")
        usage = ROOT / "skills" / "dispatch" / "references" / "usage-ledger.md"
        usage_text = usage.read_text(encoding="utf-8")

        self.assertIn("[usage-ledger.md](references/usage-ledger.md)", dispatch)
        self.assertIn("before the first worker, Composer, Reviewer, or gate dispatch", usage_text)
        self.assertIn("# Dispatch usage ledger and budget boundaries", usage_text)
        self.assertIn("scripts/usage-ledger.py record", usage_text)
        self.assertIn("scripts/budget-guard.py", usage_text)
        self.assertLess(dispatch_path.stat().st_size, 72_000)

    def test_plan_approval_contract_is_lazy_and_resolves(self) -> None:
        plan_path = ROOT / "skills" / "plan" / "SKILL.md"
        plan = plan_path.read_text(encoding="utf-8")
        gates = plan_path.parent / "references" / "approval-gates.md"
        gates_text = gates.read_text(encoding="utf-8")
        runtime_contract = (gates.parent / "../../hyperflow/runtime-contract.md").resolve()

        pointer = "[approval-gates.md](references/approval-gates.md)"
        pointer_match = re.search(r"\[approval-gates\.md\]\(([^)]+)\)", plan)
        self.assertIsNotNone(pointer_match)
        assert pointer_match is not None
        pointer_href = pointer_match.group(1)
        self.assertEqual(pointer_href, "references/approval-gates.md")
        self.assertIn(pointer, plan)
        self.assertLess(plan.index(pointer), plan.index("### Step 5 — Clarify"))
        self.assertEqual((plan_path.parent / pointer_href).resolve(), gates.resolve())
        self.assertTrue(gates.is_file())

        runtime_match = re.search(r"\[runtime-contract\.md\]\(([^)]+)\)", gates_text)
        self.assertIsNotNone(runtime_match)
        assert runtime_match is not None
        runtime_href = runtime_match.group(1)
        self.assertEqual(runtime_href, "../../hyperflow/runtime-contract.md")
        self.assertEqual((gates.parent / runtime_href).resolve(), runtime_contract)
        self.assertTrue(runtime_contract.is_file())

        self.assertIn("The build-location gate remains mandatory on every run", plan)
        self.assertIn("The build-location gate fires on **every** run", gates_text)
        for marker in (
            "Smart questions",
            "Synthesis + approach",
            "Design section approval",
            "| **Build location** |",
            "end the turn",
            "Never silently pick the recommended option",
            "Never start a build without the build-location answer",
        ):
            self.assertIn(marker, gates_text)
        self.assertIn("[runtime-contract.md](../../hyperflow/runtime-contract.md)", gates_text)
        self.assertLess(plan_path.stat().st_size, 42_000)

    def test_duplicate_prompt_references_resolve_to_canonical_sources(self) -> None:
        self.assertEqual(references.check(ROOT), [])
        pointer = ROOT / "skills" / "dispatch" / "references" / "worker-prompt.md"
        canonical = ROOT / "skills" / "hyperflow" / "worker-prompt.md"
        self.assertLess(pointer.stat().st_size, canonical.stat().st_size // 10)


if __name__ == "__main__":
    unittest.main()
