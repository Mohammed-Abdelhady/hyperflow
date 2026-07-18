#!/usr/bin/env python3
"""Scope-aware post-completion reaper for .hyperflow artefacts.

Given a slug, resolve its artefact scope, archive via archive-artefacts.py,
hard-delete ephemeral leftovers, optimise durable memory (never delete it),
and emit a JSON report. Idempotent. --dry-run / cleanup.dryRun mutate nothing.

Usage
-----
  python3 scripts/reap.py <path-to-.hyperflow> --slug <slug> [--dry-run] [--force] [--json]
"""
from __future__ import annotations

import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Full cleanup block (schema + archive-artefacts subset).
DEFAULTS: dict[str, Any] = {
    "auto": True,
    "staleDays": 7,
    "pruneDays": 30,
    "reapOnComplete": True,
    "usageRetentionDays": 30,
    "logMaxLines": 2000,
    "dryRun": False,
    # Opt-in: quarantine durable memory entries whose Evidence no longer resolves.
    # Default false → an auto-reap never removes a durable entry (memory-system.md:188).
    "dropOrphanRefs": False,
}

MEMORY_COMPACTION_DEFAULT = 300
SLUG_RE = re.compile(r"^[a-z0-9-]+$")
DAY = 86400
BG_TERMINAL = frozenset({"complete", "completed", "error", "stalled", "cancelled"})
# Terminal flat-task values (Status or State column).
TERMINAL_VALUES = frozenset({"complete", "completed"})
# Paths never mutated by reap.
PROTECTED_NAMES = frozenset(
    {".version", ".last-cleanup", ".hyperflow-handoff", ".active-chain-id", ".chain-base"}
)

# Flat / feature status table rows: | Status | completed |  or  | State | complete |
STATUS_ROW_RE = re.compile(
    r"^\|\s*(Status|State)\s*\|\s*([A-Za-z0-9_-]+)\b",
    re.MULTILINE | re.IGNORECASE,
)
# Free-form "Status: completed" / "State: complete"
STATUS_LINE_RE = re.compile(
    r"^\s*(Status|State)\s*:\s*([A-Za-z0-9_-]+)\b",
    re.MULTILINE | re.IGNORECASE,
)
EVIDENCE_RE = re.compile(r"^\*\*Evidence:\*\*\s*(.+?)\s*$", re.MULTILINE | re.IGNORECASE)
HEADING_RE = re.compile(r"^(#{2,3})\s+")
# Leading entry date `### [YYYY-MM-DD] …` → monthly quarantine bucket.
ENTRY_DATE_RE = re.compile(r"^#{2,3}\s+\[(\d{4})-(\d{2})-\d{2}\]")
# Path-like evidence (skip bare commit SHAs).
PATHISH_RE = re.compile(
    r"(?P<path>(?:~|/|\./|\.\./)?[\w./@+-]+\.[A-Za-z0-9]{1,12})(?::\d+(?:-\d+)?)?"
)
COMMIT_ONLY_RE = re.compile(r"^(?:commit\s+)?[0-9a-f]{7,40}$", re.IGNORECASE)

SCRIPTS_DIR = Path(__file__).resolve().parent


class ReapError(Exception):
    """Validation or path-safety failure (exit ≠ 0)."""


def load_cfg() -> dict[str, Any]:
    """Load cleanup knobs from ~/.hyperflow/config.json, falling back to DEFAULTS."""
    cfg = dict(DEFAULTS)
    cfg["compactionThreshold"] = MEMORY_COMPACTION_DEFAULT
    path = Path(os.environ.get("HOME", "")) / ".hyperflow" / "config.json"
    try:
        user = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(user, dict):
            return cfg
        cleanup = user.get("cleanup", {})
        if isinstance(cleanup, dict):
            for k, default in DEFAULTS.items():
                if k not in cleanup:
                    continue
                v = cleanup[k]
                if isinstance(default, bool):
                    if isinstance(v, bool):
                        cfg[k] = v
                elif isinstance(default, int):
                    if isinstance(v, int) and not isinstance(v, bool):
                        cfg[k] = int(v)
        memory = user.get("memory", {})
        if isinstance(memory, dict):
            thr = memory.get("compactionThreshold")
            if isinstance(thr, int) and not isinstance(thr, bool) and thr >= 1:
                cfg["compactionThreshold"] = thr
    except Exception:
        pass
    return cfg


def is_under(root: Path, path: Path) -> bool:
    """True when resolved path is root or a descendant of root."""
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except (ValueError, OSError):
        return False


def validate_slug(slug: str) -> str:
    if not isinstance(slug, str) or not SLUG_RE.fullmatch(slug):
        raise ReapError(f"invalid slug {slug!r}: must match {SLUG_RE.pattern}")
    return slug


def validate_hf(hf: Path) -> Path:
    if not hf.is_dir() or hf.name != ".hyperflow":
        raise ReapError(f"invalid .hyperflow root: {hf}")
    return hf.resolve()


def rel_hf(hf: Path, path: Path) -> str:
    try:
        return str(path.resolve().relative_to(hf.resolve())).replace("\\", "/")
    except Exception:
        return str(path).replace("\\", "/")


def empty_report(slug: str, dry_run: bool) -> dict[str, Any]:
    return {
        "slug": slug,
        "dryRun": dry_run,
        "archived": [],
        "deleted": [],
        "bytesFreed": 0,
        "memory": {
            "indexRebuilt": False,
            "orphansDropped": 0,
            "compacted": [],
        },
        "skipped": [],
    }


# Table-header / column-label cells that are never a real status value — so a
# `| Status | Value |` header row is not mistaken for the primary status.
_STATUS_HEADER_LABELS = frozenset({"", "status", "state", "value", "field"})


def _status_section(text: str) -> str:
    """Return the body of the first `## Status` section, or all text if absent.

    Anchoring the terminal check to this section stops a status-shaped sub-row
    elsewhere in the file (e.g. under `## Subtasks`) from being read as the
    task's primary status.
    """
    m = re.search(r"^\s*##\s+Status\b[^\n]*$", text, re.MULTILINE | re.IGNORECASE)
    if not m:
        return text
    start = m.end()
    nxt = re.search(r"^#{1,6}\s+\S", text[start:], re.MULTILINE)
    return text[start : start + nxt.start()] if nxt else text[start:]


def _primary_status_value(text: str) -> str | None:
    """First meaningful Status/State value, anchored to the `## Status` section.

    Scans status table rows and free-form status lines in document order,
    skipping table-header cells, and returns the first real value — so a stray
    terminal sub-row deeper in the file cannot flip an in-progress task to
    terminal. Tolerates both on-disk schemas (`| Status | in_progress |` and a
    `| State | complete |` row under a `| Status | Value |` header). None when no
    status is present.
    """
    section = _status_section(text)
    best: tuple[int, str] | None = None
    for regex in (STATUS_ROW_RE, STATUS_LINE_RE):
        for m in regex.finditer(section):
            val = m.group(2).strip().lower()
            if val in _STATUS_HEADER_LABELS:
                continue
            if best is None or m.start() < best[0]:
                best = (m.start(), val)
    return best[1] if best else None


def flat_task_is_terminal(hf: Path, slug: str) -> bool:
    """True when tasks/<slug>.md's primary Status/State is complete|completed."""
    task = hf / "tasks" / f"{slug}.md"
    if not task.is_file() or not is_under(hf, task):
        return False
    try:
        text = task.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return False
    val = _primary_status_value(text)
    return val in TERMINAL_VALUES if val is not None else False


def feature_is_terminal(hf: Path, slug: str) -> bool:
    """True when features/<slug>/feature.md Status is completed."""
    fm = hf / "features" / slug / "feature.md"
    if not fm.is_file() or not is_under(hf, fm):
        return False
    try:
        text = fm.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return False
    # Accept complete OR completed (align with flat-task terminal detection).
    return bool(
        re.search(
            r"^\|\s*Status\s*\|\s*complete(?:d)?\b",
            text,
            re.MULTILINE | re.IGNORECASE,
        )
    )


def is_terminal(hf: Path, slug: str) -> bool:
    return flat_task_is_terminal(hf, slug) or feature_is_terminal(hf, slug)


def scope_candidates(hf: Path, slug: str) -> list[Path]:
    """Archive-class candidates for dry-run planning (mirrors archive_slug)."""
    return [
        hf / "tasks" / f"{slug}.md",
        hf / "tasks" / slug,
        hf / "specs" / f"{slug}.md",
        hf / "specs" / f"{slug}.draft.md",
        hf / "features" / slug,
    ]


def find_twins(hf: Path, slug: str) -> list[Path]:
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
        pass
    return out


def plan_archive(hf: Path, slug: str) -> list[dict[str, str]]:
    """Dry-run archive plan — paths that would move (no mutation)."""
    planned: list[dict[str, str]] = []
    for path in scope_candidates(hf, slug):
        if path.exists() and is_under(hf, path):
            planned.append({"path": rel_hf(hf, path), "dest": f"archive/(planned)/{path.name}"})
    for twin in find_twins(hf, slug):
        planned.append({"path": rel_hf(hf, twin), "dest": f"archive/artefacts/(planned)/{twin.name}"})
    return planned


_ARCHIVER_MODULE: Any = None


def _load_archiver() -> Any:
    """Import archive-artefacts.py once (hyphenated → not a normal module name).

    Returns the loaded module (exposing ``archive_slug``) or None when the file
    is missing or fails to import, in which case run_archive falls back to a
    subprocess. Loaded under a private name so it never collides with a test's
    own spec-loaded copy in sys.modules.
    """
    global _ARCHIVER_MODULE
    if _ARCHIVER_MODULE is not None:
        return _ARCHIVER_MODULE
    script = SCRIPTS_DIR / "archive-artefacts.py"
    if not script.is_file():
        return None
    try:
        spec = importlib.util.spec_from_file_location(
            "hyperflow_archive_artefacts", script
        )
        if spec is None or spec.loader is None:
            return None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    except Exception:
        return None
    _ARCHIVER_MODULE = module
    return module


def _coerce_archived(summary: Any) -> list[dict[str, str]]:
    """Extract the archived-record list from an archive_slug/JSON summary."""
    if not isinstance(summary, dict):
        return []
    archived = summary.get("archived", [])
    if not isinstance(archived, list):
        return []
    return [e for e in archived if isinstance(e, dict)]


def _run_archive_subprocess(
    hf: Path, slug: str
) -> tuple[list[dict[str, str]], str | None]:
    """Fallback: spawn archive-artefacts.py --slug when in-process import fails.

    Returns (archived, error). error is None on success (including an empty
    archive); a non-empty string signals a genuine FAILURE (non-zero exit,
    spawn error, or an unparseable/absent JSON report) so the caller can halt
    destructive phases.
    """
    script = SCRIPTS_DIR / "archive-artefacts.py"
    if not script.is_file():
        return [], "archive-artefacts.py not found"
    try:
        proc = subprocess.run(
            [sys.executable, str(script), str(hf), "--slug", slug],
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception as exc:
        return [], f"archive subprocess spawn failed: {exc}"
    if proc.returncode != 0:
        reason = (proc.stderr or "").strip() or f"archive exited {proc.returncode}"
        return [], reason
    # JSON is on stdout; tolerate trailing human lines by scanning.
    for line in (proc.stdout or "").splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(payload.get("archived"), list):
            return _coerce_archived(payload), None
    # A zero exit with no parseable report → cannot confirm archival = failure.
    return [], "archive produced no JSON report"


def run_archive(
    hf: Path, slug: str, *, cfg: dict[str, Any] | None = None
) -> tuple[list[dict[str, str]], str | None]:
    """Archive a slug in-process; return (archived, error).

    Loads archive-artefacts.py and calls ``archive_slug(hf, slug, cfg=cfg)`` in
    the same interpreter — no second ``load_cfg``/``$HOME`` read — so the
    caller's resolved config governs the run. error is None on success (an empty
    archive is success — "nothing to archive"); a non-empty string signals a
    FAILURE (raised exception / archival error) so the caller skips the
    destructive ephemeral + orphan-drop phases. Falls back to a subprocess only
    when the in-process import is infeasible.
    """
    module = _load_archiver()
    if module is not None and hasattr(module, "archive_slug"):
        try:
            summary = module.archive_slug(hf, slug, cfg=cfg)
        except Exception as exc:
            return [], f"in-process archival failed: {exc}"
        return _coerce_archived(summary), None
    return _run_archive_subprocess(hf, slug)


def _file_size(path: Path) -> int:
    try:
        return path.stat().st_size
    except Exception:
        return 0


def _dir_size(path: Path) -> int:
    total = 0
    try:
        for root, _dirs, files in os.walk(path):
            for name in files:
                try:
                    total += (Path(root) / name).stat().st_size
                except Exception:
                    pass
    except Exception:
        pass
    return total


def active_chain_id(hf: Path) -> str | None:
    """Read .active-chain-id when present (protects in-flight usage ledgers)."""
    pointer = hf / ".active-chain-id"
    if not pointer.is_file() or not is_under(hf, pointer):
        return None
    try:
        text = pointer.read_text(encoding="utf-8", errors="replace").strip()
    except Exception:
        return None
    return text or None


def reap_usage(
    hf: Path,
    *,
    retention_days: int,
    dry_run: bool,
    report: dict[str, Any],
) -> None:
    usage = hf / "usage"
    if not usage.is_dir() or not is_under(hf, usage):
        return
    cutoff = time.time() - max(1, retention_days) * DAY
    active = active_chain_id(hf)
    try:
        entries = sorted(usage.iterdir())
    except Exception:
        return
    for path in entries:
        if not path.is_file() or not path.name.endswith(".jsonl"):
            continue
        if not is_under(hf, path):
            report["skipped"].append({"path": rel_hf(hf, path), "reason": "escape"})
            continue
        if path.name in PROTECTED_NAMES:
            continue
        # Protect the active chain's ledger entirely while a chain is marked active.
        if active is not None:
            stem = path.name[: -len(".jsonl")]
            if stem == active or path.name == f"{active}.jsonl":
                report["skipped"].append(
                    {"path": rel_hf(hf, path), "reason": "active-chain"}
                )
                continue
        try:
            mtime = path.stat().st_mtime
        except Exception:
            continue
        if mtime >= cutoff:
            report["skipped"].append(
                {"path": rel_hf(hf, path), "reason": "within-retention"}
            )
            continue
        size = _file_size(path)
        rel = rel_hf(hf, path)
        if dry_run:
            report["deleted"].append(rel)
            report["bytesFreed"] += size
            continue
        try:
            path.unlink()
            report["deleted"].append(rel)
            report["bytesFreed"] += size
        except Exception:
            report["skipped"].append({"path": rel, "reason": "unlink-failed"})


def reap_session_log(
    hf: Path,
    *,
    log_max_lines: int,
    dry_run: bool,
    report: dict[str, Any],
) -> None:
    log = hf / ".session-start.log"
    if not log.is_file() or not is_under(hf, log):
        return
    max_lines = max(100, int(log_max_lines))
    try:
        text = log.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return
    lines = text.splitlines(keepends=True)
    if len(lines) <= max_lines:
        return
    kept = lines[-max_lines:]
    # Dropped head bytes ≈ rough free estimate.
    dropped = "".join(lines[: len(lines) - max_lines])
    freed = len(dropped.encode("utf-8", errors="replace"))
    rel = rel_hf(hf, log)
    if dry_run:
        report["deleted"].append(f"{rel}#truncate:{len(lines)}->{max_lines}")
        report["bytesFreed"] += freed
        return
    # Atomic truncation: write the kept tail to a sibling temp file, fsync, then
    # os.replace over the log. The live log is never truncated in place, so a
    # session-start hook appending by path never sees a torn/empty file and its
    # lines are not lost to a read-then-overwrite race.
    tmp = log.with_name(f"{log.name}.reap-{os.getpid()}.tmp")
    try:
        with tmp.open("w", encoding="utf-8") as fh:
            fh.write("".join(kept))
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, log)
        report["deleted"].append(f"{rel}#truncate:{len(lines)}->{max_lines}")
        report["bytesFreed"] += freed
    except Exception:
        try:
            tmp.unlink()
        except OSError:
            pass
        report["skipped"].append({"path": rel, "reason": "truncate-failed"})


def _bg_registry(hf: Path) -> dict[str, Any]:
    reg_path = hf / "background" / "registry.json"
    if not reg_path.is_file() or not is_under(hf, reg_path):
        return {}
    try:
        data = json.loads(reg_path.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        return {}
    if isinstance(data, dict):
        # Common shapes: { "agents": { id: {...} } } or { id: {...} }
        agents = data.get("agents")
        if isinstance(agents, dict):
            return agents
        # Flat map of id → entry
        if all(isinstance(v, dict) for v in data.values()):
            return data
    if isinstance(data, list):
        out: dict[str, Any] = {}
        for item in data:
            if isinstance(item, dict) and "id" in item:
                out[str(item["id"])] = item
        return out
    return {}


def _bg_status_terminal(entry: dict[str, Any] | None, buf: Path) -> bool:
    if isinstance(entry, dict):
        st = str(entry.get("status", "")).strip().lower()
        if st in BG_TERMINAL:
            return True
        if st in ("running", "in_flight", "pending"):
            return False
    # File-content heuristic when registry is sparse.
    try:
        text = buf.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return False
    for m in STATUS_ROW_RE.finditer(text):
        if m.group(2).strip().lower() in BG_TERMINAL:
            return True
    for m in STATUS_LINE_RE.finditer(text):
        if m.group(2).strip().lower() in BG_TERMINAL:
            return True
    if re.search(r"\bStatus\s*[|:]?\s*(complete|error|stalled|cancelled)\b", text, re.I):
        return True
    return False


def reap_background(
    hf: Path,
    *,
    dry_run: bool,
    report: dict[str, Any],
) -> None:
    bg = hf / "background"
    if not bg.is_dir() or not is_under(hf, bg):
        return
    registry = _bg_registry(hf)
    cutoff = time.time() - 7 * DAY
    try:
        entries = sorted(bg.glob("bg-*.md"))
    except Exception:
        return
    pruned_ids: list[str] = []
    for path in entries:
        if not path.is_file() or not is_under(hf, path):
            continue
        agent_id = path.stem
        entry = registry.get(agent_id)
        if isinstance(entry, dict):
            pass
        elif agent_id not in registry:
            # Also try bare name match against registry keys.
            entry = registry.get(path.name)
        if not _bg_status_terminal(entry if isinstance(entry, dict) else None, path):
            report["skipped"].append(
                {"path": rel_hf(hf, path), "reason": "bg-non-terminal"}
            )
            continue
        try:
            mtime = path.stat().st_mtime
        except Exception:
            continue
        if mtime >= cutoff:
            report["skipped"].append(
                {"path": rel_hf(hf, path), "reason": "bg-fresh"}
            )
            continue
        size = _file_size(path)
        rel = rel_hf(hf, path)
        if dry_run:
            report["deleted"].append(rel)
            report["bytesFreed"] += size
            pruned_ids.append(agent_id)
            continue
        try:
            path.unlink()
            report["deleted"].append(rel)
            report["bytesFreed"] += size
            pruned_ids.append(agent_id)
        except Exception:
            report["skipped"].append({"path": rel, "reason": "unlink-failed"})

    if not pruned_ids or dry_run:
        return
    # Best-effort registry cleanup for deleted buffers.
    reg_path = hf / "background" / "registry.json"
    if not reg_path.is_file():
        return
    try:
        raw = json.loads(reg_path.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        return
    changed = False
    if isinstance(raw, dict) and isinstance(raw.get("agents"), dict):
        for aid in pruned_ids:
            if aid in raw["agents"]:
                del raw["agents"][aid]
                changed = True
    elif isinstance(raw, dict):
        for aid in pruned_ids:
            if aid in raw and isinstance(raw[aid], dict):
                del raw[aid]
                changed = True
    elif isinstance(raw, list):
        new_list = [
            item
            for item in raw
            if not (isinstance(item, dict) and str(item.get("id", "")) in pruned_ids)
        ]
        if len(new_list) != len(raw):
            raw = new_list
            changed = True
    if changed:
        try:
            reg_path.write_text(
                json.dumps(raw, indent=2) + "\n", encoding="utf-8"
            )
        except Exception:
            pass


def commits_queue_settled(queue: Path) -> bool:
    """True when queue is empty or has no unflushed commits in manifest."""
    if not queue.exists():
        return True
    if not queue.is_dir():
        return False
    manifest = queue / "manifest.json"
    if manifest.is_file():
        try:
            data = json.loads(manifest.read_text(encoding="utf-8", errors="replace"))
        except Exception:
            # Unreadable manifest → treat as unflushed (do not delete).
            return False
        if isinstance(data, dict):
            commits = data.get("commits")
            if isinstance(commits, list) and len(commits) > 0:
                return False
            # Empty commits list (or missing) → settled.
            return True
        return False
    # No manifest: settled only if directory is empty of real content.
    try:
        for child in queue.iterdir():
            if child.name in (".", ".."):
                continue
            return False
    except Exception:
        return False
    return True


def reap_commits_queue(
    hf: Path,
    *,
    dry_run: bool,
    report: dict[str, Any],
) -> None:
    queue = hf / "commits-queue"
    if not queue.exists() or not is_under(hf, queue):
        return
    rel = rel_hf(hf, queue)
    if not commits_queue_settled(queue):
        report["skipped"].append({"path": rel, "reason": "unflushed-queue"})
        return
    size = _dir_size(queue) if queue.is_dir() else _file_size(queue)
    if dry_run:
        report["deleted"].append(rel)
        report["bytesFreed"] += size
        return
    # Defense-in-depth: only recurse when the platform's rmtree resists symlink
    # attacks (uses dir_fd internally). Skip loudly rather than risk following a
    # planted symlink out of the queue.
    if queue.is_dir() and not getattr(
        shutil.rmtree, "avoids_symlink_attacks", False
    ):
        report["skipped"].append({"path": rel, "reason": "rmtree-symlink-unsafe"})
        return
    try:
        if queue.is_dir():
            shutil.rmtree(queue)
        else:
            queue.unlink()
        report["deleted"].append(rel)
        report["bytesFreed"] += size
    except Exception:
        report["skipped"].append({"path": rel, "reason": "rmtree-failed"})


def _resolve_evidence_paths(project_root: Path, hf: Path, raw: str) -> list[Path]:
    """Map an Evidence token to candidate filesystem paths ([] if not path-like).

    A relative token is resolved against BOTH the project root (``hf.parent``) and
    the ``.hyperflow`` root itself, so a `.hyperflow`-relative citation (e.g.
    ``memory/x.md`` or ``tasks/foo.md``) is not read as a false orphan. Absolute
    tokens resolve to themselves. An entry survives if ANY candidate exists.
    """
    token = raw.strip().split(",")[0].strip()
    # Drop trailing "commit …" already handled by split.
    if COMMIT_ONLY_RE.fullmatch(token):
        return []
    m = PATHISH_RE.search(token)
    if not m:
        # Bare relative path without extension? still try if it looks like a path.
        if "/" in token or token.startswith("."):
            candidate = token.split(":")[0].strip()
        else:
            return []
    else:
        candidate = m.group("path")
    if candidate.startswith("~"):
        candidate = os.path.expanduser(candidate)
    p = Path(candidate)
    if p.is_absolute():
        return [p]
    return [project_root / p, hf / p]


def _evidence_present(
    project_root: Path,
    hf: Path,
    raw: str,
    *,
    archived_rels: frozenset[str],
) -> bool | None:
    """Whether an Evidence token still resolves. None when it is not path-like.

    Present when any candidate exists, when the (hf-relative) target was just
    archived this run (still cited at its pre-move location), or when a same-named
    artefact lives under ``hf/archive/**`` (archived ≠ deleted). Errs toward
    "present" so durable knowledge is never lost on a coincidence.
    """
    candidates = _resolve_evidence_paths(project_root, hf, raw)
    if not candidates:
        return None
    if any(p.exists() for p in candidates):
        return True
    hf_r = hf.resolve()
    for p in candidates:
        try:
            rel = p.resolve().relative_to(hf_r)
        except (ValueError, OSError):
            continue
        if str(rel).replace("\\", "/") in archived_rels:
            return True
    return _relocated_under_archive(hf, candidates)


def _relocated_under_archive(hf: Path, candidates: list[Path]) -> bool:
    """True when a candidate's basename now lives somewhere under ``hf/archive``."""
    archive = hf / "archive"
    if not archive.is_dir():
        return False
    names = {p.name for p in candidates if p.name}
    try:
        for found in archive.rglob("*"):
            if found.name in names and found.is_file():
                return True
    except Exception:
        return False
    return False


def _split_memory_entries(text: str) -> tuple[str, list[str]]:
    """Split a memory category file into (preamble, entry_blocks).

    Each entry starts at an h2/h3 heading. Leading title lines form the preamble.
    """
    lines = text.splitlines(keepends=True)
    if not lines:
        return "", []
    preamble: list[str] = []
    entries: list[list[str]] = []
    current: list[str] | None = None
    for line in lines:
        if HEADING_RE.match(line):
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
    return "".join(preamble), ["".join(e) for e in entries]


def _entry_month(chunk: str) -> str:
    """Monthly bucket (YYYY-MM) from the entry's own date header, else current UTC."""
    m = ENTRY_DATE_RE.search(chunk)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _quarantine_entries(memory: Path, chunks: list[str]) -> bool:
    """Append dropped entries to memory/archive/YYYY-MM.md (shared monthly sidecar).

    Grouped by each entry's own date, append-only — matches the compaction archive
    convention (skills/cache/references/compaction.md). Returns False on any I/O
    failure so the caller leaves the category file untouched (never lose the entry).
    """
    archive_dir = memory / "archive"
    try:
        archive_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        return False
    for chunk in chunks:
        sidecar = archive_dir / f"{_entry_month(chunk)}.md"
        block = chunk if chunk.endswith("\n") else chunk + "\n"
        try:
            existed = sidecar.exists() and sidecar.stat().st_size > 0
            with sidecar.open("a", encoding="utf-8") as fh:
                if existed:
                    fh.write("\n")
                fh.write(block)
        except Exception:
            return False
    return True


def drop_orphaned_memory_refs(
    hf: Path,
    *,
    dry_run: bool,
    enabled: bool = False,
    archived_rels: frozenset[str] | None = None,
) -> int:
    """Optionally quarantine memory entries whose Evidence no longer resolves.

    Default (``enabled=False``) is non-destructive: an auto-reap NEVER removes a
    durable entry — the caller still rebuilds the index and flags oversized files.
    When enabled (``cleanup.dropOrphanRefs``), an entry survives if ANY path-like
    Evidence token still resolves (checked against both the project root and the
    ``.hyperflow`` root, counting just-archived and archived targets as present).
    A dropped entry is quarantined to ``memory/archive/YYYY-MM.md`` BEFORE the
    category file is rewritten; if that write fails the category file is left
    unchanged. Returns the number of quarantined entries (0 when disabled).
    """
    if not enabled:
        return 0
    memory = hf / "memory"
    if not memory.is_dir() or not is_under(hf, memory):
        return 0
    project_root = hf.parent
    excluded = archived_rels or frozenset()
    durable = [
        p
        for p in memory.glob("*.md")
        if p.is_file()
        and p.name not in ("index.md", "session-context.md", "doctrine.md")
        and is_under(hf, p)
    ]
    dropped = 0
    for path in durable:
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        preamble, entries = _split_memory_entries(text)
        if not entries:
            continue
        kept: list[str] = []
        orphaned: list[str] = []
        for chunk in entries:
            m = EVIDENCE_RE.search(chunk)
            if not m:
                kept.append(chunk)
                continue
            present = False
            had_pathish = False
            for part in re.split(r"[,;]", m.group(1)):
                part = part.strip()
                if not part or part.lower().startswith("commit "):
                    continue
                result = _evidence_present(
                    project_root, hf, part, archived_rels=excluded
                )
                if result is None:
                    continue
                had_pathish = True
                if result:
                    present = True
                    break
            # Survive unless every path-like Evidence target is missing.
            if present or not had_pathish:
                kept.append(chunk)
            else:
                orphaned.append(chunk)
        if not orphaned:
            continue
        if dry_run:
            dropped += len(orphaned)
            continue
        # Archive-first: quarantine before rewriting so a failed write loses nothing.
        if not _quarantine_entries(memory, orphaned):
            continue
        new_text = preamble + "".join(kept)
        if not new_text.strip():
            new_text = f"# {path.stem.replace('-', ' ').title()}\n"
        try:
            path.write_text(new_text, encoding="utf-8")
        except Exception:
            continue  # category untouched; quarantine already holds the copy
        dropped += len(orphaned)
    return dropped


def flag_oversized_memory(hf: Path, threshold: int) -> list[str]:
    """Return rel paths of durable memory files at/over compaction threshold."""
    memory = hf / "memory"
    if not memory.is_dir() or not is_under(hf, memory):
        return []
    out: list[str] = []
    thr = max(50, int(threshold))
    for path in sorted(memory.glob("*.md")):
        if path.name in ("index.md", "session-context.md", "doctrine.md"):
            continue
        if not path.is_file() or not is_under(hf, path):
            continue
        try:
            with path.open("r", encoding="utf-8", errors="replace") as fh:
                n = sum(1 for _ in fh)
        except Exception:
            continue
        if n >= thr:
            out.append(rel_hf(hf, path))
    return out


def rebuild_memory_index(hf: Path, *, dry_run: bool) -> bool:
    script = SCRIPTS_DIR / "memory-index.py"
    if not script.is_file():
        return False
    if dry_run:
        return True  # would rebuild
    try:
        proc = subprocess.run(
            [sys.executable, str(script), str(hf)],
            capture_output=True,
            text=True,
            check=False,
        )
        return proc.returncode == 0
    except Exception:
        return False


def assert_safe_targets(hf: Path) -> None:
    """Refuse to operate if hf escapes or is not .hyperflow."""
    validate_hf(hf)


def reap(
    hf: Path,
    slug: str,
    *,
    force: bool = False,
    dry_run: bool = False,
    cfg: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run the reaper. Returns the report dict. Raises ReapError on validation failure."""
    validate_slug(slug)
    hf = validate_hf(hf)
    cfg = cfg or load_cfg()
    effective_dry = bool(dry_run or cfg.get("dryRun", False))
    report = empty_report(slug, effective_dry)

    if not force and not is_terminal(hf, slug):
        report["skipped"].append({"path": slug, "reason": "non-terminal"})
        return report

    # ── Archive class ────────────────────────────────────────────────────────
    archive_error: str | None = None
    if effective_dry:
        report["archived"] = plan_archive(hf, slug)
    else:
        report["archived"], archive_error = run_archive(hf, slug, cfg=cfg)

    if archive_error:
        # F4: archival FAILED (distinct from "nothing to archive"). The
        # reversible class's disposition is unknown, so do NOT GC ephemeral
        # files or mutate durable memory — deleting now could orphan knowledge
        # whose archive never landed. Surface the reason; only the derived,
        # non-destructive index rebuild + compaction advisory still run.
        report["archiveError"] = archive_error
        report["skipped"].append({"path": slug, "reason": "archive-failed"})
        report["memory"]["indexRebuilt"] = rebuild_memory_index(
            hf, dry_run=effective_dry
        )
        report["memory"]["compacted"] = flag_oversized_memory(
            hf, int(cfg.get("compactionThreshold", MEMORY_COMPACTION_DEFAULT))
        )
        return report

    # ── Ephemeral class ──────────────────────────────────────────────────────
    reap_usage(
        hf,
        retention_days=int(cfg.get("usageRetentionDays", 30)),
        dry_run=effective_dry,
        report=report,
    )
    reap_session_log(
        hf,
        log_max_lines=int(cfg.get("logMaxLines", 2000)),
        dry_run=effective_dry,
        report=report,
    )
    reap_background(hf, dry_run=effective_dry, report=report)
    reap_commits_queue(hf, dry_run=effective_dry, report=report)

    # ── Memory class (never delete durable category files) ───────────────────
    # Entry-dropping is opt-in (cleanup.dropOrphanRefs); default reap quarantines
    # nothing. Exclude this slug's just-archived source paths from the missing-check
    # so a freshly-moved artefact is not read as an orphan (archive ≠ delete) —
    # cleaner than reordering the archive/memory phases.
    archived_rels = frozenset(
        e["path"]
        for e in report["archived"]
        if isinstance(e, dict) and isinstance(e.get("path"), str)
    )
    orphans = drop_orphaned_memory_refs(
        hf,
        dry_run=effective_dry,
        enabled=bool(cfg.get("dropOrphanRefs", False)),
        archived_rels=archived_rels,
    )
    report["memory"]["orphansDropped"] = orphans
    # Safe optimizations always run: rebuild index so the derived table matches.
    rebuilt = rebuild_memory_index(hf, dry_run=effective_dry)
    report["memory"]["indexRebuilt"] = rebuilt
    report["memory"]["compacted"] = flag_oversized_memory(
        hf, int(cfg.get("compactionThreshold", MEMORY_COMPACTION_DEFAULT))
    )

    return report


def _parse_args(argv: list[str]) -> tuple[Path, str, bool, bool, bool]:
    if len(argv) < 2:
        raise ReapError("usage: reap.py <hf_root> --slug <slug> [--dry-run] [--force] [--json]")
    hf = Path(argv[1])
    rest = argv[2:]
    slug: str | None = None
    dry_run = False
    force = False
    as_json = False
    i = 0
    while i < len(rest):
        a = rest[i]
        if a == "--slug":
            # Reject a missing or option-like value (bare `--`, `--force`, `-x`)
            # so `--slug --force` errors instead of binding slug="--force".
            if i + 1 >= len(rest):
                raise ReapError("missing value for --slug")
            val = rest[i + 1]
            if val == "--" or val.startswith("-"):
                raise ReapError(f"invalid --slug value {val!r}: expected a slug")
            slug = val
            i += 2
            continue
        if a.startswith("--slug="):
            val = a.split("=", 1)[1]
            if not val or val.startswith("-"):
                raise ReapError(f"invalid --slug value {val!r}: expected a slug")
            slug = val
            i += 1
            continue
        if a == "--dry-run":
            dry_run = True
            i += 1
            continue
        if a == "--force":
            force = True
            i += 1
            continue
        if a == "--json":
            as_json = True
            i += 1
            continue
        i += 1
    if not slug:
        raise ReapError("missing required --slug <slug>")
    return hf, slug, dry_run, force, as_json


def _human_summary(report: dict[str, Any]) -> str:
    n_arch = len(report.get("archived") or [])
    n_del = len(report.get("deleted") or [])
    n_skip = len(report.get("skipped") or [])
    mem = report.get("memory") or {}
    dry = "dry-run " if report.get("dryRun") else ""
    return (
        f"hyperflow reap: {dry}slug={report.get('slug')!r} · "
        f"archived {n_arch} · deleted {n_del} · "
        f"bytesFreed {report.get('bytesFreed', 0)} · "
        f"orphansDropped {mem.get('orphansDropped', 0)} · "
        f"skipped {n_skip}"
    )


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv if argv is None else argv)
    try:
        hf, slug, dry_run, force, as_json = _parse_args(argv)
        report = reap(hf, slug, force=force, dry_run=dry_run)
    except ReapError as exc:
        print(f"hyperflow reap: refused — {exc}", file=sys.stderr)
        return 1
    except SystemExit as exc:
        code = exc.code
        return int(code) if isinstance(code, int) else 1

    print(json.dumps(report, separators=(",", ":")))
    if not as_json:
        print(_human_summary(report), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
