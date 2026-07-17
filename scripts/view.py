#!/usr/bin/env python3
"""
view.py — `hyperflow view` : serve the local artefact viewer.

Starts a foreground http.server BOUND TO 127.0.0.1 ONLY (never 0.0.0.0 — a
LAN-exposed server would leak artefact data off-box and break the privacy
promise), serving the plugin's viewer/ bundle with /artefacts/ aliased to the
project's .hyperflow/artefacts/. Opens the browser at the requested artefact,
or the gallery when no slug is given. Dies on Ctrl-C. It is a user-invoked
convenience, not a daemon.

Usage:
  view.py [slug] [--type T] [--project-root DIR] [--port N] [--no-open]

Stdlib only.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import os
import sys
import webbrowser
from pathlib import Path

BIND_HOST = "127.0.0.1"  # hard requirement — never read from config, never 0.0.0.0
_PORT_PROBES = 10
_PLUGIN_ROOT = Path(__file__).resolve().parent.parent
VIEWER_DIR = _PLUGIN_ROOT / "viewer"
TYPES = ["spec", "task", "feature", "dispatch", "audit", "memory", "review"]


def _default_port() -> int:
    try:
        cfg = json.loads((_PLUGIN_ROOT / "config" / "defaults.json").read_text(encoding="utf-8"))
        return int(cfg.get("viewer", {}).get("port", 7777))
    except (OSError, ValueError):
        return 7777


class _Handler(http.server.SimpleHTTPRequestHandler):
    """Serve viewer/ bundle; alias /artefacts/* to the project artefacts dir.
    Path traversal is blocked by clamping every resolved path to its root."""

    artefacts_root: Path = Path()

    def translate_path(self, path: str) -> str:
        clean = path.split("?", 1)[0].split("#", 1)[0]
        clean = clean.lstrip("/")
        if clean == "":
            clean = "index.html"
        if clean == "artefacts" or clean.startswith("artefacts/"):
            root = self.artefacts_root
            rel = clean[len("artefacts"):].lstrip("/")
        else:
            root = VIEWER_DIR
            rel = clean
        target = (root / rel).resolve()
        try:
            target.relative_to(root.resolve())
        except ValueError:
            return str(root)  # traversal attempt — clamp back to the root
        return str(target)

    def log_message(self, *_args) -> None:  # quiet by default
        return


def _serve(port: int, handler_cls) -> http.server.HTTPServer | None:
    try:
        return http.server.HTTPServer((BIND_HOST, port), handler_cls)
    except OSError:
        return None


def _bind(start_port: int, handler_cls) -> tuple[http.server.HTTPServer, int]:
    for port in range(start_port, start_port + _PORT_PROBES + 1):
        server = _serve(port, handler_cls)
        if server is not None:
            return server, port
    raise SystemExit(
        f"view: ports {start_port}–{start_port + _PORT_PROBES} on {BIND_HOST} are all in use; "
        f"free one or pass --port"
    )


def _target_hash(slug: str | None, art_type: str | None) -> str:
    if not slug:
        return "gallery"
    if art_type:
        return f"{art_type}/{slug}"
    return f"sample/{slug}" if slug in TYPES else f"spec/{slug}"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="view.py", description="Serve the local Hyperflow artefact viewer.")
    parser.add_argument("slug", nargs="?")
    parser.add_argument("--type", choices=TYPES)
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--port", type=int, default=_default_port())
    parser.add_argument("--no-open", action="store_true")
    args = parser.parse_args(argv[1:])

    project_root = Path(args.project_root).resolve()
    handler_cls = functools.partial(_Handler)  # instantiate fresh; class attr set below
    _Handler.artefacts_root = project_root / ".hyperflow" / "artefacts"

    server, port = _bind(args.port, handler_cls)
    url = f"http://{BIND_HOST}:{port}/index.html#{_target_hash(args.slug, args.type)}"

    print(f"Hyperflow viewer → {url}")
    print(f"Serving {VIEWER_DIR} (artefacts from {_Handler.artefacts_root}) · Ctrl-C to stop")

    headless = args.no_open or os.environ.get("HYPERFLOW_NO_BROWSER")
    if headless:
        print("Browser auto-open skipped. Open the URL above, "
              "or run `render-artefact.py <slug>` for plain markdown.")
    else:
        try:
            if not webbrowser.open(url):
                print("Could not open a browser automatically — open the URL above.")
        except webbrowser.Error:
            print("No browser available — open the URL above.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nviewer stopped.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
