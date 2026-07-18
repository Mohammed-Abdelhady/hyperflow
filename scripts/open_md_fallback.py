#!/usr/bin/env python3
"""open_md_fallback.py — render a plan's classic markdown when no JSON artefact.

The plan skill writes markdown (``.hyperflow/specs/<slug>.md`` /
``tasks/<slug>.md`` / ``features/<slug>/feature.md``) and does not always emit a
JSON artefact, so ``open-artefact.py`` cannot rely on one existing. This helper
renders the plan's markdown to a self-contained HTML (with any mermaid graphs)
via ``render-md.py`` so auto-open works for every plan — model-independent.

Stdlib only. No network.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
# spec first (carries the architecture/data-flow graphs), then task, then feature.
_MD_KINDS = (("spec", "specs"), ("task", "tasks"), ("feature", "features"))


def _under(root: Path, path: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except (ValueError, OSError):
        return False


def render_markdown_fallback(hf: Path, slug: str) -> Path | None:
    """Render the plan's markdown to ``<hf>/exports/<kind>-<slug>.html``.

    Returns the export path, or None when no plan markdown backs the slug (or
    rendering failed / escaped the exports dir — the caller treats None as
    'nothing to open')."""
    exports_dir = hf / "exports"
    for kind, folder in _MD_KINDS:
        md = (
            hf / folder / slug / "feature.md"
            if kind == "feature"
            else hf / folder / f"{slug}.md"
        )
        if not (md.is_file() and _under(hf, md)):
            continue
        export_path = exports_dir / f"{kind}-{slug}.html"
        if not _under(exports_dir, export_path):
            return None
        script = _SCRIPTS / "render-md.py"
        if not script.is_file():
            return None
        exports_dir.mkdir(parents=True, exist_ok=True)
        try:
            proc = subprocess.run(
                [sys.executable, str(script), str(md), "-o", str(export_path)],
                capture_output=True,
                text=True,
                check=False,
            )
        except Exception:
            return None
        return export_path if (proc.returncode == 0 and export_path.is_file()) else None
    return None
