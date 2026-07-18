#!/usr/bin/env python3
"""
open-artefact.py — gated, headless-safe auto-open of an artefact's HTML export.

Composes export-artefact.py (which writes a self-contained
.hyperflow/exports/<type>-<slug>.html) with view.py's browser-open +
headless-fallback pattern into one small, testable entry point: given a slug,
(re)generate the static export and open it as a file:// URL in the default
browser — but only when the viewer is enabled AND auto-open is on (or --force).

Non-blocking: opens a file URL and returns immediately — no server, no
serve_forever. Headless-safe: HYPERFLOW_NO_BROWSER or --no-open print the path
instead of launching. Never crashes the caller — a disabled viewer, autoOpen
off, or a missing artefact all exit 0 with a one-line reason. Only a bad slug or
a bad .hyperflow root is a non-zero refusal.

Usage:
  open-artefact.py <hf_root> <slug> [--type T] [--no-open] [--force]

Stdlib only. Opens no sockets.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
import webbrowser
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import artefact_lib as lib  # noqa: E402

SCRIPTS_DIR = Path(__file__).resolve().parent
_PLUGIN_ROOT = SCRIPTS_DIR.parent
# Matches reap.py's slug contract (kebab-case, no separators/dots) — a hostile
# slug ("../x") must never be interpolated into an export path.
SLUG_RE = re.compile(r"^[a-z0-9-]+$")
TYPES = list(lib.TYPES)


class OpenArtefactError(Exception):
    """Validation / path-safety failure (non-zero exit)."""


def validate_slug(slug: str) -> str:
    if not isinstance(slug, str) or not SLUG_RE.fullmatch(slug):
        raise OpenArtefactError(f"invalid slug {slug!r}: must match {SLUG_RE.pattern}")
    return slug


def validate_hf(hf: Path) -> Path:
    if not hf.is_dir() or hf.name != ".hyperflow":
        raise OpenArtefactError(f"invalid .hyperflow root: {hf}")
    return hf.resolve()


def is_under(root: Path, path: Path) -> bool:
    """True when resolved path is root or a descendant of root."""
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except (ValueError, OSError):
        return False


def _apply_viewer(data: Any, cfg: dict[str, bool]) -> None:
    """Overlay bool viewer.enabled / viewer.autoOpen from one config document."""
    if not isinstance(data, dict):
        return
    viewer = data.get("viewer")
    if not isinstance(viewer, dict):
        return
    for key in ("enabled", "autoOpen"):
        val = viewer.get(key)
        if isinstance(val, bool):
            cfg[key] = val


def load_viewer_cfg() -> dict[str, bool]:
    """viewer.enabled / viewer.autoOpen — plugin defaults (config/defaults.json,
    the view.py idiom) overlaid by the user's ~/.hyperflow/config.json (the
    reap.py idiom). Any unreadable/invalid document is skipped."""
    cfg = {"enabled": True, "autoOpen": False}
    for source in (
        _PLUGIN_ROOT / "config" / "defaults.json",
        Path(os.environ.get("HOME", "")) / ".hyperflow" / "config.json",
    ):
        try:
            _apply_viewer(json.loads(source.read_text(encoding="utf-8")), cfg)
        except (OSError, ValueError):
            continue
    return cfg


def resolve_type(hf: Path, slug: str, art_type: str | None) -> str | None:
    """The artefact type that owns <slug>: the requested --type when its JSON
    exists, else the single type whose artefacts/<type>/<slug>.json is present.
    None when no on-disk artefact backs the slug."""
    base = hf / "artefacts"
    if art_type:
        return art_type if (base / art_type / f"{slug}.json").is_file() else None
    for candidate in TYPES:
        if (base / candidate / f"{slug}.json").is_file():
            return candidate
    return None


_EXPORTER_MODULE: Any = None


def _load_exporter() -> Any:
    """Import export-artefact.py once (hyphenated → not a normal module name).

    Loaded under a private name so it never collides with a test's own
    spec-loaded copy. Returns the module (exposing ``main``) or None when the
    file is missing or fails to import, in which case _run_export falls back to a
    subprocess.
    """
    global _EXPORTER_MODULE
    if _EXPORTER_MODULE is not None:
        return _EXPORTER_MODULE
    script = SCRIPTS_DIR / "export-artefact.py"
    if not script.is_file():
        return None
    try:
        spec = importlib.util.spec_from_file_location(
            "hyperflow_export_artefact", script
        )
        if spec is None or spec.loader is None:
            return None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    except Exception:
        return None
    _EXPORTER_MODULE = module
    return module


def _run_export(project_root: Path, slug: str, art_type: str) -> int:
    """(Re)generate the export via export-artefact.py; return its exit code.

    Prefers an in-process call (no second interpreter); falls back to a
    subprocess only when the import is infeasible. Any failure yields a non-zero
    code so ensure_export's on-disk check treats it as 'nothing to open'.
    """
    argv = [
        "export-artefact.py",
        slug,
        "--type",
        art_type,
        "--project-root",
        str(project_root),
    ]
    module = _load_exporter()
    if module is not None and hasattr(module, "main"):
        try:
            return int(module.main(argv))
        except SystemExit as exc:
            return int(exc.code) if isinstance(exc.code, int) else 1
        except Exception:
            return 1
    script = SCRIPTS_DIR / "export-artefact.py"
    if not script.is_file():
        return 1
    try:
        proc = subprocess.run(
            [sys.executable, str(script), *argv[1:]],
            capture_output=True,
            text=True,
            check=False,
        )
        return proc.returncode
    except Exception:
        return 1


def ensure_export(hf: Path, slug: str, art_type: str) -> Path:
    """(Re)generate the static export and return its path.

    Raises OpenArtefactError if the computed path would escape <hf>/exports/.
    Returns the (possibly non-existent) path — the caller treats a missing file
    as 'nothing to open' rather than an error.
    """
    exports_dir = hf / "exports"
    export_path = exports_dir / f"{art_type}-{slug}.html"
    if not is_under(exports_dir, export_path):
        raise OpenArtefactError(f"export path escapes {exports_dir}: {export_path}")
    _run_export(hf.parent, slug, art_type)
    return export_path


def open_export(export_path: Path, *, no_open: bool) -> None:
    """Open the export as a file:// URL, or print it when headless. Non-blocking
    — mirrors view.py's webbrowser.open + Error fallback."""
    abs_path = export_path.resolve()
    headless = no_open or bool(os.environ.get("HYPERFLOW_NO_BROWSER"))
    if headless:
        print(f"Open manually: {abs_path}")
        return
    url = f"file://{abs_path}"
    try:
        if not webbrowser.open(url):
            print(f"Open manually: {abs_path}")
            return
    except webbrowser.Error:
        print(f"Open manually: {abs_path}")
        return
    print(f"Opened {abs_path}")


def open_artefact(
    hf: Path,
    slug: str,
    art_type: str | None,
    *,
    no_open: bool = False,
    force: bool = False,
) -> int:
    """Core engine. Returns the process exit code. Raises OpenArtefactError on a
    validation/path-safety failure (bad slug or bad root)."""
    validate_slug(slug)
    hf = validate_hf(hf)

    cfg = load_viewer_cfg()
    if not cfg["enabled"]:
        # Classic mode has no artefact JSON — never open, even with --force.
        print("viewer disabled — skipping auto-open")
        return 0
    if not cfg["autoOpen"] and not force:
        print("autoOpen off — skipping")
        return 0

    resolved_type = resolve_type(hf, slug, art_type)
    if resolved_type is None:
        label = f"{art_type} " if art_type else ""
        print(f"no {label}artefact for '{slug}' — skipping auto-open")
        return 0

    export_path = ensure_export(hf, slug, resolved_type)
    if not export_path.is_file():
        print(f"export not generated for '{slug}' — skipping auto-open")
        return 0

    open_export(export_path, no_open=no_open)
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="open-artefact.py",
        description="Gated, headless-safe auto-open of an artefact's HTML export.",
    )
    parser.add_argument("hf_root")
    parser.add_argument("slug")
    parser.add_argument("--type", choices=TYPES)
    parser.add_argument("--no-open", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args(argv[1:])
    try:
        return open_artefact(
            Path(args.hf_root),
            args.slug,
            args.type,
            no_open=args.no_open,
            force=args.force,
        )
    except OpenArtefactError as exc:
        print(f"open-artefact: refused — {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
