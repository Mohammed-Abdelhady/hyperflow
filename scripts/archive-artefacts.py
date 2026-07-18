#!/usr/bin/env python3
"""Auto-archive stale .hyperflow/ artefacts and promote learnings to memory.

Runs at session start (and on demand). Idempotent. Daily-gated so repeat
session-starts don't churn. Never raises from main() daily path — best-effort
cleanup. Targeted ``--slug`` / ``--file`` modes report errors via exit status.

Flow
----
For each *.md (and brief dirs) in .hyperflow/{tasks,audits,specs}/ whose mtime
is older than ``staleDays`` (default 7):

  1. Parse its ``## Learnings`` / ``## Decisions`` / ``## Anti-patterns`` /
     ``## Pitfalls`` sections.
  2. Append (whole-line de-duplicated) to .hyperflow/memory/{learnings,
     decisions,anti-patterns}.md so the durable insight survives.
  3. Move the source to .hyperflow/archive/<type>/YYYY-MM/<name>.
  4. Collect the viewer JSON twin (artefacts/<type>/<slug>.json) into
     archive/artefacts/<type>/YYYY-MM/ when present.

Completed (``feature.md`` Status = completed), stale ``.hyperflow/features/<slug>/``
folders are promoted (every phase's learnings) and the whole folder moved to
``.hyperflow/archive/features/YYYY-MM/<slug>/``. In-progress features are never
archived by the daily sweep, however old.

Then prune .hyperflow/archive/** entries older than ``pruneDays`` (default 30).

Targeted modes
--------------
  --file <path>   Archive one file immediately (on-completion; no daily gate).
  --slug <slug>   Archive a slug's full scope (task file, brief dir, specs,
                  draft specs, feature tree, matching JSON twins). Promote
                  first, then move. Prints JSON summary on stdout:
                  {"archived":[{"path","dest"}], "promoted":[...]}
                  Refuses invalid slugs / path escapes with exit ≠ 0.

Config (~/.hyperflow/config.json)
---------------------------------
  "cleanup": { "auto": true, "staleDays": 7, "pruneDays": 30 }

Set ``auto: false`` to disable. Defaults apply if any field is missing.

Usage
-----
  archive-artefacts.py <path-to-.hyperflow>
  archive-artefacts.py <path-to-.hyperflow> --file .hyperflow/tasks/<slug>.md
  archive-artefacts.py <path-to-.hyperflow> --slug <slug>
  archive-artefacts.py <path-to-.hyperflow> --force
"""
from __future__ import annotations
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

DEFAULTS = {"auto": True, "staleDays": 7, "pruneDays": 30}

# Section title (lowercased) → target memory file
SECTION_TO_MEMORY = {
    "learnings": "learnings.md",
    "learning": "learnings.md",
    "decisions": "decisions.md",
    "decision": "decisions.md",
    "anti-patterns": "anti-patterns.md",
    "anti-pattern": "anti-patterns.md",
    "pitfalls": "anti-patterns.md",
    "pitfall": "anti-patterns.md",
}

TYPES = ("tasks", "audits", "specs")
# Slug is a path segment — reject traversal / separators / dots.
SLUG_RE = re.compile(r"^[a-z0-9-]+$")
DAY = 86400


class ArchiveError(Exception):
    """Validation or path-safety failure (targeted modes surface via exit ≠ 0)."""


def load_cfg() -> dict:
    cfg = dict(DEFAULTS)
    path = Path(os.environ.get("HOME", "")) / ".hyperflow" / "config.json"
    try:
        user = json.loads(path.read_text())
        cleanup = user.get("cleanup", {}) if isinstance(user, dict) else {}
        for k in cfg:
            v = cleanup.get(k)
            if isinstance(v, (bool, int)):
                cfg[k] = v
    except Exception:
        pass
    return cfg


def extract_sections(text: str) -> dict[str, list[str]]:
    """Return {memory_file: [body_lines]} for promotion-worthy sections."""
    out: dict[str, list[str]] = {}
    lines = text.splitlines()
    i, n = 0, len(lines)
    while i < n:
        m = re.match(r"^(#+)\s+(.*?)\s*$", lines[i])
        if not m:
            i += 1
            continue
        level = len(m.group(1))
        title = m.group(2).strip().lower()
        key = SECTION_TO_MEMORY.get(title)
        if not key:
            i += 1
            continue
        body: list[str] = []
        i += 1
        while i < n:
            nxt = re.match(r"^(#+)\s+", lines[i])
            if nxt and len(nxt.group(1)) <= level:
                break
            body.append(lines[i])
            i += 1
        while body and not body[0].strip():
            body.pop(0)
        while body and not body[-1].strip():
            body.pop()
        if body:
            out.setdefault(key, []).extend(body)
    return out


def append_deduped(target: Path, lines: list[str], source: str) -> int:
    existing: set[str] = set()
    if target.exists():
        try:
            existing = {ln.rstrip("\n") for ln in target.read_text().splitlines()}
        except Exception:
            existing = set()
    new = [ln for ln in lines if ln.strip() and ln.rstrip("\n") not in existing]
    if not new:
        return 0
    target.parent.mkdir(parents=True, exist_ok=True)
    today = datetime.now(timezone.utc).date().isoformat()
    try:
        with target.open("a", encoding="utf-8") as f:
            f.write(f"\n<!-- promoted from {source} on {today} -->\n")
            for ln in new:
                f.write(ln.rstrip("\n") + "\n")
    except Exception:
        return 0
    return len(new)


def is_under(root: Path, path: Path) -> bool:
    """True when resolved path is the root or a descendant of root."""
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except (ValueError, OSError):
        return False


def validate_slug(slug: str) -> str:
    if not isinstance(slug, str) or not SLUG_RE.fullmatch(slug):
        raise ArchiveError(
            f"invalid slug {slug!r}: must match {SLUG_RE.pattern}"
        )
    return slug


def month_bucket(path: Path) -> str:
    try:
        return datetime.fromtimestamp(
            path.stat().st_mtime, tz=timezone.utc
        ).strftime("%Y-%m")
    except Exception:
        return "unknown"


def rel_hf(hf: Path, path: Path) -> str:
    try:
        return str(path.resolve().relative_to(hf.resolve())).replace("\\", "/")
    except Exception:
        return str(path).replace("\\", "/")


def unique_dest(dest: Path) -> Path:
    """If dest already exists, append a numeric timestamp suffix (atomic rename)."""
    if not dest.exists():
        return dest
    stamp = int(time.time())
    if dest.suffix and dest.is_file():
        return dest.with_name(f"{dest.stem}-{stamp}{dest.suffix}")
    # directories, or extension-less files
    return dest.with_name(f"{dest.name}-{stamp}")


def atomic_move(hf: Path, src: Path, dest: Path) -> Path | None:
    """Promote-safe atomic move under .hyperflow. Returns final dest or None."""
    try:
        if not src.exists():
            return None
        if not is_under(hf, src):
            return None
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest = unique_dest(dest)
        # Dest may not exist yet — resolve parent, then re-join name.
        dest_resolved = (dest.parent.resolve() / dest.name)
        if not is_under(hf, dest_resolved):
            return None
        os.replace(str(src.resolve()), str(dest_resolved))
        return dest_resolved
    except Exception:
        return None


def promote_file(hf: Path, fpath: Path, source: str | None = None) -> list[dict]:
    """Promote sections from one markdown file. Returns promotion records."""
    records: list[dict] = []
    try:
        if not fpath.is_file() or not is_under(hf, fpath):
            return records
        text = fpath.read_text(errors="replace")
    except Exception:
        return records
    label = source or fpath.name
    sections = extract_sections(text)
    for memfile, body in sections.items():
        n = append_deduped(hf / "memory" / memfile, body, label)
        if n:
            records.append(
                {"source": label, "memory": memfile, "count": n}
            )
    return records


def promote_tree(hf: Path, dpath: Path) -> list[dict]:
    """Promote sections from every *.md under dpath (sorted for stability)."""
    records: list[dict] = []
    if not dpath.is_dir() or not is_under(hf, dpath):
        return records
    for md in sorted(dpath.rglob("*.md")):
        if not md.is_file():
            continue
        try:
            rel = str(md.relative_to(dpath)).replace("\\", "/")
        except Exception:
            rel = md.name
        label = f"{dpath.name}/{rel}"
        records.extend(promote_file(hf, md, label))
    return records


def archive_file(hf: Path, type_: str, fpath: Path) -> tuple[bool, int]:
    """Promote sections then move file to archive. Returns (moved, lines_promoted)."""
    if not fpath.is_file() or not is_under(hf, fpath):
        return (False, 0)
    records = promote_file(hf, fpath, fpath.name)
    promoted = sum(r["count"] for r in records)
    bucket = month_bucket(fpath)
    dest = hf / "archive" / type_ / bucket / fpath.name
    moved_to = atomic_move(hf, fpath, dest)
    return (moved_to is not None, promoted)


def archive_dir(hf: Path, type_: str, dpath: Path) -> tuple[bool, int]:
    """Promote learnings from every .md under dpath, then move the whole folder
    to archive/<type>/YYYY-MM/<name>/. Returns (moved, lines_promoted)."""
    if not dpath.is_dir() or not is_under(hf, dpath):
        return (False, 0)
    records = promote_tree(hf, dpath)
    promoted = sum(r["count"] for r in records)
    bucket = month_bucket(dpath)
    dest = hf / "archive" / type_ / bucket / dpath.name
    moved_to = atomic_move(hf, dpath, dest)
    return (moved_to is not None, promoted)


def archive_feature(hf: Path, fdir: Path) -> tuple[bool, int]:
    """Promote learnings from every .md in a completed feature folder, then move
    the whole folder to archive/features/YYYY-MM/<slug>/. Returns (moved, lines)."""
    return archive_dir(hf, "features", fdir)


def feature_is_completed(fdir: Path) -> bool:
    """True when the feature's feature.md Status block reads completed."""
    fm = fdir / "feature.md"
    try:
        text = fm.read_text(errors="replace")
    except Exception:
        return False
    # Match a Status table row: | Status | completed |
    return bool(re.search(r"^\|\s*Status\s*\|\s*completed\b", text, re.MULTILINE | re.IGNORECASE))


def find_twins(hf: Path, slug: str) -> list[Path]:
    """Return existing artefacts/*/<slug>.json paths under hf (path-safe)."""
    art = hf / "artefacts"
    if not art.is_dir():
        return []
    out: list[Path] = []
    try:
        for sub in sorted(art.iterdir()):
            if not sub.is_dir():
                continue
            twin = sub / f"{slug}.json"
            if twin.is_file() and is_under(hf, twin):
                out.append(twin)
    except Exception:
        return out
    return out


def archive_twin(hf: Path, twin: Path) -> Path | None:
    """Move a viewer JSON twin to archive/artefacts/<type>/YYYY-MM/<name>.json."""
    if not twin.is_file() or not is_under(hf, twin):
        return None
    art_type = twin.parent.name
    bucket = month_bucket(twin)
    dest = hf / "archive" / "artefacts" / art_type / bucket / twin.name
    return atomic_move(hf, twin, dest)


def archive_one(
    hf: Path,
    type_: str,
    path: Path,
    *,
    archived: list[dict],
    promoted: list[dict],
) -> bool:
    """Promote-then-move a single file or directory. Mutates summary lists."""
    if not path.exists() or not is_under(hf, path):
        return False
    src_rel = rel_hf(hf, path)
    if path.is_file():
        records = promote_file(hf, path, path.name)
        promoted.extend(records)
        bucket = month_bucket(path)
        dest = hf / "archive" / type_ / bucket / path.name
        moved_to = atomic_move(hf, path, dest)
        if moved_to is not None:
            archived.append({"path": src_rel, "dest": rel_hf(hf, moved_to)})
            return True
        return False
    if path.is_dir():
        records = promote_tree(hf, path)
        promoted.extend(records)
        bucket = month_bucket(path)
        dest = hf / "archive" / type_ / bucket / path.name
        moved_to = atomic_move(hf, path, dest)
        if moved_to is not None:
            archived.append({"path": src_rel, "dest": rel_hf(hf, moved_to)})
            return True
        return False
    return False


def archive_slug(hf: Path, slug: str) -> dict:
    """Archive a slug's full scope. Raises ArchiveError on validation failure.

    Scope: tasks/<slug>.md, tasks/<slug>/, specs/<slug>.md, specs/<slug>.draft.md,
    features/<slug>/, artefacts/*/<slug>.json.
    """
    validate_slug(slug)
    if not hf.is_dir() or hf.name != ".hyperflow":
        raise ArchiveError(f"invalid .hyperflow root: {hf}")

    hf_r = hf.resolve()
    archived: list[dict] = []
    promoted: list[dict] = []

    # Ordered scope candidates (file or dir). Only existing, under-hf paths move.
    candidates: list[tuple[str, Path]] = [
        ("tasks", hf_r / "tasks" / f"{slug}.md"),
        ("tasks", hf_r / "tasks" / slug),
        ("specs", hf_r / "specs" / f"{slug}.md"),
        ("specs", hf_r / "specs" / f"{slug}.draft.md"),
        ("features", hf_r / "features" / slug),
    ]
    for type_, path in candidates:
        if not path.exists():
            continue
        if not is_under(hf_r, path):
            raise ArchiveError(f"path escapes .hyperflow root: {path}")
        archive_one(hf_r, type_, path, archived=archived, promoted=promoted)

    for twin in find_twins(hf_r, slug):
        if not is_under(hf_r, twin):
            raise ArchiveError(f"path escapes .hyperflow root: {twin}")
        src_rel = rel_hf(hf_r, twin)
        moved_to = archive_twin(hf_r, twin)
        if moved_to is not None:
            archived.append({"path": src_rel, "dest": rel_hf(hf_r, moved_to)})

    return {"archived": archived, "promoted": promoted}


def prune_archive(hf: Path, prune_days: int) -> int:
    archive = hf / "archive"
    if not archive.exists():
        return 0
    cutoff = time.time() - prune_days * DAY
    pruned = 0
    for root, _dirs, files in os.walk(archive):
        for name in files:
            fp = Path(root) / name
            try:
                if not is_under(hf, fp):
                    continue
                if fp.stat().st_mtime < cutoff:
                    fp.unlink()
                    pruned += 1
            except Exception:
                pass
    for root, _dirs, _files in os.walk(archive, topdown=False):
        try:
            p = Path(root)
            if p != archive and is_under(hf, p) and not any(p.iterdir()):
                p.rmdir()
        except Exception:
            pass
    return pruned


def _parse_flag(args: list[str], name: str) -> str | None:
    """Parse --name VALUE or --name=VALUE from argv tail."""
    for i, a in enumerate(args):
        if a == name and i + 1 < len(args):
            return args[i + 1]
        if a.startswith(name + "="):
            return a.split("=", 1)[1]
    return None


def _archive_stale_entry(
    hf: Path,
    type_: str,
    path: Path,
    cutoff: float,
) -> tuple[int, int]:
    """Archive one stale file or brief dir (+ twin). Returns (archived_n, promoted_n)."""
    try:
        if path.stat().st_mtime >= cutoff:
            return (0, 0)
    except Exception:
        return (0, 0)
    if not is_under(hf, path):
        return (0, 0)

    archived_n = 0
    promoted_n = 0
    slug: str | None = None

    if path.is_file() and path.name.endswith(".md"):
        moved, lines = archive_file(hf, type_, path)
        if moved:
            archived_n += 1
            if path.name.endswith(".draft.md"):
                slug = path.name[: -len(".draft.md")]
            else:
                slug = path.stem
        promoted_n += lines
    elif path.is_dir() and SLUG_RE.fullmatch(path.name):
        moved, lines = archive_dir(hf, type_, path)
        if moved:
            archived_n += 1
            slug = path.name
        promoted_n += lines
    else:
        return (0, 0)

    if slug and SLUG_RE.fullmatch(slug):
        # Brief dir paired with a just-archived .md (always collect companion)
        if path.is_file():
            bdir = path.parent / slug
            if bdir.is_dir() and is_under(hf, bdir):
                m2, l2 = archive_dir(hf, type_, bdir)
                if m2:
                    archived_n += 1
                promoted_n += l2
        for twin in find_twins(hf, slug):
            if archive_twin(hf, twin) is not None:
                archived_n += 1

    return (archived_n, promoted_n)


def main() -> None:
    if len(sys.argv) < 2:
        return
    hf = Path(sys.argv[1])
    if not hf.is_dir() or hf.name != ".hyperflow":
        return

    cfg = load_cfg()
    if not cfg.get("auto", True):
        return
    stale = max(1, int(cfg.get("staleDays", 7)))
    prune = max(stale, int(cfg.get("pruneDays", 30)))

    args = sys.argv[2:]
    file_arg = _parse_flag(args, "--file")
    slug_arg = _parse_flag(args, "--slug")

    # ─── On-completion mode: --file <path> archives one file immediately ──────
    # Skills call this when a chain finishes successfully so the task/audit/spec
    # is promoted + archived right away rather than waiting for it to go stale.
    if file_arg is not None:
        fpath = Path(file_arg)
        if not fpath.is_absolute():
            fpath = hf.parent / fpath
        if not fpath.is_file():
            return
        try:
            if not is_under(hf, fpath):
                return
        except Exception:
            return
        # Determine artefact type from the path (tasks/audits/specs).
        type_ = "tasks"
        for t in TYPES:
            try:
                if (hf / t).resolve() in fpath.resolve().parents:
                    type_ = t
                    break
            except Exception:
                pass
        moved, promoted = archive_file(hf, type_, fpath)
        # Collect twin when the file name is a safe slug stem
        if moved:
            stem = fpath.stem
            if fpath.name.endswith(".draft.md"):
                stem = fpath.name[: -len(".draft.md")]
            if SLUG_RE.fullmatch(stem):
                for twin in find_twins(hf, stem):
                    archive_twin(hf, twin)
                bdir = fpath.parent / stem
                if bdir.is_dir() and is_under(hf, bdir):
                    archive_dir(hf, type_, bdir)
        if moved or promoted:
            print(
                f"hyperflow cleanup: archived {fpath.name} on completion · "
                f"promoted {promoted} line(s) to memory",
                file=sys.stderr,
            )
        return

    # ─── Targeted slug mode: full scope, JSON summary on stdout ───────────────
    if slug_arg is not None:
        try:
            summary = archive_slug(hf, slug_arg)
        except ArchiveError as exc:
            print(f"hyperflow cleanup: refused — {exc}", file=sys.stderr)
            sys.exit(1)
        print(json.dumps(summary, separators=(",", ":")))
        n = len(summary.get("archived", []))
        pcount = sum(r.get("count", 0) for r in summary.get("promoted", []))
        if n or pcount:
            print(
                f"hyperflow cleanup: archived {n} path(s) for slug {slug_arg!r} · "
                f"promoted {pcount} line(s) to memory",
                file=sys.stderr,
            )
        return

    # Daily gate — don't re-walk the tree on every session this day.
    marker = hf / ".last-cleanup"
    force = "--force" in sys.argv
    if not force and marker.exists():
        try:
            if time.time() - marker.stat().st_mtime < DAY:
                return
        except Exception:
            pass

    cutoff = time.time() - stale * DAY
    archived = 0
    promoted = 0
    for t in TYPES:
        d = hf / t
        if not d.is_dir():
            continue
        # Snapshot names first — moves mutate the directory during iteration.
        entries = sorted(d.iterdir())
        for p in entries:
            if not p.exists():
                continue  # already collected as brief-dir companion of a .md
            try:
                if not is_under(hf, p):
                    continue
            except Exception:
                continue
            if p.is_file() and p.name.endswith(".md"):
                n, lines = _archive_stale_entry(hf, t, p, cutoff)
                archived += n
                promoted += lines
            elif p.is_dir() and SLUG_RE.fullmatch(p.name):
                # Orphan / leftover brief dirs (no longer skipped)
                n, lines = _archive_stale_entry(hf, t, p, cutoff)
                archived += n
                promoted += lines

    # Completed, stale feature folders → archive the whole folder + twin.
    fdir_root = hf / "features"
    if fdir_root.is_dir():
        for fdir in sorted(fdir_root.iterdir()):
            if not fdir.is_dir() or not (fdir / "feature.md").is_file():
                continue
            try:
                if not is_under(hf, fdir):
                    continue
                if fdir.stat().st_mtime >= cutoff:
                    continue
            except Exception:
                continue
            if not feature_is_completed(fdir):
                continue  # never archive an in-progress feature, however old
            moved, lines = archive_feature(hf, fdir)
            if moved:
                archived += 1
                slug = fdir.name
                if SLUG_RE.fullmatch(slug):
                    for twin in find_twins(hf, slug):
                        if archive_twin(hf, twin) is not None:
                            archived += 1
            promoted += lines

    pruned = prune_archive(hf, prune)

    try:
        marker.write_text(datetime.now(timezone.utc).isoformat() + "\n")
    except Exception:
        pass

    if archived or promoted or pruned:
        print(
            f"hyperflow cleanup: archived {archived} stale file(s) · "
            f"promoted {promoted} line(s) to memory · pruned {pruned} old archive(s)",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
