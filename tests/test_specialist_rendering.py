"""Tests for render-specialist-brief.py — charter composition and role separation."""

from __future__ import annotations

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT = REPO_ROOT / "scripts" / "render-specialist-brief.py"
AGENTS = REPO_ROOT / "agents"


def _load():
    spec = importlib.util.spec_from_file_location("render_specialist_brief", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


rsb = _load()


def _run_cli(args: list[str], *, check: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        check=check,
    )


def _mini_plugin(tmp: Path, *, name: str, tools: str, body: str) -> Path:
    agents = tmp / "agents"
    agents.mkdir(parents=True, exist_ok=True)
    path = agents / f"{name}.md"
    path.write_text(
        f"---\nname: {name}\ndescription: test specialist\ntools: {tools}\n---\n\n{body}\n",
        encoding="utf-8",
    )
    return tmp


class ParseAndPathTests(unittest.TestCase):
    def test_parse_frontmatter_and_strip(self) -> None:
        text = (
            "---\nname: demo\ntools: Read, WebSearch\n---\n\n"
            "**Mission:** catch bugs.\n"
        )
        meta, body = rsb.parse_frontmatter(text)
        self.assertEqual(meta["name"], "demo")
        self.assertEqual(meta["tools"], "Read, WebSearch")
        self.assertFalse(body.lstrip().startswith("---"))
        self.assertIn("**Mission:**", body)
        self.assertNotIn("tools:", body)

    def test_tools_from_frontmatter(self) -> None:
        self.assertEqual(
            rsb.tools_from_frontmatter({"tools": "Read, Grep, WebSearch"}),
            ["Read", "Grep", "WebSearch"],
        )

    def test_resolve_charter_blocks_escape(self) -> None:
        with self.assertRaises(rsb.BlockedError) as ctx:
            rsb.resolve_charter_path("../.env", REPO_ROOT)
        self.assertIn("BLOCKED:", str(ctx.exception))

    def test_resolve_charter_blocks_outside_agents(self) -> None:
        with self.assertRaises(rsb.BlockedError) as ctx:
            rsb.resolve_charter_path(str(REPO_ROOT / "README.md"), REPO_ROOT)
        self.assertIn("BLOCKED:", str(ctx.exception))

    def test_resolve_charter_by_name(self) -> None:
        path = rsb.resolve_charter_path("security-reviewer", REPO_ROOT)
        self.assertEqual(path, AGENTS / "security-reviewer.md")


class TaskNameTests(unittest.TestCase):
    def test_lowercase_and_charset(self) -> None:
        name = rsb.stable_task_name(
            "security-reviewer",
            "reviewer",
            "Review authz on protected routes",
        )
        self.assertEqual(name, name.lower())
        self.assertRegex(name, r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
        self.assertLessEqual(len(name), rsb._TASK_NAME_MAX)

    def test_collision_safe_distinct_long_descriptions(self) -> None:
        base = "Review the authentication and authorization middleware " * 8
        a = rsb.stable_task_name("security-reviewer", "reviewer", base + " path-A-only-suffix")
        b = rsb.stable_task_name("security-reviewer", "reviewer", base + " path-B-only-suffix")
        self.assertNotEqual(a, b)
        self.assertTrue(a.endswith(a[-8:]))
        self.assertRegex(a, r"-[a-f0-9]{8}$")
        self.assertRegex(b, r"-[a-f0-9]{8}$")

    def test_deterministic_same_input(self) -> None:
        brief = "Map call sites for UserAvatar"
        a = rsb.stable_task_name("searcher", "worker", brief)
        b = rsb.stable_task_name("searcher", "worker", brief)
        self.assertEqual(a, b)


class ReviewerCharterTests(unittest.TestCase):
    def test_security_reviewer_role_and_contract(self) -> None:
        result = rsb.render_specialist_brief(
            charter_path=AGENTS / "security-reviewer.md",
            role="reviewer",
            brief="Review authz on /api/admin routes; halt on missing checks.",
            plugin_root=REPO_ROOT,
        )
        msg = result["message"]
        self.assertTrue(msg.startswith("hyperflow-role: reviewer\n"))
        self.assertIn("hyperflow-task-name:", msg)
        self.assertIn("## Mission", msg)
        self.assertIn("Be the gate", msg)
        self.assertIn("## Bound standards", msg)
        self.assertIn("personas-A.md", msg)
        self.assertIn("## Brief", msg)
        self.assertIn("Review authz on /api/admin", msg)
        self.assertIn("## Security constraints", msg)
        self.assertIn("SECURITY_VIOLATION:", msg)
        self.assertIn("## Output contract", msg)
        self.assertIn("VERDICT:", msg)
        self.assertIn("## Capability caveats", msg)
        # No worker implementation mandate
        self.assertIn("never implement", msg.lower())
        self.assertNotIn("You are a **worker**", msg)
        self.assertIn("Never coordinate", msg)


class InvestigatorCharterTests(unittest.TestCase):
    def test_debugger_investigation_no_review_verdict_primary(self) -> None:
        result = rsb.render_specialist_brief(
            charter_path=AGENTS / "debugger.md",
            role="investigator",
            brief="Failing test test_login_redirect — find root cause before any patch.",
            plugin_root=REPO_ROOT,
        )
        msg = result["message"]
        self.assertTrue(msg.startswith("hyperflow-role: investigator\n"))
        self.assertIn("Find the *cause*", msg)
        self.assertIn("## Mission", msg)
        self.assertIn("findings block", msg.lower())
        # Investigation primary contract — not the reviewer VERDICT table as mandate
        self.assertIn(
            "Do not emit VERDICT: APPROVED | NEEDS_FIX as the primary contract",
            msg,
        )
        self.assertNotIn("You are a **reviewer**", msg)
        self.assertNotIn("You are a **worker**", msg)


class HostFrontmatterTests(unittest.TestCase):
    def test_tools_advisory_not_enforcement(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = _mini_plugin(
                Path(td),
                name="webby",
                tools="WebSearch, WebFetch",
                body=(
                    "**Family:** Reviewer · **Binds personas:** security · "
                    "**Default role:** reviewer\n\n"
                    "**Mission:** scan for outdated advisories.\n\n"
                    "**Strict checklist / output contract:** cite sources.\n\n"
                    "**Output format:** findings block.\n"
                ),
            )
            result = rsb.render_specialist_brief(
                charter_path=root / "agents" / "webby.md",
                role="reviewer",
                brief="Check OWASP notes for the auth library.",
                plugin_root=root,
            )
            msg = result["message"]
            self.assertIn("WebSearch", msg)
            self.assertIn("advisory intent only", msg.lower())
            self.assertIn("host sandbox and approval policy", msg.lower())
            self.assertNotIn("tools: WebSearch enforce", msg.lower())
            # Frontmatter not re-emitted as YAML enforcement block
            self.assertNotRegex(msg, r"(?m)^---\s*$")
            self.assertNotRegex(msg, r"(?m)^tools:\s*WebSearch")


class NoSpawnFallbackTests(unittest.TestCase):
    def test_foreground_role_separated_when_no_spawn(self) -> None:
        result = rsb.render_specialist_brief(
            charter_path=AGENTS / "searcher.md",
            role="worker",
            brief="Map auth surfaces.",
            can_spawn=False,
            plugin_root=REPO_ROOT,
        )
        msg = result["message"]
        self.assertIn("spawn is unavailable", msg.lower())
        self.assertIn("foreground role-separated fallback", msg.lower())
        self.assertIn("never merge worker and reviewer", msg.lower())
        self.assertIn("never invent background notifications", msg.lower())


class IntegrationRoleSeparationTests(unittest.TestCase):
    def test_worker_and_reviewer_prompts_do_not_overlap_responsibilities(self) -> None:
        brief = (
            "Plan and implement the pending-gate checkpoint helper; "
            "keep artefact schemas stable."
        )
        worker = rsb.render_specialist_brief(
            charter_path=AGENTS / "searcher.md",
            role="worker",
            brief=brief,
            context="Planner worker phase for full-codex-support T4 integration.",
            plugin_root=REPO_ROOT,
        )
        reviewer = rsb.render_specialist_brief(
            charter_path=AGENTS / "security-reviewer.md",
            role="reviewer",
            brief=brief,
            context="Final independent review of the planner worker output.",
            plugin_root=REPO_ROOT,
        )
        w, r = worker["message"], reviewer["message"]

        # Complete required sections
        for msg in (w, r):
            for section in (
                "hyperflow-role:",
                "## Mission",
                "## Bound standards",
                "## Brief",
                "## Context",
                "## Security constraints",
                "## Output contract",
                "## Capability caveats",
            ):
                self.assertIn(section, msg)

        self.assertIn("hyperflow-role: worker", w)
        self.assertIn("hyperflow-role: reviewer", r)
        self.assertIn("Never self-review", w)
        self.assertIn("never implement", r.lower())
        self.assertIn("Never coordinate", r)
        self.assertNotIn("VERDICT: APPROVED | NEEDS_FIX | SECURITY_VIOLATION", w)
        self.assertIn("VERDICT:", r)
        # Distinct collaboration names for the same brief text across roles
        self.assertNotEqual(worker["task_name"], reviewer["task_name"])


class CliTests(unittest.TestCase):
    def test_cli_stdout_message(self) -> None:
        proc = _run_cli(
            [
                "--charter",
                "debugger",
                "--role",
                "investigator",
                "--brief",
                "Reproduce flaky CI failure in auth tests.",
                "--plugin-root",
                str(REPO_ROOT),
            ]
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("hyperflow-role: investigator", proc.stdout)
        self.assertIn("## Brief", proc.stdout)

    def test_cli_task_name_only(self) -> None:
        proc = _run_cli(
            [
                "--charter",
                "security-reviewer",
                "--role",
                "reviewer",
                "--brief",
                "Security gate on deploy path.",
                "--task-name-only",
                "--plugin-root",
                str(REPO_ROOT),
            ]
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        name = proc.stdout.strip()
        self.assertRegex(name, r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
        self.assertNotIn("\n", name)

    def test_cli_blocked_path(self) -> None:
        proc = _run_cli(
            [
                "--charter",
                "../../.env",
                "--role",
                "worker",
                "--brief",
                "nope",
                "--plugin-root",
                str(REPO_ROOT),
            ]
        )
        self.assertEqual(proc.returncode, 2)
        self.assertTrue(proc.stdout.startswith("BLOCKED:"))


if __name__ == "__main__":
    unittest.main()
