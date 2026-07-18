"""Tests for scripts/reap.py — scope-aware post-completion reaper.

Security-sensitive: slug validation, path-under-.hyperflow, dry-run zero
mutation, non-terminal refuse, and never-touch protected markers. Temp fixtures
only — never reaps real in-flight slugs.
"""

from __future__ import annotations

import importlib.util
import io
import json
import os
import sys
import time
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from tempfile import TemporaryDirectory

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT = REPO_ROOT / "scripts" / "reap.py"
DAY = 86400


def _load():
    spec = importlib.util.spec_from_file_location("reap", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


reap_mod = _load()


COMPLETED_TASK = """# Demo Task

## Status

| Field | Value |
|---|---|
| Status | completed |
| Progress | 100% |

## Goal

Done work.

## Learnings
- durable insight from completed task
"""

IN_PROGRESS_TASK = """# WIP Task

## Status

| Field | Value |
|---|---|
| Status | in_progress |

## Goal

Still running.
"""

STATE_COMPLETE_TASK = """| Status | Value |
|---|---|
| State | complete |
| Profile | deep |

# Token-efficient style
"""


class FixtureBase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.hf = self.root / ".hyperflow"
        for sub in (
            "tasks",
            "specs",
            "features",
            "memory",
            "artefacts/task",
            "usage",
            "background",
            "archive",
        ):
            (self.hf / sub).mkdir(parents=True, exist_ok=True)

    def _write_completed(self, slug: str = "demo-reap") -> str:
        task = self.hf / "tasks" / f"{slug}.md"
        task.write_text(COMPLETED_TASK, encoding="utf-8")
        brief = self.hf / "tasks" / slug
        brief.mkdir(exist_ok=True)
        (brief / "T1.md").write_text(
            "# T1\n\n## Learnings\n- from brief\n", encoding="utf-8"
        )
        twin = self.hf / "artefacts" / "task" / f"{slug}.json"
        twin.write_text(
            json.dumps({"type": "task", "slug": slug}) + "\n", encoding="utf-8"
        )
        (self.hf / "memory" / "learnings.md").write_text(
            "# Learnings\n\n"
            "### [2026-01-01] Keep me  `[durable]`\n"
            "**What:** a durable learning\n"
            "**Why it matters:** safety net\n"
            "**Evidence:** README.md:1\n",
            encoding="utf-8",
        )
        # Evidence target that exists under project root
        (self.root / "README.md").write_text("# hi\n", encoding="utf-8")
        return slug

    def _age(self, path: Path, days: float) -> None:
        ts = time.time() - days * DAY
        os.utime(path, (ts, ts))

    def _run_cli(self, *args: str) -> tuple[int, dict | None, str, str]:
        argv = ["reap.py", str(self.hf), *args]
        old = sys.argv
        out, err = io.StringIO(), io.StringIO()
        code = 0
        try:
            sys.argv = argv
            with redirect_stdout(out), redirect_stderr(err):
                code = reap_mod.main(argv)
        except SystemExit as exc:
            code = int(exc.code) if isinstance(exc.code, int) else 1
        finally:
            sys.argv = old
        payload = None
        text = out.getvalue().strip()
        if text:
            try:
                payload = json.loads(text.splitlines()[0])
            except json.JSONDecodeError:
                payload = None
        return code, payload, text, err.getvalue()


class TerminalDetectionTests(FixtureBase):
    def test_flat_status_completed(self) -> None:
        slug = self._write_completed("done-task")
        self.assertTrue(reap_mod.is_terminal(self.hf, slug))

    def test_state_complete_variant(self) -> None:
        (self.hf / "tasks" / "stateful.md").write_text(
            STATE_COMPLETE_TASK, encoding="utf-8"
        )
        self.assertTrue(reap_mod.flat_task_is_terminal(self.hf, "stateful"))

    def test_in_progress_not_terminal(self) -> None:
        (self.hf / "tasks" / "wip.md").write_text(IN_PROGRESS_TASK, encoding="utf-8")
        self.assertFalse(reap_mod.is_terminal(self.hf, "wip"))

    def test_feature_completed(self) -> None:
        fdir = self.hf / "features" / "feat-x"
        fdir.mkdir(parents=True)
        (fdir / "feature.md").write_text(
            "## Status\n\n| Status | completed |\n", encoding="utf-8"
        )
        self.assertTrue(reap_mod.is_terminal(self.hf, "feat-x"))


class CompletedReapTests(FixtureBase):
    def test_completed_task_archives_and_preserves_memory(self) -> None:
        slug = self._write_completed("done-demo")
        # Stale usage ledger
        usage = self.hf / "usage" / "old-chain.jsonl"
        usage.write_text('{"chain_id":"old-chain"}\n', encoding="utf-8")
        self._age(usage, 45)
        # Bloated session log
        log = self.hf / ".session-start.log"
        log.write_text("\n".join(f"line-{i}" for i in range(2500)) + "\n", encoding="utf-8")

        cfg = dict(reap_mod.DEFAULTS)
        cfg["usageRetentionDays"] = 30
        cfg["logMaxLines"] = 200
        cfg["compactionThreshold"] = 300
        report = reap_mod.reap(self.hf, slug, cfg=cfg)

        self.assertFalse(report["dryRun"])
        paths = {e["path"] for e in report["archived"]}
        self.assertIn("tasks/done-demo.md", paths)
        self.assertIn("tasks/done-demo", paths)
        self.assertIn("artefacts/task/done-demo.json", paths)
        self.assertFalse((self.hf / "tasks" / "done-demo.md").exists())
        self.assertFalse((self.hf / "tasks" / "done-demo").exists())
        self.assertFalse((self.hf / "artefacts" / "task" / "done-demo.json").exists())
        # Archived under .hyperflow/archive
        self.assertTrue(list((self.hf / "archive").rglob("done-demo.md")))
        # Memory durable content intact (promote may append more)
        learnings = (self.hf / "memory" / "learnings.md").read_text(encoding="utf-8")
        self.assertIn("a durable learning", learnings)
        self.assertIn("durable insight from completed task", learnings)
        # Ephemeral cleaned
        self.assertFalse(usage.exists())
        log_lines = (self.hf / ".session-start.log").read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(log_lines), 200)
        self.assertEqual(log_lines[-1], "line-2499")
        self.assertIn("deleted", report)
        self.assertIsInstance(report["bytesFreed"], int)
        self.assertGreaterEqual(report["bytesFreed"], 0)
        self.assertIn("memory", report)
        self.assertIn("indexRebuilt", report["memory"])
        self.assertIn("orphansDropped", report["memory"])
        self.assertIn("compacted", report["memory"])

    def test_e2e_report_shape(self) -> None:
        slug = self._write_completed("e2e-shape")
        report = reap_mod.reap(self.hf, slug, cfg=dict(reap_mod.DEFAULTS))
        for key in (
            "slug",
            "dryRun",
            "archived",
            "deleted",
            "bytesFreed",
            "memory",
            "skipped",
        ):
            self.assertIn(key, report)
        self.assertEqual(report["slug"], slug)
        self.assertIsInstance(report["archived"], list)
        self.assertIsInstance(report["deleted"], list)
        self.assertIsInstance(report["skipped"], list)
        self.assertIsInstance(report["memory"]["compacted"], list)


class NonTerminalTests(FixtureBase):
    def test_in_progress_skipped_without_force(self) -> None:
        (self.hf / "tasks" / "wip.md").write_text(IN_PROGRESS_TASK, encoding="utf-8")
        sentinel = self.hf / "tasks" / "wip.md"
        before = sentinel.read_text(encoding="utf-8")
        report = reap_mod.reap(self.hf, "wip", cfg=dict(reap_mod.DEFAULTS))
        self.assertEqual(report["archived"], [])
        self.assertEqual(report["deleted"], [])
        reasons = [s.get("reason") for s in report["skipped"]]
        self.assertIn("non-terminal", reasons)
        self.assertEqual(sentinel.read_text(encoding="utf-8"), before)

    def test_in_progress_cli_exit_zero(self) -> None:
        (self.hf / "tasks" / "wip.md").write_text(IN_PROGRESS_TASK, encoding="utf-8")
        code, payload, _out, _err = self._run_cli("--slug", "wip", "--json")
        self.assertEqual(code, 0)
        assert payload is not None
        self.assertTrue(any(s.get("reason") == "non-terminal" for s in payload["skipped"]))

    def test_force_reaps_non_terminal(self) -> None:
        (self.hf / "tasks" / "wip.md").write_text(IN_PROGRESS_TASK, encoding="utf-8")
        report = reap_mod.reap(
            self.hf, "wip", force=True, cfg=dict(reap_mod.DEFAULTS)
        )
        self.assertFalse((self.hf / "tasks" / "wip.md").exists())
        self.assertTrue(any(e["path"] == "tasks/wip.md" for e in report["archived"]))


class DryRunTests(FixtureBase):
    def test_dry_run_zero_mutation(self) -> None:
        slug = self._write_completed("dry-slug")
        usage = self.hf / "usage" / "stale.jsonl"
        usage.write_text("x\n", encoding="utf-8")
        self._age(usage, 40)
        log = self.hf / ".session-start.log"
        log.write_text("\n".join(f"L{i}" for i in range(500)) + "\n", encoding="utf-8")

        before_files: dict[str, tuple[int, str | None]] = {}
        for p in self.hf.rglob("*"):
            if p.is_file():
                rel = str(p.relative_to(self.hf))
                try:
                    before_files[rel] = (p.stat().st_size, p.read_text(encoding="utf-8", errors="replace"))
                except Exception:
                    before_files[rel] = (p.stat().st_size, None)

        report = reap_mod.reap(
            self.hf, slug, dry_run=True, cfg=dict(reap_mod.DEFAULTS)
        )
        self.assertTrue(report["dryRun"])
        self.assertGreater(len(report["archived"]), 0)
        # Filesystem identical
        self.assertTrue((self.hf / "tasks" / f"{slug}.md").exists())
        self.assertTrue(usage.exists())
        after_files = {
            str(p.relative_to(self.hf)): p.stat().st_size
            for p in self.hf.rglob("*")
            if p.is_file()
        }
        self.assertEqual(set(before_files), set(after_files))
        for rel, (size, content) in before_files.items():
            self.assertEqual(after_files[rel], size, msg=rel)
            if content is not None:
                self.assertEqual(
                    (self.hf / rel).read_text(encoding="utf-8", errors="replace"),
                    content,
                    msg=rel,
                )


class IdempotencyTests(FixtureBase):
    def test_second_reap_is_empty(self) -> None:
        slug = self._write_completed("idem")
        first = reap_mod.reap(self.hf, slug, cfg=dict(reap_mod.DEFAULTS))
        self.assertGreater(len(first["archived"]), 0)
        second = reap_mod.reap(self.hf, slug, force=True, cfg=dict(reap_mod.DEFAULTS))
        self.assertEqual(second["archived"], [])
        # No new deletions required on empty ephemeral either
        self.assertEqual(second["deleted"], [])


class OrphanMemoryTests(FixtureBase):
    def test_orphaned_evidence_dropped_valid_kept(self) -> None:
        slug = self._write_completed("mem-orph")
        learnings = self.hf / "memory" / "learnings.md"
        learnings.write_text(
            "# Learnings\n\n"
            "### [2026-01-01] Valid entry  `[ok]`\n"
            "**What:** still true\n"
            "**Why it matters:** keep\n"
            "**Evidence:** README.md:1\n\n"
            "### [2026-01-02] Orphan entry  `[gone]`\n"
            "**What:** was about a deleted file\n"
            "**Why it matters:** should go\n"
            "**Evidence:** does-not-exist-anywhere.ts:42\n",
            encoding="utf-8",
        )
        (self.root / "README.md").write_text("# root\n", encoding="utf-8")

        report = reap_mod.reap(self.hf, slug, cfg=dict(reap_mod.DEFAULTS))
        self.assertGreaterEqual(report["memory"]["orphansDropped"], 1)
        text = learnings.read_text(encoding="utf-8")
        self.assertIn("Valid entry", text)
        self.assertIn("still true", text)
        self.assertNotIn("Orphan entry", text)
        self.assertNotIn("does-not-exist-anywhere.ts", text)
        # Category file itself never deleted
        self.assertTrue(learnings.is_file())


class SlugSafetyTests(FixtureBase):
    def test_traversal_slug_refused(self) -> None:
        for bad in ("../evil", "foo/bar", "HasCaps", "dot.name", "../../etc"):
            with self.assertRaises(reap_mod.ReapError):
                reap_mod.reap(self.hf, bad, force=True, cfg=dict(reap_mod.DEFAULTS))

    def test_traversal_cli_exit_nonzero(self) -> None:
        code, payload, out, err = self._run_cli("--slug", "../evil", "--json")
        self.assertNotEqual(code, 0)
        self.assertEqual(out.strip(), "")
        self.assertIn("refused", err.lower())


class ProtectedPathsTests(FixtureBase):
    def test_never_touches_version_last_cleanup_or_handoff(self) -> None:
        slug = self._write_completed("prot")
        version = self.hf / ".version"
        version.write_text("5.0.0\n", encoding="utf-8")
        marker = self.hf / ".last-cleanup"
        marker.write_text("recent\n", encoding="utf-8")
        handoff = self.root / ".hyperflow-handoff" / "pkg"
        handoff.mkdir(parents=True)
        (handoff / "x.md").write_text("keep\n", encoding="utf-8")

        reap_mod.reap(self.hf, slug, cfg=dict(reap_mod.DEFAULTS))

        self.assertEqual(version.read_text(encoding="utf-8"), "5.0.0\n")
        self.assertEqual(marker.read_text(encoding="utf-8"), "recent\n")
        self.assertTrue((handoff / "x.md").exists())


class UsageProtectionTests(FixtureBase):
    def test_active_chain_usage_preserved(self) -> None:
        slug = self._write_completed("use-act")
        (self.hf / ".active-chain-id").write_text("live-chain\n", encoding="utf-8")
        live = self.hf / "usage" / "live-chain.jsonl"
        live.write_text("{}\n", encoding="utf-8")
        self._age(live, 90)
        stale = self.hf / "usage" / "dead-chain.jsonl"
        stale.write_text("{}\n", encoding="utf-8")
        self._age(stale, 90)

        cfg = dict(reap_mod.DEFAULTS)
        cfg["usageRetentionDays"] = 30
        reap_mod.reap(self.hf, slug, cfg=cfg)

        self.assertTrue(live.exists())
        self.assertFalse(stale.exists())


class CommitsQueueTests(FixtureBase):
    def test_empty_queue_removed(self) -> None:
        slug = self._write_completed("q-empty")
        q = self.hf / "commits-queue"
        q.mkdir()
        (q / "manifest.json").write_text(
            json.dumps({"commits": [], "user_branch": "main"}), encoding="utf-8"
        )
        reap_mod.reap(self.hf, slug, cfg=dict(reap_mod.DEFAULTS))
        self.assertFalse(q.exists())

    def test_unflushed_queue_kept(self) -> None:
        slug = self._write_completed("q-full")
        q = self.hf / "commits-queue"
        q.mkdir()
        (q / "manifest.json").write_text(
            json.dumps(
                {
                    "commits": [{"sha": "abc123", "message": "feat: x"}],
                    "user_branch": "main",
                }
            ),
            encoding="utf-8",
        )
        report = reap_mod.reap(self.hf, slug, cfg=dict(reap_mod.DEFAULTS))
        self.assertTrue(q.exists())
        self.assertTrue(
            any(s.get("reason") == "unflushed-queue" for s in report["skipped"])
        )


class BackgroundPruneTests(FixtureBase):
    def test_terminal_old_bg_deleted(self) -> None:
        slug = self._write_completed("bg-old")
        buf = self.hf / "background" / "bg-111-done.md"
        buf.write_text(
            "# Background Result\n\n| Status | complete |\n\n## Output\nok\n",
            encoding="utf-8",
        )
        self._age(buf, 10)
        (self.hf / "background" / "registry.json").write_text(
            json.dumps(
                {
                    "agents": {
                        "bg-111-done": {
                            "id": "bg-111-done",
                            "status": "complete",
                        }
                    }
                }
            ),
            encoding="utf-8",
        )
        reap_mod.reap(self.hf, slug, cfg=dict(reap_mod.DEFAULTS))
        self.assertFalse(buf.exists())

    def test_fresh_or_running_bg_kept(self) -> None:
        slug = self._write_completed("bg-run")
        running = self.hf / "background" / "bg-222-run.md"
        running.write_text("running\n", encoding="utf-8")
        (self.hf / "background" / "registry.json").write_text(
            json.dumps(
                {"agents": {"bg-222-run": {"id": "bg-222-run", "status": "running"}}}
            ),
            encoding="utf-8",
        )
        self._age(running, 10)
        reap_mod.reap(self.hf, slug, cfg=dict(reap_mod.DEFAULTS))
        self.assertTrue(running.exists())


class CliTests(FixtureBase):
    def test_json_stdout_and_exit_zero(self) -> None:
        slug = self._write_completed("cli-ok")
        code, payload, out, err = self._run_cli("--slug", slug, "--json")
        self.assertEqual(code, 0)
        assert payload is not None
        self.assertEqual(payload["slug"], slug)
        # --json suppresses human stderr summary... still may be empty
        self.assertTrue(out.strip().startswith("{"))

    def test_missing_slug_refused(self) -> None:
        code, _payload, out, err = self._run_cli("--json")
        self.assertNotEqual(code, 0)
        self.assertIn("refused", err.lower())


class ValidateSlugUnitTests(unittest.TestCase):
    def test_accepts_kebab(self) -> None:
        self.assertEqual(reap_mod.validate_slug("post-completion-reap"), "post-completion-reap")

    def test_rejects_bad(self) -> None:
        with self.assertRaises(reap_mod.ReapError):
            reap_mod.validate_slug("Bad_Slug")


if __name__ == "__main__":
    unittest.main()
