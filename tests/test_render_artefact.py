"""Tests for render-artefact.py — JSON -> full markdown rehydration."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = REPO_ROOT / "scripts"
SAMPLES = REPO_ROOT / "viewer" / "samples"


def _load(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


render = _load("render_artefact", "render-artefact.py")
# Reuse the exact artefact_lib module render.py imported, so exception classes
# match under assertRaises (importlib would otherwise create a second copy).
lib = render.lib


def _sample(art_type: str) -> dict:
    return json.loads((SAMPLES / f"{art_type}.json").read_text(encoding="utf-8"))


class RenderTests(unittest.TestCase):
    def test_every_type_renders_nonempty(self) -> None:
        for art_type in lib.TYPES:
            env = _sample(art_type)
            md = render.render(env)
            self.assertTrue(md.strip(), art_type)
            self.assertIn(env["title"], md, art_type)

    def test_spec_has_all_sections(self) -> None:
        env = _sample("spec")
        md = render.render(env)
        for marker in ("## TL;DR", "## 1. Architecture", "## 2. Data flow",
                       "## 3. Key decisions", "## 4. Edge cases", "## 5. File structure", "```mermaid"):
            self.assertIn(marker, md)

    def test_task_roster_and_scope(self) -> None:
        md = render.render(_sample("task"))
        self.assertIn("## Scope at a glance", md)
        self.assertIn("## Execution plan", md)
        self.assertIn("Brief:", md)

    def test_task_fidelity_status_and_cost(self) -> None:
        # artefact-format.md status-block metrics + cost table + brief bodies + scope total
        md = render.render(_sample("task"))
        self.assertIn("| Progress |", md)
        self.assertIn("| Branch |", md)
        self.assertIn("| Commits |", md)
        self.assertIn("**Total**", md)
        self.assertIn("## Estimated cost", md)
        self.assertIn("## Briefs", md)

    def test_usage_renders(self) -> None:
        md = render.render(_sample("usage"))
        self.assertIn("tokens/commit", md)
        self.assertIn("## Phases", md)

    def test_memory_roundtrip_preserves_decision(self) -> None:
        env = _sample("memory")
        md = render.render(env)
        for entry in env["payload"]["entries"]:
            self.assertIn(entry["decision"], md)
            self.assertIn(entry["title"], md)

    def test_audit_orders_severity(self) -> None:
        md = render.render(_sample("audit"))
        self.assertLess(md.index("[Important]"), md.index("[Praise]"))

    def test_unknown_type_raises(self) -> None:
        with self.assertRaises(lib.ArtefactError):
            render.render({"type": "nope", "title": "x", "payload": {}})

    def test_all_rehydrates_stubs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            # seed one spec artefact JSON where the writer would put it
            env = _sample("spec")
            jp = lib.artefact_json_path(root, "spec", "demo")
            jp.parent.mkdir(parents=True, exist_ok=True)
            env["slug"] = "demo"
            jp.write_text(json.dumps(env), encoding="utf-8")
            rc = render.main(["render-artefact.py", "--all", "--project-root", str(root)])
            self.assertEqual(rc, 0)
            stub = lib.stub_path(root, "spec", "demo")
            self.assertIn("## 1. Architecture", stub.read_text())


if __name__ == "__main__":
    unittest.main()
