"""Cross-file contract tests for token-efficient orchestration defaults."""

from __future__ import annotations

import importlib.util
import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BUDGET_GUARD = ROOT / "scripts" / "budget-guard.py"
ROUTE_TASK = ROOT / "scripts" / "route-task.py"


def _load_budget_guard():
    spec = importlib.util.spec_from_file_location("budget_guard_contract", BUDGET_GUARD)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


guard = _load_budget_guard()


def _load_route_task():
    spec = importlib.util.spec_from_file_location("route_task_contract", ROUTE_TASK)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


router = _load_route_task()


class TokenContractTests(unittest.TestCase):
    def test_deterministic_triage_source_literal_matches_all_consumers(self) -> None:
        triage = (ROOT / "skills" / "hyperflow" / "task-triage.md").read_text()
        dispatch = (ROOT / "skills" / "dispatch" / "SKILL.md").read_text()
        result = router.route_task(
            "Fix the typo",
            files=["src/message.ts"],
            risk="reversible",
            clarity="clear",
            project_root=ROOT,
        )
        self.assertEqual(result["triage_source"], router.TRIAGE_SOURCE)
        self.assertEqual(router.TRIAGE_SOURCE, "deterministic")
        self.assertIn("triage_source: deterministic", triage)
        self.assertIn("triage_source=deterministic", dispatch)
        self.assertNotIn("deterministic_preflight", triage + dispatch)

    def test_route_blocklist_contains_configured_sensitive_patterns(self) -> None:
        defaults = json.loads((ROOT / "config" / "defaults.json").read_text())
        self.assertTrue(
            set(defaults["security"]["blockedFiles"]).issubset(
                set(router.BLOCKED_FILE_PATTERNS)
            )
        )

    def test_default_config_and_schema_match_budget_guard(self) -> None:
        defaults = json.loads((ROOT / "config" / "defaults.json").read_text())
        schema = json.loads((ROOT / "config" / "schema.json").read_text())

        self.assertEqual(defaults["budgets"]["hardTotals"], guard.HARD_TOTALS)
        self.assertEqual(defaults["budgets"]["phaseCaps"], guard.PHASE_CAPS)

        schema_totals = schema["properties"]["budgets"]["properties"]["hardTotals"]
        schema_defaults = {
            profile: definition["default"]
            for profile, definition in schema_totals["properties"].items()
        }
        self.assertEqual(schema_defaults, guard.HARD_TOTALS)

    def test_documented_budget_tables_match_runtime(self) -> None:
        triage = (ROOT / "skills" / "hyperflow" / "task-triage.md").read_text()
        profiles = (ROOT / "skills" / "hyperflow" / "flow-profiles.md").read_text()

        for profile, budget in guard.HARD_TOTALS.items():
            with self.subTest(profile=profile):
                self.assertRegex(
                    triage,
                    rf"\| `{re.escape(profile)}` \| {budget} \|",
                )
                self.assertRegex(
                    profiles,
                    rf"\| {re.escape(profile)}\s+\| {budget:,}".replace(",", " "),
                )

    def test_lean_is_the_resolver_default(self) -> None:
        resolve_mode = (ROOT / "scripts" / "resolve-mode.py").read_text()
        self.assertIn('or "lean"', resolve_mode)

    def test_legacy_complexity_values_are_not_used_as_triage_contracts(self) -> None:
        checked = [
            ROOT / "skills" / "dispatch" / "SKILL.md",
            ROOT / "skills" / "hyperflow" / "DOCTRINE.md",
            ROOT / "skills" / "hyperflow" / "worker-prompt.md",
            ROOT / "skills" / "plan" / "SKILL.md",
        ]
        legacy_patterns = (
            r"complexity\s*(?:==|=)\s*(?:low|medium|high)\b",
            r"complexity\s*=\s*trivial\|low\b",
            r"complexity:\s*low\b",
        )

        for path in checked:
            content = path.read_text()
            for pattern in legacy_patterns:
                with self.subTest(path=path, pattern=pattern):
                    self.assertNotRegex(content, pattern)

    def test_escalation_budget_table_matches_runtime(self) -> None:
        escalation = (ROOT / "skills" / "hyperflow" / "escalation.md").read_text()
        for profile, budget in guard.HARD_TOTALS.items():
            with self.subTest(profile=profile):
                self.assertRegex(
                    escalation,
                    rf"\| {re.escape(profile)} \| {budget // 1000}k tokens \|",
                )

    def test_inline_fast_exceptions_do_not_conflict_with_normal_flow(self) -> None:
        doctrine = (ROOT / "skills" / "hyperflow" / "DOCTRINE.md").read_text()
        plan = (ROOT / "skills" / "plan" / "SKILL.md").read_text()
        example = (ROOT / "skills" / "plan" / "references" / "examples.md").read_text()
        public = "\n".join(
            [
                (ROOT / "README.md").read_text(),
                (ROOT / "config" / "features.json").read_text(),
                (ROOT / "docs" / "index.html").read_text(),
                (ROOT / "docs" / "orchestration.md").read_text(),
                (ROOT / "docs" / "orchestration.html").read_text(),
                (ROOT / "docs" / "assets" / "hero.svg").read_text(),
                (ROOT / "docs" / "assets" / "hero-vertical.svg").read_text(),
                (ROOT / "scripts" / "generate-hero.py").read_text(),
            ]
        )

        self.assertNotIn("Always decompose first", doctrine)
        self.assertNotIn("Even a single file edit", doctrine)
        self.assertNotRegex(plan, r"<\s*2 .*floor")
        self.assertNotIn("exactly 2 questions", example)
        self.assertNotIn("before or after mutation", public)
        self.assertNotIn("Worker → Reviewer review at every step", public)
        self.assertNotIn("Every stage runs Worker → Reviewer pairs", public)
        self.assertNotRegex(public, r"(?i)review(?:s|ed)? every step")
        self.assertNotIn("every step dispatches a Worker → Reviewer pair", public)
        self.assertNotIn("every step → Worker → Reviewer", public)


if __name__ == "__main__":
    unittest.main()
