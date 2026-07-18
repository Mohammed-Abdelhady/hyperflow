"""Fixture tests for normalized hook lifecycle + provider encodings (T5).

Covers:
  1. Codex nested project + CODEX_PLUGIN_ROOT
  2. Malformed payload → non-fatal, no state corruption
  3. Auto compact without marker → blocked
  4. Stale marker → consumed safely, auto still blocked
  5. Offline update → no false update claim
  6. Integration: registered launcher from arbitrary cwd

No network. No credentials. Payload paths treated as untrusted.
"""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
REPO_ROOT = Path(__file__).resolve().parent.parent
RUNTIME_PATH = REPO_ROOT / "scripts" / "hook-runtime.py"
SESSION_START = REPO_ROOT / "hooks" / "session-start"
PRE_COMPACT = REPO_ROOT / "hooks" / "pre-compact"
HOOKS_JSON = REPO_ROOT / "hooks" / "hooks.json"
VERSION = (REPO_ROOT / "skills" / "hyperflow" / "VERSION").read_text(
    encoding="utf-8"
).strip()


def _load_runtime():
    spec = importlib.util.spec_from_file_location("hook_runtime", RUNTIME_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    # Required for @dataclass on Python 3.9 when loading by path.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


hr = _load_runtime()


def _clean_env(**extra: str) -> dict[str, str]:
    blocked = ("CODEX", "CLAUDE", "OPENCODE", "GROK", "ANTIGRAVITY", "CURSOR")
    env: dict[str, str] = {}
    for key, value in os.environ.items():
        if any(key == p or key.startswith(p + "_") for p in blocked):
            continue
        env[key] = value
    env["HYPERFLOW_HOOK_OFFLINE"] = "1"
    env.update(extra)
    return env


def _scaffold_project(root: Path) -> tuple[Path, Path]:
    project = root / "project"
    nested = project / "apps" / "web"
    nested.mkdir(parents=True)
    hf = project / ".hyperflow"
    memory = hf / "memory"
    memory.mkdir(parents=True)
    tasks = hf / "tasks"
    tasks.mkdir()
    (tasks / "demo-task.md").write_text("# Task\n", encoding="utf-8")
    for name in ("profile.md", "architecture.md", "conventions.md"):
        (hf / name).write_text(f"# {name}\nbody\n", encoding="utf-8")
    (hf / ".bridge-mode").write_text("off\n", encoding="utf-8")
    (hf / ".version").write_text(VERSION + "\n", encoding="utf-8")
    return project, nested


class EncoderUnitTests(unittest.TestCase):
    """Codex / Claude encoders are independently fixture-tested."""

    def test_claude_session_encoder(self) -> None:
        hr.reject_undocumented_encoding("claude-session-start")
        out = hr.encode_claude_session_start("hello")
        self.assertEqual(out["type"], "system-prompt-inject")
        self.assertEqual(out["content"], "hello")
        self.assertNotIn("hookSpecificOutput", out)

    def test_codex_session_encoder(self) -> None:
        hr.reject_undocumented_encoding("codex-session-start")
        out = hr.encode_codex_session_start("hello")
        self.assertEqual(
            out["hookSpecificOutput"]["hookEventName"], "SessionStart"
        )
        self.assertEqual(out["hookSpecificOutput"]["additionalContext"], "hello")
        # Dual key for backward-compat host/tests
        self.assertEqual(out["content"], "hello")

    def test_claude_precompact_block(self) -> None:
        hr.reject_undocumented_encoding("claude-precompact-block")
        out = hr.encode_claude_precompact_block("nope")
        self.assertEqual(out, {"decision": "block", "reason": "nope"})

    def test_codex_precompact_block(self) -> None:
        hr.reject_undocumented_encoding("codex-precompact-block")
        out = hr.encode_codex_precompact_block("nope")
        self.assertIs(out["continue"], False)
        self.assertEqual(out["stopReason"], "nope")
        self.assertEqual(out["decision"], "block")

    def test_undocumented_encoding_rejected(self) -> None:
        with self.assertRaises(ValueError):
            hr.reject_undocumented_encoding("mystery-format")


class EventNormalizationTests(unittest.TestCase):
    def test_session_sources(self) -> None:
        cases = {
            "startup": "session.start",
            "resume": "session.start",
            "clear": "session.after_clear",
            "compact": "session.after_compact",
        }
        for source, expected in cases.items():
            payload = hr.HookPayload(source=source, trigger=source)
            self.assertEqual(
                hr.normalize_event("SessionStart", payload),
                expected,
                msg=source,
            )

    def test_precompact(self) -> None:
        payload = hr.HookPayload(trigger="auto")
        self.assertEqual(
            hr.normalize_event("PreCompact", payload),
            "session.before_compact",
        )

    def test_unsupported_host_event(self) -> None:
        payload = hr.HookPayload()
        self.assertEqual(hr.normalize_event("Stop", payload), "")


class UpdateSelectionTests(unittest.TestCase):
    def test_marketplace_codex_command(self) -> None:
        cmd = hr.select_update_command(
            "codex-marketplace", "/tmp/plugin", provider="codex"
        )
        self.assertEqual(cmd, "codex plugin marketplace upgrade hyperflow-marketplace")
        self.assertNotIn("git pull", cmd or "")

    def test_marketplace_claude_command(self) -> None:
        cmd = hr.select_update_command(
            "claude-marketplace", "/tmp/plugin", provider="claude-code"
        )
        self.assertEqual(cmd, "claude plugin update hyperflow@hyperflow-marketplace")

    def test_source_checkout_git_pull(self) -> None:
        cmd = hr.select_update_command(
            "source-checkout", "/repo/hyperflow", provider="codex"
        )
        self.assertIn("git", cmd or "")
        self.assertIn("pull --ff-only", cmd or "")
        self.assertIn("/repo/hyperflow", cmd or "")

    def test_unknown_no_guess(self) -> None:
        self.assertIsNone(
            hr.select_update_command("unknown", "/somewhere", provider="codex")
        )


class CompactLogicTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.ready = self.root / ".dispatch-auto-compact-ready"
        self.home = self.root / "home"
        (self.home / ".hyperflow").mkdir(parents=True)

    def test_auto_without_marker_blocks(self) -> None:
        decision = hr.evaluate_auto_compact(
            "auto", None, self.ready, self.home, now=time.time()
        )
        assert decision is not None
        self.assertEqual(decision.action, "block")
        self.assertFalse(decision.consume_marker)
        self.assertIn("end-of-chain", decision.reason)

    def test_stale_marker_consumed_and_blocked(self) -> None:
        self.ready.write_text("ready\n", encoding="utf-8")
        stale_mtime = time.time() - (31 * 60)
        os.utime(self.ready, (stale_mtime, stale_mtime))
        decision = hr.evaluate_auto_compact(
            "auto",
            None,
            self.ready,
            self.home,
            now=time.time(),
        )
        assert decision is not None
        self.assertEqual(decision.action, "block")
        self.assertTrue(decision.consume_marker)
        self.assertIn("older than", decision.reason)

        # Integration path consumes via handle_pre_compact
        project, _ = _scaffold_project(self.root / "proj")
        hf = project / ".hyperflow"
        ready = hf / ".dispatch-auto-compact-ready"
        ready.write_text("x\n", encoding="utf-8")
        os.utime(ready, (stale_mtime, stale_mtime))
        env = _clean_env(
            HOME=str(self.home),
            CODEX_PLUGIN_ROOT=str(REPO_ROOT),
            CODEX_SESSION_ID="test",
        )
        payload = hr.HookPayload(
            cwd=str(project),
            trigger="auto",
            transcript_path="",
        )
        out = hr.handle_pre_compact(
            payload,
            plugin_root=REPO_ROOT,
            cwd=project,
            environ=env,
            now=time.time(),
        )
        self.assertIsNotNone(out)
        assert out is not None
        self.assertEqual(out.get("decision"), "block")
        self.assertFalse(ready.exists())

    def test_manual_always_allows(self) -> None:
        decision = hr.evaluate_auto_compact(
            "manual", None, self.ready, self.home, now=time.time()
        )
        self.assertIsNone(decision)


class OfflineUpdateTests(unittest.TestCase):
    def test_offline_stale_cache_no_false_claim(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp) / "home"
            cache_dir = home / ".hyperflow"
            cache_dir.mkdir(parents=True)
            cache = cache_dir / ".update-check"
            cache.write_text("999.0.0", encoding="utf-8")
            # Age the cache past 24h
            old = time.time() - (25 * 60 * 60)
            os.utime(cache, (old, old))
            notice = hr.check_update_notice(
                VERSION,
                home,
                REPO_ROOT,
                "source-checkout",
                "codex",
                now=time.time(),
                allow_network=False,
            )
            self.assertEqual(notice, "")
            self.assertNotIn("update available", notice.lower())

    def test_fresh_cache_newer_version_surfaces(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp) / "home"
            cache_dir = home / ".hyperflow"
            cache_dir.mkdir(parents=True)
            (cache_dir / ".update-check").write_text("999.0.0", encoding="utf-8")
            notice = hr.check_update_notice(
                VERSION,
                home,
                REPO_ROOT,
                "codex-marketplace",
                "codex",
                now=time.time(),
                allow_network=False,
            )
            self.assertIn("999.0.0", notice)
            self.assertIn(
                "codex plugin marketplace upgrade hyperflow-marketplace", notice
            )


class NestedCwdAndMalformedTests(unittest.TestCase):
    def test_codex_nested_project_resolves_and_encodes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            project, nested = _scaffold_project(root)
            # Full mode so Codex alias table + project snapshot are injected.
            (project / ".hyperflow" / ".mode").write_text("default\n", encoding="utf-8")
            home = root / "home"
            (home / ".hyperflow").mkdir(parents=True)
            (home / ".hyperflow" / ".update-check").write_text(
                VERSION, encoding="utf-8"
            )
            env = _clean_env(
                HOME=str(home),
                CODEX_PLUGIN_ROOT=str(REPO_ROOT),
                CODEX_SESSION_ID="nested-test",
            )
            payload = hr.HookPayload(
                cwd=str(nested),
                source="startup",
                hook_event_name="SessionStart",
            )
            out = hr.handle_session_start(
                payload,
                plugin_root=REPO_ROOT,
                cwd=nested,
                environ=env,
            )
            self.assertIn("hookSpecificOutput", out)
            content = out["hookSpecificOutput"]["additionalContext"]
            self.assertIn("hyperflow-runtime: codex", content)
            self.assertIn("Codex function aliases", content)
            self.assertIn("/hyperflow:plan", content)
            self.assertIn("## Project Snapshot", content)
            # Dual content key
            self.assertEqual(out["content"], content)
            # Nested cwd still found project .hyperflow
            self.assertIn(".hyperflow", content)
            # Session context written under project, not nested apps/web
            self.assertTrue((project / ".hyperflow" / "memory" / "session-context.md").is_file())
            self.assertFalse((nested / ".hyperflow").exists())

    def test_malformed_payload_nonfatal_no_corruption(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            project, _ = _scaffold_project(root)
            hf = project / ".hyperflow"
            sentinel = hf / "profile.md"
            before = sentinel.read_text(encoding="utf-8")
            # No ready marker / no precompact
            self.assertFalse((hf / ".precompact.md").exists())

            env = _clean_env(
                HOME=str(root / "home"),
                CODEX_PLUGIN_ROOT=str(REPO_ROOT),
            )
            (root / "home" / ".hyperflow").mkdir(parents=True)

            payload = hr.parse_payload("{not-json")
            self.assertTrue(payload.malformed)

            # CLI path: malformed stdin must exit 0
            result = subprocess.run(
                [
                    sys.executable,
                    str(RUNTIME_PATH),
                    "pre-compact",
                    "--plugin-root",
                    str(REPO_ROOT),
                    "--cwd",
                    str(project),
                ],
                input="{not-json!!!",
                capture_output=True,
                text=True,
                env=env,
                check=False,
            )
            self.assertEqual(result.returncode, 0)
            # profile untouched; no spurious precompact from malformed session
            self.assertEqual(sentinel.read_text(encoding="utf-8"), before)

            # session-start malformed also non-fatal and emits valid JSON
            result2 = subprocess.run(
                [
                    sys.executable,
                    str(RUNTIME_PATH),
                    "session-start",
                    "--plugin-root",
                    str(REPO_ROOT),
                    "--cwd",
                    str(project),
                ],
                input="[[[",
                capture_output=True,
                text=True,
                env=env,
                check=False,
            )
            self.assertEqual(result2.returncode, 0)
            data = json.loads(result2.stdout)
            self.assertIn("content", data)


class IntegrationLauncherTests(unittest.TestCase):
    def test_hooks_json_valid_and_resolvable(self) -> None:
        data = json.loads(HOOKS_JSON.read_text(encoding="utf-8"))
        self.assertIn("SessionStart", data["hooks"])
        self.assertIn("PreCompact", data["hooks"])
        for event in ("SessionStart", "PreCompact"):
            cmd = data["hooks"][event][0]["hooks"][0]["command"]
            self.assertIn("session-start" if event == "SessionStart" else "pre-compact", cmd)
            self.assertIn("CODEX_PLUGIN_ROOT", cmd)
            self.assertIn("CLAUDE_PLUGIN_ROOT", cmd)

    def test_session_start_launcher_from_unrelated_cwd(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            project, _ = _scaffold_project(root)
            home = root / "home"
            (home / ".hyperflow").mkdir(parents=True)
            (home / ".hyperflow" / ".update-check").write_text(
                VERSION, encoding="utf-8"
            )
            unrelated = root / "elsewhere"
            unrelated.mkdir()
            env = _clean_env(
                HOME=str(home),
                CODEX_PLUGIN_ROOT=str(REPO_ROOT),
                CODEX_SESSION_ID="launcher",
            )
            # Run hook with cwd=project (host contract) but prove PLUGIN_ROOT resolves
            # from env even if process was started far from the plugin tree.
            result = subprocess.run(
                [str(SESSION_START)],
                cwd=str(project),
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            payload = json.loads(result.stdout)
            content = payload["content"]
            self.assertIn("hyperflow-runtime: codex", content)
            self.assertIn("hookSpecificOutput", payload)
            self.assertEqual(
                payload["hookSpecificOutput"]["additionalContext"], content
            )

    def test_pre_compact_launcher_blocks_auto_without_marker(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            project, _ = _scaffold_project(root)
            home = root / "home"
            (home / ".hyperflow").mkdir(parents=True)
            env = _clean_env(
                HOME=str(home),
                CODEX_PLUGIN_ROOT=str(REPO_ROOT),
                CODEX_SESSION_ID="pc",
            )
            body = json.dumps(
                {
                    "cwd": str(project),
                    "trigger": "auto",
                    "transcript_path": str(root / "missing.jsonl"),
                    "hook_event_name": "PreCompact",
                }
            )
            result = subprocess.run(
                [str(PRE_COMPACT)],
                cwd=str(project),
                env=env,
                input=body,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            data = json.loads(result.stdout)
            self.assertEqual(data.get("decision"), "block")
            self.assertIs(data.get("continue"), False)
            # Snapshot written for recovery if a later compact proceeds
            self.assertTrue((project / ".hyperflow" / ".precompact.md").is_file())

    def test_find_hyperflow_nested_and_unrelated(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            project, nested = _scaffold_project(root)
            found = hr.find_hyperflow_dir(nested)
            self.assertIsNotNone(found)
            assert found is not None
            self.assertEqual(found.resolve(), (project / ".hyperflow").resolve())
            elsewhere = root / "nope" / "here"
            elsewhere.mkdir(parents=True)
            self.assertIsNone(hr.find_hyperflow_dir(elsewhere))


class PathContainmentTests(unittest.TestCase):
    def test_safe_project_state_rejects_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            hf = Path(tmp) / ".hyperflow"
            hf.mkdir()
            self.assertIsNone(hr.safe_project_state_path(hf, "../etc/passwd"))
            self.assertIsNone(hr.safe_project_state_path(hf, "/etc/passwd"))
            ok = hr.safe_project_state_path(hf, ".precompact.md")
            self.assertIsNotNone(ok)
            assert ok is not None
            self.assertEqual(ok.name, ".precompact.md")


if __name__ == "__main__":
    unittest.main()
