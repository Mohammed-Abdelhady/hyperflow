"""Static portability lint for shared skill references + lean-summary targets.

Scans only under the repository `skills/` tree:

* `skills/*/references/**/*.md` — per-skill shared references
* `skills/hyperflow/*.md` except `SKILL.md` — canonical runtime docs

Never walks user homes, `.env*`, or paths outside the repo `skills/` root.

Rules (narrow; precise path:line failures):

1. Unmapped Claude-only tool hard requirements as UNIVERSAL ops
   (e.g. "must use the Agent tool", "call Agent({") without nearby
   capability / fallback / provider-scope language.
2. Retired routes as active instructions: `scope -> dispatch`,
   `/hyperflow:scope`, `/hyperflow:spec` (allow retired/banned wording).
3. Model-tier routing language as active policy ("thinking model",
   "worker model", affirmative model-tier routing).
4. Fabricated universal metric parsing of Claude UI (`⎿ Done` as the
   universal wall-clock/token source without rejection language).

Product names and explicitly scoped native mappings (provider-*.md and
sections that name Claude/Codex/OpenCode as host docs) are allowlisted when
capability/fallback language is present.

Also covers lean-summary provider-appropriate instruction targets
(AGENTS.md vs CLAUDE.md).
"""

from __future__ import annotations

import importlib.util
import os
import re
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SKILLS_ROOT = REPO_ROOT / "skills"
LEAN_SUMMARY = REPO_ROOT / "scripts" / "lean-summary.py"

# Blocked path fragments — scan must never cross these.
_BLOCKED_FRAGMENTS = (
    "/.env",
    "/.ssh/",
    "/.aws/",
    "/.kube/",
    "/.config/gcloud/",
)

# Context window (lines) for allowlist keywords near a hit.
_CTX = 3

# Explicit native-provider doc basenames (always allowlisted for host tool names).
_PROVIDER_DOC_NAMES = frozenset(
    {
        "provider-claude.md",
        "provider-codex.md",
        "provider-opencode.md",
    }
)

# Capability / fallback / scoped-mapping language that pardons a nearby hit.
_CAPABILITY_NEARBY = re.compile(
    r"(?i)\b("
    r"spawn|fallback|when available|if available|when present|when the host|"
    r"inventory|runtime-contract|canonical op|semantic op|provider|"
    r"native mapping|host mapping|claude only|claude-only|codex only|"
    r"prefer the host|labelled inline|inline worker|inline reviewer|"
    r"structured_question|skill_continuation|usage_metrics|"
    r"never parse|not universal|unavailable|e\.g\.|for example|"
    r"ui chrome|do not assume|if .* unavailable|when .* missing"
    r")\b"
)

# Negation / retirement language that pardons retired-route and model-tier hits.
_NEGATION_NEARBY = re.compile(
    r"(?i)\b("
    r"never|not |no |without|banned|retired|obsolete|do not|"
    r"must not|cannot|forbidden|not targets|no longer|"
    r"there is no|are not|is not"
    r")\b"
)


def _load_lean() -> object:
    spec = importlib.util.spec_from_file_location("lean_summary", LEAN_SUMMARY)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


lean = _load_lean()


def iter_reference_files(repo_root: Path) -> list[Path]:
    """Inventory executable references under repo skills/ only."""
    skills = repo_root / "skills"
    if not skills.is_dir():
        return []
    # Hard boundary: never leave skills/
    skills_resolved = skills.resolve()
    files: list[Path] = []
    for path in skills.glob("*/references/**/*.md"):
        files.append(path)
    for path in skills.glob("hyperflow/*.md"):
        if path.name == "SKILL.md":
            continue  # skill body migration is out of scope (T7–T10)
        files.append(path)
    out: list[Path] = []
    for path in files:
        resolved = path.resolve()
        try:
            resolved.relative_to(skills_resolved)
        except ValueError:
            continue  # outside skills/
        text = str(resolved)
        if any(frag in text for frag in _BLOCKED_FRAGMENTS):
            continue
        out.append(path)
    return sorted(set(out), key=lambda p: str(p))


def _rel(path: Path, repo_root: Path) -> str:
    try:
        return str(path.relative_to(repo_root))
    except ValueError:
        return str(path)


def _context_blob(lines: list[str], idx: int, window: int = _CTX) -> str:
    start = max(0, idx - window)
    end = min(len(lines), idx + window + 1)
    return "\n".join(lines[start:end])


def _is_provider_scoped(path: Path, blob: str) -> bool:
    if path.name in _PROVIDER_DOC_NAMES:
        return True
    # Explicit host-doc sections naming a provider + mapping language.
    if re.search(r"(?i)\b(claude code|codex|opencode)\b", blob) and _CAPABILITY_NEARBY.search(
        blob
    ):
        return True
    return False


# ─── Rule patterns ───────────────────────────────────────────────────────────

# Hard universal requirements of Claude Agent API without capability language.
_AGENT_HARD = re.compile(
    r"(?i)("
    r"must use the Agent tool|"
    r"before the Agent tool call|"
    r"use the Agent tool|"
    r"call Agent\s*\(|"
    r"Agent\s*\(\s*\{"
    r")"
)

# Retired live routes (not artefact paths like .hyperflow/specs/).
_RETIRED_ROUTE = re.compile(
    r"(?i)("
    r"/hyperflow:scope\b|"
    r"/hyperflow:spec\b|"
    r"\bscope\s*(?:->|→)\s*dispatch\b|"
    r"\bspec\s*(?:->|→)\s*scope\b|"
    r"\bspec\s*(?:->|→)\s*scope\s*(?:->|→)\s*dispatch\b"
    r")"
)

# Affirmative model-tier policy terms.
_THINKING_MODEL = re.compile(r"(?i)\bthinking model\b")
_WORKER_MODEL = re.compile(r"(?i)\bworker model\b")
_MODEL_TIER = re.compile(r"(?i)\bmodel[- ]tier\b")


def _term_negated_on_line(line: str, match: re.Match[str]) -> bool:
    """True when negation appears in the left-context of *match* on the same line."""
    left = line[max(0, match.start() - 48) : match.start()]
    return bool(re.search(r"(?i)\b(no|not|never|without|ban+|forbid)\b", left))


# Claude UI chrome used as a universal duration/token source.
_DONE_TOKEN = re.compile(r"⎿\s*Done")
_DONE_POSITIVE_SOURCE = re.compile(
    r"(?i)("
    r"to last\s*`?⎿?\s*Done|"
    r"from first.*Agent\(\).*Done|"
    r"reported in each\s*`?⎿?\s*Done|"
    r"sum of the individual agent durations reported in each|"
    r"from each\s*`?⎿?\s*Done|"
    r"wall-clock`?\s+is the elapsed real time from first"
    r")"
)
_DONE_REJECTS = re.compile(
    r"(?i)("
    r"never parse|not (a )?universal|claude-only|claude only|"
    r"ui chrome|e\.g\.|for example|unavailable|do not fabricate|"
    r"never invent"
    r")"
)


class Finding:
    __slots__ = ("path", "line", "rule", "snippet")

    def __init__(self, path: str, line: int, rule: str, snippet: str) -> None:
        self.path = path
        self.line = line
        self.rule = rule
        self.snippet = snippet.strip()

    def __str__(self) -> str:
        return f"{self.path}:{self.line}: [{self.rule}] {self.snippet}"


def lint_text(text: str, *, rel_path: str = "<memory>", path: Path | None = None) -> list[Finding]:
    """Lint a single markdown document; return findings."""
    findings: list[Finding] = []
    lines = text.splitlines()
    path_obj = path or Path(rel_path)

    for i, line in enumerate(lines):
        blob = _context_blob(lines, i)
        lineno = i + 1
        # Strip light markdown emphasis so **before** still matches hard requirements.
        plain = re.sub(r"[*_`]+", "", line)

        # 1) Unmapped Agent hard requirements
        if _AGENT_HARD.search(plain):
            if not (
                _CAPABILITY_NEARBY.search(blob)
                or _is_provider_scoped(path_obj, blob)
                or _NEGATION_NEARBY.search(blob)
            ):
                findings.append(
                    Finding(rel_path, lineno, "unmapped-agent-tool", line)
                )

        # 2) Retired routes as active instructions
        if _RETIRED_ROUTE.search(line):
            if not _NEGATION_NEARBY.search(blob):
                findings.append(
                    Finding(rel_path, lineno, "retired-route", line)
                )

        # 3) Model-tier routing as active policy
        for pat in (_THINKING_MODEL, _WORKER_MODEL, _MODEL_TIER):
            for m in pat.finditer(line):
                if _term_negated_on_line(line, m):
                    continue
                # Broader blob may still ban the concept ("never model-tier …").
                if _NEGATION_NEARBY.search(blob) and re.search(
                    r"(?i)\b(no|never|not|without)\b.{0,60}" + re.escape(m.group(0)),
                    blob,
                ):
                    continue
                findings.append(
                    Finding(rel_path, lineno, "model-tier-routing", line)
                )
                break

        # 4) Fabricated Claude UI metrics as universal source
        if _DONE_POSITIVE_SOURCE.search(line) and _DONE_TOKEN.search(line):
            if not _DONE_REJECTS.search(blob):
                findings.append(
                    Finding(rel_path, lineno, "fabricated-done-metrics", line)
                )
        elif _DONE_POSITIVE_SOURCE.search(line) and not _DONE_REJECTS.search(blob):
            # "from first Agent() … to last Done" even if glyph omitted
            if re.search(r"(?i)Agent\s*\(\s*\)", line) and re.search(
                r"(?i)\bDone\b", line
            ):
                findings.append(
                    Finding(rel_path, lineno, "fabricated-done-metrics", line)
                )

    return findings


def lint_repo(repo_root: Path) -> list[Finding]:
    findings: list[Finding] = []
    for path in iter_reference_files(repo_root):
        rel = _rel(path, repo_root)
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        findings.extend(lint_text(text, rel_path=rel, path=path))
    return findings


# ─── Tests ───────────────────────────────────────────────────────────────────


class InventoryTests(unittest.TestCase):
    def test_scan_stays_under_skills(self) -> None:
        files = iter_reference_files(REPO_ROOT)
        self.assertGreater(len(files), 20)
        for path in files:
            resolved = path.resolve()
            self.assertTrue(
                str(resolved).startswith(str(SKILLS_ROOT.resolve())),
                msg=f"escaped skills/: {path}",
            )
            self.assertNotIn("/.env", str(resolved))
            self.assertNotEqual(path.name, "SKILL.md")

    def test_includes_scaffold_and_status_refs(self) -> None:
        rels = {_rel(p, REPO_ROOT) for p in iter_reference_files(REPO_ROOT)}
        self.assertIn("skills/scaffold/references/project-analysis.md", rels)
        self.assertIn("skills/status/references/output-style.md", rels)
        self.assertIn("skills/hyperflow/runtime-contract.md", rels)


class LiveRepoLintTests(unittest.TestCase):
    def test_live_references_pass(self) -> None:
        findings = lint_repo(REPO_ROOT)
        if findings:
            detail = "\n".join(str(f) for f in findings)
            self.fail(f"{len(findings)} portability finding(s):\n{detail}")


class FixtureLintTests(unittest.TestCase):
    """Synthetic bad content must fail with precise path:line + rule id."""

    def test_unmapped_agent_tool_fails(self) -> None:
        bad = (
            "# Bad ref\n\n"
            "Every agent dispatch gets a label **before** the Agent tool call. Format:\n"
        )
        findings = lint_text(bad, rel_path="fixture/unmapped-agent.md")
        rules = {f.rule for f in findings}
        self.assertIn("unmapped-agent-tool", rules)
        hit = next(f for f in findings if f.rule == "unmapped-agent-tool")
        self.assertEqual(hit.line, 3)
        self.assertIn("unmapped-agent.md:3", str(hit))

    def test_call_agent_brace_fails(self) -> None:
        bad = "Dispatch with call Agent({\"role\": \"searcher\"}) for every batch.\n"
        findings = lint_text(bad, rel_path="fixture/call-agent.md")
        self.assertTrue(any(f.rule == "unmapped-agent-tool" for f in findings))

    def test_scoped_native_agent_allowed(self) -> None:
        good = (
            "# Claude native mapping\n\n"
            "On Claude Code, map `spawn` to Agent when available "
            "(see runtime-contract). Prefer spawn; else labelled inline.\n"
        )
        findings = lint_text(good, rel_path="skills/hyperflow/provider-claude.md")
        self.assertEqual(findings, [])

    def test_retired_scope_dispatch_fails(self) -> None:
        bad = "After plan, continue with scope -> dispatch for the build phase.\n"
        findings = lint_text(bad, rel_path="fixture/retired-route.md")
        self.assertTrue(any(f.rule == "retired-route" for f in findings))
        hit = next(f for f in findings if f.rule == "retired-route")
        self.assertIn("retired-route.md:", str(hit))

    def test_retired_slash_commands_fail(self) -> None:
        bad = "Run /hyperflow:scope then /hyperflow:spec to continue.\n"
        findings = lint_text(bad, rel_path="fixture/retired-slash.md")
        rules = [f.rule for f in findings]
        self.assertIn("retired-route", rules)

    def test_retired_route_allowed_when_negated(self) -> None:
        good = (
            "Never route to retired targets. Live continuation never uses "
            "`scope -> dispatch` or `/hyperflow:scope` as active instructions.\n"
        )
        findings = lint_text(good, rel_path="fixture/retired-ok.md")
        self.assertEqual(findings, [])

    def test_thinking_model_active_policy_fails(self) -> None:
        bad = "3. **Thinking model decides.** Staleness evaluation is never delegated.\n"
        findings = lint_text(bad, rel_path="fixture/thinking.md")
        # "never" is on the same line for "delegated" but "Thinking model decides"
        # is affirmative policy — still fail if the model-tier rule fires.
        self.assertTrue(
            any(f.rule == "model-tier-routing" for f in findings),
            msg=findings,
        )

    def test_no_model_tier_routing_allowed(self) -> None:
        good = (
            "Every agent runs on the current session model. "
            "There is no model-tier routing and no worker model selection.\n"
        )
        findings = lint_text(good, rel_path="fixture/session-model.md")
        self.assertEqual(findings, [])

    def test_fabricated_done_metrics_fail(self) -> None:
        bad = (
            "- `wall-clock` is the elapsed real time from first `Agent()` call "
            "to last `⎿ Done`. `cumulative` is the sum of the individual agent "
            "durations reported in each `⎿ Done (... · Ym Zs)`.\n"
        )
        findings = lint_text(bad, rel_path="fixture/done-metrics.md")
        self.assertTrue(
            any(f.rule == "fabricated-done-metrics" for f in findings),
            msg=findings,
        )

    def test_honest_done_rejection_allowed(self) -> None:
        good = (
            "Never parse a single host's UI chrome (e.g. Claude `⎿ Done` lines) "
            "as a universal duration source. When timing is missing, print "
            "`unavailable`.\n"
        )
        findings = lint_text(good, rel_path="fixture/done-ok.md")
        self.assertEqual(findings, [])

    def test_temp_file_roundtrip(self) -> None:
        """Deliberately bad temp content fails; good content passes."""
        with tempfile.TemporaryDirectory() as tmp:
            bad_path = Path(tmp) / "bad.md"
            bad_path.write_text(
                "must use the Agent tool for every searcher.\n"
                "Then scope -> dispatch to finish.\n",
                encoding="utf-8",
            )
            findings = lint_text(
                bad_path.read_text(encoding="utf-8"),
                rel_path=str(bad_path),
            )
            rules = {f.rule for f in findings}
            self.assertIn("unmapped-agent-tool", rules)
            self.assertIn("retired-route", rules)


class LeanSummaryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.project = self.root / "project"
        self.hf = self.project / ".hyperflow"
        self.hf.mkdir(parents=True)
        for name in ("profile.md", "architecture.md", "conventions.md"):
            (self.hf / name).write_text(f"# {name}\n", encoding="utf-8")
        (self.hf / ".bridge-mode").write_text("auto\n", encoding="utf-8")

    def _run(self, env: dict[str, str]) -> tuple[int, str]:
        # Clear provider env pollution from the parent process for isolation.
        full_env = {
            k: v
            for k, v in os.environ.items()
            if not (
                k.startswith("CODEX")
                or k.startswith("CLAUDE")
                or k.startswith("OPENCODE")
                or k.startswith("GROK")
                or k.startswith("ANTIGRAVITY")
                or k.startswith("CURSOR")
            )
        }
        full_env.update(env)
        # Temporarily patch os.environ for the pure-python main call.
        old = os.environ.copy()
        os.environ.clear()
        os.environ.update(full_env)
        try:
            from io import StringIO
            import contextlib

            buf = StringIO()
            with contextlib.redirect_stdout(buf):
                code = lean.main(
                    ["lean-summary.py", str(REPO_ROOT), str(self.project)]
                )
            return code, buf.getvalue().strip()
        finally:
            os.environ.clear()
            os.environ.update(old)

    def test_codex_reports_agents_not_claude(self) -> None:
        (self.project / "AGENTS.md").write_text("# agents\n", encoding="utf-8")
        code, line = self._run({"CODEX_PLUGIN_ROOT": str(REPO_ROOT)})
        self.assertEqual(code, 0)
        self.assertIn("AGENTS.md", line)
        self.assertNotIn("CLAUDE.md", line)
        self.assertEqual(line.count(" · "), line.count("·"))  # compact single line
        self.assertEqual(len(line.splitlines()), 1)

    def test_claude_reports_claude_md(self) -> None:
        (self.project / "CLAUDE.md").write_text("# claude\n", encoding="utf-8")
        code, line = self._run({"CLAUDE_PLUGIN_ROOT": str(REPO_ROOT)})
        self.assertEqual(code, 0)
        self.assertIn("CLAUDE.md", line)
        self.assertNotIn("AGENTS.md", line)

    def test_missing_target_reports_no_yet(self) -> None:
        code, line = self._run({"CODEX_PLUGIN_ROOT": str(REPO_ROOT)})
        self.assertEqual(code, 0)
        self.assertIn("no AGENTS.md yet", line)

    def test_bridge_off_unchanged(self) -> None:
        (self.hf / ".bridge-mode").write_text("off\n", encoding="utf-8")
        code, line = self._run({"CODEX_PLUGIN_ROOT": str(REPO_ROOT)})
        self.assertEqual(code, 0)
        self.assertIn("bridge: off", line)

    def test_exit_zero_always(self) -> None:
        code, _ = self._run({})
        self.assertEqual(code, 0)
        # Not a hyperflow project edge: empty project
        empty = self.root / "empty"
        empty.mkdir()
        code2 = lean.main(["lean-summary.py", str(REPO_ROOT), str(empty)])
        self.assertEqual(code2, 0)


if __name__ == "__main__":
    unittest.main()
