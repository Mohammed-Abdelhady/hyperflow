#!/usr/bin/env python3
"""
render-artefact.py — rehydrate full markdown from a compact JSON artefact.

The viewer renders the JSON richly; this script produces the plain markdown a
reader wants in an editor, in a PR diff, or when the viewer is disabled. It is
the inverse of the slim stub: on demand, JSON -> the full artefact-format.md
layout (status table, sections, batches, findings).

Usage:
  render-artefact.py <slug|path> [--type T] [--project-root DIR] [-o FILE]
  render-artefact.py --all [--project-root DIR]     # rehydrate every stub

Without --all, prints the markdown to stdout (or -o FILE). With --all, walks
.hyperflow/artefacts/** and writes each type's full markdown to its stub path,
turning a viewer-mode project back into a fully readable markdown project.

Stdlib only. No network.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import artefact_lib as lib  # noqa: E402


def _table(rows: list[tuple[str, str]]) -> str:
    out = ["| Field | Value |", "|---|---|"]
    out += [f"| {k} | {v} |" for k, v in rows]
    return "\n".join(out)


def _status_rows(env: dict[str, Any], extra: list[tuple[str, str]]) -> str:
    rows = [("Status", env.get("status", "")), ("Type", env.get("type", ""))]
    rows += extra
    specs = ", ".join(env.get("specialists", []))
    if specs:
        rows.append(("Specialists", f"`{specs}`"))
    rows.append(("Updated", env.get("updated", "")))
    return _table(rows)


def render_spec(env: dict[str, Any]) -> str:
    p = env["payload"]
    parts = [f"## Status\n\n{_status_rows(env, [])}", f"# {env['title']}", f"## TL;DR\n\n{p.get('tldr', '')}"]
    if p.get("components"):
        parts.append("## Components\n\n" + "\n".join(f"- **{c.get('name','')}** — {c.get('role','')}" for c in p["components"]))
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
        decs.append(f"- **{d.get('decision','')}** — {d.get('rationale','')}")
        if d.get("tradeoff"):
            decs.append(f"  - Trade-off: {d['tradeoff']}")
    parts.append("\n".join(decs))
    if p.get("edgeCases"):
        parts.append("## 4. Edge cases\n\n" + "\n".join(f"- {e}" for e in p["edgeCases"]))
    if p.get("fileStructure"):
        rows = "\n".join(f"| `{f.get('path','')}` | {f.get('change','')} | {f.get('note','')} |" for f in p["fileStructure"])
        parts.append("## 5. File structure\n\n| Path | Change | Note |\n|---|---|---|\n" + rows)
    return "\n\n".join(parts) + "\n"


def render_task(env: dict[str, Any]) -> str:
    p = env["payload"]
    parts = [f"## Status\n\n{_status_rows(env, [])}", f"# {env['title']}", f"## Goal\n\n{p.get('goal','')}"]
    if p.get("scope"):
        rows = "\n".join(
            f"| {s.get('surface','')} | {s.get('files',0)} | {s.get('created',0)} | {s.get('modified',0)} | {s.get('risk','')} |"
            for s in p["scope"]
        )
        parts.append("## Scope at a glance\n\n| Surface | Files | Created | Modified | Risk |\n|---|--:|--:|--:|---|\n" + rows)
    plan = ["## Execution plan", ""]
    for b in p.get("batches", []):
        dep = f" (depends on {', '.join(b['dependsOn'])})" if b.get("dependsOn") else ""
        par = "parallel" if b.get("parallel") else "sequential"
        plan.append(f"### {b.get('name','')} — {par}{dep}")
        for t in b.get("tasks", []):
            brief = f" · Brief: `{t['brief']}`" if t.get("brief") else ""
            files = " · ".join(
                filter(None, [
                    "Read: " + ", ".join(t["read"]) if t.get("read") else "",
                    "Modify: " + ", ".join(t["modify"]) if t.get("modify") else "",
                    "Create: " + ", ".join(t["create"]) if t.get("create") else "",
                ])
            )
            plan.append(f"- [ ] {t.get('id','')} — {t.get('role','')} · {t.get('task','')}")
            plan.append(f"       {files} · Complexity: {t.get('complexity','')} · Specialist: {t.get('specialist','')}{brief}")
    parts.append("\n".join(plan))
    if p.get("verification"):
        parts.append("## Verification\n\n" + "\n".join(f"- {v}" for v in p["verification"]))
    if p.get("commits"):
        parts.append("## Commit plan\n\n" + "\n".join(f"{i+1}. `{c}`" for i, c in enumerate(p["commits"])))
    return "\n\n".join(parts) + "\n"


def render_feature(env: dict[str, Any]) -> str:
    p = env["payload"]
    phases = "\n".join(
        f"{ph.get('n','')}. **{ph.get('name','')}** — {ph.get('goal','')} — `{ph.get('status','')}`"
        + (f" (depends on {ph['dependsOn']})" if ph.get("dependsOn") else "")
        for ph in p.get("phases", [])
    )
    parts = [f"## Status\n\n{_status_rows(env, [])}", f"# Feature: {env['title']}", f"## Goal\n\n{p.get('goal','')}", "## Phases\n\n" + phases]
    if p.get("graph"):
        parts.append("## Phase dependency graph\n\n```\n" + p["graph"] + "\n```")
    return "\n\n".join(parts) + "\n"


_SEV_ORDER = ["critical", "important", "suggestion", "praise"]


def render_audit(env: dict[str, Any]) -> str:
    p = env["payload"]
    c = p.get("counts", {})
    counts = " · ".join(f"{c.get(s,0)} {s.capitalize()}" for s in _SEV_ORDER)
    rows = [("Verdict", f"`{p.get('verdict','')}`"), ("Scope", p.get("scope","")), ("Level", p.get("level","")), ("Findings", counts)]
    parts = [f"## Status\n\n{_table(rows)}", f"# {env['title']}"]
    for sev in _SEV_ORDER:
        items = [f for f in p.get("findings", []) if f.get("severity") == sev]
        for f in items:
            loc = f" {f['file']}:{f['line']}" if f.get("file") else ""
            block = f"### [{sev.capitalize()}]{loc}\n\n**Issue:** {f.get('issue','')}"
            if f.get("fix"):
                block += f"\n\n**Fix:** {f['fix']}"
            if f.get("why"):
                block += f"\n\n**Why it matters:** {f['why']}"
            parts.append(block)
    return "\n\n".join(parts) + "\n"


def render_memory(env: dict[str, Any]) -> str:
    p = env["payload"]
    parts = [f"# {env['title']}"]
    for e in p.get("entries", []):
        tags = f" _(tags: {', '.join(e['tags'])})_" if e.get("tags") else ""
        parts.append(f"## {e.get('title','')}\n\n- Task: {e.get('task','')}\n- Decision: {e.get('decision','')}{tags}")
    return "\n\n".join(parts) + "\n"


def render_dispatch(env: dict[str, Any]) -> str:
    p = env["payload"]
    parts = [f"# {env['title']}"]
    for b in p.get("batches", []):
        rows = "\n".join(f"| {t.get('id','')} | {t.get('status','')} | {t.get('tokens',0)} | {t.get('wallclock','')} |" for t in b.get("tasks", []))
        parts.append(f"## {b.get('name','')}\n\n| Task | Status | Tokens | Wall-clock |\n|---|---|--:|---|\n" + rows)
    tot = p.get("totals", {})
    parts.append(f"## Totals\n\n{tot.get('agents',0)} agents · {tot.get('tokens',0)} tokens · {tot.get('elapsed','')}")
    return "\n\n".join(parts) + "\n"


def render_review(env: dict[str, Any]) -> str:
    p = env["payload"]
    parts = [f"# {env['title']}", f"Verdict: `{p.get('verdict','')}`"]
    for f in p.get("findings", []):
        block = f"### [{f.get('severity','').capitalize()}] {f.get('anchor','')}\n\n{f.get('issue','')}"
        if f.get("fix"):
            block += f"\n\n**Fix:** {f['fix']}"
        parts.append(block)
    return "\n\n".join(parts) + "\n"


_RENDERERS = {
    "spec": render_spec, "task": render_task, "feature": render_feature,
    "audit": render_audit, "memory": render_memory, "dispatch": render_dispatch, "review": render_review,
}


def render(env: dict[str, Any]) -> str:
    art_type = env.get("type")
    if art_type not in _RENDERERS:
        raise lib.ArtefactError(f"no renderer for type {art_type!r}")
    return _RENDERERS[art_type](env)


def _resolve_one(project_root: Path, arg: str, art_type: str | None) -> Path:
    p = Path(arg)
    if p.suffix == ".json" and p.exists():
        return p
    base = project_root / ".hyperflow" / "artefacts"
    matches = [m for m in base.rglob(f"{arg}.json") if art_type is None or m.parent.name == art_type]
    if not matches:
        raise lib.ArtefactError(f"no artefact found for slug '{arg}'" + (f" of type {art_type}" if art_type else ""))
    if len(matches) > 1:
        raise lib.ArtefactError(f"'{arg}' is ambiguous across types; pass --type: {[m.parent.name for m in matches]}")
    return matches[0]


def _cmd_all(project_root: Path) -> int:
    written = 0
    for path, env in lib.iter_artefacts(project_root):
        stub = lib.stub_path(project_root, env.get("type", ""), env.get("slug", ""))
        if stub is None:
            continue
        stub.parent.mkdir(parents=True, exist_ok=True)
        stub.write_text(render(env), encoding="utf-8")
        written += 1
    print(f"render-artefact: rehydrated {written} markdown file(s)")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="render-artefact.py", description="Rehydrate markdown from artefact JSON.")
    parser.add_argument("target", nargs="?", help="slug or path to a .json artefact")
    parser.add_argument("--type", choices=lib.TYPES)
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--all", action="store_true", help="rehydrate every stub to full markdown")
    parser.add_argument("-o", "--output", help="write to FILE instead of stdout")
    args = parser.parse_args(argv[1:])
    project_root = Path(args.project_root).resolve()

    try:
        if args.all:
            return _cmd_all(project_root)
        if not args.target:
            parser.error("a slug/path is required unless --all is given")
        env = lib.read_envelope(_resolve_one(project_root, args.target, args.type))
        markdown = render(env)
    except lib.ArtefactError as exc:
        print(f"render-artefact: {exc}", file=sys.stderr)
        return 3

    if args.output:
        Path(args.output).write_text(markdown, encoding="utf-8")
    else:
        sys.stdout.write(markdown)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
