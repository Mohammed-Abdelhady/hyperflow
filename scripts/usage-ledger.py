#!/usr/bin/env python3
"""Record and summarize Hyperflow agent usage as a metadata-only JSONL ledger."""

from __future__ import annotations

import argparse
import errno
import json
import os
import re
import sys
import time
from collections.abc import Iterable, Mapping, Sequence
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:  # POSIX inter-process locking.
    import fcntl
except ImportError:  # pragma: no cover - exercised on Windows.
    fcntl = None

try:  # Windows inter-process byte-range locking.
    import msvcrt
except ImportError:  # pragma: no cover - exercised on POSIX.
    msvcrt = None


FIELDS = (
    "chain_id",
    "phase",
    "batch",
    "task",
    "attempt",
    "role",
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "cached_input_tokens",
    "context_hash",
    "context_tokens",
    "estimated",
    "accepted_commit",
    "timestamp",
)

_TOKEN_FIELDS = (
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "cached_input_tokens",
    "context_tokens",
)
_PHASES = frozenset(("triage", "planning", "execution", "review", "verification"))
_SHA256_HEX = re.compile(r"^[0-9a-f]{64}$")
_SAFE_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]*$")
_SECRET_LIKE = re.compile(
    r"^(?:sk-[A-Za-z0-9_-]{8,}|gh[oprsu]_[A-Za-z0-9_]{8,}|AKIA[A-Z0-9]{8,}|eyJ[A-Za-z0-9_-]{8,})"
)


class LedgerError(ValueError):
    """Raised when a usage record or ledger line is invalid."""


def _lock_path(ledger_path: Path) -> Path:
    """Return the stable sidecar used to synchronize one ledger."""

    return ledger_path.with_name(f".{ledger_path.name}.lock")


def _acquire_lock(lock_file: Any, *, exclusive: bool) -> None:
    """Acquire a process-wide lock using the host's stdlib primitive."""

    if fcntl is not None:
        mode = fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH
        fcntl.flock(lock_file.fileno(), mode)
        return

    if msvcrt is not None:  # pragma: no cover - exercised on Windows.
        # ``msvcrt.locking`` has no shared mode, so Windows readers take the
        # same exclusive one-byte lock as writers. This preserves the same
        # atomic-snapshot guarantee while only reducing reader concurrency.
        lock_file.seek(0)
        while True:
            try:
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
                return
            except OSError as exc:
                if exc.errno not in (errno.EACCES, errno.EAGAIN, errno.EDEADLK):
                    raise
                time.sleep(0.05)

    raise OSError("usage ledger locking is unsupported on this platform")


def _release_lock(lock_file: Any) -> None:
    """Release a lock previously acquired by :func:`_acquire_lock`."""

    if fcntl is not None:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
        return
    if msvcrt is not None:  # pragma: no cover - exercised on Windows.
        lock_file.seek(0)
        msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
        return
    raise OSError("usage ledger locking is unsupported on this platform")


@contextmanager
def _ledger_lock(path: Path | str, *, exclusive: bool):
    """Lock a ledger across processes for an append or complete read snapshot."""

    ledger_path = Path(path)
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_CREAT | os.O_RDWR | getattr(os, "O_BINARY", 0)
    descriptor = os.open(_lock_path(ledger_path), flags, 0o600)
    with os.fdopen(descriptor, "r+b", buffering=0) as lock_file:
        lock_file.seek(0, os.SEEK_END)
        if lock_file.tell() == 0:
            lock_file.write(b"\0")
            os.fsync(lock_file.fileno())
        lock_file.seek(0)
        _acquire_lock(lock_file, exclusive=exclusive)
        try:
            yield
        finally:
            _release_lock(lock_file)


def utc_timestamp() -> str:
    """Return a compact UTC timestamp suitable for a ledger record."""

    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


def _require_text(
    value: Any, field: str, *, optional: bool = False, max_length: int = 256
) -> str | None:
    if value is None and optional:
        return None
    if not isinstance(value, str) or not value.strip():
        raise LedgerError(f"{field} must be a non-empty string")
    if value != value.strip() or "\n" in value or "\r" in value:
        raise LedgerError(f"{field} must be a single trimmed line")
    if len(value) > max_length:
        raise LedgerError(f"{field} must be at most {max_length} characters")
    return value


def _require_nonnegative_int(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise LedgerError(f"{field} must be a nonnegative integer")
    return value


def _require_identifier(
    value: Any, field: str, *, optional: bool = False, max_length: int = 256
) -> str | None:
    identifier = _require_text(
        value, field, optional=optional, max_length=max_length
    )
    if identifier is None:
        return None
    if not _SAFE_IDENTIFIER.fullmatch(identifier):
        raise LedgerError(
            f"{field} must use identifier characters: letters, numbers, . _ : / -"
        )
    if _SECRET_LIKE.match(identifier):
        raise LedgerError(f"{field} looks like secret material")
    return identifier


def _require_bool(value: Any, field: str) -> bool:
    if not isinstance(value, bool):
        raise LedgerError(f"{field} must be a boolean")
    return value


def validate_record(record: Mapping[str, Any]) -> dict[str, Any]:
    """Validate and normalize one metadata-only usage record.

    The returned dictionary always contains exactly ``FIELDS`` in canonical order.
    Unknown keys are rejected so raw prompts or arbitrary metadata cannot leak into
    the ledger.
    """

    unknown = set(record) - set(FIELDS)
    missing = set(FIELDS) - set(record)
    if unknown:
        raise LedgerError(f"unknown ledger fields: {', '.join(sorted(unknown))}")
    if missing:
        raise LedgerError(f"missing ledger fields: {', '.join(sorted(missing))}")

    normalized: dict[str, Any] = {}
    normalized["chain_id"] = _require_identifier(
        record["chain_id"], "chain_id", max_length=128
    )
    phase = _require_identifier(record["phase"], "phase", max_length=96)
    if phase not in _PHASES:
        raise LedgerError(
            "phase must be one of: triage, planning, execution, review, verification"
        )
    normalized["phase"] = phase

    batch = record["batch"]
    normalized["batch"] = (
        None if batch is None else _require_nonnegative_int(batch, "batch")
    )
    normalized["task"] = _require_identifier(
        record["task"], "task", optional=True, max_length=256
    )

    attempt = _require_nonnegative_int(record["attempt"], "attempt")
    if attempt < 1:
        raise LedgerError("attempt must be at least 1")
    normalized["attempt"] = attempt
    normalized["role"] = _require_identifier(
        record["role"], "role", max_length=96
    )

    for field in _TOKEN_FIELDS:
        normalized[field] = _require_nonnegative_int(record[field], field)

    if normalized["total_tokens"] != (
        normalized["input_tokens"] + normalized["output_tokens"]
    ):
        raise LedgerError("total_tokens must equal input_tokens + output_tokens")
    if normalized["cached_input_tokens"] > normalized["input_tokens"]:
        raise LedgerError("cached_input_tokens cannot exceed input_tokens")
    if normalized["context_tokens"] > normalized["input_tokens"]:
        raise LedgerError("context_tokens cannot exceed input_tokens")

    context_hash = _require_text(
        record["context_hash"], "context_hash", optional=True, max_length=128
    )
    if context_hash is not None and not _SHA256_HEX.fullmatch(context_hash):
        raise LedgerError("context_hash must be a lowercase SHA-256 hex digest")
    if context_hash is None and normalized["context_tokens"] != 0:
        raise LedgerError("context_tokens must be 0 when context_hash is absent")
    normalized["context_hash"] = context_hash

    normalized["estimated"] = _require_bool(record["estimated"], "estimated")
    normalized["accepted_commit"] = _require_bool(
        record["accepted_commit"], "accepted_commit"
    )

    timestamp = _require_text(
        record["timestamp"], "timestamp", max_length=64
    )
    try:
        datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError as exc:
        raise LedgerError("timestamp must be an ISO-8601 value") from exc
    normalized["timestamp"] = timestamp

    return {field: normalized[field] for field in FIELDS}


def make_record(
    *,
    chain_id: str,
    phase: str,
    role: str,
    input_tokens: int,
    output_tokens: int,
    total_tokens: int | None = None,
    batch: int | None = None,
    task: str | None = None,
    attempt: int = 1,
    cached_input_tokens: int = 0,
    context_hash: str | None = None,
    context_tokens: int = 0,
    estimated: bool = False,
    accepted_commit: bool = False,
    timestamp: str | None = None,
) -> dict[str, Any]:
    """Build and validate a usage record for programmatic callers."""

    if total_tokens is None:
        if isinstance(input_tokens, int) and isinstance(output_tokens, int):
            total_tokens = input_tokens + output_tokens
        else:
            total_tokens = -1
    return validate_record(
        {
            "chain_id": chain_id,
            "phase": phase,
            "batch": batch,
            "task": task,
            "attempt": attempt,
            "role": role,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": total_tokens,
            "cached_input_tokens": cached_input_tokens,
            "context_hash": context_hash,
            "context_tokens": context_tokens,
            "estimated": estimated,
            "accepted_commit": accepted_commit,
            "timestamp": timestamp or utc_timestamp(),
        }
    )


def append_record(path: Path | str, record: Mapping[str, Any]) -> dict[str, Any]:
    """Validate and append one canonical JSON line.

    A portable inter-process sidecar lock serializes writers against complete
    reader snapshots. POSIX uses ``fcntl.flock``; Windows uses the stdlib
    ``msvcrt`` byte-range lock and serializes readers as well as writers.
    """

    ledger_path = Path(path)
    normalized = validate_record(record)
    payload = (
        json.dumps(normalized, ensure_ascii=True, separators=(",", ":")) + "\n"
    ).encode("utf-8")

    with _ledger_lock(ledger_path, exclusive=True):
        flags = (
            os.O_APPEND
            | os.O_CREAT
            | os.O_WRONLY
            | getattr(os, "O_BINARY", 0)
        )
        descriptor = os.open(ledger_path, flags, 0o600)
        try:
            written = os.write(descriptor, payload)
            if written != len(payload):
                raise OSError("short write while appending usage ledger record")
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    return normalized


def record_usage(path: Path | str, **values: Any) -> dict[str, Any]:
    """Create, validate, and append one usage record."""

    return append_record(path, make_record(**values))


def load_records(
    path: Path | str, *, chain_id: str | None = None
) -> list[dict[str, Any]]:
    """Read and validate ledger records, optionally filtering by chain."""

    ledger_path = Path(path)
    records: list[dict[str, Any]] = []
    with _ledger_lock(ledger_path, exclusive=False):
        try:
            ledger = ledger_path.open(encoding="utf-8")
        except FileNotFoundError:
            return []
        with ledger:
            for line_number, raw_line in enumerate(ledger, start=1):
                if not raw_line.strip():
                    continue
                try:
                    decoded = json.loads(raw_line)
                    if not isinstance(decoded, dict):
                        raise LedgerError("ledger line must contain a JSON object")
                    record = validate_record(decoded)
                except (json.JSONDecodeError, LedgerError) as exc:
                    raise LedgerError(
                        f"invalid ledger record at {ledger_path}:{line_number}: {exc}"
                    ) from exc
                if chain_id is None or record["chain_id"] == chain_id:
                    records.append(record)
    return records


def _empty_totals() -> dict[str, int]:
    return {
        "record_count": 0,
        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "cached_input_tokens": 0,
        "context_tokens": 0,
        "retry_cost_tokens": 0,
        "accepted_commit_count": 0,
        "estimated_record_count": 0,
    }


def _accumulate(totals: dict[str, int], record: Mapping[str, Any]) -> None:
    totals["record_count"] += 1
    for field in (
        "input_tokens",
        "output_tokens",
        "total_tokens",
        "cached_input_tokens",
        "context_tokens",
    ):
        totals[field] += record[field]
    if record["attempt"] > 1:
        totals["retry_cost_tokens"] += record["total_tokens"]
    if record["accepted_commit"]:
        totals["accepted_commit_count"] += 1
    if record["estimated"]:
        totals["estimated_record_count"] += 1


def _ratio(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 6) if denominator else 0.0


def summarize_records(records: Iterable[Mapping[str, Any]]) -> dict[str, Any]:
    """Return deterministic totals and efficiency metrics for validated records."""

    validated = [validate_record(record) for record in records]
    totals = _empty_totals()
    per_phase: dict[str, dict[str, int]] = {}
    duplicate_context_tokens = 0
    seen_contexts: set[tuple[str, str]] = set()

    for record in validated:
        _accumulate(totals, record)
        phase_totals = per_phase.setdefault(record["phase"], _empty_totals())
        _accumulate(phase_totals, record)

        context_hash = record["context_hash"]
        if context_hash is not None:
            context_key = (record["chain_id"], context_hash)
            if context_key in seen_contexts:
                duplicate_context_tokens += record["context_tokens"]
            else:
                seen_contexts.add(context_key)

    accepted = totals["accepted_commit_count"]
    tokens_per_commit = (
        round(totals["total_tokens"] / accepted, 2) if accepted else None
    )
    return {
        "totals": totals,
        "per_phase": {phase: per_phase[phase] for phase in sorted(per_phase)},
        "duplicate_context_tokens": duplicate_context_tokens,
        "duplicate_context_ratio": _ratio(
            duplicate_context_tokens, totals["input_tokens"]
        ),
        "retry_cost_tokens": totals["retry_cost_tokens"],
        "cache_hit_rate": _ratio(
            totals["cached_input_tokens"], totals["input_tokens"]
        ),
        "accepted_commit_count": accepted,
        "tokens_per_accepted_commit": tokens_per_commit,
        "estimated_record_count": totals["estimated_record_count"],
    }


def summarize_ledger(
    path: Path | str, *, chain_id: str | None = None
) -> dict[str, Any]:
    """Load and summarize a ledger file."""

    return summarize_records(load_records(path, chain_id=chain_id))


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Record and summarize metadata-only Hyperflow usage JSONL."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    record = subparsers.add_parser("record", help="append one validated record")
    record.add_argument("ledger", type=Path)
    record.add_argument("--chain-id", required=True)
    record.add_argument("--phase", required=True)
    record.add_argument("--batch", type=int)
    record.add_argument("--task")
    record.add_argument("--attempt", type=int, default=1)
    record.add_argument("--role", required=True)
    record.add_argument("--input-tokens", type=int, required=True)
    record.add_argument("--output-tokens", type=int, required=True)
    record.add_argument("--total-tokens", type=int)
    record.add_argument("--cached-input-tokens", type=int, default=0)
    record.add_argument("--context-hash")
    record.add_argument("--context-tokens", type=int, default=0)
    record.add_argument("--estimated", action="store_true")
    record.add_argument("--accepted-commit", action="store_true")
    record.add_argument("--timestamp")

    summary = subparsers.add_parser("summary", help="summarize ledger records")
    summary.add_argument("ledger", type=Path)
    summary.add_argument("--chain-id")
    summary.add_argument("--pretty", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "record":
            record = record_usage(
                args.ledger,
                chain_id=args.chain_id,
                phase=args.phase,
                batch=args.batch,
                task=args.task,
                attempt=args.attempt,
                role=args.role,
                input_tokens=args.input_tokens,
                output_tokens=args.output_tokens,
                total_tokens=args.total_tokens,
                cached_input_tokens=args.cached_input_tokens,
                context_hash=args.context_hash,
                context_tokens=args.context_tokens,
                estimated=args.estimated,
                accepted_commit=args.accepted_commit,
                timestamp=args.timestamp,
            )
            print(json.dumps(record, sort_keys=True, separators=(",", ":")))
        else:
            summary = summarize_ledger(args.ledger, chain_id=args.chain_id)
            if args.pretty:
                print(json.dumps(summary, indent=2, sort_keys=True))
            else:
                print(json.dumps(summary, sort_keys=True, separators=(",", ":")))
    except (LedgerError, OSError) as exc:
        print(f"usage-ledger: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
