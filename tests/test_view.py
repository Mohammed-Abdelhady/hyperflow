"""Tests for view.py — the local artefact viewer server (127.0.0.1 only)."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT = REPO_ROOT / "scripts" / "view.py"


def _load():
    spec = importlib.util.spec_from_file_location("view", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


view = _load()


def _handler(artefacts_root: Path):
    h = view._Handler.__new__(view._Handler)  # skip socket-bound __init__
    view._Handler.artefacts_root = artefacts_root
    return h


class ViewTests(unittest.TestCase):
    def test_bind_host_is_loopback(self) -> None:
        self.assertEqual(view.BIND_HOST, "127.0.0.1")
        # no code literal binds 0.0.0.0 (the docstring may name it as forbidden)
        self.assertNotIn('"0.0.0.0"', SCRIPT.read_text())
        self.assertNotIn("'0.0.0.0'", SCRIPT.read_text())

    def test_bind_uses_loopback_and_falls_back_on_busy_port(self) -> None:
        first, port = view._bind(view._default_port(), view._Handler)
        try:
            self.assertEqual(first.server_address[0], "127.0.0.1")
            second, port2 = view._bind(port, view._Handler)  # port now busy
            try:
                self.assertNotEqual(port, port2)
            finally:
                second.server_close()
        finally:
            first.server_close()

    def test_artefacts_root_defaults_to_project(self) -> None:
        root = view.resolve_artefacts_root(Path("/proj"), None)
        self.assertEqual(root, Path("/proj") / ".hyperflow" / "artefacts")

    def test_artefacts_root_override_for_handoff_package(self) -> None:
        override = REPO_ROOT / ".hyperflow" / "artefacts"
        root = view.resolve_artefacts_root(Path("/proj"), str(override))
        self.assertEqual(root, override.resolve())

    def test_target_hash(self) -> None:
        self.assertEqual(view._target_hash(None, None), "gallery")
        self.assertEqual(view._target_hash("visual-artefacts", "spec"), "spec/visual-artefacts")
        self.assertEqual(view._target_hash("spec", None), "sample/spec")
        self.assertEqual(view._target_hash("my-plan", None), "spec/my-plan")

    def test_find_type_resolves_slug_to_its_type(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "artefacts"
            (root / "audit").mkdir(parents=True)
            (root / "audit" / "my-audit.json").write_text("{}", encoding="utf-8")
            self.assertEqual(view.find_type(root, "my-audit"), "audit")
            self.assertIsNone(view.find_type(root, "nope"))
            self.assertIsNone(view.find_type(root, "spec"))  # bare type name -> sample route

    def test_translate_path_serves_bundle(self) -> None:
        h = _handler(REPO_ROOT / ".hyperflow" / "artefacts")
        self.assertTrue(h.translate_path("/").endswith("viewer/index.html"))
        self.assertTrue(h.translate_path("/app.js").endswith("viewer/app.js"))

    def test_translate_path_aliases_artefacts(self) -> None:
        art = REPO_ROOT / ".hyperflow" / "artefacts"
        h = _handler(art)
        got = Path(h.translate_path("/artefacts/spec/demo.json"))
        self.assertEqual(got, (art / "spec" / "demo.json"))

    def test_translate_path_blocks_traversal(self) -> None:
        art = (REPO_ROOT / ".hyperflow" / "artefacts").resolve()
        h = _handler(art)
        # bundle-side traversal clamps inside viewer/
        escaped = Path(h.translate_path("/../../../../etc/passwd")).resolve()
        self.assertTrue(str(escaped).startswith(str(view.VIEWER_DIR.resolve())))
        # artefacts-side traversal clamps inside the artefacts root
        escaped2 = Path(h.translate_path("/artefacts/../../../../etc/passwd")).resolve()
        self.assertTrue(str(escaped2).startswith(str(art)))


if __name__ == "__main__":
    unittest.main()
