from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATUS = ROOT / "scripts" / "status.py"


def _run(*args: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(STATUS), *args],
        cwd=cwd or ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


class TestStatusScript(unittest.TestCase):
    def test_empty_project(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / ".hyperflow").mkdir()
            r = _run("--root", str(root))
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertIn("Hyperflow Status", r.stdout)
            self.assertIn("Active tasks  (none)", r.stdout)
            self.assertIn("[capabilities]", r.stdout)

    def test_inflight_task_progress_and_resume(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            tasks = root / ".hyperflow" / "tasks"
            tasks.mkdir(parents=True)
            (root / ".hyperflow" / "memory").mkdir(parents=True)
            (root / ".hyperflow" / "memory" / "decisions.md").write_text(
                "# Decisions\n\n## Use Hono\nlocked\n",
                encoding="utf-8",
            )
            (tasks / "implement-auth.md").write_text(
                """# implement-auth

## Status

| Field | Value |
|---|---|
| Status | in_progress |
| Progress | `████░░░░░░░░░░░░░░░░` 2 / 5 sub-tasks (40%) |
| Wall-clock | 4m elapsed · ETA ~6m |
| Tokens | 3 agents · 12.0k total · execution 8.0k · review 4.0k · verification 0 |

## Batches

### Batch 1 — foundation
- [x] T1: models
- [x] T2: migrations

### Batch 2 — handlers
- [~] T3: login handler
- [ ] T4: logout
- [ ] T5: session

WORKER_ABORT: implementer · tool timeout
""",
                encoding="utf-8",
            )
            r = _run("--root", str(root), "--resume")
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertIn("Task:         implement-auth", r.stdout)
            self.assertIn("2/5", r.stdout)
            self.assertIn("DISPATCH_RESUME", r.stdout)
            self.assertIn("slug: implement-auth", r.stdout)
            self.assertIn("failed_at: worker", r.stdout)
            self.assertIn("finished_batches: 1", r.stdout)
            self.assertIn("memory_ok: yes", r.stdout)
            self.assertIn("T3: login handler", r.stdout)

    def test_completed_task_no_resume_need(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            tasks = root / ".hyperflow" / "tasks"
            tasks.mkdir(parents=True)
            (tasks / "done-thing.md").write_text(
                """## Status

| Field | Value |
|---|---|
| Status | completed |
| Progress | 3 / 3 sub-tasks |

## Tasks
- [x] a
- [x] b
- [x] c
""",
                encoding="utf-8",
            )
            r = _run("--root", str(root), "--resume-only")
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertIn("slug: (none)", r.stdout)

    def test_json_mode(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            tasks = root / ".hyperflow" / "tasks"
            tasks.mkdir(parents=True)
            (tasks / "x.md").write_text(
                "## Status\n\n| Status | pending |\n\n- [ ] only\n",
                encoding="utf-8",
            )
            r = _run("--root", str(root), "--json")
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            data = json.loads(r.stdout)
            self.assertEqual(data["active_tasks"], 1)
            self.assertEqual(data["tasks"][0]["slug"], "x")
            self.assertTrue(data["resume"])

    def test_legacy_checkbox_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            tasks = root / ".hyperflow" / "tasks"
            tasks.mkdir(parents=True)
            (tasks / "legacy.md").write_text(
                "# legacy\n\n- [x] one\n- [ ] two\n- [ ] three\n",
                encoding="utf-8",
            )
            r = _run("--root", str(root), "--json")
            self.assertEqual(r.returncode, 0)
            data = json.loads(r.stdout)
            t = data["tasks"][0]
            self.assertEqual(t["done"], 1)
            self.assertEqual(t["total"], 3)
            self.assertEqual(t["pending"], 2)

    def test_never_writes(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            hf = root / ".hyperflow"
            hf.mkdir()
            before = {p.name for p in hf.iterdir()}
            _run("--root", str(root), "--resume")
            after = {p.name for p in hf.iterdir()}
            self.assertEqual(before, after)

    def test_memory_ok_polarity_conflict(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            tasks = root / ".hyperflow" / "tasks"
            mem = root / ".hyperflow" / "memory"
            tasks.mkdir(parents=True)
            mem.mkdir(parents=True)
            (mem / "decisions.md").write_text(
                "## Use Hono\nlocked\n\n## Avoid Hono\nold note\n",
                encoding="utf-8",
            )
            (tasks / "t.md").write_text(
                "## Status\n\n| Status | in_progress |\n| Progress | 0 / 1 |\n\n- [ ] a\n",
                encoding="utf-8",
            )
            r = _run("--root", str(root), "--resume-only")
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertIn("memory_ok: review memory", r.stdout)
            self.assertIn("polarity", r.stdout.lower())

    def test_feature_phase_progress_and_resume(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            feat = root / ".hyperflow" / "features" / "checkout-redesign"
            p1 = feat / "phase-1-data-layer"
            p2 = feat / "phase-2-api"
            p3 = feat / "phase-3-ui"
            for d in (p1, p2, p3):
                d.mkdir(parents=True)
            (feat / "feature.md").write_text(
                """# Feature: checkout

## Status

| Field | Value |
|---|---|
| Status | in_progress |
| Branch | `feat/checkout-redesign` |
""",
                encoding="utf-8",
            )
            (p1 / "phase.md").write_text(
                """## Status

| Status | completed |
| Progress | 2 / 2 tasks |

## Tasks
- [x] T1 models
- [x] T2 migrations
""",
                encoding="utf-8",
            )
            (p2 / "phase.md").write_text(
                """## Status

| Status | in_progress |
| Progress | 2 / 5 tasks (40%) |
| Depends on | phase-1-data-layer |

## Exit criteria
- [ ] API green

## Tasks
- [x] T1 routes
- [x] T2 schemas
- [~] T3 handlers
- [ ] T4 auth
- [ ] T5 tests
""",
                encoding="utf-8",
            )
            (p3 / "phase.md").write_text(
                """## Status

| Status | pending |
| Depends on | phase-2-api |

## Tasks
- [ ] UI shell
""",
                encoding="utf-8",
            )
            r = _run("--root", str(root), "--resume")
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertIn("Feature: checkout-redesign", r.stdout)
            self.assertIn("1 / 3 phases", r.stdout)
            self.assertIn("phase-2-api", r.stdout)
            self.assertIn("2/5", r.stdout)
            self.assertIn("running: T3 handlers", r.stdout)
            self.assertIn("depends on phase-2-api", r.stdout)
            self.assertIn("DISPATCH_RESUME", r.stdout)
            self.assertIn("slug: checkout-redesign", r.stdout)
            self.assertIn("phase: phase-2-api", r.stdout)
            self.assertIn("finished_batches: 1", r.stdout)

            j = _run("--root", str(root), "--json")
            self.assertEqual(j.returncode, 0, j.stdout + j.stderr)
            data = json.loads(j.stdout)
            self.assertEqual(len(data["features"]), 1)
            feat_j = data["features"][0]
            self.assertEqual(feat_j["current_phase"], "phase-2-api")
            self.assertTrue(feat_j["needs_resume"])
            p2j = next(p for p in feat_j["phases"] if p["name"] == "phase-2-api")
            self.assertEqual(p2j["done"], 2)
            self.assertEqual(p2j["total"], 5)
            self.assertEqual(p2j["running"], "T3 handlers")
            self.assertEqual(p2j["exit_criteria_open"], 1)

    def test_feature_phase_tasks_dir(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            phase = root / ".hyperflow" / "features" / "f" / "phase-1-core"
            tasks = phase / "tasks"
            tasks.mkdir(parents=True)
            (root / ".hyperflow" / "features" / "f" / "feature.md").write_text(
                "## Status\n\n| Status | in_progress |\n",
                encoding="utf-8",
            )
            (phase / "phase.md").write_text(
                "## Status\n\n| Status | in_progress |\n",
                encoding="utf-8",
            )
            (tasks / "T1-a.md").write_text(
                "## Status\n\n| Status | completed |\n", encoding="utf-8"
            )
            (tasks / "T2-b.md").write_text(
                "## Status\n\n| Status | in_progress |\n\n- [~] mid\n",
                encoding="utf-8",
            )
            (tasks / "T3-c.md").write_text(
                "## Status\n\n| Status | pending |\n", encoding="utf-8"
            )
            r = _run("--root", str(root), "--json")
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            data = json.loads(r.stdout)
            p = data["features"][0]["phases"][0]
            self.assertEqual(p["done"], 1)
            self.assertEqual(p["total"], 3)
            self.assertEqual(p["pending"], 1)
            self.assertIn("mid", p["running"] or "")

    def test_background_agents_key_and_timeout_stall(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            bg = root / ".hyperflow" / "background"
            bg.mkdir(parents=True)
            (root / ".hyperflow").mkdir(exist_ok=True)
            (bg / "registry.json").write_text(
                json.dumps(
                    {
                        "agents": [
                            {
                                "id": "bg-1-gates",
                                "purpose": "Layer 5 quality gates",
                                "status": "running",
                                "fired_at": "2020-01-01T00:00:00Z",
                                "timeout_at": "2020-01-01T00:30:00Z",
                                "output_buffer": ".hyperflow/background/bg-1-gates.md",
                                "blocks_step": None,
                            },
                            {
                                "id": "bg-2-ci",
                                "purpose": "CI watcher",
                                "status": "complete",
                                "collected": False,
                                "output_buffer": ".hyperflow/background/bg-2-ci.md",
                            },
                            {
                                "id": "bg-3-ok",
                                "purpose": "still running",
                                "status": "running",
                                "timeout_at": "2099-01-01T00:00:00Z",
                            },
                        ]
                    }
                ),
                encoding="utf-8",
            )
            r = _run("--root", str(root), "--json")
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            data = json.loads(r.stdout)
            bgj = data["background"]
            self.assertIsInstance(bgj, dict)
            self.assertEqual(bgj["counts"]["stalled"], 1)
            self.assertEqual(bgj["counts"]["uncollected"], 1)
            self.assertEqual(bgj["counts"]["running"], 1)
            ids = {a["id"]: a["status"] for a in bgj["agents"]}
            self.assertEqual(ids["bg-1-gates"], "stalled")
            self.assertEqual(ids["bg-2-ci"], "uncollected")
            self.assertEqual(ids["bg-3-ok"], "running")

            text = _run("--root", str(root))
            self.assertEqual(text.returncode, 0, text.stdout + text.stderr)
            self.assertIn("Background", text.stdout)
            self.assertIn("1 running", text.stdout)
            self.assertIn("1 uncollected", text.stdout)
            self.assertIn("1 stalled", text.stdout)
            self.assertIn("bg-1-gates", text.stdout)

    def test_background_legacy_jobs_key(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            bg = root / ".hyperflow" / "background"
            bg.mkdir(parents=True)
            (bg / "registry.json").write_text(
                json.dumps({"jobs": [{"id": "j1", "status": "running", "purpose": "x"}]}),
                encoding="utf-8",
            )
            r = _run("--root", str(root), "--json")
            data = json.loads(r.stdout)
            self.assertEqual(data["background"]["counts"]["running"], 1)


if __name__ == "__main__":
    unittest.main()
