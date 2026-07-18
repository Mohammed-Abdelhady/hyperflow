"""Freeze Claude Code and OpenCode provider behavior before portable migration.

Goldens live in tests/fixtures/provider-regressions.json. Assertions check
semantic contracts and stable structured fields against live repository files
(and, where needed, hermetic hook execution). No network. No credentials.

Update the fixture only with an explicit intentional_update.reason in the same
task-owned commit that changes live behavior.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURE_PATH = REPO_ROOT / "tests" / "fixtures" / "provider-regressions.json"
SESSION_START = REPO_ROOT / "hooks" / "session-start"
VERSION = (REPO_ROOT / "skills" / "hyperflow" / "VERSION").read_text(
    encoding="utf-8"
).strip()


def _load_fixture() -> dict[str, Any]:
    data = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or "cases" not in data:
        raise AssertionError("provider-regressions.json must be an object with cases")
    return data


# Patterns that must never appear as real fixture content (credentials/paths).
# Listed only in Python so the JSON denylist cannot self-match.
_SECURITY_FORBIDDEN: tuple[str, ...] = (
    "BEGIN PRIVATE KEY",
    "BEGIN RSA PRIVATE KEY",
    "AKIA",
    "sk-ant-",
    "sk-proj-",
    "ghp_",
    "xoxb-",
    "/Users/",
    "/home/",
    "password=",
    "api_key=",
)


def _scan_fixture_for_secrets(data: dict[str, Any]) -> list[str]:
    """Return forbidden tokens found in fixture payload (excluding denylist fields)."""
    hits: list[str] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("kind") == "security_scan_self":
                # Skip denylist-only fields; parent case id/summary still scanned.
                for key, value in node.items():
                    if key in {"forbidden_substrings", "kind"}:
                        continue
                    walk(value)
                return
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)
        elif isinstance(node, str):
            for token in _SECURITY_FORBIDDEN:
                if token in node:
                    hits.append(token)

    walk(data)
    return sorted(set(hits))


def _repo_path(rel: str) -> Path:
    path = (REPO_ROOT / rel).resolve()
    if not str(path).startswith(str(REPO_ROOT.resolve())):
        raise AssertionError(f"path escapes repo root: {rel}")
    return path


def _read(rel: str) -> str:
    return _repo_path(rel).read_text(encoding="utf-8")


def _providers_by_key() -> dict[str, dict[str, Any]]:
    data = json.loads(_read("config/providers.json"))
    return {p["key"]: p for p in data["providers"]}


def _frontmatter(text: str) -> dict[str, str]:
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end < 0:
        return {}
    block = text[3:end]
    meta: dict[str, str] = {}
    for line in block.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        meta[key.strip()] = value.strip()
    return meta


def _allowed_tools(skill_text: str) -> list[str]:
    meta = _frontmatter(skill_text)
    raw = meta.get("allowed-tools", "")
    if not raw:
        # Multi-line YAML style is uncommon here; fall back to full scan.
        m = re.search(r"^allowed-tools:\s*(.+)$", skill_text, re.M)
        raw = m.group(1).strip() if m else ""
    parts: list[str] = []
    for token in re.split(r",\s*", raw):
        token = token.strip()
        if not token:
            continue
        # Bash(git:*) → Bash
        base = token.split("(", 1)[0].strip()
        parts.append(base)
    return parts


def _agent_names(agents_dir: str) -> list[str]:
    directory = _repo_path(agents_dir)
    names: list[str] = []
    for path in sorted(directory.glob("*.md")):
        if path.name == "README.md":
            continue
        meta = _frontmatter(path.read_text(encoding="utf-8"))
        name = meta.get("name", path.stem)
        names.append(name)
    return names


def _features_specialist_names(features_path: str) -> list[str]:
    data = json.loads(_read(features_path))
    specs = data["specialists"]
    names = [specs["router"]["name"]]
    names.extend(r["name"] for r in specs["reviewers"])
    names.extend(i["name"] for i in specs["investigators"])
    return sorted(names)


def _portable_router_aliases(text: str) -> dict[str, str]:
    """Parse alias → skill rows from the portable function router table."""
    # Prefer the Portable Function Router section if present.
    section = text
    marker = "## Portable Function Router"
    idx = text.find(marker)
    if idx >= 0:
        section = text[idx : idx + 4000]
    aliases: dict[str, str] = {}
    for line in section.splitlines():
        if not line.strip().startswith("|"):
            continue
        if "User says" in line or line.strip().startswith("|---"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 2:
            continue
        left, right = cells[0], cells[1]
        m_right = re.search(r"`([^`]+)`", right)
        if not m_right:
            continue
        target = m_right.group(1).strip()
        for alias in re.findall(r"`(/hyperflow:[^`]+)`", left):
            aliases[alias] = target
    return aliases


def _run_session_start(provider_env: dict[str, str]) -> dict[str, Any]:
    """Execute hooks/session-start hermetically; return parsed JSON payload."""
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        project = root / "project"
        hf = project / ".hyperflow"
        memory = hf / "memory"
        home = root / "home"
        memory.mkdir(parents=True)
        (home / ".hyperflow").mkdir(parents=True)
        (hf / ".version").write_text(VERSION + "\n", encoding="utf-8")
        (hf / ".bridge-mode").write_text("off\n", encoding="utf-8")
        for name in ("profile.md", "architecture.md", "conventions.md"):
            (hf / name).write_text(f"# {name}\n", encoding="utf-8")
        # Skip network update check.
        (home / ".hyperflow" / ".update-check").write_text(VERSION, encoding="utf-8")

        env = {
            k: v
            for k, v in os.environ.items()
            if not any(
                k == p or k.startswith(p + "_")
                for p in (
                    "CODEX",
                    "CLAUDE",
                    "OPENCODE",
                    "GROK",
                    "ANTIGRAVITY",
                    "CURSOR",
                )
            )
        }
        env["HOME"] = str(home)
        env["PATH"] = os.environ.get("PATH", "/usr/bin:/bin")
        for key, value in provider_env.items():
            env[key] = value.replace("$REPO_ROOT", str(REPO_ROOT))

        result = subprocess.run(
            [str(SESSION_START)],
            cwd=str(project),
            env=env,
            check=True,
            capture_output=True,
            text=True,
            timeout=60,
        )
        payload = json.loads(result.stdout)
        return payload


class FixtureIntegrityTests(unittest.TestCase):
    def test_fixture_loads_and_has_required_shape(self) -> None:
        data = _load_fixture()
        self.assertEqual(data["version"], 1)
        self.assertIsInstance(data["cases"], list)
        self.assertGreaterEqual(len(data["cases"]), 5)
        ids: set[str] = set()
        for case in data["cases"]:
            self.assertIn("id", case)
            self.assertIn("provider", case)
            self.assertIn("capability_profile", case)
            self.assertIn("invariants", case)
            self.assertIsInstance(case["invariants"], list)
            self.assertNotIn(case["id"], ids)
            ids.add(case["id"])
        # Both providers must appear.
        providers = {c["provider"] for c in data["cases"]}
        self.assertIn("claude-code", providers)
        self.assertIn("opencode", providers)

    def test_no_credentials_in_fixture_file(self) -> None:
        data = _load_fixture()
        hits = _scan_fixture_for_secrets(data)
        self.assertEqual(
            hits,
            [],
            msg=f"SECURITY_VIOLATION: fixture content contains {hits}",
        )


class ProviderRegressionEngine(unittest.TestCase):
    """Drive every fixture case through the structured invariant engine."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.fixture = _load_fixture()
        cls.providers = _providers_by_key()

    def test_all_fixture_cases(self) -> None:
        for case in self.fixture["cases"]:
            with self.subTest(case_id=case["id"], provider=case["provider"]):
                for inv in case["invariants"]:
                    self._assert_invariant(case, inv)

    def _assert_invariant(self, case: dict[str, Any], inv: dict[str, Any]) -> None:
        kind = inv["kind"]
        handler = getattr(self, f"_inv_{kind}", None)
        if handler is None:
            self.fail(f"unknown invariant kind {kind!r} in case {case['id']}")
        handler(case, inv)

    # ── invariant handlers ────────────────────────────────────────────────

    def _inv_provider_ops(self, case: dict[str, Any], inv: dict[str, Any]) -> None:
        provider = self.providers[inv["provider_key"]]
        ops = provider["operations"]
        for op_name, expected in inv["ops"].items():
            self.assertEqual(
                ops[op_name],
                expected,
                msg=f"{case['id']}: operations.{op_name}",
            )

    def _inv_provider_ops_empty(self, case: dict[str, Any], inv: dict[str, Any]) -> None:
        provider = self.providers[inv["provider_key"]]
        ops = provider["operations"]
        for op_name in inv["ops"]:
            self.assertEqual(
                ops[op_name],
                [],
                msg=f"{case['id']}: expected empty operations.{op_name}",
            )

    def _inv_provider_ops_exclude(self, case: dict[str, Any], inv: dict[str, Any]) -> None:
        provider = self.providers[inv["provider_key"]]
        flat: list[str] = []
        for candidates in provider["operations"].values():
            flat.extend(candidates)
        for forbidden in inv["forbidden_anywhere"]:
            self.assertNotIn(
                forbidden,
                flat,
                msg=f"{case['id']}: opencode must not require {forbidden}",
            )

    def _inv_provider_lifecycle(self, case: dict[str, Any], inv: dict[str, Any]) -> None:
        provider = self.providers[inv["provider_key"]]
        events = provider["lifecycle_events"]
        for name, expected in inv["events"].items():
            self.assertEqual(
                events[name],
                expected,
                msg=f"{case['id']}: lifecycle_events.{name}",
            )

    def _inv_provider_signals(self, case: dict[str, Any], inv: dict[str, Any]) -> None:
        provider = self.providers[inv["provider_key"]]
        signals = provider["signals"]
        if "env_prefixes" in inv:
            self.assertEqual(signals["env_prefixes"], inv["env_prefixes"])
        if "plugin_root_env" in inv:
            self.assertEqual(signals["plugin_root_env"], inv["plugin_root_env"])

    def _inv_provider_degraded_contains(
        self, case: dict[str, Any], inv: dict[str, Any]
    ) -> None:
        policy = self.providers[inv["provider_key"]]["degraded_policy"]
        for op_name, needles in inv["ops"].items():
            text = policy[op_name]
            for needle in needles:
                self.assertIn(
                    needle,
                    text,
                    msg=f"{case['id']}: degraded_policy.{op_name} missing {needle!r}",
                )

    def _inv_file_contains(self, case: dict[str, Any], inv: dict[str, Any]) -> None:
        text = _read(inv["path"])
        for needle in inv.get("all_of", []):
            self.assertIn(
                needle,
                text,
                msg=f"{case['id']}: {inv['path']} missing {needle!r}",
            )
        for needle in inv.get("none_of", []):
            self.assertNotIn(
                needle,
                text,
                msg=f"{case['id']}: {inv['path']} unexpectedly contains {needle!r}",
            )

    def _inv_skill_allowed_tools(self, case: dict[str, Any], inv: dict[str, Any]) -> None:
        tools = _allowed_tools(_read(inv["path"]))
        for required in inv["must_include"]:
            self.assertIn(
                required,
                tools,
                msg=f"{case['id']}: {inv['path']} allowed-tools missing {required}",
            )

    def _inv_hooks_json_events(self, case: dict[str, Any], inv: dict[str, Any]) -> None:
        data = json.loads(_read(inv["path"]))
        hooks = data.get("hooks", {})
        for event in inv["required_events"]:
            self.assertIn(event, hooks, msg=f"{case['id']}: missing hook event {event}")
            self.assertTrue(hooks[event], msg=f"{case['id']}: empty hook list for {event}")

    def _inv_hooks_json_commands(self, case: dict[str, Any], inv: dict[str, Any]) -> None:
        raw = _read(inv["path"])
        for needle in inv["must_mention"]:
            self.assertIn(needle, raw, msg=f"{case['id']}: hooks.json missing {needle!r}")

    def _inv_session_start_runtime(self, case: dict[str, Any], inv: dict[str, Any]) -> None:
        payload = _run_session_start(inv["provider_env"])
        self.assertEqual(payload.get("type"), inv["expect_json_type"])
        content = payload.get("content", "")
        self.assertIsInstance(content, str)
        self.assertTrue(content, msg=f"{case['id']}: empty session-start content")
        for needle in inv.get("expect_content_substrings", []):
            self.assertIn(
                needle,
                content,
                msg=f"{case['id']}: session-start content missing {needle!r}",
            )
        for needle in inv.get("forbid_content_substrings", []):
            self.assertNotIn(
                needle,
                content,
                msg=f"{case['id']}: session-start content has {needle!r}",
            )

    def _inv_agent_roster(self, case: dict[str, Any], inv: dict[str, Any]) -> None:
        found = _agent_names(inv["agents_dir"])
        self.assertEqual(
            found,
            inv["expected_names"],
            msg=f"{case['id']}: agent roster drift",
        )
        # Each file exists and frontmatter name matches filename stem.
        for name in inv["expected_names"]:
            path = _repo_path(f"{inv['agents_dir']}/{name}.md")
            self.assertTrue(path.is_file(), msg=f"missing agent file {path.name}")
            meta = _frontmatter(path.read_text(encoding="utf-8"))
            self.assertEqual(meta.get("name"), name)

    def _inv_features_specialists_match_agents(
        self, case: dict[str, Any], inv: dict[str, Any]
    ) -> None:
        from_features = set(_features_specialist_names(inv["features_path"]))
        from_agents = set(_agent_names(inv["agents_dir"]))
        self.assertEqual(
            from_features,
            from_agents,
            msg=f"{case['id']}: features.json specialists vs agents/ mismatch",
        )

    def _inv_agent_frontmatter(self, case: dict[str, Any], inv: dict[str, Any]) -> None:
        text = _read(inv["path"])
        meta = _frontmatter(text)
        self.assertEqual(meta.get("name"), inv["name"])
        tools_raw = meta.get("tools", "")
        for tool in inv.get("tools_must_include", []):
            self.assertIn(tool, tools_raw, msg=f"{case['id']}: {inv['path']} tools")

    def _inv_features_skill(self, case: dict[str, Any], inv: dict[str, Any]) -> None:
        data = json.loads(_read(inv["features_path"]))
        skill = next(s for s in data["skills"] if s["name"] == inv["name"])
        self.assertEqual(skill["command"], inv["command"])
        purpose = skill.get("purpose", "")
        for needle in inv.get("purpose_contains", []):
            self.assertIn(needle, purpose, msg=f"{case['id']}: purpose missing {needle!r}")

    def _inv_features_skill_commands(
        self, case: dict[str, Any], inv: dict[str, Any]
    ) -> None:
        data = json.loads(_read(inv["features_path"]))
        by_name = {s["name"]: s["command"] for s in data["skills"]}
        for name, command in inv["commands"].items():
            self.assertEqual(
                by_name.get(name),
                command,
                msg=f"{case['id']}: features skill command for {name}",
            )

    def _inv_features_providers(self, case: dict[str, Any], inv: dict[str, Any]) -> None:
        data = json.loads(_read(inv["features_path"]))
        keys = {p["key"] for p in data["providers"]}
        for key in inv["required_keys"]:
            self.assertIn(key, keys, msg=f"{case['id']}: features providers missing {key}")

    def _inv_portable_router_aliases(
        self, case: dict[str, Any], inv: dict[str, Any]
    ) -> None:
        aliases = _portable_router_aliases(_read(inv["path"]))
        for alias, target in inv["aliases"].items():
            self.assertEqual(
                aliases.get(alias),
                target,
                msg=f"{case['id']}: portable router {alias} → {target}",
            )

    def _inv_skill_dirs(self, case: dict[str, Any], inv: dict[str, Any]) -> None:
        directory = _repo_path(inv["skills_dir"])
        found = sorted(
            p.name
            for p in directory.iterdir()
            if p.is_dir() and (p / "SKILL.md").is_file()
        )
        self.assertEqual(found, inv["expected"], msg=f"{case['id']}: skill inventory drift")

    def _inv_question_block_markers(
        self, case: dict[str, Any], inv: dict[str, Any]
    ) -> None:
        text = _read(inv["path"])
        for line in inv["required_lines"]:
            self.assertIn(line, text, msg=f"{case['id']}: missing question marker {line!r}")

    def _inv_security_scan_self(self, case: dict[str, Any], inv: dict[str, Any]) -> None:
        # Denylist may be declared in the fixture for documentation; the canonical
        # scanner uses the Python constant so listing the tokens does not self-match.
        data = _load_fixture()
        hits = _scan_fixture_for_secrets(data)
        declared = list(inv.get("forbidden_substrings") or _SECURITY_FORBIDDEN)
        # Declared list must cover the same security surface as the engine.
        for token in _SECURITY_FORBIDDEN:
            self.assertIn(
                token,
                declared,
                msg=f"{case['id']}: fixture denylist missing engine token {token!r}",
            )
        if hits:
            self.fail(f"SECURITY_VIOLATION: fixture contains forbidden token(s) {hits}")


class SemanticStabilityTests(unittest.TestCase):
    """Extra non-whitespace semantic anchors that should not regress silently."""

    def test_claude_and_opencode_spawn_remain_distinct(self) -> None:
        providers = _providers_by_key()
        self.assertEqual(providers["claude-code"]["operations"]["spawn"], ["Agent"])
        self.assertEqual(
            providers["opencode"]["operations"]["spawn"],
            ["Task", "task", "subagent"],
        )
        # OpenCode must not list Claude or Codex spawn names.
        for name in ("Agent", "collaboration.spawn_agent", "multi_agent_v1.spawn_agent"):
            self.assertNotIn(name, providers["opencode"]["operations"]["spawn"])

    def test_plan_never_auto_implements_is_documented(self) -> None:
        plan = _read("skills/plan/SKILL.md")
        self.assertIn("Plan never implements", plan)
        self.assertIn("build-location gate", plan)
        self.assertRegex(plan, r"Skill.*skill:\s*dispatch|skill:\s*dispatch")

    def test_opencode_workflow_is_portable_not_native(self) -> None:
        workflow = _read("skills/workflow/SKILL.md")
        self.assertIn("### OpenCode Portable Workflow Adapter", workflow)
        self.assertIn("### Claude Code Native Workflow", workflow)
        # Order: Claude native section appears before OpenCode portable.
        self.assertLess(
            workflow.index("### Claude Code Native Workflow"),
            workflow.index("### OpenCode Portable Workflow Adapter"),
        )

    def test_hooks_register_only_supported_lifecycle_for_claude(self) -> None:
        hooks = json.loads(_read("hooks/hooks.json"))
        self.assertIn("SessionStart", hooks["hooks"])
        self.assertIn("PreCompact", hooks["hooks"])
        # OpenCode has no lifecycle events in the registry today.
        providers = _providers_by_key()
        for event, values in providers["opencode"]["lifecycle_events"].items():
            self.assertEqual(values, [], msg=event)


if __name__ == "__main__":
    unittest.main()
