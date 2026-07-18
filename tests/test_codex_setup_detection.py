"""Tests for Codex-safe AGENTS setup, managed-block preservation, and installer lifecycle.

Covers:
  * setup-detection.sh managed AGENTS.md create / append / refresh / force / dry-run
  * byte preservation of user content outside the managed Hyperflow block
  * codex-only tooling never mutates CLAUDE.md
  * auto-bridge.py provider-aware AGENTS.md / CLAUDE.md targets (one algorithm)
  * install.sh Codex lifecycle outcomes without touching real ~/.codex

All fixtures use temporary directories only.
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import os
import stat
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SETUP_SCRIPT = REPO_ROOT / "scripts" / "setup-detection.sh"
AUTO_BRIDGE = REPO_ROOT / "scripts" / "auto-bridge.py"
INSTALL_SCRIPT = REPO_ROOT / "install.sh"
VERSION = (REPO_ROOT / "skills" / "hyperflow" / "VERSION").read_text(
    encoding="utf-8"
).strip()

USER_PREFIX = "# Project rules\n\n- always use 2-space indent\n- never invent APIs\n"
USER_SUFFIX = "\n## Local notes\n\nkeep this trailing user content\n"
SHIM_START = "hyperflow-shim-start"
SHIM_END = "hyperflow-shim-end"
DOCTRINE_END = "<!-- hyperflow:doctrine:end -->"


def _load_auto_bridge():
    spec = importlib.util.spec_from_file_location("auto_bridge_t6", AUTO_BRIDGE)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


auto_bridge = _load_auto_bridge()


def _run_setup(
    project: Path,
    *args: str,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    cmd = ["bash", str(SETUP_SCRIPT), *args, str(project)]
    merged = os.environ.copy()
    if env:
        merged.update(env)
    return subprocess.run(
        cmd,
        check=False,
        capture_output=True,
        text=True,
        env=merged,
    )


def _extract_user_bytes_outside_shim(content: str) -> str:
    """Return content with the managed shim block removed (markers inclusive)."""
    lines = content.splitlines(keepends=True)
    out: list[str] = []
    skip = False
    for line in lines:
        if SHIM_START in line:
            skip = True
            continue
        if skip and SHIM_END in line:
            skip = False
            continue
        if not skip:
            out.append(line)
    return "".join(out)


class AgentsManagedBlockTests(unittest.TestCase):
    """setup-detection.sh AGENTS.md managed-block behavior."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.project = Path(self._tmp.name)
        self.agents = self.project / "AGENTS.md"
        self.claude = self.project / "CLAUDE.md"

    def test_existing_user_agents_appends_one_block_preserving_bytes(self) -> None:
        """Scenario 1: custom rules without Hyperflow block → append; preserve bytes."""
        self.agents.write_text(USER_PREFIX, encoding="utf-8")
        before = self.agents.read_bytes()
        result = _run_setup(self.project, "--tools", "codex")
        self.assertEqual(result.returncode, 0, msg=result.stderr + result.stdout)
        after = self.agents.read_text(encoding="utf-8")
        self.assertTrue(after.startswith(USER_PREFIX))
        self.assertEqual(after.count(SHIM_START), 1)
        self.assertEqual(after.count(SHIM_END), 1)
        self.assertIn("current session model", after)
        # Original user bytes are a prefix of the new file (append path).
        self.assertTrue(self.agents.read_bytes().startswith(before))

    def test_stale_block_refresh_replaces_only_block(self) -> None:
        """Scenario 2: old version between markers → replace block; no duplicate."""
        stale = (
            f"{USER_PREFIX}\n"
            f"<!-- {SHIM_START} v0.0.1 -->\n"
            "stale shim body\n"
            f"<!-- {SHIM_END} -->\n"
            f"{USER_SUFFIX}"
        )
        self.agents.write_text(stale, encoding="utf-8")
        result = _run_setup(self.project, "--tools", "codex", "--force")
        self.assertEqual(result.returncode, 0, msg=result.stderr + result.stdout)
        content = self.agents.read_text(encoding="utf-8")
        self.assertEqual(content.count(SHIM_START), 1)
        self.assertEqual(content.count(SHIM_END), 1)
        self.assertNotIn("stale shim body", content)
        self.assertIn(f"v{VERSION}", content)
        # User regions outside markers preserved.
        outside = _extract_user_bytes_outside_shim(content)
        self.assertIn("always use 2-space indent", outside)
        self.assertIn("keep this trailing user content", outside)

    def test_force_mode_preserves_user_content(self) -> None:
        """Scenario 3: force refreshes block without truncating file."""
        original_user = USER_PREFIX + "extra-user-line-xyz\n"
        body = (
            f"{original_user}\n"
            f"<!-- {SHIM_START} v1.0.0 -->\nold\n<!-- {SHIM_END} -->\n"
        )
        self.agents.write_text(body, encoding="utf-8")
        result = _run_setup(self.project, "--tools", "codex", "--force")
        self.assertEqual(result.returncode, 0, msg=result.stderr + result.stdout)
        content = self.agents.read_text(encoding="utf-8")
        self.assertIn("extra-user-line-xyz", content)
        self.assertIn(f"v{VERSION}", content)
        self.assertNotIn("\nold\n", "\n" + content)

    def test_dry_run_missing_agents_creates_nothing(self) -> None:
        """Scenario 4: dry-run prints intent and creates nothing."""
        self.assertFalse(self.agents.exists())
        result = _run_setup(self.project, "--tools", "codex", "--dry-run")
        self.assertEqual(result.returncode, 0, msg=result.stderr + result.stdout)
        self.assertIn("dry-run", result.stdout.lower())
        self.assertFalse(self.agents.exists())
        self.assertFalse(self.claude.exists())

    def test_codex_only_does_not_mutate_claude_md(self) -> None:
        """Codex-only projects do not receive automatic CLAUDE.md mutation."""
        claude_body = "# Claude rules\n\nuser-owned claude content\n"
        self.claude.write_text(claude_body, encoding="utf-8")
        result = _run_setup(self.project, "--tools", "codex")
        self.assertEqual(result.returncode, 0, msg=result.stderr + result.stdout)
        self.assertTrue(self.agents.exists())
        self.assertEqual(
            self.claude.read_text(encoding="utf-8"),
            claude_body,
        )

    def test_repeated_setup_is_idempotent_single_block(self) -> None:
        """Scenario 6 (partial): run setup twice → exactly one current block."""
        self.agents.write_text(USER_PREFIX, encoding="utf-8")
        r1 = _run_setup(self.project, "--tools", "codex")
        self.assertEqual(r1.returncode, 0, msg=r1.stderr + r1.stdout)
        first = self.agents.read_text(encoding="utf-8")
        r2 = _run_setup(self.project, "--tools", "codex")
        self.assertEqual(r2.returncode, 0, msg=r2.stderr + r2.stdout)
        second = self.agents.read_text(encoding="utf-8")
        self.assertEqual(first, second)
        self.assertEqual(second.count(SHIM_START), 1)
        self.assertEqual(second.count(SHIM_END), 1)

    def test_nested_fixture_scoped_rules_visible(self) -> None:
        """Nested project dir: nearest AGENTS receives managed block; rules present."""
        nested = self.project / "apps" / "api"
        nested.mkdir(parents=True)
        agents = nested / "AGENTS.md"
        agents.write_text("# nested project rules\n\nscoped-rule-abc\n", encoding="utf-8")
        result = _run_setup(nested, "--tools", "codex")
        self.assertEqual(result.returncode, 0, msg=result.stderr + result.stdout)
        content = agents.read_text(encoding="utf-8")
        self.assertIn("scoped-rule-abc", content)
        self.assertEqual(content.count(SHIM_START), 1)
        # Parent was not mutated.
        self.assertFalse((self.project / "AGENTS.md").exists())


class AutoBridgeProviderTargetsTests(unittest.TestCase):
    """auto-bridge.py provider-aware targets using one block algorithm."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.project = Path(self._tmp.name)
        (self.project / ".hyperflow").mkdir()
        self.agents = self.project / "AGENTS.md"
        self.claude = self.project / "CLAUDE.md"
        self._env_backup = {
            k: os.environ.get(k)
            for k in (
                "CODEX_PLUGIN_ROOT",
                "CLAUDE_PLUGIN_ROOT",
                "CODEX_HOME",
                "CODEX_SESSION_ID",
                "CLAUDE_CODE_ENTRYPOINT",
                "CLAUDE_PROJECT_DIR",
            )
        }

    def tearDown(self) -> None:
        for key, value in self._env_backup.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def _clear_provider_env(self) -> None:
        for key in self._env_backup:
            os.environ.pop(key, None)

    def test_codex_targets_agents_only(self) -> None:
        self._clear_provider_env()
        os.environ["CODEX_PLUGIN_ROOT"] = "/tmp/fake-codex-plugin"
        targets = auto_bridge._resolve_targets(self.project)
        self.assertEqual([t.name for t in targets], ["AGENTS.md"])

    def test_claude_targets_claude_only(self) -> None:
        self._clear_provider_env()
        os.environ["CLAUDE_PLUGIN_ROOT"] = "/tmp/fake-claude-plugin"
        targets = auto_bridge._resolve_targets(self.project)
        self.assertEqual([t.name for t in targets], ["CLAUDE.md"])

    def test_codex_bridge_preserves_user_content_in_agents(self) -> None:
        self._clear_provider_env()
        os.environ["CODEX_HOME"] = str(self.project / ".codex-home")
        prefix = "# user agents intro\n\nMUST_SURVIVE_PREFIX\n\n"
        suffix = "\n## trailing\nMUST_SURVIVE_SUFFIX\n"
        stale = (
            "<!-- hyperflow:doctrine:start version=0.0.1 "
            "generated=2020-01-01T00:00:00Z body-sha=deadbeef "
            "source=https://github.com/Mohammed-Abdelhady/hyperflow -->\n"
            "old body\n"
            f"{DOCTRINE_END}\n"
        )
        self.agents.write_text(prefix + stale + suffix, encoding="utf-8")
        self.claude.write_text("# should not change\n", encoding="utf-8")
        claude_before = self.claude.read_text(encoding="utf-8")

        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            code = auto_bridge.main(
                [str(AUTO_BRIDGE), str(REPO_ROOT), str(self.project)]
            )
        self.assertEqual(code, 0)
        content = self.agents.read_text(encoding="utf-8")
        self.assertTrue(content.startswith(prefix))
        self.assertTrue(content.endswith(suffix) or content.rstrip("\n").endswith(
            suffix.rstrip("\n")
        ))
        self.assertIn("MUST_SURVIVE_PREFIX", content)
        self.assertIn("MUST_SURVIVE_SUFFIX", content)
        self.assertNotIn("body-sha=deadbeef", content)
        self.assertEqual(content.count(DOCTRINE_END), 1)
        self.assertEqual(self.claude.read_text(encoding="utf-8"), claude_before)
        self.assertIn("AGENTS.md", stdout.getvalue())

    def test_write_instruction_file_algorithm_shared(self) -> None:
        """Same apply algorithm works for an arbitrary path (AGENTS or CLAUDE)."""
        target = self.project / "AGENTS.md"
        original = "USER_BYTES_UNTOUCHED\n"
        target.write_text(original, encoding="utf-8")
        block = (
            "<!-- hyperflow:doctrine:start version=9.9.9 "
            "generated=2026-01-01T00:00:00Z body-sha=0123456789ab "
            "source=https://github.com/Mohammed-Abdelhady/hyperflow -->\n"
            "body\n"
            f"{DOCTRINE_END}\n"
        )
        action = auto_bridge._write_instruction_file(target, block, "auto")
        self.assertEqual(action, "generated")
        text = target.read_text(encoding="utf-8")
        self.assertTrue(text.startswith(original))
        self.assertIn(block.strip(), text)

        action2 = auto_bridge._write_instruction_file(target, block, "auto")
        self.assertEqual(action2, "refreshed")
        text2 = target.read_text(encoding="utf-8")
        self.assertTrue(text2.startswith(original))
        self.assertEqual(text2.count(DOCTRINE_END), 1)


class InstallCodexLifecycleTests(unittest.TestCase):
    """install.sh Codex lifecycle outcomes — temp home only, never real installs."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.home = Path(self._tmp.name) / "home"
        self.home.mkdir()
        self.bin = Path(self._tmp.name) / "bin"
        self.bin.mkdir()
        self.codex_home = self.home / ".codex"
        self.codex_home.mkdir()
        # Detect Codex via plugins parent existing.
        (self.codex_home / "plugins").mkdir()

    def _env(self, *, with_codex: bool = False, instruction_only: bool = False) -> dict[str, str]:
        env = os.environ.copy()
        env["HOME"] = str(self.home)
        env["CODEX_HOME"] = str(self.codex_home)
        env["HYPERFLOW_HOME"] = str(self.home / ".hyperflow" / "repo")
        env["INSTALL_NONINTERACTIVE"] = "1"
        # Keep system bins so /bin/bash and coreutils remain available; only
        # the temp bin is used for the fake `codex` (or its absence).
        system_path = "/bin:/usr/bin:/usr/local/bin"
        if with_codex:
            self._write_fake_codex()
            env["PATH"] = f"{self.bin}:{system_path}"
        else:
            # No host codex — path without the rest of the user PATH.
            env["PATH"] = system_path
        if instruction_only:
            env["HYPERFLOW_CODEX_INSTRUCTION_ONLY"] = "1"
        return env

    def _write_fake_codex(
        self,
        *,
        list_output: str = "",
        add_exit: int = 0,
        remove_exit: int = 0,
        permission_denied: bool = False,
    ) -> None:
        script = self.bin / "codex"
        if permission_denied:
            body = textwrap.dedent(
                f"""\
                #!/bin/sh
                echo "permission denied" >&2
                exit 13
                """
            )
        else:
            body = textwrap.dedent(
                f"""\
                #!/bin/sh
                cmd="$1"
                sub="$2"
                if [ "$cmd" = "plugin" ] && [ "$sub" = "list" ]; then
                  printf '%s\\n' {list_output!r}
                  exit 0
                fi
                if [ "$cmd" = "plugin" ] && [ "$sub" = "marketplace" ]; then
                  exit {add_exit}
                fi
                if [ "$cmd" = "plugin" ] && [ "$sub" = "add" ]; then
                  exit {add_exit}
                fi
                if [ "$cmd" = "plugin" ] && [ "$sub" = "remove" ]; then
                  exit {remove_exit}
                fi
                exit 0
                """
            )
        script.write_text(body, encoding="utf-8")
        script.chmod(script.stat().st_mode | stat.S_IEXEC)

    def _install_body_for_sourcing(self) -> str:
        """Strip install.sh curl|bash outer braces and trailing main invocation."""
        lines = INSTALL_SCRIPT.read_text(encoding="utf-8").splitlines()
        start = None
        end = None
        for i, line in enumerate(lines):
            if line.strip() == "{":
                start = i + 1
                break
        for i in range(len(lines) - 1, -1, -1):
            if lines[i].strip() == "}":
                end = i
                break
        if start is None or end is None or end <= start:
            raise AssertionError("install.sh outer-brace structure not recognized")
        body_lines = lines[start:end]
        trimmed: list[str] = []
        for line in body_lines:
            if line.strip() in {'main "$@"', "exit 0"}:
                continue
            trimmed.append(line)
        return "\n".join(trimmed) + "\n"

    def _source_and_call(
        self, function: str, env: dict[str, str]
    ) -> subprocess.CompletedProcess[str]:
        """Source install.sh function definitions and invoke *function* in isolation."""
        body = self._install_body_for_sourcing()
        filtered = Path(self._tmp.name) / "install-sourced.sh"
        filtered.write_text(body, encoding="utf-8")
        harness = textwrap.dedent(
            f"""\
            set -euo pipefail
            # shellcheck disable=SC1091
            source "{filtered}"
            LIFECYCLE_RESULTS=()
            {function}
            for e in "${{LIFECYCLE_RESULTS[@]+"${{LIFECYCLE_RESULTS[@]}}"}}"; do
              printf 'OUTCOME:%s\\n' "$e"
            done
            """
        )
        return subprocess.run(
            ["/bin/bash", "-c", harness],
            capture_output=True,
            text=True,
            env=env,
            check=False,
        )

    def test_codex_command_unavailable(self) -> None:
        """Scenario 5: no codex on PATH → command_unavailable + exact manual command."""
        env = self._env(with_codex=False)
        result = self._source_and_call("install_codex_plugin", env)
        self.assertEqual(result.returncode, 0, msg=result.stderr + result.stdout)
        self.assertIn("command unavailable", result.stdout.lower() + result.stderr.lower())
        self.assertIn(
            "codex plugin add hyperflow@hyperflow-marketplace",
            result.stdout + result.stderr,
        )
        self.assertIn("OUTCOME:Codex|command_unavailable|", result.stdout)
        self.assertIn("fresh", (result.stdout + result.stderr).lower())

    def test_codex_already_installed(self) -> None:
        env = self._env(with_codex=True)
        self._write_fake_codex(list_output="hyperflow@hyperflow-marketplace")
        result = self._source_and_call("install_codex_plugin", env)
        self.assertEqual(result.returncode, 0, msg=result.stderr + result.stdout)
        self.assertIn("OUTCOME:Codex|already_installed|", result.stdout)
        self.assertIn(
            "codex plugin marketplace upgrade hyperflow-marketplace",
            result.stdout + result.stderr,
        )

    def test_codex_installed_success(self) -> None:
        env = self._env(with_codex=True)
        self._write_fake_codex(list_output="", add_exit=0)
        result = self._source_and_call("install_codex_plugin", env)
        self.assertEqual(result.returncode, 0, msg=result.stderr + result.stdout)
        self.assertIn("OUTCOME:Codex|installed|", result.stdout)

    def test_codex_permission_denied(self) -> None:
        env = self._env(with_codex=True)
        self._write_fake_codex(permission_denied=True)
        result = self._source_and_call("install_codex_plugin", env)
        self.assertEqual(result.returncode, 0, msg=result.stderr + result.stdout)
        combined = result.stdout + result.stderr
        self.assertIn("OUTCOME:Codex|permission_denied|", result.stdout)
        self.assertIn("codex plugin add hyperflow@hyperflow-marketplace", combined)

    def test_codex_instruction_only_env(self) -> None:
        env = self._env(with_codex=True, instruction_only=True)
        result = self._source_and_call("install_codex_plugin", env)
        self.assertEqual(result.returncode, 0, msg=result.stderr + result.stdout)
        self.assertIn("OUTCOME:Codex|instruction_only|", result.stdout)

    def test_codex_remove_uses_supported_command(self) -> None:
        env = self._env(with_codex=True)
        self._write_fake_codex(list_output="hyperflow@hyperflow-marketplace", remove_exit=0)
        result = self._source_and_call("remove_codex_plugin", env)
        self.assertEqual(result.returncode, 0, msg=result.stderr + result.stdout)
        self.assertIn("OUTCOME:Codex|removed|hyperflow@hyperflow-marketplace", result.stdout)
        self.assertIn("fresh", (result.stdout + result.stderr).lower())
        # Failure/instruction path must still name the supported remove command.
        env_fail = self._env(with_codex=False)
        result_fail = self._source_and_call("remove_codex_plugin", env_fail)
        self.assertEqual(result_fail.returncode, 0, msg=result_fail.stderr + result_fail.stdout)
        self.assertIn(
            "codex plugin remove hyperflow@hyperflow-marketplace",
            result_fail.stdout + result_fail.stderr,
        )

    def test_never_touches_real_codex_home(self) -> None:
        """Safety: harness HOME/CODEX_HOME stay under temp; real ~/.codex not required."""
        env = self._env(with_codex=False)
        real_marker = Path.home() / ".codex" / ".hyperflow-t6-should-not-exist"
        self.assertFalse(real_marker.exists())
        result = self._source_and_call("install_codex_plugin", env)
        self.assertEqual(result.returncode, 0, msg=result.stderr + result.stdout)
        self.assertFalse(real_marker.exists())
        # Our temp CODEX_HOME remains empty of destructive mutation needs.
        self.assertTrue(self.codex_home.is_dir())


class ClaudeSetupPreservedTests(unittest.TestCase):
    """Ensure Claude setup path still uses managed-block semantics."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.project = Path(self._tmp.name)

    def test_claude_append_preserves_user_content(self) -> None:
        claude = self.project / "CLAUDE.md"
        claude.write_text("# My Claude rules\n\nuser-only\n", encoding="utf-8")
        before = claude.read_bytes()
        result = _run_setup(self.project, "--tools", "claude-code")
        self.assertEqual(result.returncode, 0, msg=result.stderr + result.stdout)
        after = claude.read_text(encoding="utf-8")
        self.assertTrue(claude.read_bytes().startswith(before) or "user-only" in after)
        self.assertIn("user-only", after)
        self.assertEqual(after.count(SHIM_START), 1)

    def test_all_tools_writes_both_but_does_not_drop_user_agents(self) -> None:
        agents = self.project / "AGENTS.md"
        agents.write_text("CUSTOM_AGENTS_RULE\n", encoding="utf-8")
        result = _run_setup(self.project, "--tools", "claude-code,codex")
        self.assertEqual(result.returncode, 0, msg=result.stderr + result.stdout)
        self.assertIn("CUSTOM_AGENTS_RULE", agents.read_text(encoding="utf-8"))
        self.assertTrue((self.project / "CLAUDE.md").exists())


if __name__ == "__main__":
    unittest.main()
