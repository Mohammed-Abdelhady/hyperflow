"""Tests for the compact-JSON artefact writer + validator."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = REPO_ROOT / "scripts"


def _load(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


artefact = _load("artefact", "artefact.py")
lib = _load("artefact_lib", "artefact_lib.py")


def _sample(art_type: str) -> dict:
    return json.loads((REPO_ROOT / "viewer" / "samples" / f"{art_type}.json").read_text(encoding="utf-8"))


def _payload(art_type: str) -> dict:
    return _sample(art_type)["payload"]


class WriterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def _write(self, art_type: str, slug: str, payload: dict, extra: list[str] | None = None) -> int:
        pf = self.root / "payload.json"
        pf.write_text(json.dumps(payload), encoding="utf-8")
        argv = ["artefact.py", "write", art_type, slug, "--title", "T", "--status", "s",
                "--project-root", str(self.root), "--payload", str(pf)] + (extra or [])
        return artefact.main(argv)

    def test_all_samples_validate(self) -> None:
        schema = lib.load_schema(REPO_ROOT / "config")
        for art_type in lib.TYPES:
            env = _sample(art_type)
            self.assertEqual(lib.validate_envelope(env, schema), [], art_type)

    def test_valid_write_creates_json_and_stub(self) -> None:
        self.assertEqual(self._write("spec", "demo", _payload("spec")), 0)
        jp = lib.artefact_json_path(self.root, "spec", "demo")
        self.assertTrue(jp.exists())
        env = json.loads(jp.read_text())
        self.assertEqual(env["hf"], 1)
        self.assertTrue(env["created"] and env["updated"])
        stub = lib.stub_path(self.root, "spec", "demo")
        self.assertIn("hyperflow view demo", stub.read_text())

    def test_created_preserved_on_update(self) -> None:
        self._write("spec", "demo", _payload("spec"))
        jp = lib.artefact_json_path(self.root, "spec", "demo")
        original = json.loads(jp.read_text())
        original["created"] = "2000-01-01"
        jp.write_text(json.dumps(original), encoding="utf-8")
        self._write("spec", "demo", _payload("spec"))
        self.assertEqual(json.loads(jp.read_text())["created"], "2000-01-01")

    def test_invalid_payload_rejected(self) -> None:
        rc = self._write("memory", "bad", {"entries": [{"title": "x", "task": "y"}]})
        self.assertEqual(rc, 2)
        self.assertFalse(lib.artefact_json_path(self.root, "memory", "bad").exists())

    def test_oversize_payload_rejected(self) -> None:
        big = {"entries": [{"title": "x", "task": "y", "decision": "z" * 2_000_000}]}
        self.assertEqual(self._write("memory", "big", big), 3)

    def test_no_stub_flag(self) -> None:
        self.assertEqual(self._write("audit", "a1", _payload("audit"), ["--no-stub"]), 0)
        self.assertTrue(lib.artefact_json_path(self.root, "audit", "a1").exists())
        self.assertFalse(lib.stub_path(self.root, "audit", "a1").exists())

    def test_check_passes_then_flags_missing_stub(self) -> None:
        self._write("spec", "demo", _payload("spec"))
        self.assertEqual(artefact.main(["artefact.py", "check", "--project-root", str(self.root)]), 0)
        lib.stub_path(self.root, "spec", "demo").unlink()
        self.assertEqual(artefact.main(["artefact.py", "check", "--project-root", str(self.root)]), 1)

    def test_writer_has_no_network_imports(self) -> None:
        for name in ("artefact.py", "artefact_lib.py", "render-artefact.py"):
            src = (SCRIPTS / name).read_text()
            for banned in ("import socket", "import http", "import urllib", "import requests", "import ftplib"):
                self.assertNotIn(banned, src, f"{name} must not import networking ({banned})")


if __name__ == "__main__":
    unittest.main()
