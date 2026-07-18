"""Tests for the provider capability registry and detect-provider runtime."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from typing import Any
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = REPO_ROOT / "scripts" / "detect-provider.py"
PROVIDERS_PATH = REPO_ROOT / "config" / "providers.json"
SCHEMA_PATH = REPO_ROOT / "config" / "providers.schema.json"


def _load_module():
    spec = importlib.util.spec_from_file_location("detect_provider", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


dp = _load_module()


def _clean_env(**extra: str) -> dict[str, str]:
    """Build an env dict free of host provider signals for hermetic tests."""
    blocked_prefixes = (
        "CODEX",
        "CLAUDE",
        "OPENCODE",
        "GROK",
        "ANTIGRAVITY",
        "CURSOR",
    )
    env: dict[str, str] = {}
    for key, value in os.environ.items():
        if any(key == p or key.startswith(p + "_") for p in blocked_prefixes):
            continue
        # Keep PATH and similar so Path operations remain normal.
        env[key] = value
    env.update(extra)
    return env


class SchemaAndFixtureTests(unittest.TestCase):
    """Scenario 6 — registry + schema fixtures validate."""

    def test_checked_in_registry_validates_against_schema(self) -> None:
        data = json.loads(PROVIDERS_PATH.read_text(encoding="utf-8"))
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        errors: list[str] = []
        dp.validate_against_schema(data, schema, "", errors)
        self.assertEqual(errors, [], msg=f"schema errors: {errors}")

    def test_schema_uses_only_allowed_keywords(self) -> None:
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        allowed = dp.SCHEMA_KEYWORDS_ENFORCED | dp.SCHEMA_KEYWORDS_ANNOTATION

        def walk(node: Any, path: str) -> list[str]:
            found: list[str] = []
            if isinstance(node, dict):
                for key, value in node.items():
                    if key.startswith("$") and key not in allowed:
                        # Only $schema/$id/$comment are annotation keywords.
                        if key not in allowed:
                            found.append(f"{path}: unexpected keyword {key}")
                    elif not key.startswith("$") and key not in allowed and key not in (
                        # property names under "properties" are data keys, not schema keywords
                    ):
                        # Schema keywords appear as keys of schema objects.
                        # Distinguish: if parent context is a schema object.
                        pass
                    child = f"{path}.{key}" if path else key
                    # When this dict is a schema (has type/properties/etc), flag unknown keys.
                    if any(k in node for k in ("type", "properties", "items", "required")):
                        bad = sorted(set(node) - allowed)
                        if bad:
                            found.append(f"{path or '<root>'}: unsupported {bad}")
                            return found
                    found.extend(walk(value, child))
            elif isinstance(node, list):
                for i, item in enumerate(node):
                    found.extend(walk(item, f"{path}[{i}]"))
            return found

        errors = walk(schema, "")
        # Deduplicate because nested walks re-check parents.
        uniq = sorted(set(errors))
        self.assertEqual(uniq, [], msg=f"keyword errors: {uniq}")

    def test_registry_covers_required_operations_and_providers(self) -> None:
        data = json.loads(PROVIDERS_PATH.read_text(encoding="utf-8"))
        required_ops = {
            "spawn",
            "wait",
            "message",
            "follow_up",
            "interrupt",
            "list",
            "structured_question",
            "skill_continuation",
            "edit",
            "shell",
            "web_research",
            "background",
            "usage_metrics",
        }
        self.assertEqual(set(data["canonical_operations"]), required_ops)
        keys = {p["key"] for p in data["providers"]}
        for expected in (
            "codex",
            "claude-code",
            "opencode",
            "grok",
            "antigravity",
            "cursor",
        ):
            self.assertIn(expected, keys)

    def test_codex_lists_collaboration_lifecycle_first(self) -> None:
        data = json.loads(PROVIDERS_PATH.read_text(encoding="utf-8"))
        codex = next(p for p in data["providers"] if p["key"] == "codex")
        self.assertEqual(
            codex["operations"]["spawn"][0], "collaboration.spawn_agent"
        )
        self.assertIn("multi_agent_v1.spawn_agent", codex["operations"]["spawn"])
        # Current session surface (may appear with or without collaboration. prefix).
        for tool in (
            "collaboration.spawn_agent",
            "send_message",
            "followup_task",
            "interrupt_agent",
            "list_agents",
            "wait_agent",
        ):
            found = any(
                tool == c or c.endswith(tool) or tool in c
                for op_candidates in codex["operations"].values()
                for c in op_candidates
            )
            self.assertTrue(found, msg=f"missing codex candidate related to {tool}")

    def test_load_registry_from_repo(self) -> None:
        registry, errors = dp.load_registry(REPO_ROOT)
        self.assertEqual(errors, [])
        self.assertEqual(registry.get("schema_version"), 1)


class CodexCapabilityTests(unittest.TestCase):
    """Scenarios 1, 2, 5 — inventory intersection for Codex."""

    def setUp(self) -> None:
        self.registry, errors = dp.load_registry(REPO_ROOT)
        self.assertEqual(errors, [])
        self.codex = dp.providers_by_key(self.registry)["codex"]
        self.canonical = list(self.registry["canonical_operations"])

    def test_current_codex_tools_select_collaboration_ops(self) -> None:
        """Scenario 1 — current collaboration tools are selected exactly."""
        inventory = [
            "collaboration.spawn_agent",
            "send_message",
            "followup_task",
            "interrupt_agent",
            "list_agents",
            "wait_agent",
            "apply_patch",
            "shell",
            "web_search",
            "unrelated_future_tool_xyz",  # scenario 5 also covered here
        ]
        effective = dp.resolve_operations(self.codex, inventory, self.canonical)
        self.assertTrue(effective["spawn"]["available"])
        self.assertEqual(
            effective["spawn"]["selected"], "collaboration.spawn_agent"
        )
        self.assertEqual(effective["message"]["selected"], "send_message")
        self.assertEqual(effective["follow_up"]["selected"], "followup_task")
        self.assertEqual(effective["interrupt"]["selected"], "interrupt_agent")
        self.assertEqual(effective["list"]["selected"], "list_agents")
        self.assertEqual(effective["wait"]["selected"], "wait_agent")
        self.assertTrue(effective["edit"]["available"])
        self.assertEqual(effective["edit"]["selected"], "apply_patch")
        # Unknown inventory entry must not appear as selected for any op.
        for op, meta in effective.items():
            self.assertNotEqual(meta["selected"], "unrelated_future_tool_xyz")

    def test_codex_without_subagents_marks_spawn_unavailable(self) -> None:
        """Scenario 2 — no collaboration tools → spawn unavailable, inline required."""
        inventory = ["apply_patch", "shell", "web_search"]
        effective = dp.resolve_operations(self.codex, inventory, self.canonical)
        self.assertFalse(effective["spawn"]["available"])
        self.assertIsNone(effective["spawn"]["selected"])
        self.assertFalse(effective["wait"]["available"])
        self.assertFalse(effective["message"]["available"])
        self.assertTrue(effective["edit"]["available"])
        policy = self.codex["degraded_policy"]["spawn"]
        self.assertIn("inline", policy.lower())

    def test_empty_inventory_does_not_claim_available(self) -> None:
        effective = dp.resolve_operations(self.codex, None, self.canonical)
        for op, meta in effective.items():
            self.assertIsNone(meta["available"], msg=op)
            self.assertIsNone(meta["selected"], msg=op)
            self.assertIsInstance(meta["candidates"], list)

    def test_unknown_future_tool_ignored(self) -> None:
        """Scenario 5 — unrecognized inventory entry is ignored safely."""
        inventory = [
            "collaboration.spawn_agent",
            "totally_unknown_host_tool_99",
        ]
        effective = dp.resolve_operations(self.codex, inventory, self.canonical)
        self.assertEqual(
            effective["spawn"]["selected"], "collaboration.spawn_agent"
        )
        selected_values = {
            meta["selected"] for meta in effective.values() if meta["selected"]
        }
        self.assertNotIn("totally_unknown_host_tool_99", selected_values)


class DetectionPrecedenceTests(unittest.TestCase):
    """Scenario 3 — mixed env signals with deterministic precedence."""

    def setUp(self) -> None:
        self.registry, errors = dp.load_registry(REPO_ROOT)
        self.assertEqual(errors, [])

    def test_codex_plugin_root_wins_over_claude_when_both_set(self) -> None:
        env = _clean_env(
            CODEX_PLUGIN_ROOT="/tmp/hyperflow-codex-root",
            CLAUDE_PLUGIN_ROOT="/tmp/hyperflow-claude-root",
            CLAUDE_CODE_ENTRYPOINT="cli",
            CODEX_HOME="/tmp/codex-home",
        )
        detection = dp.detect_provider(self.registry, environ=env)
        self.assertEqual(detection["provider"], "codex")
        self.assertEqual(detection["detection_tier"], "plugin_root")
        self.assertIn("CODEX_PLUGIN_ROOT", detection["matched_signals"])

    def test_claude_plugin_root_alone_selects_claude(self) -> None:
        env = _clean_env(
            CLAUDE_PLUGIN_ROOT="/tmp/hyperflow-claude-root",
            CODEX_HOME="/tmp/codex-home",  # weaker than plugin root
        )
        detection = dp.detect_provider(self.registry, environ=env)
        self.assertEqual(detection["provider"], "claude-code")
        self.assertEqual(detection["detection_tier"], "plugin_root")

    def test_env_prefix_without_plugin_root(self) -> None:
        env = _clean_env(OPENCODE_CONFIG="/tmp/opencode.json")
        detection = dp.detect_provider(self.registry, environ=env)
        self.assertEqual(detection["provider"], "opencode")
        self.assertEqual(detection["detection_tier"], "env")

    def test_mixed_codex_and_claude_prefixes_without_roots_is_stable(self) -> None:
        # Longer / more specific CLAUDE_CODE prefix should not lose to CODEX
        # when only prefixes exist — first matching by specificity then registry
        # order. With only prefixes, longer CLAUDE_CODE and CODEX both fire;
        # longer prefix wins (CLAUDE_CODE len > CODEX).
        env = _clean_env(CLAUDE_CODE_ENTRYPOINT="cli", CODEX_SANDBOX="seatbelt")
        detection = dp.detect_provider(self.registry, environ=env)
        self.assertIn(detection["provider"], {"claude-code", "codex"})
        # Documented stability: longer prefix preferred.
        self.assertEqual(detection["provider"], "claude-code")


class InstallModeTests(unittest.TestCase):
    """Scenario 4 — marketplace cache with .git remains marketplace."""

    def test_codex_marketplace_with_git_is_still_marketplace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp) / "home"
            cache = (
                home
                / ".codex"
                / "plugins"
                / "cache"
                / "hyperflow-marketplace"
                / "hyperflow"
                / "5.14.0"
            )
            cache.mkdir(parents=True)
            (cache / ".git").mkdir()
            env = _clean_env(HOME=str(home))
            mode = dp.detect_install_mode(cache, environ=env)
            self.assertEqual(mode, "codex-marketplace")

    def test_claude_marketplace_with_git_is_still_marketplace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp) / "home"
            cache = (
                home
                / ".claude"
                / "plugins"
                / "cache"
                / "hyperflow-marketplace"
                / "hyperflow"
                / "5.14.0"
            )
            cache.mkdir(parents=True)
            (cache / ".git").mkdir()
            env = _clean_env(HOME=str(home))
            mode = dp.detect_install_mode(cache, environ=env)
            self.assertEqual(mode, "claude-marketplace")

    def test_source_checkout_outside_marketplace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "src" / "hyperflow"
            root.mkdir(parents=True)
            (root / ".git").mkdir()
            env = _clean_env(HOME=str(Path(tmp) / "home"))
            mode = dp.detect_install_mode(root, environ=env)
            self.assertEqual(mode, "source-checkout")

    def test_unknown_without_git_or_marketplace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "plain"
            root.mkdir()
            mode = dp.detect_install_mode(root, environ=_clean_env())
            self.assertEqual(mode, "unknown")

    def test_four_install_modes_are_distinct(self) -> None:
        modes = set()
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            home = base / "home"
            # codex marketplace
            codex_m = home / ".codex" / "plugins" / "cache" / "p" / "h" / "1"
            codex_m.mkdir(parents=True)
            modes.add(dp.detect_install_mode(codex_m, environ=_clean_env(HOME=str(home))))
            # claude marketplace
            claude_m = home / ".claude" / "plugins" / "cache" / "p" / "h" / "1"
            claude_m.mkdir(parents=True)
            modes.add(dp.detect_install_mode(claude_m, environ=_clean_env(HOME=str(home))))
            # source
            src = base / "checkout"
            src.mkdir()
            (src / ".git").mkdir()
            modes.add(dp.detect_install_mode(src, environ=_clean_env(HOME=str(home))))
            # unknown
            plain = base / "plain"
            plain.mkdir()
            modes.add(dp.detect_install_mode(plain, environ=_clean_env(HOME=str(home))))
        self.assertEqual(
            modes,
            {
                "codex-marketplace",
                "claude-marketplace",
                "source-checkout",
                "unknown",
            },
        )


class CliIntegrationTests(unittest.TestCase):
    """CLI wiring + full descriptor integration (scenario 6 remainder)."""

    def test_cli_json_default_with_tools(self) -> None:
        env = _clean_env(
            CODEX_PLUGIN_ROOT=str(REPO_ROOT),
            HOME=str(REPO_ROOT.parent),  # not under marketplace
        )
        tools = (
            "collaboration.spawn_agent,wait_agent,send_message,"
            "followup_task,interrupt_agent,list_agents,apply_patch,shell"
        )
        stdout = io.StringIO()
        stderr = io.StringIO()
        argv = [
            "--root",
            str(REPO_ROOT),
            "--tools",
            tools,
        ]
        with mock.patch.dict(os.environ, env, clear=True):
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(
                stderr
            ):
                code = dp.main(argv)
        self.assertEqual(code, 0, msg=stderr.getvalue())
        payload = json.loads(stdout.getvalue())
        self.assertEqual(payload["provider"], "codex")
        self.assertTrue(payload["inventory_provided"])
        self.assertEqual(
            payload["operations"]["spawn"]["selected"],
            "collaboration.spawn_agent",
        )
        self.assertTrue(payload["operations"]["spawn"]["available"])
        self.assertIn("candidates", payload)
        self.assertIn("signals", payload)
        self.assertIn("install_mode", payload)
        # Source checkout when repo root is a git work tree outside marketplace.
        self.assertIn(
            payload["install_mode"], ("source-checkout", "unknown")
        )

    def test_cli_marketplace_root_overrides_git(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp) / "home"
            cache = (
                home
                / ".codex"
                / "plugins"
                / "cache"
                / "hyperflow-marketplace"
                / "hyperflow"
                / "1.0.0"
            )
            cache.mkdir(parents=True)
            (cache / ".git").mkdir()
            # Minimal registry copy so --root can load config
            cfg = cache / "config"
            cfg.mkdir()
            cfg.joinpath("providers.json").write_text(
                PROVIDERS_PATH.read_text(encoding="utf-8"), encoding="utf-8"
            )
            cfg.joinpath("providers.schema.json").write_text(
                SCHEMA_PATH.read_text(encoding="utf-8"), encoding="utf-8"
            )
            env = _clean_env(
                HOME=str(home),
                CODEX_PLUGIN_ROOT=str(cache),
            )
            stdout = io.StringIO()
            stderr = io.StringIO()
            with mock.patch.dict(os.environ, env, clear=True):
                with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(
                    stderr
                ):
                    code = dp.main(["--root", str(cache), "--pretty"])
            self.assertEqual(code, 0, msg=stderr.getvalue())
            payload = json.loads(stdout.getvalue())
            self.assertEqual(payload["provider"], "codex")
            self.assertEqual(payload["install_mode"], "codex-marketplace")

    def test_cli_tools_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tools_path = Path(tmp) / "tools.json"
            tools_path.write_text(
                json.dumps(["Agent", "AskUserQuestion", "Skill", "Edit", "Bash"]),
                encoding="utf-8",
            )
            env = _clean_env(CLAUDE_PLUGIN_ROOT=str(REPO_ROOT))
            stdout = io.StringIO()
            stderr = io.StringIO()
            with mock.patch.dict(os.environ, env, clear=True):
                with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(
                    stderr
                ):
                    code = dp.main(
                        [
                            "--root",
                            str(REPO_ROOT),
                            "--tools-file",
                            str(tools_path),
                        ]
                    )
            self.assertEqual(code, 0, msg=stderr.getvalue())
            payload = json.loads(stdout.getvalue())
            self.assertEqual(payload["provider"], "claude-code")
            self.assertEqual(payload["operations"]["spawn"]["selected"], "Agent")
            self.assertEqual(
                payload["operations"]["structured_question"]["selected"],
                "AskUserQuestion",
            )
            self.assertEqual(
                payload["operations"]["skill_continuation"]["selected"], "Skill"
            )

    def test_cli_bad_tools_file_exits_nonzero(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "bad.json"
            bad.write_text('{"not":"array"}', encoding="utf-8")
            env = _clean_env()
            stdout = io.StringIO()
            stderr = io.StringIO()
            with mock.patch.dict(os.environ, env, clear=True):
                with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(
                    stderr
                ):
                    code = dp.main(["--tools-file", str(bad)])
            self.assertEqual(code, 2)
            self.assertIn("JSON array", stderr.getvalue())
    def test_descriptor_sorted_keys_deterministic(self) -> None:
        registry, _ = dp.load_registry(REPO_ROOT)
        env = _clean_env(CODEX_PLUGIN_ROOT="/tmp/plugin")
        a = dp.build_descriptor(
            registry,
            environ=env,
            root=Path("/tmp/plugin"),
            inventory=["collaboration.spawn_agent"],
        )
        b = dp.build_descriptor(
            registry,
            environ=env,
            root=Path("/tmp/plugin"),
            inventory=["collaboration.spawn_agent"],
        )
        self.assertEqual(
            json.dumps(a, sort_keys=True),
            json.dumps(b, sort_keys=True),
        )


if __name__ == "__main__":
    unittest.main()
