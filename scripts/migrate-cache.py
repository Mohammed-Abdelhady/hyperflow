#!/usr/bin/env python3
"""Migrate a project's .hyperflow/ cache forward when the plugin version moves.

Runs at session start (and is safe to run on demand). Idempotent, non-destructive,
never raises — best-effort. A project set up by an older Hyperflow gets brought up
to the current cache structure the first time a newer plugin starts a session.

Mechanism
---------
- The cache version is stamped in ``.hyperflow/.version`` (the plugin version that
  last set up or migrated the cache). Missing marker ⇒ treat as a legacy cache.
- Each entry in ``MIGRATIONS`` declares ``since`` (the plugin version that introduced
  the change) and a function. A step runs when ``cache_version < since`` — so a cache
  several versions behind catches up through every intermediate step, in order.
- After applying, ``.hyperflow/.version`` is stamped to the current plugin version.
- When cache version already equals the plugin version, this is a fast no-op.

Migrations must be additive and data-preserving — never delete or rewrite user
content. Creating missing skeleton files and refreshing the read-only doctrine copy
is allowed; touching learnings/decisions/task content is not.

Usage
-----
  migrate-cache.py <path-to-.hyperflow> <plugin-version> [--plugin-root <dir>]
"""
from __future__ import annotations
import hashlib
import os
import re
import stat
import sys
import uuid
from pathlib import Path


def parse_version(v: str) -> tuple:
    parts = []
    for chunk in str(v).strip().lstrip("v").split("."):
        num = "".join(c for c in chunk if c.isdigit())
        parts.append(int(num) if num else 0)
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts[:3])


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


def _write_text_no_follow(path: Path, content: str) -> None:
    dir_fd = _open_directory_path(path.parent)
    temp_name = f".{path.name}.{uuid.uuid4().hex}.tmp"
    try:
        try:
            old_st = os.stat(path.name, dir_fd=dir_fd, follow_symlinks=False)
            if stat.S_ISLNK(old_st.st_mode):
                raise OSError("destination is a symlink")
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
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            st = os.stat(path.name, dir_fd=dir_fd, follow_symlinks=False)
            if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode):
                raise OSError("destination is not a regular file")
        except FileNotFoundError:
            pass
        os.replace(temp_name, path.name, src_dir_fd=dir_fd, dst_dir_fd=dir_fd)
        os.fsync(dir_fd)
    finally:
        try:
            os.unlink(temp_name, dir_fd=dir_fd)
        except FileNotFoundError:
            pass
        os.close(dir_fd)


def _read_regular_text(path: Path) -> str:
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    st = os.fstat(fd)
    if not stat.S_ISREG(st.st_mode):
        os.close(fd)
        raise OSError(f"not a regular file: {path}")
    with os.fdopen(fd, "r", encoding="utf-8", errors="replace") as stream:
        return stream.read()


def read_marker(hf: Path) -> str | None:
    m = hf / ".version"
    try:
        if m.is_symlink() or not m.is_file():
            return None
        return _read_regular_text(m).strip() or None
    except Exception:
        return None


def write_marker(hf: Path, version: str) -> None:
    m = hf / ".version"
    try:
        if m.is_symlink() or (m.exists() and not m.is_file()):
            return
        _write_text_no_follow(m, version.strip() + "\n")
    except Exception:
        pass


def _ensure_memory_stub(hf: Path, name: str) -> bool:
    """Create an empty memory stub if absent. Returns True if created."""
    mem = hf / "memory"
    if not mem.is_dir():
        return False
    f = mem / name
    if f.is_symlink() or f.exists():
        return False
    title = name[:-3].replace("-", " ").title() if name.endswith(".md") else name
    content = f"# {title}\n\n<!-- to be populated by future runs -->\n"
    dir_fd = _open_directory_path(mem)
    temp_name = f".{name}.{uuid.uuid4().hex}.tmp"
    try:
        fd = os.open(
            temp_name,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
            0o644,
            dir_fd=dir_fd,
        )
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temp_name, f.name, src_dir_fd=dir_fd, dst_dir_fd=dir_fd, follow_symlinks=False)
        os.fsync(dir_fd)
        return True
    except Exception:
        return False
    finally:
        try:
            os.unlink(temp_name, dir_fd=dir_fd)
        except FileNotFoundError:
            pass
        os.close(dir_fd)


# ── Migration steps ──────────────────────────────────────────────────────────
# Each: (since_version, human_label, fn(hf, plugin_root) -> bool changed)

def _m_memory_files(hf: Path, plugin_root: Path | None) -> bool:
    """Add memory files introduced after the original skeleton."""
    changed = False
    for name in ("anti-patterns.md", "project-decisions.md"):
        changed |= _ensure_memory_stub(hf, name)
    return changed


DOCTRINE_COPY_MARKER = "<!-- generated by scripts/migrate-cache.py; do not hand-edit -->"
# Exact hash of the pristine pre-index doctrine copy. Only this unmarked legacy
# content is safe to replace; customized/unrecognized doctrine is preserved.
LEGACY_DOCTRINE_SHA256 = "f1b73960bef3cc2a0d60c94ac2e9fab4aa04d2b15d7da2d23a4c234d240d3906"


def _m_refresh_doctrine(hf: Path, plugin_root: Path | None) -> bool:
    """Refresh the read-only doctrine copy so an old project picks up new rules
    (specialist registry, feature/phase structure, …). Only the doctrine *copy*
    is touched — never user learnings."""
    if not plugin_root:
        return False
    src = plugin_root / "skills" / "hyperflow" / "DOCTRINE.md"
    dst = hf / "memory" / "doctrine.md"
    try:
        memory_path = hf / "memory"
        if not src.is_file() or not memory_path.is_dir() or memory_path.is_symlink():
            return False
        memory_dir = memory_path.resolve()
        new = DOCTRINE_COPY_MARKER + "\n\n" + _read_regular_text(src)
        if dst.is_symlink() or not dst.resolve().parent == memory_dir:
            return False
        if dst.exists():
            if not dst.is_file():
                return False
            existing = _read_regular_text(dst)
            if not existing.startswith(DOCTRINE_COPY_MARKER):
                legacy_hash = hashlib.sha256(existing.encode()).hexdigest()
                if legacy_hash != LEGACY_DOCTRINE_SHA256:
                    return False
            elif existing == new:
                return False
        _write_text_no_follow(dst, new)
        return True
    except Exception:
        return False


CACHE_INDEX_MARKER = "<!-- generated by scripts/migrate-cache.py; do not hand-edit -->"


def _m_refresh_doctrine_index(hf: Path, plugin_root: Path | None) -> bool:
    """Copy the doctrine index into the cache with source-rooted links.

    The cached doctrine is read from ``.hyperflow/memory/`` rather than the
    plugin tree, so its relative links cannot resolve there. Keep the cache
    copy navigable without copying the entire reference tree.
    """
    if not plugin_root:
        return False
    src = plugin_root / "skills" / "hyperflow" / "doctrine-index.md"
    dst = hf / "memory" / "doctrine-index.md"
    try:
        if not src.is_file() or not (hf / "memory").is_dir():
            return False
        memory_path = hf / "memory"
        if memory_path.is_symlink():
            return False
        source_root = src.parent
        memory_dir = memory_path.resolve()
        text = _read_regular_text(src)

        def root_link(match: re.Match[str]) -> str:
            href = match.group(1)
            if href.startswith(("http://", "https://", "#")):
                return match.group(0)
            return f"]({(source_root / href).resolve().as_uri()})"

        cached = CACHE_INDEX_MARKER + "\n\n" + re.sub(r"\]\(([^)]+)\)", root_link, text)
        if dst.is_symlink() or not dst.resolve().parent == memory_dir:
            return False
        if dst.exists():
            if not dst.is_file():
                return False
            existing = _read_regular_text(dst)
            if not existing.startswith(CACHE_INDEX_MARKER):
                return False
            if existing == cached:
                return False
        _write_text_no_follow(dst, cached)
        return True
    except Exception:
        return False


MIGRATIONS = [
    ("4.29.0", "add anti-patterns + project-decisions memory files", _m_memory_files),
    ("4.29.0", "refresh portable doctrine copy", _m_refresh_doctrine),
    ("5.28.0", "refresh portable doctrine copy", _m_refresh_doctrine),
    ("5.28.0", "refresh cached doctrine index", _m_refresh_doctrine_index),
]


def main() -> None:
    if len(sys.argv) < 3:
        return
    hf = Path(sys.argv[1])
    plugin_version = sys.argv[2]
    plugin_root = None
    args = sys.argv[3:]
    for i, a in enumerate(args):
        if a == "--plugin-root" and i + 1 < len(args):
            plugin_root = Path(args[i + 1])
        elif a.startswith("--plugin-root="):
            plugin_root = Path(a.split("=", 1)[1])
    if (
        not hf.is_dir()
        or hf.name != ".hyperflow"
        or hf.is_symlink()
        or hf.resolve(strict=False) != hf.absolute()
        or (hf / "memory").is_symlink()
        or (hf / ".version").is_symlink()
    ):
        return

    cache_version = read_marker(hf)
    cur = parse_version(plugin_version)

    # Already current → fast no-op (but stamp if the marker was simply missing on
    # an otherwise up-to-date cache so we don't re-scan every session).
    if cache_version is not None and parse_version(cache_version) >= cur:
        # Scaffold stamps the cache before session-start migrations run. Reconcile
        # generated doctrine artifacts only for the exact current version; a newer
        # cache belongs to a future plugin and must remain untouched.
        if parse_version(cache_version) == cur:
            _m_refresh_doctrine(hf, plugin_root)
            _m_refresh_doctrine_index(hf, plugin_root)
        return

    # Legacy cache (no marker) is treated as version 0.0.0 so every step applies.
    from_v = parse_version(cache_version) if cache_version else (0, 0, 0)

    applied = []
    for since, label, fn in MIGRATIONS:
        if from_v < parse_version(since):
            try:
                if fn(hf, plugin_root):
                    applied.append(label)
            except Exception:
                pass  # never fail the session over a migration step

    write_marker(hf, plugin_version)

    if applied:
        frm = cache_version or "legacy"
        # User-facing notice on stdout (session-start hook surfaces it); the
        # marker write above means this fires once per version bump, not per session.
        print(
            f"Migrated `.hyperflow/` cache **{frm} → v{plugin_version}** "
            f"({len(applied)} change(s): {', '.join(applied)}). No action needed."
        )


if __name__ == "__main__":
    main()
