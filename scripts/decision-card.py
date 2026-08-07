#!/usr/bin/env python3
"""Lock a reviewed decision card into project memory.

The plan skill presents the options and gets the user's choice. This helper
performs the mechanical same-turn write so every lock has the fields required
by the memory index and duplicate locks fail closed.

Usage:
  decision-card.py lock --memory-dir .hyperflow/memory \
    --title "Edge API framework" --choice "Hono" \
    --why "It matches the existing runtime" --revisit-if "The runtime changes"
  decision-card.py validate --memory-dir .hyperflow/memory

Stdlib only. No network access and no source-code writes.
"""
from __future__ import annotations

import argparse
import errno
import json
import os
import re
import sys
import time
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Any, Sequence

try:  # POSIX inter-process locking.
    import fcntl
except ImportError:  # pragma: no cover - exercised on Windows.
    fcntl = None

try:  # Windows inter-process byte-range locking.
    import msvcrt
except ImportError:  # pragma: no cover - exercised on POSIX.
    msvcrt = None

HEADING_RE = re.compile(r"^#{2,3}\s+(?P<title>.+?)\s*$", re.MULTILINE)
DATE_RE = re.compile(r"\[\d{4}-\d{2}-\d{2}\]")
TAG_RE = re.compile(r"\s+`?\[[^\]]*\]`?\s*$")
STUB_RE = re.compile(r"\s+—\s+summarized,\s+see\s+archive/.*$", re.IGNORECASE)
SAFE_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_LENGTHS = {
    "title": 160,
    "choice": 2000,
    "why": 2000,
    "chooser": 160,
    "revisit_if": 1000,
}


class DecisionCardError(ValueError):
    """A user-provided card cannot be safely or consistently recorded."""


def _clean_field(name: str, value: str | None, *, required: bool = True) -> str:
    if value is None:
        if required:
            raise DecisionCardError(f"{name} is required")
        return ""
    cleaned = value.strip()
    if required and not cleaned:
        raise DecisionCardError(f"{name} must not be empty")
    if len(cleaned) > MAX_LENGTHS[name]:
        raise DecisionCardError(f"{name} exceeds {MAX_LENGTHS[name]} characters")
    if any(ord(char) < 32 and char not in "\t" for char in cleaned):
        raise DecisionCardError(f"{name} contains a control character")
    if "\n" in cleaned or "\r" in cleaned:
        raise DecisionCardError(f"{name} must be one line")
    return cleaned


def _parse_date(raw: str | None) -> str:
    value = raw or date.today().isoformat()
    if not SAFE_DATE_RE.fullmatch(value):
        raise DecisionCardError("date must use YYYY-MM-DD")
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise DecisionCardError("date is not a valid calendar date") from exc
    return value


def normalize_title(raw: str) -> str:
    """Normalize heading metadata for duplicate detection."""
    title = DATE_RE.sub(" ", raw)
    title = TAG_RE.sub("", title)
    title = STUB_RE.sub("", title)
    title = re.sub(r"[`*_~]", "", title)
    title = re.sub(r"\s+", " ", title).strip(" -—")
    return title.casefold()


def existing_titles(text: str) -> set[str]:
    titles: set[str] = set()
    for match in HEADING_RE.finditer(text):
        title = normalize_title(match.group("title"))
        if title:
            titles.add(title)
    return titles


def duplicate_titles(text: str) -> list[str]:
    counts: dict[str, int] = {}
    for match in HEADING_RE.finditer(text):
        title = normalize_title(match.group("title"))
        if title:
            counts[title] = counts.get(title, 0) + 1
    return sorted(title for title, count in counts.items() if count > 1)


def validate_memory(memory_dir: Path) -> dict[str, object]:
    path = memory_dir / "decisions.md"
    if not memory_dir.exists():
        return {"ok": True, "memory_dir": str(memory_dir), "entries": 0, "duplicates": []}
    if not memory_dir.is_dir() or memory_dir.is_symlink():
        return {
            "ok": False,
            "memory_dir": str(memory_dir),
            "entries": 0,
            "duplicates": [],
            "error": "memory directory must be a real directory",
        }
    if not path.exists():
        return {"ok": True, "memory_dir": str(memory_dir), "entries": 0, "duplicates": []}
    if path.is_symlink() or not path.is_file():
        return {
            "ok": False,
            "memory_dir": str(memory_dir),
            "entries": 0,
            "duplicates": [],
            "error": "decisions.md must be a regular file, not a symlink",
        }
    text = path.read_text(encoding="utf-8", errors="replace")
    duplicates = duplicate_titles(text)
    return {
        "ok": not duplicates,
        "memory_dir": str(memory_dir),
        "entries": len(existing_titles(text)),
        "duplicates": duplicates,
        **({"error": "duplicate decision headings found"} if duplicates else {}),
    }


def format_lock(
    *, title: str, choice: str, why: str, revisit_if: str, chooser: str, locked_date: str
) -> str:
    chooser_line = f"- Chooser: {chooser}\n" if chooser else ""
    return (
        f"### [{locked_date}] {title}  `[decision]`\n"
        f"- Choice: {choice}\n"
        f"- Why: {why}\n"
        f"{chooser_line}"
        f"- Revisit if: {revisit_if}\n\n"
    )


def _acquire_lock(lock_file: Any) -> None:
    if fcntl is not None:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        return
    if msvcrt is not None:  # pragma: no cover - exercised on Windows.
        lock_file.seek(0)
        while True:
            try:
                getattr(msvcrt, "locking")(
                    lock_file.fileno(), getattr(msvcrt, "LK_NBLCK"), 1
                )
                return
            except OSError as exc:
                if exc.errno not in (errno.EACCES, errno.EAGAIN, errno.EDEADLK):
                    raise
                time.sleep(0.05)
    raise OSError("decision-card locking is unsupported on this platform")


def _release_lock(lock_file: Any) -> None:
    if fcntl is not None:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
        return
    if msvcrt is not None:  # pragma: no cover - exercised on Windows.
        lock_file.seek(0)
        getattr(msvcrt, "locking")(
            lock_file.fileno(), getattr(msvcrt, "LK_UNLCK"), 1
        )
        return
    raise OSError("decision-card locking is unsupported on this platform")


@contextmanager
def _decision_lock(path: Path):
    """Serialize title check + append across processes on POSIX and Windows."""
    flags = os.O_CREAT | os.O_RDWR | getattr(os, "O_BINARY", 0)
    descriptor = os.open(path, flags, 0o600)
    with os.fdopen(descriptor, "r+b", buffering=0) as lock_file:
        if lock_file.seek(0, os.SEEK_END) == 0:
            lock_file.write(b"\0")
            os.fsync(lock_file.fileno())
        lock_file.seek(0)
        _acquire_lock(lock_file)
        try:
            yield
        finally:
            _release_lock(lock_file)


def lock_decision(
    memory_dir: Path,
    *,
    title: str,
    choice: str,
    why: str,
    revisit_if: str,
    chooser: str = "",
    locked_date: str | None = None,
) -> dict[str, object]:
    if memory_dir.exists() and (memory_dir.is_symlink() or not memory_dir.is_dir()):
        raise DecisionCardError("memory directory must be a real directory")

    fields = {
        "title": _clean_field("title", title),
        "choice": _clean_field("choice", choice),
        "why": _clean_field("why", why),
        "revisit_if": _clean_field("revisit_if", revisit_if),
        "chooser": _clean_field("chooser", chooser, required=False),
    }
    day = _parse_date(locked_date)
    block = format_lock(**fields, locked_date=day)

    memory_dir.mkdir(parents=True, exist_ok=True)
    path = memory_dir / "decisions.md"
    if path.exists() and (path.is_symlink() or not path.is_file()):
        raise DecisionCardError("decisions.md must be a regular file, not a symlink")

    lock_path = memory_dir / ".decision-card.lock"
    with _decision_lock(lock_path):
        current = path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""
        if normalize_title(fields["title"]) in existing_titles(current):
            raise DecisionCardError(
                f"decision title already exists: {fields['title']!r}; edit the existing lock or choose a distinct title"
            )
        if not current:
            current = "# Decisions\n\n"
        elif not current.endswith("\n"):
            current += "\n"
        if not current.endswith("\n\n"):
            current += "\n"
        path.write_text(current + block, encoding="utf-8")
    return {
        "ok": True,
        "memory_file": str(path),
        "title": fields["title"],
        "date": day,
        "tag": "decision",
    }


def _emit(value: dict[str, object], as_json: bool) -> None:
    if as_json:
        print(json.dumps(value, sort_keys=True))
    elif value.get("ok"):
        if "memory_file" in value:
            print(f"Locked decision: {value['title']} → {value['memory_file']}")
        else:
            print(f"Decision memory valid: {value['entries']} unique entr{'y' if value['entries'] == 1 else 'ies'}")
    else:
        print(f"ERROR: {value.get('error', 'decision memory is invalid')}", file=sys.stderr)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    lock_parser = sub.add_parser("lock", help="append one reviewed decision lock")
    lock_parser.add_argument("--memory-dir", default=".hyperflow/memory")
    lock_parser.add_argument("--title", required=True)
    lock_parser.add_argument("--choice", required=True)
    lock_parser.add_argument("--why", required=True)
    lock_parser.add_argument("--revisit-if", required=True, dest="revisit_if")
    lock_parser.add_argument("--chooser", default="")
    lock_parser.add_argument("--date", dest="locked_date")
    lock_parser.add_argument("--json", action="store_true")

    validate_parser = sub.add_parser("validate", help="check decision memory shape")
    validate_parser.add_argument("--memory-dir", default=".hyperflow/memory")
    validate_parser.add_argument("--json", action="store_true")

    args = parser.parse_args(argv)
    try:
        memory_dir = Path(args.memory_dir).expanduser()
        if args.command == "validate":
            result = validate_memory(memory_dir)
            _emit(result, args.json)
            return 0 if result["ok"] else 1
        result = lock_decision(
            memory_dir,
            title=args.title,
            choice=args.choice,
            why=args.why,
            revisit_if=args.revisit_if,
            chooser=args.chooser,
            locked_date=args.locked_date,
        )
        _emit(result, args.json)
        return 0
    except (DecisionCardError, OSError) as exc:
        result = {"ok": False, "error": str(exc)}
        _emit(result, getattr(args, "json", False))
        return 2


if __name__ == "__main__":
    sys.exit(main())
