#!/usr/bin/env python3
"""
export-artefact.py — export one artefact as a self-contained, read-only HTML.

Inlines the artefact's JSON plus the viewer bundle (CSS + the render engine,
minus the router/live-poll) into a single HTML file that opens offline with no
network request and nothing uploaded — a shareable, committable snapshot of a
plan / spec / audit graph that stays true to the local-first privacy posture.

Usage:
  export-artefact.py <slug|path> [--type T] [--project-root DIR] [-o FILE]

Default output: .hyperflow/exports/<type>-<slug>.html. Stdlib only. No network.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import artefact_lib as lib  # noqa: E402

_VIEWER = Path(__file__).resolve().parent.parent / "viewer"
# Order matters: components.js sets window.HF; the rest extend it. app.js (router,
# home, live-poll) is intentionally excluded — an export is read-only, one artefact.
_CSS = ["styles.css", "graph.css"]
_JS = ["components.js", "graph-core.js", "graph.js", "interactions.js", "renderers.js"]


def _resolve(project_root: Path, arg: str, art_type: str | None) -> Path:
    p = Path(arg)
    if p.suffix == ".json" and p.exists():
        return p
    lib.safe_slug(arg)
    base = project_root / ".hyperflow" / "artefacts"
    matches = [m for m in base.rglob(f"{arg}.json") if art_type is None or m.parent.name == art_type]
    if not matches:
        raise lib.ArtefactError(f"no artefact found for slug '{arg}'")
    if len(matches) > 1:
        raise lib.ArtefactError(f"'{arg}' is ambiguous; pass --type: {[m.parent.name for m in matches]}")
    return matches[0]


def build_html(env: dict) -> str:
    css = "\n".join((_VIEWER / f).read_text(encoding="utf-8") for f in _CSS)
    js = "\n".join((_VIEWER / f).read_text(encoding="utf-8") for f in _JS)
    # Escape any </ so an artefact string can't break out of the inline <script>.
    data = json.dumps(env, ensure_ascii=False).replace("</", "<\\/")
    title = env.get("title", env.get("slug", "Hyperflow artefact"))
    boot = (
        "(function(){var env=" + data + ";var HF=window.HF;"
        "var app=document.getElementById('app');"
        "var fn=HF.renderers[env.type];"
        "var nodes=fn?fn(env):[HF.emptyState('Unsupported type',env.type)];"
        "nodes.forEach(function(n){if(n)app.append(n);});"
        "var h=app.querySelector('h1,h2');if(h){h.setAttribute('tabindex','-1');}})();"
    )
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        "<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230B0F1A'/%3E%3Crect x='9' y='9' width='14' height='14' rx='4' fill='%237C3AED'/%3E%3C/svg%3E\">"
        f"<title>{title}</title><style>{css}</style></head><body>"
        '<header class="topbar"><span class="brand"><span class="brand-mark"></span>'
        '<span class="brand-name">Hyperflow</span>'
        '<span class="brand-sub">read-only export</span></span></header>'
        '<main id="app" class="app" tabindex="-1"></main>'
        '<footer class="footer"><span>Exported locally · self-contained · nothing left your machine</span></footer>'
        f"<script>{js}</script><script>{boot}</script></body></html>\n"
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="export-artefact.py", description="Export an artefact as self-contained HTML.")
    parser.add_argument("target")
    parser.add_argument("--type", choices=lib.TYPES)
    parser.add_argument("--project-root", default=".")
    parser.add_argument("-o", "--output")
    args = parser.parse_args(argv[1:])
    project_root = Path(args.project_root).resolve()
    try:
        env = lib.read_envelope(_resolve(project_root, args.target, args.type))
        html = build_html(env)
    except lib.ArtefactError as exc:
        print(f"export-artefact: {exc}", file=sys.stderr)
        return 3
    out = Path(args.output) if args.output else (project_root / ".hyperflow" / "exports" / f"{env.get('type')}-{env.get('slug')}.html")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    kb = round(len(html.encode("utf-8")) / 1024)
    print(f"Exported → {out}  ({kb} KB, self-contained, read-only)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
