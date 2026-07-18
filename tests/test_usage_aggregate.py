"""Tests for usage-aggregate.py — the cross-chain ledger rollup feeding the
telemetry view."""

from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT = REPO_ROOT / "scripts" / "usage-aggregate.py"


def _load():
    spec = importlib.util.spec_from_file_location("usage_aggregate", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ua = _load()

_RECORDS = [
    {"chain_id": "c1", "phase": "execution", "attempt": 1, "input_tokens": 1000, "output_tokens": 500, "total_tokens": 1500, "cached_input_tokens": 300, "context_hash": "aaa", "context_tokens": 200, "accepted_commit": True},
    {"chain_id": "c1", "phase": "review", "attempt": 1, "input_tokens": 800, "output_tokens": 200, "total_tokens": 1000, "cached_input_tokens": 400, "context_hash": "aaa", "context_tokens": 200, "accepted_commit": False},
    {"chain_id": "c1", "phase": "execution", "attempt": 2, "input_tokens": 600, "output_tokens": 300, "total_tokens": 900, "cached_input_tokens": 0, "context_hash": "bbb", "context_tokens": 100, "accepted_commit": True},
]


class AggregateTests(unittest.TestCase):
    def _root(self, tmp: str) -> Path:
        root = Path(tmp)
        u = root / ".hyperflow" / "usage"
        u.mkdir(parents=True)
        (u / "demo.jsonl").write_text("\n".join(json.dumps(r) for r in _RECORDS) + "\n", encoding="utf-8")
        return root

    def test_totals_and_ratios(self) -> None:
        with TemporaryDirectory() as tmp:
            p = ua.aggregate(self._root(tmp))
            self.assertEqual(p["totals"]["agents"], 3)
            self.assertEqual(p["totals"]["tokens"], 3400)
            self.assertEqual(p["totals"]["acceptedCommits"], 2)
            self.assertEqual(p["totals"]["tokensPerCommit"], 1700)
            self.assertEqual(p["ratios"]["retryCost"], 900)         # attempt>1 tokens
            self.assertAlmostEqual(p["ratios"]["cacheHit"], 700 / 2400, places=3)
            # duplicate context: second 'aaa' record's context_tokens counted
            self.assertAlmostEqual(p["ratios"]["duplicateContext"], 200 / 3400, places=3)

    def test_phase_and_chain_grouping(self) -> None:
        with TemporaryDirectory() as tmp:
            p = ua.aggregate(self._root(tmp))
            phases = {ph["name"]: ph for ph in p["phases"]}
            self.assertEqual(phases["execution"]["agents"], 2)
            self.assertEqual(phases["execution"]["tokens"], 2400)
            self.assertEqual(p["chains"][0], {"id": "c1", "tokens": 3400, "commits": 2})

    def test_empty_ledger_is_zeroed_not_crashed(self) -> None:
        with TemporaryDirectory() as tmp:
            p = ua.aggregate(Path(tmp))  # no .hyperflow/usage at all
            self.assertEqual(p["totals"]["agents"], 0)
            self.assertEqual(p["totals"]["tokensPerCommit"], 0)  # no divide-by-zero

    def test_malformed_line_skipped(self) -> None:
        with TemporaryDirectory() as tmp:
            root = self._root(tmp)
            with (root / ".hyperflow" / "usage" / "demo.jsonl").open("a") as f:
                f.write("{ not json\n")
            p = ua.aggregate(root)
            self.assertEqual(p["totals"]["agents"], 3)  # bad line skipped, valid ones counted


if __name__ == "__main__":
    unittest.main()
