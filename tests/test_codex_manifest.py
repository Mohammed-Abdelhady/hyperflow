"""Codex plugin manifest contract: schema, paths, versions, hooks."""

from __future__ import annotations

import importlib.util
import json
import re
import shutil
import subprocess
import sys
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


def _minimal_plugin_tree(tmp: Path, *, version: str = "5.14.0", hooks: str | None = "./hooks/hooks.json") -> Path:
    """Scaffold a tiny plugin root sufficient for check_codex_manifest."""
    root = tmp / "plugin"
    root.mkdir()
    skills = root / "skills" / "plan"
    skills.mkdir(parents=True)
    _write(skills / "SKILL.md", "---\nname: plan\ndescription: plan\n---\n# plan\n")
    hyperflow = root / "skills" / "hyperflow"
    hyperflow.mkdir(parents=True)
    _write(hyperflow / "VERSION", version + "\n")
    _write(
        hyperflow / "SKILL.md",
        "---\nname: hyperflow\ndescription: doctrine\n---\n# Hyperflow\n\n"
        "| User says | Run |\n|---|---|\n| `/hyperflow:plan` | `plan` |\n",
    )

    hooks_dir = root / "hooks"
    hooks_dir.mkdir()
    _write(hooks_dir / "session-start", "#!/bin/sh\n")
    _write(hooks_dir / "pre-compact", "#!/bin/sh\n")
    _write(
        hooks_dir / "hooks.json",
        json.dumps(
            {
                "hooks": {
                    "SessionStart": [
                        {
                            "hooks": [
                                {
                                    "type": "command",
                                    "command": "sh -c 'hook=session-start; exec \"$root/hooks/$hook\"'",
                                }
                            ]
                        }
                    ],
                    "PreCompact": [
                        {
                            "hooks": [
                                {
                                    "type": "command",
                                    "command": "sh -c 'hook=pre-compact; exec \"$root/hooks/$hook\"'",
                                }
                            ]
                        }
                    ],
                }
            }
        ),
    )

    interface = {
        "displayName": "Hyperflow",
        "shortDescription": "short",
        "longDescription": "long",
        "developerName": "Dev",
        "category": "Engineering",
        "capabilities": ["Interactive"],
        "websiteURL": "https://example.com",
        "defaultPrompt": ["do work"],
        "brandColor": "#2EA39F",
        "screenshots": [],
    }
    manifest: dict = {
        "name": "hyperflow",
        "version": version,
        "description": "test plugin",
        "author": {"name": "Tester"},
        "homepage": "https://example.com",
        "repository": "https://example.com/repo",
        "license": "MIT",
        "keywords": ["codex"],
        "skills": "./skills/",
        "interface": interface,
    }
    if hooks is not None:
        manifest["hooks"] = hooks
    _write(root / ".codex-plugin" / "plugin.json", json.dumps(manifest, indent=2) + "\n")

    # Version parity surfaces
    _write(
        root / "package.json",
        json.dumps({"name": "hyperflow", "version": version}) + "\n",
    )
    _write(
        root / ".claude-plugin" / "plugin.json",
        json.dumps(
            {
                "name": "hyperflow",
                "version": version,
                "description": "claude",
                "author": {"name": "Tester"},
                "homepage": "https://example.com",
                "repository": "https://example.com/repo",
                "license": "MIT",
            }
        )
        + "\n",
    )
    _write(
        root / ".claude-plugin" / "marketplace.json",
        json.dumps(
            {
                "plugins": [
                    {
                        "name": "hyperflow",
                        "version": version,
                        "source": "./",
                        "description": "x",
                    }
                ]
            }
        )
        + "\n",
    )
    _write(
        root / "config" / "features.json",
        json.dumps({"version": version, "skills": [{"name": "plan", "command": "/hyperflow:plan"}]})
        + "\n",
    )
    # Copy derived schema from the real repo so validate_against_schema runs.
    schema_src = REPO_ROOT / "config" / "codex-plugin.schema.json"
    schema_dst = root / "config" / "codex-plugin.schema.json"
    schema_dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(schema_src, schema_dst)
    return root


class CodexManifestTests(unittest.TestCase):
    def test_current_manifest_passes_schema_and_paths(self) -> None:
        errors = vp.check_codex_manifest(REPO_ROOT)
        self.assertEqual(errors, [], msg="\n".join(errors))

    def test_schema_provenance_is_derived_not_official(self) -> None:
        schema = json.loads(
            (REPO_ROOT / "config" / "codex-plugin.schema.json").read_text(encoding="utf-8")
        )
        comment = schema.get("$comment", "")
        self.assertIsInstance(comment, str)
        self.assertIn("DERIVED", comment.upper())
        self.assertRegex(comment, r"not an official|NOT an official|never label", re.I)
        # Must not claim to be the official OpenAI schema without disclaimer.
        self.assertNotRegex(comment, r"(?i)^official\b")

    def test_escaping_path_fails_containment(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _minimal_plugin_tree(Path(tmp))
            manifest_path = root / ".codex-plugin" / "plugin.json"
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            data["skills"] = "../outside"
            manifest_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
            errors = vp.check_codex_manifest(root)
            joined = "\n".join(errors)
            self.assertTrue(
                any("escapes" in e or "must start with" in e for e in errors),
                msg=joined,
            )

    def test_dotdot_inside_relative_path_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _minimal_plugin_tree(Path(tmp))
            manifest_path = root / ".codex-plugin" / "plugin.json"
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            data["skills"] = "./skills/../../outside"
            manifest_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
            errors = vp.plugin_path_errors(root, data["skills"], "skills")
            self.assertTrue(any("escapes" in e for e in errors), msg=errors)

    def test_version_drift_fails_with_both_values(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _minimal_plugin_tree(Path(tmp), version="5.14.0")
            # Drift Codex manifest only.
            manifest_path = root / ".codex-plugin" / "plugin.json"
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            data["version"] = "9.9.9"
            manifest_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
            errors = vp.version_parity_errors(root)
            joined = "\n".join(errors)
            self.assertTrue(any("drift" in e for e in errors), msg=joined)
            self.assertIn("5.14.0", joined)
            self.assertIn("9.9.9", joined)

    def test_missing_hooks_field_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _minimal_plugin_tree(Path(tmp), hooks=None)
            errors = vp.check_codex_manifest(root)
            self.assertTrue(
                any("hooks" in e and "missing" in e for e in errors),
                msg="\n".join(errors),
            )

    def test_hooks_sh_c_extracts_and_requires_scripts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _minimal_plugin_tree(Path(tmp))
            # Drop session-start — sh -c extractor must still notice.
            (root / "hooks" / "session-start").unlink()
            errors = vp.check_hooks_at(root)
            joined = "\n".join(errors)
            self.assertIn("session-start", joined)

    def test_validate_plugin_integration_passes(self) -> None:
        result = subprocess.run(
            [sys.executable, str(VALIDATE)],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(
            result.returncode,
            0,
            msg=f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}",
        )
        self.assertIn("PASSED", result.stdout)


if __name__ == "__main__":
    unittest.main()
