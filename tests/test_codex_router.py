"""Public router closure: aliases, transitions, retired targets."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
VALIDATE = REPO_ROOT / "scripts" / "validate-plugin.py"


def _load():
    spec = importlib.util.spec_from_file_location("validate_plugin", VALIDATE)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


vp = _load()


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _router_fixture(
    tmp: Path,
    *,
    skills: list[str],
    alias_targets: list[str],
    include_session_start: bool = True,
) -> Path:
    root = tmp / "plugin"
    root.mkdir()
    for name in skills:
        skill_dir = root / "skills" / name
        skill_dir.mkdir(parents=True, exist_ok=True)
        _write(
            skill_dir / "SKILL.md",
            f"---\nname: {name}\ndescription: {name}\n---\n# {name}\n",
        )

    rows = "\n".join(
        f"| `/hyperflow:{t}`, `hyperflow {t}` | `{t}` |" for t in alias_targets
    )
    portable = (
        "---\nname: hyperflow\ndescription: doctrine\n---\n\n"
        "## Portable Function Router\n\n"
        "| User says | Run |\n|---|---|\n"
        f"{rows}\n"
    )
    hyperflow = root / "skills" / "hyperflow"
    hyperflow.mkdir(parents=True, exist_ok=True)
    _write(hyperflow / "SKILL.md", portable)
    _write(hyperflow / "VERSION", "5.14.0\n")

    if include_session_start:
        # Shell-escaped backticks, matching real hooks/session-start shape.
        ss_rows = "\n".join(
            f"| \\`/hyperflow:{t}\\`, \\`hyperflow {t}\\` | \\`{t}\\` |" for t in alias_targets
        )
        session = (
            "#!/bin/sh\n"
            "DIRECT_ENTRIES=\"## Codex function aliases\n\n"
            "| User says | Run |\n"
            "|---|---|\n"
            f"{ss_rows}\n"
            "\"\n"
        )
        _write(root / "hooks" / "session-start", session)

    features_skills = [{"name": n, "command": f"/hyperflow:{n}"} for n in skills if n != "hyperflow"]
    # Always register hyperflow if present as a skill dir
    if "hyperflow" in skills or (root / "skills" / "hyperflow").exists():
        # hyperflow dir always exists for alias source; only register if requested
        pass
    _write(
        root / "config" / "features.json",
        json.dumps(
            {
                "version": "5.14.0",
                "skills": [
                    {"name": n, "command": f"/hyperflow:{n}"}
                    for n in skills
                ],
            }
        )
        + "\n",
    )
    return root


class CodexRouterTests(unittest.TestCase):
    def test_current_repo_router_closure_passes(self) -> None:
        errors = vp.check_router_closure(REPO_ROOT)
        self.assertEqual(errors, [], msg="\n".join(errors))

    def test_parse_alias_tables_from_live_sources(self) -> None:
        skill_md = (REPO_ROOT / "skills" / "hyperflow" / "SKILL.md").read_text(encoding="utf-8")
        session = (REPO_ROOT / "hooks" / "session-start").read_text(encoding="utf-8")
        portable = vp.parse_alias_run_targets(skill_md)
        codex = vp.parse_alias_run_targets(session)
        self.assertIn("plan", portable)
        self.assertIn("dispatch", portable)
        self.assertIn("plan", codex)
        self.assertIn("handoff", codex)
        # Union covers the required Codex public set.
        self.assertTrue(vp.REQUIRED_CODEX_ALIAS_TARGETS <= (portable | codex))

    def test_missing_public_alias_fails_naming_skill(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            # All required skills exist, but alias table omits "dispatch".
            skills = sorted(vp.REQUIRED_CODEX_ALIAS_TARGETS | {"hyperflow"})
            # Ensure every required skill has a SKILL.md so only the alias is missing.
            aliases = sorted(vp.REQUIRED_CODEX_ALIAS_TARGETS - {"dispatch"})
            root = _router_fixture(Path(tmp), skills=list(skills), alias_targets=aliases)
            errors = vp.check_router_closure(
                root,
                required_aliases=vp.REQUIRED_CODEX_ALIAS_TARGETS,
                required_transitions=(),
            )
            joined = "\n".join(errors)
            self.assertTrue(
                any("missing public alias" in e and "dispatch" in e for e in errors),
                msg=joined,
            )

    def test_stale_scope_to_dispatch_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            skills = sorted(vp.REQUIRED_CODEX_ALIAS_TARGETS)
            root = _router_fixture(
                Path(tmp),
                skills=skills,
                alias_targets=skills,
            )
            # Inject retired chain transition as an active required edge.
            errors = vp.check_router_closure(
                root,
                required_aliases=frozenset(skills),
                required_transitions=(("scope", "dispatch"),),
            )
            joined = "\n".join(errors)
            self.assertTrue(
                any("scope" in e and "dispatch" in e for e in errors),
                msg=joined,
            )
            self.assertTrue(
                any("retired" in e for e in errors),
                msg=joined,
            )

    def test_stale_chain_edge_in_docs_when_scan_enabled(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            skills = sorted(vp.REQUIRED_CODEX_ALIAS_TARGETS)
            root = _router_fixture(Path(tmp), skills=skills, alias_targets=skills)
            # Append historical chain prose into session-start.
            ss = root / "hooks" / "session-start"
            ss.write_text(
                ss.read_text(encoding="utf-8")
                + "\n# chain\n`scaffold` → `spec` → `scope` → `dispatch`\n",
                encoding="utf-8",
            )
            errors = vp.check_router_closure(
                root,
                required_aliases=frozenset(skills),
                required_transitions=(),
                scan_chain_docs=True,
            )
            joined = "\n".join(errors)
            self.assertTrue(
                any("stale chain edge" in e and "scope" in e for e in errors),
                msg=joined,
            )

    def test_unresolved_alias_target_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            skills = ["plan", "dispatch"]
            root = _router_fixture(
                Path(tmp),
                skills=skills,
                alias_targets=["plan", "dispatch", "not-a-skill"],
            )
            errors = vp.check_router_closure(
                root,
                required_aliases=frozenset(skills),
                required_transitions=(),
            )
            self.assertTrue(
                any("unresolved skill 'not-a-skill'" in e for e in errors),
                msg="\n".join(errors),
            )

    def test_retired_skill_name_as_public_skill_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            skills = ["plan", "scope"]
            root = _router_fixture(
                Path(tmp),
                skills=skills,
                alias_targets=["plan"],
            )
            errors = vp.check_router_closure(
                root,
                required_aliases=frozenset({"plan"}),
                required_transitions=(),
            )
            self.assertTrue(
                any("retired skill name 'scope'" in e for e in errors),
                msg="\n".join(errors),
            )

    def test_required_chain_transitions_resolve_on_live_repo(self) -> None:
        skills = vp.public_skill_names(REPO_ROOT)
        for src, dst in vp.REQUIRED_CHAIN_TRANSITIONS:
            self.assertIn(src, skills, msg=f"missing chain source skill {src}")
            self.assertIn(dst, skills, msg=f"missing chain target skill {dst}")
            self.assertNotIn(src, vp.RETIRED_SKILL_TARGETS)
            self.assertNotIn(dst, vp.RETIRED_SKILL_TARGETS)


if __name__ == "__main__":
    unittest.main()
