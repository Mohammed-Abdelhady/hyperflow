"""Tests for the metadata-only context budget probe."""

from __future__ import annotations

import importlib.util
import json
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

    def test_duplicate_prompt_references_resolve_to_canonical_sources(self) -> None:
        self.assertEqual(references.check(ROOT), [])
        pointer = ROOT / "skills" / "dispatch" / "references" / "worker-prompt.md"
        canonical = ROOT / "skills" / "hyperflow" / "worker-prompt.md"
        self.assertLess(pointer.stat().st_size, canonical.stat().st_size // 10)


if __name__ == "__main__":
    unittest.main()
