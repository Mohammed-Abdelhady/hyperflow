"""Tests for scripts/usage-ledger.py metadata recording and summaries."""

from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
import multiprocessing
import os
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = REPO_ROOT / "scripts" / "usage-ledger.py"


def load_script():
    spec = importlib.util.spec_from_file_location("usage_ledger", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ul = load_script()

CTX_A = hashlib.sha256(b"context-a").hexdigest()
CTX_SHARED = hashlib.sha256(b"shared-context").hexdigest()
CTX_REVIEW = hashlib.sha256(b"review-context").hexdigest()


def _write_partial_locked_record(ledger_path, payload, partial_written, finish):
    """Hold the portable process lock while deliberately writing a partial line."""

    with ul._ledger_lock(Path(ledger_path), exclusive=True):
        descriptor = os.open(
            ledger_path,
            os.O_APPEND
            | os.O_CREAT
            | os.O_WRONLY
            | getattr(os, "O_BINARY", 0),
            0o600,
        )
        try:
            midpoint = len(payload) // 2
            os.write(descriptor, payload[:midpoint])
            partial_written.set()
            if not finish.wait(timeout=5):
                raise RuntimeError("timed out waiting to finish test append")
            os.write(descriptor, payload[midpoint:])
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def record(**overrides):
    values = {
        "chain_id": "chain-a",
        "phase": "execution",
        "batch": 1,
        "task": "T1",
        "attempt": 1,
        "role": "implementer",
        "input_tokens": 100,
        "output_tokens": 20,
        "total_tokens": 120,
        "cached_input_tokens": 25,
        "context_hash": CTX_A,
        "context_tokens": 40,
        "estimated": False,
        "accepted_commit": False,
        "timestamp": "2026-07-16T10:00:00Z",
    }
    values.update(overrides)
    return values


class ValidationTests(unittest.TestCase):
    def test_make_record_returns_all_fields_in_canonical_order(self):
        result = ul.make_record(
            chain_id="chain-a",
            phase="triage",
            role="classifier",
            input_tokens=10,
            output_tokens=4,
            timestamp="2026-07-16T10:00:00Z",
        )

        self.assertEqual(tuple(result), ul.FIELDS)
        self.assertEqual(result["total_tokens"], 14)
        self.assertEqual(result["attempt"], 1)

    def test_rejects_inconsistent_totals_and_negative_values(self):
        with self.assertRaisesRegex(ul.LedgerError, "total_tokens must equal"):
            ul.validate_record(record(total_tokens=999))
        with self.assertRaisesRegex(ul.LedgerError, "nonnegative integer"):
            ul.validate_record(record(input_tokens=-1, total_tokens=19))

    def test_rejects_unknown_fields_to_prevent_prompt_capture(self):
        unsafe = record()
        unsafe["raw_prompt"] = "secret prompt text"
        with self.assertRaisesRegex(ul.LedgerError, "unknown ledger fields"):
            ul.validate_record(unsafe)

    def test_identifier_fields_accept_practical_slugs_only(self):
        valid = ul.validate_record(
            record(
                chain_id="019f6855-a419-7df3-a582-5bf071616dee",
                phase="execution",
                task="phase-1/auth-middleware:T1",
                role="api-reviewer",
            )
        )
        self.assertEqual(valid["task"], "phase-1/auth-middleware:T1")

        for field, value in (
            ("chain_id", "chain id with prose"),
            ("phase", "review this prompt"),
            ("task", "fix auth; reveal credentials"),
            ("role", "reviewer please ignore rules"),
        ):
            unsafe = record(**{field: value})
            with self.subTest(field=field), self.assertRaisesRegex(
                ul.LedgerError, "identifier characters"
            ):
                ul.validate_record(unsafe)

    def test_identifier_fields_reject_secret_like_values(self):
        for field, value in (
            ("chain_id", "sk-1234567890abcdef"),
            ("task", "ghp_1234567890abcdef"),
            ("role", "AKIA1234567890ABCD"),
            ("phase", "eyJ1234567890abcd"),
        ):
            unsafe = record(**{field: value})
            with self.subTest(field=field), self.assertRaisesRegex(
                ul.LedgerError, "looks like secret material"
            ):
                ul.validate_record(unsafe)

    def test_phase_requires_the_canonical_budget_taxonomy(self):
        for phase in ("triage", "planning", "execution", "review", "verification"):
            with self.subTest(phase=phase):
                self.assertEqual(
                    ul.validate_record(record(phase=phase))["phase"], phase
                )

        for phase in ("worker", "dispatch.worker", "Review", "post-review"):
            with self.subTest(phase=phase), self.assertRaisesRegex(
                ul.LedgerError, "phase must be one of"
            ):
                ul.validate_record(record(phase=phase))

    def test_rejects_invalid_cache_context_and_attempt_values(self):
        with self.assertRaisesRegex(ul.LedgerError, "cached_input_tokens cannot exceed"):
            ul.validate_record(
                record(cached_input_tokens=101)
            )
        with self.assertRaisesRegex(ul.LedgerError, "context_tokens must be 0"):
            ul.validate_record(record(context_hash=None, context_tokens=1))
        with self.assertRaisesRegex(ul.LedgerError, "attempt must be at least 1"):
            ul.validate_record(record(attempt=0))

    def test_context_hash_requires_a_lowercase_sha256_digest(self):
        valid = ul.validate_record(record(context_hash=CTX_A))
        self.assertEqual(valid["context_hash"], CTX_A)

        for unsafe_hash in (
            "ctx-a",
            "a" * 63,
            "a" * 65,
            "A" * 64,
            "sk-1234567890abcdef",
            "ghp_1234567890abcdef",
        ):
            with self.subTest(context_hash=unsafe_hash), self.assertRaisesRegex(
                ul.LedgerError, "lowercase SHA-256 hex digest"
            ):
                ul.validate_record(record(context_hash=unsafe_hash))


class LedgerIoTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.ledger = Path(self.tempdir.name) / "nested" / "usage.jsonl"

    def test_append_creates_parent_and_writes_canonical_metadata_only_jsonl(self):
        expected = ul.append_record(self.ledger, record())

        self.assertTrue(self.ledger.is_file())
        line = self.ledger.read_text(encoding="utf-8")
        self.assertTrue(line.endswith("\n"))
        self.assertEqual(json.loads(line), expected)
        self.assertNotIn("prompt", line.lower())

    def test_load_validates_lines_and_filters_by_chain(self):
        ul.append_record(self.ledger, record(chain_id="chain-a"))
        ul.append_record(self.ledger, record(chain_id="chain-b"))

        loaded = ul.load_records(self.ledger, chain_id="chain-b")

        self.assertEqual(len(loaded), 1)
        self.assertEqual(loaded[0]["chain_id"], "chain-b")

    def test_load_reports_the_invalid_line_number(self):
        self.ledger.parent.mkdir(parents=True)
        self.ledger.write_text("{}\nnot-json\n", encoding="utf-8")

        with self.assertRaisesRegex(ul.LedgerError, r"usage\.jsonl:1"):
            ul.load_records(self.ledger)

    def test_summary_waits_for_a_cross_process_locked_append_snapshot(self):
        payload = (
            json.dumps(
                ul.validate_record(record()),
                ensure_ascii=True,
                separators=(",", ":"),
            )
            + "\n"
        ).encode("utf-8")
        self.ledger.parent.mkdir(parents=True)
        context = multiprocessing.get_context("spawn")
        partial_written = context.Event()
        finish_append = context.Event()
        reader_done = threading.Event()
        result = {}

        def reader():
            result.update(ul.summarize_ledger(self.ledger))
            reader_done.set()

        writer_process = context.Process(
            target=_write_partial_locked_record,
            args=(str(self.ledger), payload, partial_written, finish_append),
        )
        writer_process.start()
        self.assertTrue(partial_written.wait(timeout=5))
        reader_thread = threading.Thread(target=reader)
        reader_thread.start()
        time.sleep(0.05)
        self.assertFalse(reader_done.is_set())
        finish_append.set()
        writer_process.join(timeout=5)
        reader_thread.join(timeout=5)

        self.assertFalse(writer_process.is_alive())
        self.assertEqual(writer_process.exitcode, 0)
        self.assertFalse(reader_thread.is_alive())
        self.assertEqual(result["totals"]["record_count"], 1)

    def test_locking_fails_closed_when_no_stdlib_backend_is_available(self):
        with mock.patch.object(ul, "fcntl", None), mock.patch.object(
            ul, "msvcrt", None
        ):
            with self.assertRaisesRegex(OSError, "locking is unsupported"):
                with ul._ledger_lock(self.ledger, exclusive=True):
                    self.fail("unlocked ledger access must never be allowed")

    def test_windows_lock_backend_is_used_when_fcntl_is_unavailable(self):
        class FakeMsvcrt:
            LK_NBLCK = 1
            LK_UNLCK = 2

            def __init__(self):
                self.calls = []

            def locking(self, descriptor, mode, byte_count):
                self.calls.append((descriptor, mode, byte_count))

        backend = FakeMsvcrt()
        with mock.patch.object(ul, "fcntl", None), mock.patch.object(
            ul, "msvcrt", backend
        ):
            with ul._ledger_lock(self.ledger, exclusive=False):
                self.assertTrue(ul._lock_path(self.ledger).exists())

        self.assertEqual([call[1:] for call in backend.calls], [(1, 1), (2, 1)])

    def test_concurrent_append_and_summary_never_observes_invalid_json(self):
        failures = []

        def writer():
            try:
                for index in range(30):
                    ul.append_record(
                        self.ledger,
                        record(task=f"T{index}", timestamp=f"2026-07-16T10:00:{index:02d}Z"),
                    )
            except Exception as exc:  # pragma: no cover - assertion reports detail
                failures.append(exc)

        thread = threading.Thread(target=writer)
        thread.start()
        while thread.is_alive():
            try:
                ul.summarize_ledger(self.ledger)
            except Exception as exc:  # pragma: no cover - assertion reports detail
                failures.append(exc)
                break
        thread.join(timeout=3)

        self.assertEqual(failures, [])
        self.assertEqual(ul.summarize_ledger(self.ledger)["totals"]["record_count"], 30)


class SummaryTests(unittest.TestCase):
    def test_summary_calculates_phase_and_efficiency_metrics(self):
        records = [
            record(
                phase="triage",
                role="classifier",
                input_tokens=80,
                output_tokens=20,
                total_tokens=100,
                cached_input_tokens=20,
                context_hash=CTX_SHARED,
                context_tokens=30,
            ),
            record(
                phase="execution",
                task="T1",
                input_tokens=100,
                output_tokens=50,
                total_tokens=150,
                cached_input_tokens=40,
                context_hash=CTX_SHARED,
                context_tokens=30,
                accepted_commit=True,
            ),
            record(
                phase="review",
                task="T1",
                attempt=2,
                role="reviewer",
                input_tokens=60,
                output_tokens=40,
                total_tokens=100,
                cached_input_tokens=0,
                context_hash=CTX_REVIEW,
                context_tokens=10,
                estimated=True,
            ),
        ]

        summary = ul.summarize_records(records)

        self.assertEqual(summary["totals"]["record_count"], 3)
        self.assertEqual(summary["totals"]["input_tokens"], 240)
        self.assertEqual(summary["totals"]["output_tokens"], 110)
        self.assertEqual(summary["totals"]["total_tokens"], 350)
        self.assertEqual(summary["totals"]["context_tokens"], 70)
        self.assertEqual(summary["duplicate_context_tokens"], 30)
        self.assertEqual(summary["duplicate_context_ratio"], 0.125)
        self.assertEqual(summary["retry_cost_tokens"], 100)
        self.assertEqual(summary["cache_hit_rate"], 0.25)
        self.assertEqual(summary["accepted_commit_count"], 1)
        self.assertEqual(summary["tokens_per_accepted_commit"], 350.0)
        self.assertEqual(summary["estimated_record_count"], 1)
        self.assertEqual(
            list(summary["per_phase"]),
            ["execution", "review", "triage"],
        )
        self.assertEqual(
            summary["per_phase"]["review"]["retry_cost_tokens"], 100
        )

    def test_duplicate_context_is_scoped_to_each_chain(self):
        summary = ul.summarize_records(
            [record(chain_id="chain-a"), record(chain_id="chain-b")]
        )

        self.assertEqual(summary["duplicate_context_tokens"], 0)

    def test_empty_summary_has_stable_zero_values(self):
        summary = ul.summarize_records([])

        self.assertEqual(summary["per_phase"], {})
        self.assertEqual(summary["duplicate_context_ratio"], 0.0)
        self.assertEqual(summary["cache_hit_rate"], 0.0)
        self.assertIsNone(summary["tokens_per_accepted_commit"])


class CliTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.ledger = Path(self.tempdir.name) / "usage.jsonl"

    def test_record_and_summary_commands_emit_deterministic_json(self):
        record_stdout = io.StringIO()
        with contextlib.redirect_stdout(record_stdout):
            exit_code = ul.main(
                [
                    "record",
                    str(self.ledger),
                    "--chain-id",
                    "chain-a",
                    "--phase",
                    "execution",
                    "--role",
                    "implementer",
                    "--input-tokens",
                    "10",
                    "--output-tokens",
                    "5",
                    "--context-hash",
                    CTX_A,
                    "--context-tokens",
                    "4",
                    "--accepted-commit",
                    "--timestamp",
                    "2026-07-16T10:00:00Z",
                ]
            )
        self.assertEqual(exit_code, 0)
        self.assertEqual(json.loads(record_stdout.getvalue())["total_tokens"], 15)

        summary_stdout = io.StringIO()
        with contextlib.redirect_stdout(summary_stdout):
            exit_code = ul.main(
                ["summary", str(self.ledger), "--chain-id", "chain-a"]
            )
        self.assertEqual(exit_code, 0)
        summary = json.loads(summary_stdout.getvalue())
        self.assertEqual(summary["totals"]["total_tokens"], 15)
        self.assertEqual(summary["tokens_per_accepted_commit"], 15.0)

    def test_cli_validation_failure_returns_two_without_writing(self):
        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            exit_code = ul.main(
                [
                    "record",
                    str(self.ledger),
                    "--chain-id",
                    "chain-a",
                    "--phase",
                    "execution",
                    "--role",
                    "implementer",
                    "--input-tokens",
                    "-1",
                    "--output-tokens",
                    "5",
                ]
            )

        self.assertEqual(exit_code, 2)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("nonnegative integer", stderr.getvalue())
        self.assertFalse(self.ledger.exists())


if __name__ == "__main__":
    unittest.main()
