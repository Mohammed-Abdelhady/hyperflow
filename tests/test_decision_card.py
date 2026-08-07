"""Regression tests for the deterministic decision-card memory writer."""
from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "decision-card.py"


def load_script():
    spec = importlib.util.spec_from_file_location("decision_card", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load decision-card.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


card = load_script()


class DecisionCardWriterTests(unittest.TestCase):
    def test_lock_creates_canonical_memory_entry(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            memory = Path(td) / ".hyperflow" / "memory"
            result = card.lock_decision(
                memory,
                title="Edge API framework",
                choice="Hono",
                why="It matches the existing runtime",
                revisit_if="The runtime changes",
                chooser="maintainer",
                locked_date="2026-08-07",
            )
            self.assertTrue(result["ok"])
            text = (memory / "decisions.md").read_text(encoding="utf-8")
            self.assertIn("# Decisions", text)
            self.assertIn("### [2026-08-07] Edge API framework  `[decision]`", text)
            self.assertIn("- Choice: Hono", text)
            self.assertIn("- Revisit if: The runtime changes", text)
            self.assertTrue(card.validate_memory(memory)["ok"])

    def test_lock_defaults_to_today_and_is_index_compatible(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            memory = Path(td) / "memory"
            card.lock_decision(
                memory,
                title="Storage shape",
                choice="SQLite",
                why="Small deployment footprint",
                revisit_if="Scale requirements change",
            )
            text = (memory / "decisions.md").read_text(encoding="utf-8")
            self.assertIn(f"### [{date.today().isoformat()}] Storage shape", text)
            self.assertEqual(card.existing_titles(text), {"storage shape"})

    def test_duplicate_title_fails_closed_case_insensitive(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            memory = Path(td) / "memory"
            kwargs = dict(
                title="Auth provider",
                choice="Local sessions",
                why="No external dependency",
                revisit_if="The threat model changes",
            )
            card.lock_decision(memory, **kwargs)
            with self.assertRaises(card.DecisionCardError):
                card.lock_decision(memory, **{**kwargs, "title": "AUTH PROVIDER"})
            text = (memory / "decisions.md").read_text(encoding="utf-8")
            self.assertEqual(text.count("Auth provider"), 1)

    def test_invalid_input_does_not_create_or_mutate_memory(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            memory = Path(td) / "memory"
            with self.assertRaises(card.DecisionCardError):
                card.lock_decision(
                    memory,
                    title="Bad\nheading",
                    choice="A",
                    why="Because",
                    revisit_if="Never",
                )
            self.assertFalse(memory.exists())

    def test_invalid_date_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaises(card.DecisionCardError):
                card.lock_decision(
                    Path(td) / "memory",
                    title="Date test",
                    choice="A",
                    why="Because",
                    revisit_if="Never",
                    locked_date="2026-02-30",
                )

    def test_duplicate_existing_titles_are_reported_by_validate(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            memory = Path(td) / "memory"
            memory.mkdir()
            (memory / "decisions.md").write_text(
                "# Decisions\n\n## Use Hono\n- Choice: yes\n\n### [2026-08-07] use hono `[decision]`\n",
                encoding="utf-8",
            )
            result = card.validate_memory(memory)
            self.assertFalse(result["ok"])
            self.assertEqual(result["duplicates"], ["use hono"])

    def test_cli_json_is_machine_readable(self) -> None:
        import subprocess

        with tempfile.TemporaryDirectory() as td:
            memory = Path(td) / "memory"
            proc = subprocess.run(
                [
                    "python3",
                    str(SCRIPT),
                    "lock",
                    "--memory-dir",
                    str(memory),
                    "--title",
                    "CLI choice",
                    "--choice",
                    "A",
                    "--why",
                    "Because",
                    "--revisit-if",
                    "Requirements change",
                    "--json",
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            payload = json.loads(proc.stdout)
            self.assertTrue(payload["ok"])
            self.assertEqual(payload["tag"], "decision")


if __name__ == "__main__":
    unittest.main()
