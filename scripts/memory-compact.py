#!/usr/bin/env python3
"""Deterministic memory compact / cold-archive helper (no LLM).

Mechanical path for `/hyperflow:cache compact` and `archive`:

  - Split category files into preamble + h2/h3 entry blocks
  - Classify by entry date: hot (<= hot_days), warm, cold
  - mode=compact  → eligible when age > hot_days (default 7)
  - mode=archive  → eligible when age > warm_days (default 30, cold tier)
  - Skip already-stubbed entries (— summarized, see archive/…)
  - Skip undated / future-dated entries (keep hot)
  - Skip anti-patterns.md and project-decisions.md by default
  - Append full original blocks to memory/archive/YYYY-MM.md (dedup by header)
  - Rewrite source with one-line stubs; rebuild index + .checksums

Default is dry-run (plan only). Pass --apply to mutate.

Usage
-----
  memory-compact.py --memory-dir .hyperflow/memory
  memory-compact.py --memory-dir .hyperflow/memory --mode archive --apply
  memory-compact.py --memory-dir .hyperflow/memory --file learnings.md --apply
  memory-compact.py --memory-dir .hyperflow/memory --json --apply
"""
from __future__ import annotations

import argparse
import fcntl
import importlib.util
import json
import os
import re
import stat
import sys
import uuid
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from pathlib import Path

HOT_DAYS = 7
WARM_DAYS = 30

DEFAULT_CATEGORY_FILES = (
    "learnings.md",
    "decisions.md",
    "pitfalls.md",
    "patterns.md",
    "conventions.md",
)
# Always-hot / structural — not compacted unless --include-special
SKIP_DEFAULT = frozenset({"anti-patterns.md", "project-decisions.md"})
EXCLUDED = frozenset({"index.md", "session-context.md", "doctrine.md", "doctrine-index.md"})

HEADING_RE = re.compile(r"^(#{2,3})\s+(.+)$")
DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")
# Tags: unbackticked [a, b] or legacy `[a, b]` — reject date-bearing brackets.
TAGS_RE = re.compile(r"`?\[([a-z0-9,\s-]+)\]`?", re.IGNORECASE)
STUB_MARKER_RE = re.compile(r"—\s*summarized", re.IGNORECASE)
STUB_SUFFIX = "— summarized, see archive/{month}.md"


@dataclass
class PlannedEntry:
    file: str
    day: str
    month: str
    title: str
    tags: list[str]
    age_days: int
    header_key: str
    stub_line: str
    full_block: str
    action: str  # compact | skip_stub | skip_young | skip_undated | skip_dup_archive
    reason: str = ""


@dataclass
class CompactReport:
    memory_dir: str
    mode: str
    applied: bool
    hot_days: int
    warm_days: int
    planned: list[dict] = field(default_factory=list)
    compacted: int = 0
    skipped: int = 0
    rejected_dup: int = 0
    archive_files: list[str] = field(default_factory=list)
    source_files: list[str] = field(default_factory=list)
    index_rebuilt: bool = False
    errors: list[str] = field(default_factory=list)
    ok: bool = True


def _to_date(raw: str) -> date | None:
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError:
        return None


def parse_tags(heading_rest: str) -> list[str]:
    for match in TAGS_RE.finditer(heading_rest):
        inner = match.group(1)
        if DATE_RE.search(inner):
            continue
        return [t.strip().lower() for t in inner.split(",") if t.strip()]
    return []


def strip_heading_meta(heading_rest: str) -> str:
    """Title text without date brackets/parens, tags, or stub suffix."""
    text = STUB_MARKER_RE.split(heading_rest, maxsplit=1)[0]
    # drop tag forms
    text = TAGS_RE.sub(" ", text)
    # drop [YYYY-MM-DD] or (YYYY-MM-DD, …)
    text = re.sub(r"\[\d{4}-\d{2}-\d{2}\]", " ", text)
    text = re.sub(r"\([^)]*\d{4}-\d{2}-\d{2}[^)]*\)", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" -—\t")
    return text


def header_key(day: str, title: str, tags: list[str]) -> str:
    tag_part = ",".join(sorted(tags))
    return f"{day}|{title.strip().lower()}|{tag_part}"


def is_stub_heading(heading_rest: str) -> bool:
    return bool(STUB_MARKER_RE.search(heading_rest))


def split_entries(text: str) -> tuple[str, list[tuple[str, str, str]]]:
    """Return (preamble, [(heading_line, body, full_block), ...])."""
    lines = text.splitlines(keepends=True)
    if not lines:
        return "", []
    preamble: list[str] = []
    entries: list[list[str]] = []
    current: list[str] | None = None
    for line in lines:
        if HEADING_RE.match(line.rstrip("\n")):
            if current is not None:
                entries.append(current)
            current = [line]
        else:
            if current is None:
                preamble.append(line)
            else:
                current.append(line)
    if current is not None:
        entries.append(current)

    out: list[tuple[str, str, str]] = []
    for block_lines in entries:
        full = "".join(block_lines)
        heading = block_lines[0].rstrip("\n")
        body = "".join(block_lines[1:])
        out.append((heading, body, full))
    return "".join(preamble), out


def format_stub(level: str, day: str, title: str, tags: list[str], month: str) -> str:
    tag_s = f"  [{', '.join(tags)}]" if tags else ""
    return f"{level} [{day}] {title}{tag_s} {STUB_SUFFIX.format(month=month)}\n"


def archive_header_keys(archive_text: str) -> set[str]:
    keys: set[str] = set()
    for heading, body, full in split_entries(archive_text)[1]:
        if not body.strip():
            continue
        rest = heading.strip()
        m = HEADING_RE.match(rest)
        if not m:
            continue
        rest = m.group(2).strip()
        if is_stub_heading(rest):
            continue
        dm = DATE_RE.search(rest)
        if not dm:
            continue
        day = dm.group(1)
        tags = parse_tags(rest)
        title = strip_heading_meta(rest)
        canonical = full.rstrip() + "\n"
        keys.add(f"{header_key(day, title, tags)}\0{canonical}")
    return keys


def load_existing_archive_keys(
    archive_dir: Path, *, dir_fd: int | None = None
) -> dict[str, set[str]]:
    """month -> header keys already present; never follow archive symlinks."""
    out: dict[str, set[str]] = {}
    owned_fd = dir_fd is None
    if dir_fd is None:
        if not archive_dir.is_dir() or archive_dir.is_symlink():
            return out
        try:
            dir_fd = _open_directory_path(archive_dir)
        except OSError:
            return out
    try:
        for name in os.listdir(dir_fd):
            if not re.fullmatch(r"\d{4}-\d{2}\.md", name):
                continue
            try:
                fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=dir_fd)
                st = os.fstat(fd)
                if not stat.S_ISREG(st.st_mode) or st.st_nlink > 1:
                    os.close(fd)
                    continue
                with os.fdopen(fd, "r", encoding="utf-8", errors="replace") as fh:
                    out[Path(name).stem] = archive_header_keys(fh.read())
            except OSError:
                continue
    finally:
        if owned_fd:
            os.close(dir_fd)
    return out


def rebuild_index(hf_dir: Path) -> bool:
    """Call memory-index.py against the .hyperflow parent when available."""
    script = Path(__file__).resolve().parent / "memory-index.py"
    if not script.is_file():
        return False
    try:
        spec = importlib.util.spec_from_file_location("hyperflow_memory_index", script)
        if spec is None or spec.loader is None:
            return False
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        if hasattr(mod, "main"):
            code = mod.main(["memory-index.py", str(hf_dir)])
            return code == 0
    except Exception:
        return False
    return False


def _read_regular_text(path: Path) -> str:
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    st = os.fstat(fd)
    if not stat.S_ISREG(st.st_mode):
        os.close(fd)
        raise OSError(f"not a regular file: {path.name}")
    with os.fdopen(fd, "r", encoding="utf-8", errors="replace") as stream:
        return stream.read()


def plan_file(
    path: Path,
    rel_name: str,
    *,
    mode: str,
    hot_days: int,
    warm_days: int,
    today: date,
    archive_keys: dict[str, set[str]],
) -> tuple[str, list[PlannedEntry], list[str]]:
    """Return (original_text, plans, new_source_lines_if_applied)."""
    try:
        text = _read_regular_text(path)
    except OSError as exc:
        return "", [], [f"unreadable {rel_name}: {exc}"]

    preamble, blocks = split_entries(text)
    plans: list[PlannedEntry] = []
    new_parts: list[str] = [preamble] if preamble else []
    # Ensure trailing newline hygiene on preamble
    if new_parts and new_parts[0] and not new_parts[0].endswith("\n"):
        new_parts[0] = new_parts[0] + "\n"

    min_age = hot_days if mode == "compact" else warm_days

    for heading, body, full in blocks:
        hm = HEADING_RE.match(heading.strip())
        if not hm:
            new_parts.append(full if full.endswith("\n") else full + "\n")
            continue
        level, rest = hm.group(1), hm.group(2).strip()

        if is_stub_heading(rest):
            plans.append(
                PlannedEntry(
                    file=rel_name,
                    day="",
                    month="",
                    title=strip_heading_meta(rest),
                    tags=parse_tags(rest),
                    age_days=-1,
                    header_key="",
                    stub_line=heading + "\n",
                    full_block=full,
                    action="skip_stub",
                    reason="already stubbed",
                )
            )
            new_parts.append(full if full.endswith("\n") else full + "\n")
            continue

        dm = DATE_RE.search(rest)
        day_s = dm.group(1) if dm else ""
        day = _to_date(day_s) if day_s else None
        tags = parse_tags(rest)
        title = strip_heading_meta(rest) or "untitled"

        if day is None:
            plans.append(
                PlannedEntry(
                    file=rel_name,
                    day=day_s or "",
                    month="",
                    title=title,
                    tags=tags,
                    age_days=-1,
                    header_key="",
                    stub_line="",
                    full_block=full,
                    action="skip_undated",
                    reason="no parseable date",
                )
            )
            new_parts.append(full if full.endswith("\n") else full + "\n")
            continue

        age = (today - day).days
        if age < 0:
            # future-dated → treat as hot
            plans.append(
                PlannedEntry(
                    file=rel_name,
                    day=day.isoformat(),
                    month=day.strftime("%Y-%m"),
                    title=title,
                    tags=tags,
                    age_days=age,
                    header_key="",
                    stub_line="",
                    full_block=full,
                    action="skip_young",
                    reason="future-dated",
                )
            )
            new_parts.append(full if full.endswith("\n") else full + "\n")
            continue

        if age <= min_age:
            plans.append(
                PlannedEntry(
                    file=rel_name,
                    day=day.isoformat(),
                    month=day.strftime("%Y-%m"),
                    title=title,
                    tags=tags,
                    age_days=age,
                    header_key="",
                    stub_line="",
                    full_block=full,
                    action="skip_young",
                    reason=f"age {age}d <= {min_age}d",
                )
            )
            new_parts.append(full if full.endswith("\n") else full + "\n")
            continue

        month = day.strftime("%Y-%m")
        hkey = header_key(day.isoformat(), title, tags)
        existing = archive_keys.setdefault(month, set())
        archive_identity = f"{hkey}\0{full.rstrip()}\n"
        if archive_identity in existing:
            # Already in archive — still convert source to stub if body remains full
            stub = format_stub(level, day.isoformat(), title, tags, month)
            plans.append(
                PlannedEntry(
                    file=rel_name,
                    day=day.isoformat(),
                    month=month,
                    title=title,
                    tags=tags,
                    age_days=age,
                    header_key=hkey,
                    stub_line=stub,
                    full_block=full,
                    action="skip_dup_archive",
                    reason="archive header already present; stub source only",
                )
            )
            new_parts.append(stub)
            continue

        stub = format_stub(level, day.isoformat(), title, tags, month)
        plans.append(
            PlannedEntry(
                file=rel_name,
                day=day.isoformat(),
                month=month,
                title=title,
                tags=tags,
                age_days=age,
                header_key=hkey,
                stub_line=stub,
                full_block=full if full.endswith("\n") else full + "\n",
                action="compact",
                reason=f"age {age}d > {min_age}d",
            )
        )
        # Reserve key so same-run duplicates within one file don't double-append
        existing.add(archive_identity)
        new_parts.append(stub)

    return text, plans, new_parts


def _append_archive_fd(
    archive_dir: Path, month: str, block: str, *, dir_fd: int | None = None
) -> Path:
    owned_fd = dir_fd is None
    if dir_fd is None:
        try:
            dir_fd = _open_directory_path(archive_dir)
        except FileNotFoundError:
            parent_fd = _open_directory_path(archive_dir.parent)
            try:
                try:
                    os.mkdir(archive_dir.name, dir_fd=parent_fd)
                except FileExistsError:
                    pass
                os.fsync(parent_fd)
                dir_fd = os.open(
                    archive_dir.name,
                    os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                    dir_fd=parent_fd,
                )
            finally:
                os.close(parent_fd)
    try:
        block = block if block.endswith("\n") else block + "\n"
        name = f"{month}.md"
        try:
            fd = os.open(
                name,
                os.O_RDWR | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW | os.O_NONBLOCK,
                0o644,
                dir_fd=dir_fd,
            )
            try:
                fcntl.flock(fd, fcntl.LOCK_EX)
            except BaseException:
                os.close(fd)
                raise
            st = os.fstat(fd)
            if not stat.S_ISREG(st.st_mode) or st.st_nlink > 1:
                os.close(fd)
                raise OSError("archive sidecar is not a private regular file")
            existed = st.st_size > 0
            if existed:
                existing = os.pread(fd, st.st_size, 0).decode("utf-8", errors="replace")
                if archive_header_keys(block) & archive_header_keys(existing):
                    os.close(fd)
                    return archive_dir / name
        except FileNotFoundError:
            raise
        with os.fdopen(fd, "a", encoding="utf-8") as fh:
            if existed:
                fh.write("\n")
            fh.write(block)
            fh.flush()
            os.fsync(fh.fileno())
        os.fsync(dir_fd)
        return archive_dir / name
    finally:
        if owned_fd and dir_fd is not None:
            os.close(dir_fd)


def _open_directory_path(path: Path) -> int:
    absolute = path.absolute()
    if not absolute.is_absolute() or any(part in ("", ".", "..") for part in absolute.parts):
        raise OSError("directory path is not a safe absolute path")
    expected = os.stat(absolute, follow_symlinks=False)
    if not stat.S_ISDIR(expected.st_mode):
        raise OSError("directory path is not a directory")
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in absolute.parts[1:]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        actual = os.fstat(fd)
        if (actual.st_dev, actual.st_ino) != (expected.st_dev, expected.st_ino):
            raise OSError("directory changed during secure open")
        return fd
    except Exception:
        os.close(fd)
        raise

def _write_text_no_follow(
    path: Path, content: str, *, expected: str | None = None
) -> None:
    try:
        dir_fd = _open_directory_path(path.parent)
    except OSError:
        raise
    temp_name = f".{path.name}.{uuid.uuid4().hex}.tmp"
    try:
        try:
            old_st = os.stat(path.name, dir_fd=dir_fd, follow_symlinks=False)
            if stat.S_ISLNK(old_st.st_mode):
                raise OSError("source is a symlink")
            mode = stat.S_IMODE(old_st.st_mode)
        except FileNotFoundError:
            mode = 0o644
        fd = os.open(
            temp_name,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
            0o644,
            dir_fd=dir_fd,
        )
        os.fchmod(fd, mode)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(content)
            fh.flush()
            os.fsync(fh.fileno())
        try:
            st = os.stat(path.name, dir_fd=dir_fd, follow_symlinks=False)
            if stat.S_ISLNK(st.st_mode):
                raise OSError("source is a symlink")
        except FileNotFoundError:
            pass
        if expected is not None:
            guard_name = f".{path.name}.{uuid.uuid4().hex}.guard"
            os.rename(path.name, guard_name, src_dir_fd=dir_fd, dst_dir_fd=dir_fd)
            try:
                guard_fd = os.open(
                    guard_name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=dir_fd
                )
                guard_st = os.fstat(guard_fd)
                if not stat.S_ISREG(guard_st.st_mode):
                    os.close(guard_fd)
                    raise OSError("guard source is not regular")
                with os.fdopen(guard_fd, "r", encoding="utf-8", errors="replace") as guard:
                    unchanged = guard.read() == expected
                if not unchanged:
                    raise OSError("source changed during replacement")
                try:
                    os.link(
                        temp_name,
                        path.name,
                        src_dir_fd=dir_fd,
                        dst_dir_fd=dir_fd,
                        follow_symlinks=False,
                    )
                except FileExistsError as exc:
                    raise OSError("source recreated during replacement") from exc
                os.unlink(guard_name, dir_fd=dir_fd)
                os.unlink(temp_name, dir_fd=dir_fd)
            except Exception:
                try:
                    os.link(
                        guard_name,
                        path.name,
                        src_dir_fd=dir_fd,
                        dst_dir_fd=dir_fd,
                        follow_symlinks=False,
                    )
                    os.unlink(guard_name, dir_fd=dir_fd)
                except FileExistsError:
                    pass
                raise
        else:
            os.link(
                temp_name,
                path.name,
                src_dir_fd=dir_fd,
                dst_dir_fd=dir_fd,
                follow_symlinks=False,
            )
            os.unlink(temp_name, dir_fd=dir_fd)
        os.fsync(dir_fd)
    finally:
        try:
            os.unlink(temp_name, dir_fd=dir_fd)
        except FileNotFoundError:
            pass
        os.close(dir_fd)


def append_archive(archive_dir: Path, month: str, block: str) -> Path:
    return _append_archive_fd(archive_dir, month, block)


def resolve_targets(
    mem: Path,
    file_arg: str | None,
    include_special: bool,
) -> list[Path]:
    if file_arg:
        p = Path(file_arg)
        if not p.is_absolute():
            # allow bare name or relative
            cand = mem / p.name if p.name == str(p) or not p.exists() else p
            if not cand.is_file() and (mem / p.name).is_file():
                cand = mem / p.name
            p = cand
        if not p.is_file() or p.is_symlink():
            raise FileNotFoundError(f"memory file not found: {file_arg}")
        # path safety: must live under mem
        try:
            p.resolve().relative_to(mem.resolve())
        except ValueError as exc:
            raise ValueError(f"file escapes memory dir: {file_arg}") from exc
        return [p]

    names = list(DEFAULT_CATEGORY_FILES)
    if include_special:
        names = list(DEFAULT_CATEGORY_FILES) + sorted(SKIP_DEFAULT)
    out: list[Path] = []
    for name in names:
        p = mem / name
        if p.is_file() and not p.is_symlink() and p.resolve(strict=False).parent == mem.absolute():
            out.append(p)
    return out


def run_compact(
    mem: Path,
    *,
    mode: str = "compact",
    apply: bool = False,
    hot_days: int = HOT_DAYS,
    warm_days: int = WARM_DAYS,
    file_arg: str | None = None,
    include_special: bool = False,
    today: date | None = None,
    rebuild: bool = True,
) -> CompactReport:
    today = today or date.today()
    report = CompactReport(
        memory_dir=str(mem),
        mode=mode,
        applied=False,
        hot_days=hot_days,
        warm_days=warm_days,
    )
    if mode not in {"compact", "archive"}:
        report.ok = False
        report.errors.append(f"unknown mode: {mode}")
        return report
    mem_abs = mem.absolute()
    if (
        not mem.is_dir()
        or mem.is_symlink()
        or mem.resolve(strict=False) != mem_abs
    ):
        report.ok = False
        report.errors.append("memory dir is symlinked or non-canonical")
        return report

    archive_dir = mem / "archive"
    if archive_dir.is_symlink():
        report.ok = False
        report.errors.append("archive dir is symlinked")
        return report
    archive_keys = load_existing_archive_keys(archive_dir)

    try:
        targets = resolve_targets(mem, file_arg, include_special)
    except (FileNotFoundError, ValueError) as exc:
        report.ok = False
        report.errors.append(str(exc))
        return report

    # month -> list of full blocks to append
    to_archive: dict[str, list[str]] = {}
    # path -> new text
    rewrites: dict[Path, tuple[str, str]] = {}

    for path in targets:
        rel = path.name
        if rel in EXCLUDED:
            continue
        if rel in SKIP_DEFAULT and not include_special and not file_arg:
            continue
        _orig, plans, new_parts = plan_file(
            path,
            rel,
            mode=mode,
            hot_days=hot_days,
            warm_days=warm_days,
            today=today,
            archive_keys=archive_keys,
        )
        changed = False
        for pl in plans:
            report.planned.append(asdict(pl))
            if pl.action == "compact":
                report.compacted += 1
                to_archive.setdefault(pl.month, []).append(pl.full_block)
                changed = True
            elif pl.action == "skip_dup_archive":
                report.rejected_dup += 1
                # stub-only rewrite still reduces source size
                changed = True
            else:
                report.skipped += 1
        if changed:
            new_text = "".join(new_parts)
            if not new_text.endswith("\n") and new_text:
                new_text += "\n"
            rewrites[path] = (new_text, _orig)

    if not apply:
        return report

    # Mutate: archives first (so failure leaves source intact), then sources
    written_archives: list[str] = []
    try:
        for month, blocks in sorted(to_archive.items()):
            for block in blocks:
                sidecar = append_archive(archive_dir, month, block)
                rel = str(sidecar.relative_to(mem)) if sidecar.is_relative_to(mem) else str(sidecar)
                if rel not in written_archives:
                    written_archives.append(rel)
        for path, (new_text, expected_text) in rewrites.items():
            if _read_regular_text(path) != expected_text:
                raise OSError(f"source changed during compaction: {path.name}")
            _write_text_no_follow(path, new_text, expected=expected_text)
            report.source_files.append(path.name)
    except OSError as exc:
        report.ok = False
        report.errors.append(f"write failed: {exc}")
        return report

    report.archive_files = written_archives
    report.applied = True

    if rebuild:
        # memory dir is .hyperflow/memory → parent is .hyperflow
        hf = mem.parent if mem.name == "memory" else mem.parent
        report.index_rebuilt = rebuild_index(hf)

    return report


def format_text(report: CompactReport) -> str:
    lines: list[str] = []
    lines.append(
        f"memory_dir={report.memory_dir} mode={report.mode} "
        f"applied={report.applied} hot_days={report.hot_days} warm_days={report.warm_days}"
    )
    lines.append(
        f"compacted={report.compacted} skipped={report.skipped} "
        f"rejected_dup={report.rejected_dup} planned={len(report.planned)}"
    )
    for pl in report.planned:
        action = pl.get("action", "?")
        if action in {"skip_stub", "skip_young", "skip_undated"} and report.compacted:
            # keep output short: only show skips when nothing compacted? show all compact + dups
            continue
        if action == "compact" or action == "skip_dup_archive":
            lines.append(
                f"{action.upper()} {pl.get('file')}: [{pl.get('day')}] "
                f"{pl.get('title', '')[:60]} ({pl.get('reason', '')})"
            )
    # if nothing to do, show a clear line
    if report.compacted == 0 and report.rejected_dup == 0:
        lines.append("NOOP nothing eligible (already compacted or all entries hot/undated)")
    if report.applied:
        if report.archive_files:
            lines.append("archives: " + ", ".join(report.archive_files))
        if report.source_files:
            lines.append("rewrote: " + ", ".join(report.source_files))
        lines.append(f"index_rebuilt={report.index_rebuilt}")
    else:
        if report.compacted or report.rejected_dup:
            lines.append("dry-run only — pass --apply to mutate")
    for err in report.errors:
        lines.append(f"ERROR {err}")
    if report.ok and not report.errors:
        lines.append("PASS")
    elif not report.ok:
        lines.append("FAIL")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Deterministic Hyperflow memory compact / cold-archive (no LLM)"
    )
    ap.add_argument(
        "--memory-dir",
        type=Path,
        default=Path(".hyperflow/memory"),
        help="Path to project memory dir",
    )
    ap.add_argument(
        "--mode",
        choices=("compact", "archive"),
        default="compact",
        help="compact: age>hot_days (default 7); archive: age>warm_days (default 30)",
    )
    ap.add_argument(
        "--apply",
        action="store_true",
        help="Mutate files (default is dry-run plan only)",
    )
    ap.add_argument(
        "--file",
        dest="file_arg",
        default=None,
        help="Single category file name or path under memory dir",
    )
    ap.add_argument(
        "--hot-days",
        type=int,
        default=HOT_DAYS,
        help=f"Hot window — compact eligibility age > N (default {HOT_DAYS})",
    )
    ap.add_argument(
        "--warm-days",
        type=int,
        default=WARM_DAYS,
        help=f"Warm window — archive mode eligibility age > N (default {WARM_DAYS})",
    )
    ap.add_argument(
        "--include-special",
        action="store_true",
        help="Also process anti-patterns.md and project-decisions.md",
    )
    ap.add_argument(
        "--no-rebuild-index",
        action="store_true",
        help="Skip memory-index.py after --apply",
    )
    ap.add_argument("--json", action="store_true", help="Machine-readable JSON")
    args = ap.parse_args(argv)

    report = run_compact(
        args.memory_dir,
        mode=args.mode,
        apply=args.apply,
        hot_days=args.hot_days,
        warm_days=args.warm_days,
        file_arg=args.file_arg,
        include_special=args.include_special,
        rebuild=not args.no_rebuild_index,
    )
    if args.json:
        print(json.dumps(asdict(report), indent=2))
    else:
        sys.stdout.write(format_text(report))
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
