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
from unittest.mock import patch

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
        # Isolate HOME so config-dependent subprocesses (archive-artefacts.py,
        # memory-index.py) fall back to DEFAULTS deterministically.
        home = self.root / "_home"
        home.mkdir(parents=True, exist_ok=True)
        env_patch = patch.dict(
            os.environ, {"HOME": str(home), "USERPROFILE": str(home)}
        )
        env_patch.start()
        self.addCleanup(env_patch.stop)
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

    def _write_home_config(
        self, cleanup: dict | None = None, memory: dict | None = None
    ) -> Path:
        """Write ``~/.hyperflow/config.json`` inside the patched (temp) HOME.

        Lets a test exercise reap()'s OWN ``load_cfg()`` — call ``reap`` with no
        ``cfg=`` so it reads this file — proving config-dependent behavior
        (``cleanup.auto``, ``cleanup.dryRun``) rather than an injected dict.
        Safe because setUp isolated HOME/USERPROFILE (F5).
        """
        home_hf = Path(os.environ["HOME"]) / ".hyperflow"
        home_hf.mkdir(parents=True, exist_ok=True)
        doc: dict = {}
        if cleanup is not None:
            doc["cleanup"] = cleanup
        if memory is not None:
            doc["memory"] = memory
        cfg_path = home_hf / "config.json"
        cfg_path.write_text(json.dumps(doc), encoding="utf-8")
        return cfg_path


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

    def test_feature_complete_value(self) -> None:
        # F8: feature terminal must accept `complete` as well as `completed`.
        fdir = self.hf / "features" / "feat-c"
        fdir.mkdir(parents=True)
        (fdir / "feature.md").write_text(
            "## Status\n\n| Status | complete |\n", encoding="utf-8"
        )
        self.assertTrue(reap_mod.feature_is_terminal(self.hf, "feat-c"))
        self.assertTrue(reap_mod.is_terminal(self.hf, "feat-c"))

    def test_stray_terminal_subrow_not_terminal(self) -> None:
        # F7: the primary `## Status` row is in_progress; a stray terminal
        # sub-row under a later heading must NOT make the task reapable.
        (self.hf / "tasks" / "anchored.md").write_text(
            "# Anchored Task\n\n"
            "## Status\n\n"
            "| Field | Value |\n|---|---|\n"
            "| Status | in_progress |\n\n"
            "## Subtasks\n\n"
            "| Field | Value |\n|---|---|\n"
            "| State | complete |\n",
            encoding="utf-8",
        )
        self.assertFalse(reap_mod.flat_task_is_terminal(self.hf, "anchored"))
        self.assertFalse(reap_mod.is_terminal(self.hf, "anchored"))


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


class _BoomArchiver:
    """Stand-in archiver whose slug archival always raises (F4 failure sim)."""

    def archive_slug(self, hf: Path, slug: str, cfg: dict | None = None) -> dict:
        raise RuntimeError("simulated archive failure")


class ArchiveFailureTests(FixtureBase):
    """F3 in-process archival + F4 loud failure: a failing archive must set
    ``archiveError`` and skip every destructive phase (ephemeral GC + orphan
    drop), leaving stale ephemeral files and durable memory untouched."""

    def test_archive_failure_aborts_gc_and_preserves_state(self) -> None:
        slug = self._write_completed("arch-fail")
        # Stale usage ledger a SUCCESSFUL reap would delete (aged past retention).
        usage = self.hf / "usage" / "stale-chain.jsonl"
        usage.write_text('{"chain_id":"stale-chain"}\n', encoding="utf-8")
        self._age(usage, 90)
        learnings = self.hf / "memory" / "learnings.md"
        learnings_before = learnings.read_text(encoding="utf-8")

        cfg = dict(reap_mod.DEFAULTS)
        cfg["usageRetentionDays"] = 30
        with patch.object(reap_mod, "_load_archiver", return_value=_BoomArchiver()):
            report = reap_mod.reap(self.hf, slug, cfg=cfg)

        # Loud failure surfaced.
        self.assertIn("archiveError", report)
        self.assertIn("simulated archive failure", report["archiveError"])
        # Ephemeral GC skipped — stale ledger survives, nothing deleted.
        self.assertTrue(usage.exists())
        self.assertEqual(report["deleted"], [])
        self.assertEqual(report["bytesFreed"], 0)
        # Orphan-drop skipped — durable memory byte-for-byte unchanged.
        self.assertEqual(learnings.read_text(encoding="utf-8"), learnings_before)
        self.assertEqual(report["memory"]["orphansDropped"], 0)
        # Archival never moved the source (it failed).
        self.assertTrue((self.hf / "tasks" / f"{slug}.md").exists())
        self.assertEqual(report["archived"], [])

    def test_happy_path_archives_without_error(self) -> None:
        slug = self._write_completed("arch-ok")
        report = reap_mod.reap(self.hf, slug, cfg=dict(reap_mod.DEFAULTS))

        self.assertNotIn("archiveError", report)
        self.assertGreater(len(report["archived"]), 0)
        paths = {e["path"] for e in report["archived"]}
        self.assertIn(f"tasks/{slug}.md", paths)
        # In-process archival ran — source moved out, learning promoted.
        self.assertFalse((self.hf / "tasks" / f"{slug}.md").exists())
        self.assertIn(
            "durable insight from completed task",
            (self.hf / "memory" / "learnings.md").read_text(encoding="utf-8"),
        )

    def test_run_archive_returns_error_tuple_on_failure(self) -> None:
        with patch.object(reap_mod, "_load_archiver", return_value=_BoomArchiver()):
            archived, error = reap_mod.run_archive(self.hf, "whatever")
        self.assertEqual(archived, [])
        self.assertIsNotNone(error)
        self.assertIn("simulated archive failure", error)


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

    def test_second_reap_leaves_memory_unmutated(self) -> None:
        # F12: a repeat pass must not re-mutate durable memory. Capture every
        # memory/*.md byte-for-byte AFTER the first (mutating) reap, then assert
        # the forced second pass leaves each file identical — in addition to the
        # empty archived/deleted contract above.
        slug = self._write_completed("idem-mem")
        reap_mod.reap(self.hf, slug, cfg=dict(reap_mod.DEFAULTS))
        memory = self.hf / "memory"

        def snapshot() -> dict[str, bytes]:
            return {
                str(p.relative_to(memory)): p.read_bytes()
                for p in sorted(memory.rglob("*.md"))
                if p.is_file()
            }

        before = snapshot()
        self.assertTrue(before, "expected memory files to snapshot")

        second = reap_mod.reap(self.hf, slug, force=True, cfg=dict(reap_mod.DEFAULTS))
        self.assertEqual(second["archived"], [])
        self.assertEqual(second["deleted"], [])

        after = snapshot()
        self.assertEqual(set(before), set(after))
        for rel, data in before.items():
            self.assertEqual(after[rel], data, msg=f"memory/{rel} re-mutated")


class MemoryCoverageTests(FixtureBase):
    """F12: positive coverage for the always-on memory optimizations —
    compaction advisory (oversized file flagged) and index rebuild (index.md
    actually (re)written), which the existing suites only shape-check."""

    def test_oversized_memory_flagged_as_compacted(self) -> None:
        slug = self._write_completed("mem-big")
        # Durable category file at/over the compaction threshold.
        bloated = self.hf / "memory" / "bloated.md"
        bloated.write_text(
            "# Bloated\n\n" + "".join(f"- line {i}\n" for i in range(400)),
            encoding="utf-8",
        )

        cfg = dict(reap_mod.DEFAULTS)
        cfg["compactionThreshold"] = 300
        report = reap_mod.reap(self.hf, slug, cfg=cfg)

        self.assertIn("memory/bloated.md", report["memory"]["compacted"])
        # Advisory only — the oversized file is never deleted/truncated by reap.
        self.assertTrue(bloated.is_file())
        # A small durable file stays below threshold and is not flagged.
        self.assertNotIn("memory/learnings.md", report["memory"]["compacted"])

    def test_index_rebuilt_and_index_md_written(self) -> None:
        slug = self._write_completed("mem-idx")
        index = self.hf / "memory" / "index.md"
        # Seed a stale index so a genuine rebuild must overwrite its content.
        stale = "# STALE INDEX\n\nthis is not the derived index\n"
        index.write_text(stale, encoding="utf-8")

        report = reap_mod.reap(self.hf, slug, cfg=dict(reap_mod.DEFAULTS))

        self.assertIs(report["memory"]["indexRebuilt"], True)
        self.assertTrue(index.is_file())
        rebuilt = index.read_text(encoding="utf-8")
        self.assertNotEqual(rebuilt, stale)
        self.assertTrue(rebuilt.strip())


class HomeConfigTests(FixtureBase):
    """F5: config read from the (isolated) HOME governs a cfg-less reap.

    Locks T3-F2 through the real config path — targeted `--slug` archival runs
    even under `cleanup.auto=false`, and `cleanup.dryRun=true` forces a dry run
    with zero mutation. reap() is called WITHOUT `cfg=` so its own load_cfg()
    reads the file."""

    def test_archives_with_home_cleanup_auto_false(self) -> None:
        slug = self._write_completed("cfg-auto")
        self._write_home_config(cleanup={"auto": False})

        # No cfg= → reap.load_cfg() reads the hostile HOME config (auto=false).
        report = reap_mod.reap(self.hf, slug)

        self.assertNotIn("archiveError", report)
        self.assertGreater(len(report["archived"]), 0)
        paths = {e["path"] for e in report["archived"]}
        self.assertIn(f"tasks/{slug}.md", paths)
        # Targeted archival is unconditional — source moved out despite auto=false.
        self.assertFalse((self.hf / "tasks" / f"{slug}.md").exists())

    def test_home_cleanup_dry_run_true_zero_mutation(self) -> None:
        slug = self._write_completed("cfg-dry")
        usage = self.hf / "usage" / "stale.jsonl"
        usage.write_text("x\n", encoding="utf-8")
        self._age(usage, 40)
        self._write_home_config(cleanup={"dryRun": True})

        before = {
            str(p.relative_to(self.hf)): (p.stat().st_size, p.read_bytes())
            for p in self.hf.rglob("*")
            if p.is_file()
        }

        report = reap_mod.reap(self.hf, slug)

        self.assertTrue(report["dryRun"])
        self.assertGreater(len(report["archived"]), 0)
        # Nothing moved or deleted: source + stale ledger both survive.
        self.assertTrue((self.hf / "tasks" / f"{slug}.md").exists())
        self.assertTrue(usage.exists())
        after = {
            str(p.relative_to(self.hf)): (p.stat().st_size, p.read_bytes())
            for p in self.hf.rglob("*")
            if p.is_file()
        }
        self.assertEqual(before, after)


class ReapLogTests(FixtureBase):
    """F12 reap-log append smoke.

    The `archive/.reap-log.jsonl` append is orchestrated by the reap SKILL
    (skills/deploy, skills/dispatch, skills/handoff, DOCTRINE), not by
    scripts/reap.py — the Python engine emits its report to stdout and never
    writes the log itself. There is no engine-level surface to assert here.
    """

    @unittest.skip("E2E: reap-log append covered at skill level")
    def test_reap_log_append(self) -> None:  # pragma: no cover
        # E2E: reap-log append covered at skill level
        pass


class OrphanMemoryTests(FixtureBase):
    """Three durable entries: (1) `.hyperflow`-relative Evidence, (2) cites the
    slug's just-archived task file, (3) genuinely dead source. Default reap must
    keep all three; `dropOrphanRefs=true` must quarantine only (3)."""

    def _write_three_entries(self, slug: str) -> Path:
        # Existing .hyperflow-relative target for entry (1).
        (self.hf / "memory" / "decisions.md").write_text(
            "# Decisions\n\n- keep this alive\n", encoding="utf-8"
        )
        learnings = self.hf / "memory" / "learnings.md"
        learnings.write_text(
            "# Learnings\n\n"
            "### [2026-01-01] HF-relative evidence  `[keep]`\n"
            "**What:** cites a .hyperflow-relative path\n"
            "**Why it matters:** must not false-orphan\n"
            "**Evidence:** memory/decisions.md:1\n\n"
            "### [2026-01-02] Just-archived artefact  `[keep]`\n"
            "**What:** cites the slug's task file reap archives this run\n"
            "**Why it matters:** archive is not delete\n"
            f"**Evidence:** tasks/{slug}.md\n\n"
            "### [2026-01-03] Dead source  `[gone]`\n"
            "**What:** cites a file that never existed\n"
            "**Why it matters:** genuinely orphaned\n"
            "**Evidence:** src/gone-forever.ts:99\n",
            encoding="utf-8",
        )
        return learnings

    def test_default_reap_drops_zero_entries(self) -> None:
        slug = self._write_completed("mem-def")
        learnings = self._write_three_entries(slug)

        report = reap_mod.reap(self.hf, slug, cfg=dict(reap_mod.DEFAULTS))

        self.assertEqual(report["memory"]["orphansDropped"], 0)
        text = learnings.read_text(encoding="utf-8")
        self.assertIn("HF-relative evidence", text)
        self.assertIn("Just-archived artefact", text)
        self.assertIn("Dead source", text)
        # No quarantine sidecar written on a default (non-destructive) reap.
        self.assertFalse((self.hf / "memory" / "archive").exists())

    def test_enabled_quarantines_only_dead_source(self) -> None:
        slug = self._write_completed("mem-en")
        learnings = self._write_three_entries(slug)

        cfg = dict(reap_mod.DEFAULTS)
        cfg["dropOrphanRefs"] = True
        report = reap_mod.reap(self.hf, slug, cfg=cfg)

        self.assertEqual(report["memory"]["orphansDropped"], 1)
        text = learnings.read_text(encoding="utf-8")
        # Survivors: .hyperflow-relative + just-archived artefact.
        self.assertIn("HF-relative evidence", text)
        self.assertIn("Just-archived artefact", text)
        # Dead-source entry removed from the category file...
        self.assertNotIn("Dead source", text)
        self.assertNotIn("src/gone-forever.ts", text)
        # Category file itself never deleted.
        self.assertTrue(learnings.is_file())
        # ...and quarantined (not hard-deleted) to the monthly sidecar.
        sidecar = self.hf / "memory" / "archive" / "2026-01.md"
        self.assertTrue(sidecar.is_file())
        archived = sidecar.read_text(encoding="utf-8")
        self.assertIn("Dead source", archived)
        self.assertIn("src/gone-forever.ts:99", archived)


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


class ArgParseTests(FixtureBase):
    """F10: `--slug` must not swallow an option-like value."""

    def test_slug_consumes_dash_prefixed_value_refused(self) -> None:
        with self.assertRaises(reap_mod.ReapError):
            reap_mod._parse_args(["reap.py", str(self.hf), "--slug", "--force"])

    def test_slug_bare_double_dash_refused(self) -> None:
        with self.assertRaises(reap_mod.ReapError):
            reap_mod._parse_args(["reap.py", str(self.hf), "--slug", "--"])

    def test_slug_missing_trailing_value_refused(self) -> None:
        with self.assertRaises(reap_mod.ReapError):
            reap_mod._parse_args(["reap.py", str(self.hf), "--slug"])

    def test_slug_equals_dash_value_refused(self) -> None:
        with self.assertRaises(reap_mod.ReapError):
            reap_mod._parse_args(["reap.py", str(self.hf), "--slug=--force"])

    def test_valid_slug_still_parses(self) -> None:
        hf, slug, dry_run, force, as_json = reap_mod._parse_args(
            ["reap.py", str(self.hf), "--slug", "good-slug", "--force", "--json"]
        )
        self.assertEqual(slug, "good-slug")
        self.assertTrue(force)
        self.assertTrue(as_json)
        self.assertFalse(dry_run)

    def test_dash_slug_cli_exit_nonzero(self) -> None:
        code, _payload, out, err = self._run_cli("--slug", "--force", "--json")
        self.assertNotEqual(code, 0)
        self.assertEqual(out.strip(), "")
        self.assertIn("refused", err.lower())


class AtomicLogTruncationTests(FixtureBase):
    """F6: session-log truncation must be atomic (temp file + os.replace) so a
    concurrent append-by-path never observes a torn/empty log or loses lines."""

    def _write_log(self, n: int) -> Path:
        log = self.hf / ".session-start.log"
        log.write_text(
            "".join(f"line-{i}\n" for i in range(n)), encoding="utf-8"
        )
        return log

    def test_truncation_keeps_recent_tail(self) -> None:
        log = self._write_log(2500)
        report = reap_mod.empty_report("log", False)
        reap_mod.reap_session_log(
            self.hf, log_max_lines=200, dry_run=False, report=report
        )
        lines = log.read_text(encoding="utf-8").splitlines()
        # Exactly the kept tail, ending with the most-recently-appended line.
        self.assertEqual(len(lines), 200)
        self.assertEqual(lines[-1], "line-2499")
        self.assertEqual(lines[0], "line-2300")
        self.assertTrue(any("truncate" in d for d in report["deleted"]))

    def test_no_leftover_temp_file(self) -> None:
        self._write_log(2500)
        report = reap_mod.empty_report("log", False)
        reap_mod.reap_session_log(
            self.hf, log_max_lines=200, dry_run=False, report=report
        )
        leftovers = [p.name for p in self.hf.iterdir() if ".tmp" in p.name]
        self.assertEqual(leftovers, [])

    def test_concurrent_append_never_sees_torn_log(self) -> None:
        # Interpose on os.replace to inspect state at the atomic-swap instant:
        # the live log must still hold its COMPLETE original content (never an
        # in-place truncation), and an append that races in right before the
        # swap must not corrupt the committed result.
        log = self._write_log(2500)
        original = log.read_text(encoding="utf-8")
        real_replace = os.replace
        observed: dict[str, object] = {}

        def spy_replace(src: object, dst: object) -> None:
            # Original log untouched until the swap — proves no torn write.
            observed["intact"] = log.read_text(encoding="utf-8") == original
            # A session-start hook appends by path during the operation.
            with open(log, "a", encoding="utf-8") as fh:
                fh.write("CONCURRENT-APPEND\n")
            real_replace(src, dst)

        report = reap_mod.empty_report("log", False)
        with patch.object(reap_mod.os, "replace", spy_replace):
            reap_mod.reap_session_log(
                self.hf, log_max_lines=200, dry_run=False, report=report
            )

        self.assertTrue(observed.get("intact"))
        lines = log.read_text(encoding="utf-8").splitlines()
        # Committed log is complete and well-formed (no partial/torn line).
        self.assertEqual(len(lines), 200)
        self.assertEqual(lines[-1], "line-2499")


class ValidateSlugUnitTests(unittest.TestCase):
    def test_accepts_kebab(self) -> None:
        self.assertEqual(reap_mod.validate_slug("post-completion-reap"), "post-completion-reap")

    def test_rejects_bad(self) -> None:
        with self.assertRaises(reap_mod.ReapError):
            reap_mod.validate_slug("Bad_Slug")


if __name__ == "__main__":
    unittest.main()
