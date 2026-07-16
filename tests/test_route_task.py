"""Tests for the deterministic inline-fast router."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "route-task.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("route_task", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


router = _load_module()


class RouteTaskTests(unittest.TestCase):
    def route(self, request="Fix the typo", **kwargs):
        defaults = {"files": ["src/message.ts"], "risk": "reversible", "clarity": "clear"}
        defaults.update(kwargs)
        return router.route_task(request, **defaults)

    def test_routes_observed_one_or_two_file_task_inline(self):
        single = self.route()
        self.assertEqual(single["route"], "inline_fast")
        self.assertEqual(single["scope"], "single-file")
        result = self.route(files=["src/a.ts", "src/a.test.ts"])
        self.assertEqual(result["route"], "inline_fast")
        self.assertEqual(result["confidence"], "high")
        self.assertEqual(result["scope"], "multi-file")

    def test_inline_result_has_complete_deterministic_triage_contract(self):
        result = self.route()
        expected = {
            "triage_source": "deterministic",
            "types": [],
            "personas": [],
            "specialists": [],
            "complexity": "trivial",
            "risk": "reversible",
            "scope": "single-file",
            "ambiguity": 0.0,
            "brainstormDepth": "none",
            "flow": "fast",
            "estimatedWorkers": 0,
            "estimatedBatches": 1,
            "budget": 10_000,
            "security": False,
            "integration_risk": False,
        }
        for key, value in expected.items():
            self.assertEqual(result[key], value)
        self.assertTrue(result["rationale"])

    def test_unknown_observations_fall_back(self):
        self.assertEqual(self.route(risk="unknown")["route"], "classifier")
        self.assertEqual(self.route(clarity="unknown")["route"], "classifier")
        self.assertEqual(self.route(files=[])["route"], "classifier")
        self.assertEqual(
            self.route(files=["a.ts", "b.ts", "c.ts"])["route"], "classifier"
        )
        self.assertEqual(self.route("")["route"], "classifier")

    def test_sensitive_or_integrated_work_falls_back(self):
        self.assertEqual(self.route("Fix the JWT parser")["route"], "classifier")
        self.assertEqual(self.route(integration_risk=True)["route"], "classifier")
        self.assertEqual(
            self.route("Update the API contract", files=["src/api.ts"])["route"],
            "classifier",
        )

    def test_explicit_thorough_generated_and_migration_surfaces_fall_back(self):
        cases = [
            self.route("/hyperflow:plan fix the typo"),
            self.route("Fix the typo --thorough"),
            self.route("Fix the typo mode=default"),
            self.route("Fix the typo --mode=default"),
            self.route(files=["pnpm-lock.yaml"]),
            self.route(files=["db/migrations/001_add_name.sql"]),
            self.route("Maybe fix the typo"),
        ]
        self.assertTrue(all(case["route"] == "classifier" for case in cases))

    def test_blocked_and_escaping_paths_fall_back(self):
        blocked = [
            ".env",
            ".env.local",
            "keys/server.pem",
            "keys/server.key",
            "keys/server.crt",
            "keys/server.cer",
            "config/credentials.json",
            "config/prod-service-account.json",
            "config/prod-secret.yaml",
            ".docker/config.json",
            "signing/key.gpg",
            ".git/config",
            "../outside.ts",
            "/tmp/outside.ts",
            "~/outside.ts",
            "C:/outside.ts",
        ]
        for path in blocked:
            with self.subTest(path=path):
                self.assertEqual(self.route(files=[path])["route"], "classifier")

    def test_project_root_rejects_symlinks_and_outside_resolution(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as out:
            root = Path(tmp)
            (root / "src").mkdir()
            (root / "src" / "safe.ts").write_text("safe", encoding="utf-8")
            (root / "linked").symlink_to(Path(out), target_is_directory=True)
            self.assertEqual(
                self.route(files=["src/safe.ts"], project_root=root)["route"],
                "inline_fast",
            )
            result = self.route(files=["linked/outside.ts"], project_root=root)
            self.assertEqual(result["route"], "classifier")
            self.assertIn("symlink_or_outside_project", result["reasons"])

    def test_project_root_is_canonicalized_and_must_exist_as_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp)
            root = parent / "project"
            root.mkdir()
            (root / "src").mkdir()
            (root / "src" / "safe.ts").write_text("safe", encoding="utf-8")
            alias = parent / "project-link"
            alias.symlink_to(root, target_is_directory=True)
            self.assertEqual(
                self.route(files=["src/safe.ts"], project_root=alias)["route"],
                "inline_fast",
            )
            invalid = self.route(files=["src/safe.ts"], project_root=parent / "missing")
            self.assertEqual(invalid["route"], "classifier")
            self.assertIn("invalid_project_root", invalid["reasons"])

    def test_cli_prints_valid_json(self):
        completed = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "Fix the typo",
                "--file",
                "src/message.ts",
                "--risk",
                "reversible",
                "--clarity",
                "clear",
                "--project-root",
                str(ROOT),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        self.assertEqual(json.loads(completed.stdout)["route"], "inline_fast")


if __name__ == "__main__":
    unittest.main()
