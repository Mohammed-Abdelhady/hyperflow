"""Handoff package shape round-trip (fixture-based)."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path


REQUIRED = ("HANDOFF.md", "STATUS")


class TestHandoffRoundtrip(unittest.TestCase):
    def test_minimal_handoff_pack_shape(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / ".hyperflow-handoff" / "demo-slug"
            root.mkdir(parents=True)
            (root / "HANDOFF.md").write_text("# Handoff\n\nslug: demo-slug\n", encoding="utf-8")
            (root / "STATUS").write_text("planned\n", encoding="utf-8")
            art = root / "artefact" / "specs"
            art.mkdir(parents=True)
            (art / "demo-slug.md").write_text("# Spec\n", encoding="utf-8")
            for name in REQUIRED:
                self.assertTrue((root / name).is_file(), name)
            # round-trip: re-read STATUS
            self.assertEqual((root / "STATUS").read_text(encoding="utf-8").strip(), "planned")

    def test_repo_documents_handoff(self) -> None:
        root = Path(__file__).resolve().parents[1]
        readme = (root / "README.md").read_text(encoding="utf-8")
        self.assertIn("handoff", readme.lower())
        self.assertTrue((root / "skills" / "handoff" / "SKILL.md").is_file())


if __name__ == "__main__":
    unittest.main()
