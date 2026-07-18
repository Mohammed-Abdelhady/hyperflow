"""Unit coverage for Codex lifecycle fixtures + harness scripts (T11).

Runs without the `codex` CLI so CI stays green offline. Validates:
  - marketplace-v1/v2 and hook-payload JSON load and schema shape
  - v1 → v2 version ordering
  - public skill parity between v1 and v2
  - scripts exist and are executable
  - scripts declare SKIP when codex is unavailable (header contract)
"""

from __future__ import annotations

import json
import os
import stat
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURE_DIR = REPO_ROOT / "tests" / "fixtures" / "codex"
V1 = FIXTURE_DIR / "marketplace-v1.json"
V2 = FIXTURE_DIR / "marketplace-v2.json"
PAYLOADS = FIXTURE_DIR / "hook-payloads.json"
PLUGIN_SH = REPO_ROOT / "scripts" / "test-codex-plugin.sh"
HOOKS_SH = REPO_ROOT / "scripts" / "test-codex-hooks.sh"

PUBLIC_SKILLS = {
    "scaffold",
    "plan",
    "issue",
    "dispatch",
    "workflow",
    "trace",
    "audit",
    "pr",
    "deploy",
    "cache",
    "handoff",
    "design",
    "status",
    "background",
    "sticky",
    "bridge",
    "flush",
    "hyperflow",
}


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _is_executable(path: Path) -> bool:
    mode = path.stat().st_mode
    return bool(mode & (stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH))


class MarketplaceFixtureTests(unittest.TestCase):
    def test_fixtures_exist(self) -> None:
        for path in (V1, V2, PAYLOADS):
            self.assertTrue(path.is_file(), msg=f"missing {path}")

    def test_v1_and_v2_schema(self) -> None:
        for path, label in ((V1, "v1"), (V2, "v2")):
            data = _load(path)
            self.assertEqual(data.get("kind"), "codex-marketplace-fixture")
            self.assertEqual(data.get("schemaVersion"), 1)
            self.assertEqual(data.get("label"), label)
            self.assertIn("marketplace", data)
            self.assertIn("plugin", data)
            self.assertIn("git", data)
            mp = data["marketplace"]
            self.assertEqual(mp["name"], "hyperflow-marketplace")
            self.assertIn("version", mp["metadata"])
            plugin = data["plugin"]
            self.assertEqual(plugin["name"], "hyperflow")
            self.assertRegex(str(plugin["version"]), r"^\d+\.\d+\.\d+$")
            self.assertIn("interface", plugin)
            self.assertIn("hooks", plugin)
            self.assertIn("sessionStartMarker", plugin["hooks"])
            self.assertIn("preCompactReason", plugin["hooks"])
            skills = plugin["skills"]
            self.assertIsInstance(skills, list)
            self.assertGreaterEqual(len(skills), 1)
            self.assertTrue(PUBLIC_SKILLS.issubset(set(skills)), msg=set(skills))

    def test_v2_is_newer_than_v1(self) -> None:
        v1 = _load(V1)
        v2 = _load(V2)
        self.assertNotEqual(v1["plugin"]["version"], v2["plugin"]["version"])

        def tuple_ver(s: str) -> tuple[int, ...]:
            return tuple(int(p) for p in s.split("."))

        self.assertLess(
            tuple_ver(v1["plugin"]["version"]),
            tuple_ver(v2["plugin"]["version"]),
        )
        self.assertLess(
            tuple_ver(v1["marketplace"]["metadata"]["version"]),
            tuple_ver(v2["marketplace"]["metadata"]["version"]),
        )
        self.assertNotEqual(
            v1["plugin"]["hooks"]["sessionStartMarker"],
            v2["plugin"]["hooks"]["sessionStartMarker"],
        )

    def test_skill_lists_match(self) -> None:
        v1 = _load(V1)
        v2 = _load(V2)
        self.assertEqual(v1["plugin"]["skills"], v2["plugin"]["skills"])


class HookPayloadFixtureTests(unittest.TestCase):
    def test_payload_schema(self) -> None:
        data = _load(PAYLOADS)
        self.assertEqual(data.get("kind"), "codex-hook-payload-fixture")
        self.assertEqual(data.get("schemaVersion"), 1)
        cases = data["cases"]
        self.assertIsInstance(cases, list)
        self.assertGreaterEqual(len(cases), 4)
        ids = [c["id"] for c in cases]
        self.assertEqual(len(ids), len(set(ids)), msg="duplicate case ids")
        hooks = {c["hook"] for c in cases}
        self.assertIn("session-start", hooks)
        self.assertIn("pre-compact", hooks)
        events = {c["event"] for c in cases}
        self.assertIn("SessionStart", events)
        self.assertIn("PreCompact", events)
        for case in cases:
            self.assertIn("expect", case)
            self.assertIn("exitCode", case["expect"])
            if "rawStdin" not in case and not case.get("requiresIsolationBypass"):
                # payload or rawStdin required for non-bypass structural cases
                self.assertTrue(
                    "payload" in case or "rawStdin" in case,
                    msg=case["id"],
                )

    def test_placeholders_documented(self) -> None:
        text = PAYLOADS.read_text(encoding="utf-8")
        for token in (
            "{{PROJECT_ROOT}}",
            "{{NESTED_CWD}}",
            "{{UNRELATED_CWD}}",
            "{{TEMP_HOME}}",
            "{{CODEX_HOME}}",
        ):
            self.assertIn(token, text)


class HarnessScriptTests(unittest.TestCase):
    def test_scripts_exist_and_executable(self) -> None:
        for path in (PLUGIN_SH, HOOKS_SH):
            self.assertTrue(path.is_file(), msg=f"missing {path}")
            self.assertTrue(
                _is_executable(path),
                msg=f"not executable: {path} mode={oct(path.stat().st_mode)}",
            )

    def test_scripts_document_skip_and_isolation(self) -> None:
        for path in (PLUGIN_SH, HOOKS_SH):
            text = path.read_text(encoding="utf-8")
            self.assertIn("SKIP: codex CLI not available", text)
            self.assertIn("set -euo pipefail", text)
            self.assertIn("CODEX_HOME", text)
            self.assertIn("SECURITY_VIOLATION", text)
            self.assertIn("exit 0", text)
            # Documented alternative skip code
            self.assertIn("77", text)

    def test_scripts_never_hardcode_user_codex_as_target(self) -> None:
        """Scripts may mention real ~/.codex only as a negative isolation check."""
        for path in (PLUGIN_SH, HOOKS_SH):
            text = path.read_text(encoding="utf-8")
            self.assertNotRegex(
                text,
                r'(?m)^\s*(export\s+)?CODEX_HOME=["\']?\$HOME/\.codex',
            )
            self.assertIn("REAL_CODEX_HOME", text)


if __name__ == "__main__":
    unittest.main()
