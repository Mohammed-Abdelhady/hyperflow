#!/usr/bin/env python3
"""Deterministic one-screen Hyperflow project status + DISPATCH_RESUME emitter.

Read-only. Mirrors the /hyperflow:status skill contract so hosts can get a
stable snapshot without LLM parsing of task markdown.

Usage:
  python3 scripts/status.py                 # one-screen status (cwd project)
  python3 scripts/status.py --root /path
  python3 scripts/status.py --resume        # status + DISPATCH_RESUME blocks
  python3 scripts/status.py --resume-only   # only DISPATCH_RESUME blocks
  python3 scripts/status.py --json          # machine-readable snapshot
  python3 scripts/status.py --slug <name>   # single task focus
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

PLUGIN_ROOT = Path(__file__).resolve().parents[1]
VERSION_FILE = PLUGIN_ROOT / "skills" / "hyperflow" / "VERSION"

CHECKBOX_RE = re.compile(r"^- \[(?P<mark>[ xX~])\]\s*(?P<body>.+)$", re.MULTILINE)
TABLE_ROW_RE = re.compile(
    r"^\|\s*(?P<key>[^|]+?)\s*\|\s*(?P<value>[^|]*?)\s*\|\s*$", re.MULTILINE
)
WORKER_ABORT_RE = re.compile(r"WORKER_ABORT:\s*(.+)$", re.MULTILINE)
REVIEWER_ABORT_RE = re.compile(r"REVIEWER_ABORT:\s*(.+)$", re.MULTILINE)
BATCH_HEADING_RE = re.compile(
    r"^#{2,3}\s+Batch\s+(?P<n>\d+)\b(?P<title>[^\n]*)",
    re.MULTILINE | re.IGNORECASE,
)
LEGACY_SUBTASKS_RE = re.compile(
    r"^Sub-tasks:\s*(?P<done>\d+)\s*/\s*(?P<total>\d+)", re.MULTILINE
)
LEGACY_TOKENS_RE = re.compile(r"^Tokens used:\s*(?P<v>.+)$", re.MULTILINE)
LEGACY_WALL_RE = re.compile(r"^Wall-clock:\s*(?P<v>.+)$", re.MULTILINE)
LEGACY_ETA_RE = re.compile(r"^ETA:\s*(?P<v>.+)$", re.MULTILINE)
PROGRESS_COUNTS_RE = re.compile(
    r"(?P<done>\d+)\s*/\s*(?P<total>\d+)\s*(?:sub-tasks?)?", re.IGNORECASE
)


@dataclass
class TaskSnapshot:
    slug: str
    path: str
    status: str
    done: int
    total: int
    pending: int
    running: str | None
    last_done: str | None
    tokens: str
    wall_clock: str
    eta: str
    finished_batches: int
    failed_at: str
    error: str
    next_action: str
    memory_ok: str
    needs_resume: bool


@dataclass
class ProjectSnapshot:
    root: str
    version: str
    profile: str
    memory: str
    active_tasks: int
    capabilities: dict[str, str] = field(default_factory=dict)
    tasks: list[TaskSnapshot] = field(default_factory=list)
    features: list[dict] = field(default_factory=list)
    background: str = "(none)"


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _table_map(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    # Prefer ## Status section when present
    m = re.search(r"^##\s+Status\b[^\n]*$", text, re.MULTILINE | re.IGNORECASE)
    section = text
    if m:
        start = m.end()
        nxt = re.search(r"^#{1,6}\s+\S", text[start:], re.MULTILINE)
        section = text[start : start + nxt.start()] if nxt else text[start:]
    for row in TABLE_ROW_RE.finditer(section):
        key = row.group("key").strip()
        val = row.group("value").strip().strip("`")
        if key.lower() in {"field", "status"} and val.lower() in {"value", "status"}:
            # header-ish; still allow Status field when value is lifecycle word
            if key.lower() == "field":
                continue
        if key.lower() == "field":
            continue
        out[key] = val
        out.setdefault(key.lower(), val)
    return out


def _checkboxes(text: str) -> tuple[list[str], list[str], list[str]]:
    done: list[str] = []
    running: list[str] = []
    pending: list[str] = []
    for m in CHECKBOX_RE.finditer(text):
        mark = m.group("mark").lower()
        body = m.group("body").strip()
        if mark == "x":
            done.append(body)
        elif mark == "~":
            running.append(body)
        else:
            pending.append(body)
    return done, running, pending


def _finished_batches(text: str, done: int, total: int) -> int:
    headings = list(BATCH_HEADING_RE.finditer(text))
    if not headings:
        # No batch headings: treat fully-done checkbox groups as finished units
        return done if total and done == total else max(0, done // max(total, 1)) if False else (
            0 if done == 0 else (1 if done < total else 1)
        )
    # Count batches whose following checkbox section is fully checked
    finished = 0
    for i, h in enumerate(headings):
        start = h.end()
        end = headings[i + 1].start() if i + 1 < len(headings) else len(text)
        chunk = text[start:end]
        d, r, p = _checkboxes(chunk)
        if d and not r and not p:
            finished += 1
        elif not d and not r and not p:
            # empty batch section — ignore
            continue
    return finished


def _failed_at(text: str, running: str | None, status: str, pending: int, done: int, total: int) -> str:
    low = text.lower()
    if "worker_abort" in low:
        return "worker"
    if "reviewer_abort" in low:
        return "review"
    if re.search(r"gate\s+(failed|fail|error)", text, re.IGNORECASE):
        return "gate"
    if running:
        return "batch"
    if status in {"failed", "blocked", "aborted"}:
        return "batch"
    if total and done < total and pending:
        return "batch"
    if total and done >= total:
        return "none"
    return "batch" if status in {"in_progress", "pending", ""} else "none"


def _error_line(text: str) -> str:
    for rx in (WORKER_ABORT_RE, REVIEWER_ABORT_RE):
        m = rx.search(text)
        if m:
            return m.group(1).strip()[:200]
    m = re.search(r"(?im)^(?:error|failed_at|failure):\s*(.+)$", text)
    if m:
        return m.group(1).strip()[:200]
    if re.search(r"gate\s+(failed|fail)", text, re.IGNORECASE):
        return "quality gate failed"
    return ""


def _next_action(failed_at: str, done: int, total: int, running: str | None) -> str:
    if failed_at == "gate":
        return "fix gates"
    if failed_at == "worker":
        return "retry worker or abort"
    if failed_at == "review":
        return "retry reviewer or abort"
    if total and done >= total and not running:
        return "none (complete)"
    if running:
        return f"re-dispatch batch (running: {running[:60]})"
    if total and done < total:
        # next batch index is roughly finished+1; 1-based for humans
        k = done + 1
        return f"re-dispatch batch {k}"
    if total == 0:
        return "plan or dispatch"
    return "re-dispatch remaining"


def _progress_bar(done: int, total: int, width: int = 20) -> str:
    if total <= 0:
        filled = 0
        pct = 0
    else:
        filled = int(round(width * done / total))
        filled = max(0, min(width, filled))
        pct = int(round(100 * done / total))
    return f"[{'█' * filled}{'░' * (width - filled)}] {done}/{total}  {pct}%"


def _plugin_version() -> str:
    if VERSION_FILE.is_file():
        v = VERSION_FILE.read_text(encoding="utf-8").strip()
        if v:
            return v if v.startswith("v") else f"v{v}"
    return "(missing)"


def _git_tag_version(root: Path) -> str | None:
    try:
        r = subprocess.run(
            ["git", "tag", "--sort=-v:refname"],
            cwd=root,
            capture_output=True,
            text=True,
            check=False,
            timeout=5,
        )
        if r.returncode != 0:
            return None
        for line in r.stdout.splitlines():
            if re.match(r"^v\d", line.strip()):
                return line.strip()
    except (OSError, subprocess.TimeoutExpired):
        return None
    return None


def _profile_line(hf: Path) -> str:
    profile = hf / "profile.md"
    if not profile.is_file():
        return "(missing)"
    try:
        mtime = profile.stat().st_mtime
    except OSError:
        return "(missing)"
    hours = int((time.time() - mtime) / 3600)
    label = "fresh" if hours <= 24 else "stale"
    if hours < 1:
        ago = "analyzed <1h ago"
    else:
        ago = f"analyzed {hours}h ago"
    return f"{label}      ({ago})"


def _memory_line(hf: Path) -> str:
    index = hf / "memory" / "index.md"
    if not index.is_file():
        # fall back: count non-empty category files
        mem = hf / "memory"
        if not mem.is_dir():
            return "(none)"
        n = 0
        for p in mem.glob("*.md"):
            if p.name.startswith("."):
                continue
            text = _read_text(p)
            if any(line.strip() and not line.strip().startswith("#") and "<!--" not in line for line in text.splitlines()):
                n += 1
        return f"{n} category files" if n else "(none)"
    count = sum(1 for line in _read_text(index).splitlines() if line.startswith("|"))
    entries = max(0, count - 2)
    return f"{entries} entries" if entries else "(none)"


def _memory_ok(hf: Path) -> str:
    decisions = hf / "memory" / "decisions.md"
    if not decisions.is_file():
        return "review decisions.md (missing)"
    text = _read_text(decisions)
    # light conflict: duplicate H2/H3
    titles: dict[str, int] = {}
    for line in text.splitlines():
        m = re.match(r"^#{2,3}\s+(.+)$", line.strip())
        if m:
            t = m.group(1).strip().lower()
            titles[t] = titles.get(t, 0) + 1
    if any(v > 1 for v in titles.values()):
        return "review decisions.md (duplicate headings)"
    return "yes"


def _primary_status(table: dict[str, str], done: int, total: int, running: str | None) -> str:
    for key in ("Status", "status", "State", "state"):
        if key in table:
            val = table[key].strip().lower()
            if val and val not in {"value", "field"}:
                return val
    if running:
        return "in_progress"
    if total and done >= total:
        return "completed"
    if done > 0:
        return "in_progress"
    return "pending"


def parse_task(path: Path, hf: Path) -> TaskSnapshot:
    text = _read_text(path)
    slug = path.stem
    table = _table_map(text)
    done_list, running_list, pending_list = _checkboxes(text)

    done = len(done_list)
    pending = len(pending_list)
    total = done + len(running_list) + pending

    progress = table.get("Progress") or table.get("progress") or ""
    pm = PROGRESS_COUNTS_RE.search(progress)
    if pm:
        done = int(pm.group("done"))
        total = int(pm.group("total"))
        # pending from checkboxes preferred; else derive
        if not pending_list and not running_list:
            pending = max(0, total - done)
    else:
        lm = LEGACY_SUBTASKS_RE.search(text)
        if lm:
            done = int(lm.group("done"))
            total = int(lm.group("total"))
            pending = max(0, total - done - len(running_list))

    legacy_tokens = LEGACY_TOKENS_RE.search(text)
    legacy_wall = LEGACY_WALL_RE.search(text)
    tokens = (
        table.get("Tokens")
        or table.get("tokens")
        or (legacy_tokens.group("v").strip() if legacy_tokens else "")
        or "(not tracked yet)"
    )
    wall = (
        table.get("Wall-clock")
        or table.get("wall-clock")
        or (legacy_wall.group("v").strip() if legacy_wall else "")
        or "(not started)"
    )
    eta = ""
    if "ETA" in wall or "eta" in wall.lower():
        em = re.search(r"ETA\s*([^·]+)", wall, re.IGNORECASE)
        if em:
            eta = em.group(1).strip()
    if not eta:
        em = LEGACY_ETA_RE.search(text)
        eta = em.group("v").strip() if em else ("(computing)" if done < 3 else "")
    if not eta:
        eta = "(computing)" if done < 3 and total > done else ("(done)" if total and done >= total else "(computing)")

    running = running_list[0] if running_list else None
    last_done = done_list[-1] if done_list else None
    status = _primary_status(table, done, total, running)
    finished = _finished_batches(text, done, total)
    failed_at = _failed_at(text, running, status, pending, done, total)
    error = _error_line(text)
    if not error and status in {"failed", "blocked", "aborted"}:
        error = status
    if not error and running:
        error = f"mid-flight: {running[:120]}"
    if not error and status == "in_progress" and pending:
        error = "interrupted or not yet finished"
    next_action = _next_action(failed_at, done, total, running)
    mem_ok = _memory_ok(hf)

    needs_resume = bool(
        status in {"failed", "blocked", "aborted", "in_progress"}
        or running
        or (total and done < total and status not in {"completed", "complete", "approved"})
        or "WORKER_ABORT" in text
        or "REVIEWER_ABORT" in text
    )
    # completed tasks don't need resume
    if status in {"completed", "complete", "approved"} and not running and done >= total:
        needs_resume = False
        failed_at = "none"
        next_action = "none (complete)"
        error = error if "ABORT" in text else ""

    return TaskSnapshot(
        slug=slug,
        path=str(path),
        status=status,
        done=done,
        total=total,
        pending=pending if pending else max(0, total - done - (1 if running else 0)),
        running=running,
        last_done=last_done,
        tokens=tokens,
        wall_clock=wall,
        eta=eta,
        finished_batches=finished,
        failed_at=failed_at if needs_resume else "none",
        error=error if needs_resume else (error if error else ""),
        next_action=next_action,
        memory_ok=mem_ok,
        needs_resume=needs_resume,
    )


def _features(hf: Path) -> list[dict]:
    features_dir = hf / "features"
    if not features_dir.is_dir():
        return []
    out: list[dict] = []
    for feat in sorted(features_dir.iterdir()):
        fm = feat / "feature.md"
        if not fm.is_file():
            continue
        text = _read_text(fm)
        table = _table_map(text)
        status = table.get("Status") or table.get("status") or "unknown"
        phases = []
        for phase_dir in sorted(feat.glob("phase-*")):
            pm = phase_dir / "phase.md"
            if not pm.is_file():
                continue
            ptext = _read_text(pm)
            ptable = _table_map(ptext)
            pstatus = ptable.get("Status") or ptable.get("status") or "unknown"
            phases.append({"name": phase_dir.name, "status": pstatus})
        out.append({"slug": feat.name, "status": status, "phases": phases})
    return out


def _background(hf: Path) -> str:
    reg = hf / "background" / "registry.json"
    if not reg.is_file():
        return "(none)"
    try:
        data = json.loads(_read_text(reg) or "{}")
    except json.JSONDecodeError:
        return "(none)"
    entries = data if isinstance(data, list) else data.get("jobs") or data.get("entries") or []
    if not entries:
        return "(none)"
    running = uncollected = stalled = 0
    for e in entries:
        if not isinstance(e, dict):
            continue
        st = str(e.get("status", "")).lower()
        if st in {"running", "active"}:
            running += 1
        elif st in {"uncollected", "done_uncollected"}:
            uncollected += 1
        elif st in {"stalled", "stuck"}:
            stalled += 1
    return f"{running} running · {uncollected} uncollected · {stalled} stalled"


def _capabilities(root: Path, version: str) -> dict[str, str]:
    agents = (root / "AGENTS.md").is_file()
    claude = (root / "CLAUDE.md").is_file()
    if agents and claude:
        installed_extra = "AGENTS.md + CLAUDE.md present"
    elif agents:
        installed_extra = "AGENTS.md present"
    elif claude:
        installed_extra = "CLAUDE.md present"
    else:
        installed_extra = "instruction file (missing)"
    return {
        "installed": f"hyperflow {version} · {installed_extra}",
        "enabled": "(not reported)",
        "certified": "(not reported)",
    }


def collect(root: Path, slug: str | None = None) -> ProjectSnapshot:
    root = root.resolve()
    hf = root / ".hyperflow"
    version = _plugin_version()
    tag = _git_tag_version(root)
    if version == "(missing)" and tag:
        version = tag
    elif tag and version != "(missing)":
        # keep plugin version; tag is informational only in text renderer
        pass

    tasks_dir = hf / "tasks"
    task_paths: list[Path] = []
    if tasks_dir.is_dir():
        task_paths = sorted(tasks_dir.glob("*.md"))
        if slug:
            task_paths = [p for p in task_paths if p.stem == slug]

    tasks = [parse_task(p, hf) for p in task_paths]
    return ProjectSnapshot(
        root=str(root),
        version=version,
        profile=_profile_line(hf),
        memory=_memory_line(hf),
        active_tasks=len(tasks) if not slug else len(tasks),
        capabilities=_capabilities(root, version),
        tasks=tasks,
        features=_features(hf) if not slug else [],
        background=_background(hf),
    )


def format_status(snap: ProjectSnapshot) -> str:
    lines: list[str] = []
    lines.append("── Hyperflow Status ─────────────────────────────────────────")
    lines.append(f"Version       {snap.version}")
    lines.append(f"Profile       {snap.profile}")
    lines.append(f"Memory        {snap.memory}")
    lines.append(
        f"Active tasks  {snap.active_tasks if snap.active_tasks else '(none)'}"
    )
    lines.append("")
    lines.append("[capabilities]")
    for k in ("installed", "enabled", "certified"):
        lines.append(f"  {k:<10}  {snap.capabilities.get(k, '(not reported)')}")

    if snap.features:
        lines.append("")
        for feat in snap.features:
            phases = feat.get("phases") or []
            done_p = sum(
                1
                for p in phases
                if str(p.get("status", "")).lower() in {"completed", "complete"}
            )
            lines.append(
                f"── Feature: {feat['slug']} ──  ({done_p} / {len(phases)} phases)"
            )
            for p in phases:
                lines.append(f"  {p['name']:<22} {p['status']}")

    if snap.tasks:
        lines.append("")
        lines.append("── In-flight work ───────────────────────────────────────────")
        for t in snap.tasks:
            lines.append(f"Task:         {t.slug}")
            lines.append(f"  Progress    {_progress_bar(t.done, t.total)}")
            if t.status in {"pending"} and t.done == 0 and not t.running:
                lines.append(f"  Status      not started")
            else:
                lines.append(f"  Status      {t.status}")
            if t.last_done:
                lines.append(f"  Last done   {t.last_done[:80]}")
            lines.append(
                f"  Running     {t.running if t.running else '(idle)'}"
            )
            lines.append(f"  Pending     {t.pending} sub-tasks")
            lines.append(f"  Tokens      {t.tokens}")
            lines.append(f"  Wall-clock  {t.wall_clock}")
            lines.append(f"  ETA         {t.eta}")
            lines.append("")
    if snap.background and snap.background != "(none)":
        lines.append(f"Background  {snap.background}")
    lines.append("─────────────────────────────────────────────────────────────")
    return "\n".join(lines).rstrip() + "\n"


def format_resume(tasks: list[TaskSnapshot]) -> str:
    blocks: list[str] = []
    resume_tasks = [t for t in tasks if t.needs_resume]
    if not resume_tasks:
        return (
            "DISPATCH_RESUME\n"
            "slug: (none)\n"
            "finished_batches: 0\n"
            "failed_at: none\n"
            "error: no in-flight or failed tasks\n"
            "next: nothing to resume\n"
            "memory_ok: yes\n"
        )
    for t in resume_tasks:
        blocks.append(
            "DISPATCH_RESUME\n"
            f"slug: {t.slug}\n"
            f"finished_batches: {t.finished_batches}\n"
            f"failed_at: {t.failed_at}\n"
            f"error: {t.error or '(unknown — inspect task file)'}\n"
            f"next: {t.next_action}\n"
            f"memory_ok: {t.memory_ok}\n"
        )
    return "\n".join(blocks)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Hyperflow one-screen status + DISPATCH_RESUME")
    ap.add_argument("--root", type=Path, default=Path.cwd(), help="Project root (default: cwd)")
    ap.add_argument("--resume", action="store_true", help="Print status then DISPATCH_RESUME blocks")
    ap.add_argument("--resume-only", action="store_true", help="Only DISPATCH_RESUME blocks")
    ap.add_argument("--json", action="store_true", help="Machine-readable JSON")
    ap.add_argument("--slug", type=str, default=None, help="Focus a single task slug")
    args = ap.parse_args(argv)

    snap = collect(args.root, slug=args.slug)

    if args.json:
        payload = {
            "root": snap.root,
            "version": snap.version,
            "profile": snap.profile,
            "memory": snap.memory,
            "active_tasks": snap.active_tasks,
            "capabilities": snap.capabilities,
            "features": snap.features,
            "background": snap.background,
            "tasks": [asdict(t) for t in snap.tasks],
            "resume": [
                {
                    "slug": t.slug,
                    "finished_batches": t.finished_batches,
                    "failed_at": t.failed_at,
                    "error": t.error,
                    "next": t.next_action,
                    "memory_ok": t.memory_ok,
                }
                for t in snap.tasks
                if t.needs_resume
            ],
        }
        print(json.dumps(payload, indent=2))
        return 0

    parts: list[str] = []
    if args.resume_only:
        parts.append(format_resume(snap.tasks))
    else:
        parts.append(format_status(snap))
        if args.resume:
            parts.append("")
            parts.append(format_resume(snap.tasks))
    sys.stdout.write("\n".join(parts).rstrip() + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
