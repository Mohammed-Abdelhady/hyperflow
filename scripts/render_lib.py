#!/usr/bin/env python3
"""
render_lib.py — JSON artefact -> full markdown renderers.

Reproduces the `skills/hyperflow/artefact-format.md` layout from a compact
artefact envelope so the rehydrated markdown is lossless (status-block metrics,
dependency diagram, scope total, cost table, brief bodies). Imported by
scripts/render-artefact.py (the CLI). Stdlib only.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import artefact_lib as lib  # noqa: E402


def _table(rows: list[tuple[str, str]]) -> str:
    return "\n".join(["| Field | Value |", "|---|---|"] + [f"| {k} | {v} |" for k, v in rows])


def _bar(done: int, total: int, width: int = 20) -> str:
    filled = round(width * done / total) if total else 0
    pct = round(100 * done / total) if total else 0
    return f"`{'█' * filled}{'░' * (width - filled)}`  {done} / {total} ({pct}%)"


def _status_rows(env: dict[str, Any], extra: list[tuple[str, str]]) -> str:
    rows = [("Status", env.get("status", "")), ("Type", env.get("type", ""))] + extra
    specs = ", ".join(env.get("specialists", []))
    if specs:
        rows.append(("Specialists", f"`{specs}`"))
    rows.append(("Updated", env.get("updated", "")))
    return _table(rows)


def _task_status(env: dict[str, Any], p: dict[str, Any]) -> list[tuple[str, str]]:
    """The richer status-block rows artefact-format.md mandates for task files."""
    extra: list[tuple[str, str]] = []
    prog = p.get("progress")
    if prog:
        extra.append(("Progress", _bar(prog.get("done", 0), prog.get("total", 0))))
    if p.get("branch"):
        extra.append(("Branch", f"`{p['branch']}`"))
    if p.get("commits"):
        extra.append(("Commits", str(len(p["commits"]))))
    cost = p.get("cost")
    if cost:
        extra.append(("Tokens", f"{cost.get('agents', 0)} agents · {cost.get('tokens', 0)} total"))
    return extra


def _dep_diagram(batches: list[dict[str, Any]]) -> str:
    """Plain-Unicode dependency diagram (↓ sequential · · parallel siblings)."""
    lines = []
    for i, b in enumerate(batches):
        if i:
            lines.append("     ↓")
        ids = " · ".join(t.get("id", "") for t in b.get("tasks", []))
        dep = f"  (depends on {', '.join(b['dependsOn'])})" if b.get("dependsOn") else ""
        lines.append(f"{b.get('name', 'Batch ' + str(i + 1))}{dep}")
        if ids:
            lines.append(f"  {ids}")
    return "```\n" + "\n".join(lines) + "\n```"


def render_spec(env: dict[str, Any]) -> str:
    p = env["payload"]
    parts = [f"# {env['title']}", f"## Status\n\n{_status_rows(env, [])}", f"## TL;DR\n\n{p.get('tldr', '')}"]
    if p.get("components"):
        parts.append("## Components\n\n" + "\n".join(f"- **{c.get('name', '')}** — {c.get('role', '')}" for c in p["components"]))
    arch = p.get("architecture", {})
    sec1 = "## 1. Architecture\n\n" + arch.get("summary", "")
    if arch.get("mermaid"):
        sec1 += f"\n\n```mermaid\n{arch['mermaid']}\n```"
    parts.append(sec1)
    flow = p.get("dataFlow", {})
    sec2 = "## 2. Data flow\n\n" + flow.get("summary", "")
    if flow.get("mermaid"):
        sec2 += f"\n\n```mermaid\n{flow['mermaid']}\n```"
    parts.append(sec2)
    decs = ["## 3. Key decisions", ""]
    for d in p.get("decisions", []):
        decs.append(f"- **{d.get('decision', '')}** — {d.get('rationale', '')}")
        if d.get("tradeoff"):
            decs.append(f"  - Trade-off: {d['tradeoff']}")
    parts.append("\n".join(decs))
    if p.get("edgeCases"):
        parts.append("## 4. Edge cases\n\n" + "\n".join(f"- {e}" for e in p["edgeCases"]))
    if p.get("fileStructure"):
        rows = "\n".join(f"| `{f.get('path', '')}` | {f.get('change', '')} | {f.get('note', '')} |" for f in p["fileStructure"])
        parts.append("## 5. File structure\n\n| Path | Change | Note |\n|---|---|---|\n" + rows)
    return "\n\n".join(parts) + "\n"


def render_task(env: dict[str, Any]) -> str:
    p = env["payload"]
    batches = p.get("batches", [])
    parts = [f"# {env['title']}", f"## Status\n\n{_status_rows(env, _task_status(env, p))}", f"## Goal\n\n{p.get('goal', '')}"]
    if p.get("scope"):
        rows = [f"| {s.get('surface', '')} | {s.get('files', 0)} | {s.get('created', 0)} | {s.get('modified', 0)} | {s.get('risk', '')} |" for s in p["scope"]]
        tot = (sum(s.get('files', 0) for s in p['scope']), sum(s.get('created', 0) for s in p['scope']), sum(s.get('modified', 0) for s in p['scope']))
        rows.append(f"| **Total** | **{tot[0]}** | **{tot[1]}** | **{tot[2]}** | |")
        parts.append("## Scope at a glance\n\n| Surface | Files | Created | Modified | Risk |\n|---|--:|--:|--:|---|\n" + "\n".join(rows))
    if len(batches) >= 3 or any(b.get("dependsOn") for b in batches):
        parts.append("## Execution plan\n\n" + _dep_diagram(batches))
    plan, briefs = [], []
    for b in batches:
        dep = f" (depends on {', '.join(b['dependsOn'])})" if b.get("dependsOn") else ""
        par = "parallel" if b.get("parallel") else "sequential"
        plan.append(f"### {b.get('name', '')} — {par}{dep}")
        for t in b.get("tasks", []):
            files = " · ".join(filter(None, [
                "Read: " + ", ".join(t["read"]) if t.get("read") else "",
                "Modify: " + ", ".join(t["modify"]) if t.get("modify") else "",
                "Create: " + ", ".join(t["create"]) if t.get("create") else "",
            ]))
            brief = f" · Brief: `{t['brief']}`" if t.get("brief") else ""
            plan.append(f"- [ ] {t.get('id', '')} — {t.get('role', '')} · {t.get('task', '')}")
            plan.append(f"       {files} · Complexity: {t.get('complexity', '')} · Specialist: {t.get('specialist', '')}{brief}")
            if t.get("briefBody"):
                briefs.append(f"#### {t.get('id', '')} — {t.get('task', '')}\n\n{t['briefBody']}")
    parts.append("## Execution roster\n\n" + "\n".join(plan))
    if briefs:
        parts.append("## Briefs\n\n" + "\n\n".join(briefs))
    if p.get("verification"):
        parts.append("## Verification\n\n" + "\n".join(f"- {v}" for v in p["verification"]))
    if p.get("commits"):
        parts.append("## Commit plan\n\n" + "\n".join(f"{i + 1}. `{c}`" for i, c in enumerate(p["commits"])))
    cost = p.get("cost")
    if cost:
        parts.append("## Estimated cost\n\n" + _table([("Agents", str(cost.get("agents", 0))), ("Tokens", str(cost.get("tokens", 0))), ("Tokens / commit", str(cost.get("perCommit", 0)))]))
    return "\n\n".join(parts) + "\n"


def render_feature(env: dict[str, Any]) -> str:
    p = env["payload"]
    phases = "\n".join(
        f"{ph.get('n', '')}. **{ph.get('name', '')}** — {ph.get('goal', '')} — `{ph.get('status', '')}`"
        + (f" (depends on {ph['dependsOn']})" if ph.get("dependsOn") else "")
        for ph in p.get("phases", [])
    )
    parts = [f"# Feature: {env['title']}", f"## Status\n\n{_status_rows(env, [])}", f"## Goal\n\n{p.get('goal', '')}", "## Phases\n\n" + phases]
    if p.get("graph"):
        parts.append("## Phase dependency graph\n\n```\n" + p["graph"] + "\n```")
    return "\n\n".join(parts) + "\n"


_SEV_ORDER = ["critical", "important", "suggestion", "praise"]


def render_audit(env: dict[str, Any]) -> str:
    p = env["payload"]
    c = p.get("counts", {})
    counts = " · ".join(f"{c.get(s, 0)} {s.capitalize()}" for s in _SEV_ORDER)
    rows = [("Verdict", f"`{p.get('verdict', '')}`"), ("Scope", p.get("scope", "")), ("Level", p.get("level", "")), ("Findings", counts)]
    parts = [f"# {env['title']}", f"## Status\n\n{_table(rows)}"]
    for sev in _SEV_ORDER:
        for f in [x for x in p.get("findings", []) if x.get("severity") == sev]:
            loc = f" {f['file']}:{f['line']}" if f.get("file") else ""
            block = f"### [{sev.capitalize()}]{loc}\n\n**Issue:** {f.get('issue', '')}"
            if f.get("fix"):
                block += f"\n\n**Fix:** {f['fix']}"
            if f.get("why"):
                block += f"\n\n**Why it matters:** {f['why']}"
            parts.append(block)
    return "\n\n".join(parts) + "\n"


def render_memory(env: dict[str, Any]) -> str:
    parts = [f"# {env['title']}"]
    for e in env["payload"].get("entries", []):
        tags = f" _(tags: {', '.join(e['tags'])})_" if e.get("tags") else ""
        parts.append(f"## {e.get('title', '')}\n\n- Task: {e.get('task', '')}\n- Decision: {e.get('decision', '')}{tags}")
    return "\n\n".join(parts) + "\n"


def render_dispatch(env: dict[str, Any]) -> str:
    p = env["payload"]
    parts = [f"# {env['title']}"]
    for b in p.get("batches", []):
        rows = "\n".join(f"| {t.get('id', '')} | {t.get('status', '')} | {t.get('tokens', 0)} | {t.get('wallclock', '')} |" for t in b.get("tasks", []))
        parts.append(f"## {b.get('name', '')}\n\n| Task | Status | Tokens | Wall-clock |\n|---|---|--:|---|\n" + rows)
    tot = p.get("totals", {})
    parts.append(f"## Totals\n\n{tot.get('agents', 0)} agents · {tot.get('tokens', 0)} tokens · {tot.get('elapsed', '')}")
    return "\n\n".join(parts) + "\n"


def render_review(env: dict[str, Any]) -> str:
    parts = [f"# {env['title']}", f"Verdict: `{env['payload'].get('verdict', '')}`"]
    for f in env["payload"].get("findings", []):
        block = f"### [{f.get('severity', '').capitalize()}] {f.get('anchor', '')}\n\n{f.get('issue', '')}"
        if f.get("fix"):
            block += f"\n\n**Fix:** {f['fix']}"
        parts.append(block)
    return "\n\n".join(parts) + "\n"


def render_usage(env: dict[str, Any]) -> str:
    p = env["payload"]
    t = p.get("totals", {})
    parts = [f"# {env['title']}",
             f"## Totals\n\n{t.get('agents', 0)} agents · {t.get('tokens', 0)} tokens · {t.get('elapsed', '')} · "
             f"{t.get('acceptedCommits', 0)} accepted commits · {t.get('tokensPerCommit', 0)} tokens/commit"]
    if p.get("phases"):
        rows = "\n".join(f"| {ph.get('name', '')} | {ph.get('agents', 0)} | {ph.get('tokens', 0)} |" for ph in p["phases"])
        parts.append("## Phases\n\n| Phase | Agents | Tokens |\n|---|--:|--:|\n" + rows)
    if p.get("ratios"):
        parts.append("## Ratios\n\n" + " · ".join(f"{k} {v}" for k, v in p["ratios"].items()))
    return "\n\n".join(parts) + "\n"


_RENDERERS = {
    "spec": render_spec, "task": render_task, "feature": render_feature,
    "audit": render_audit, "memory": render_memory, "dispatch": render_dispatch,
    "review": render_review, "usage": render_usage,
}


def render(env: dict[str, Any]) -> str:
    art_type = env.get("type")
    if art_type not in _RENDERERS:
        raise lib.ArtefactError(f"no renderer for type {art_type!r}")
    return _RENDERERS[art_type](env)
