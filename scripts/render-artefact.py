#!/usr/bin/env python3
"""
render-artefact.py — rehydrate full markdown from a compact JSON artefact.

The viewer renders the JSON richly; this script produces the plain markdown a
reader wants in an editor, in a PR diff, or when the viewer is disabled. It is
the inverse of the slim stub: on demand, JSON -> the full artefact-format.md
layout (status table, sections, batches, findings). Rendering lives in
render_lib.py; this file is the CLI.

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

sys.path.insert(0, str(Path(__file__).resolve().parent))
import artefact_lib as lib  # noqa: E402
from render_lib import render  # noqa: E402,F401  (re-exported for tests + callers)


def _resolve_one(project_root: Path, arg: str, art_type: str | None) -> Path:
    p = Path(arg)
    if p.suffix == ".json" and p.exists():
        return p
    lib.safe_slug(arg)  # also blocks glob metacharacters / traversal in the lookup
    base = project_root / ".hyperflow" / "artefacts"
    matches = [m for m in base.rglob(f"{arg}.json") if art_type is None or m.parent.name == art_type]
    if not matches:
        raise lib.ArtefactError(f"no artefact found for slug '{arg}'" + (f" of type {art_type}" if art_type else ""))
    if len(matches) > 1:
        raise lib.ArtefactError(f"'{arg}' is ambiguous across types; pass --type: {[m.parent.name for m in matches]}")
    return matches[0]


def _cmd_all(project_root: Path) -> int:
    written = 0
    skipped = 0
    for path, env, err in lib.iter_artefacts(project_root):
        if err is not None:
            print(f"render-artefact: skipped unreadable {path.name} ({err})", file=sys.stderr)
            skipped += 1
            continue
        stub = lib.stub_path(project_root, env.get("type", ""), env.get("slug", ""))
        if stub is None:
            continue
        try:
            markdown = render(env)
        except (lib.ArtefactError, KeyError, TypeError) as exc:
            print(f"render-artefact: skipped un-renderable {path.name} ({exc})", file=sys.stderr)
            skipped += 1
            continue
        stub.parent.mkdir(parents=True, exist_ok=True)
        stub.write_text(markdown, encoding="utf-8")
        written += 1
    note = f" ({skipped} skipped)" if skipped else ""
    print(f"render-artefact: rehydrated {written} markdown file(s){note}")
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
