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


if __name__ == "__main__":
    unittest.main()
