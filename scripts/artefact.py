#!/usr/bin/env python3
"""
artefact.py — the deterministic artefact writer + checker.

Agents emit the compact payload only. This script wraps it in the versioned
envelope, stamps created/updated, validates against config/artefact.schema.json
(stdlib only), writes .hyperflow/artefacts/<type>/<slug>.json, and rewrites the
slim markdown stub at the canonical path — so the JSON and the stub can never
drift. When the viewer is disabled, skills bypass this script entirely and write
full markdown; artefact.py is never on the classic-mode path.

Usage:
  artefact.py write <type> <slug> --title T --status S [--specialists a,b]
                    [--payload -|<file>] [--project-root DIR] [--no-stub]
  artefact.py check [--project-root DIR]

`write` reads the payload JSON from stdin (`--payload -`, the default) or a file.
Exit 0 on success, 2 on validation failure, 3 on I/O / usage error.
`check` validates every artefact + stub coherence; exit 0 clean, 1 on problems.

Stdlib only. Opens no sockets. Writes only under .hyperflow/.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import artefact_lib as lib  # noqa: E402

# Reject absurd payloads outright so a runaway agent cannot write an unbounded
# file into .hyperflow/. Real artefacts are a few KB; 1 MB is a generous ceiling.
_MAX_PAYLOAD_BYTES = 1_000_000

_PLUGIN_CONFIG = Path(__file__).resolve().parent.parent / "config"


def _markdown_mode() -> str:
    """config viewer.markdown: 'on-demand' (slim stub) | 'always' (full markdown) | 'never'."""
    try:
        cfg = json.loads((_PLUGIN_CONFIG / "defaults.json").read_text(encoding="utf-8"))
        return cfg.get("viewer", {}).get("markdown", "on-demand")
    except (OSError, ValueError):
        return "on-demand"


def _stub_content(env: dict) -> str:
    """The .md content for the canonical path: full markdown when viewer.markdown
    is 'always', else the slim ≤6-line stub."""
    if _markdown_mode() == "always":
        try:
            import render_lib
            return render_lib.render(env)
        except Exception:  # noqa: BLE001 — render is best-effort; fall back to the stub
            return lib.render_stub(env)
    return lib.render_stub(env)


def _read_payload(source: str) -> dict:
    # Bound the read on BOTH paths so a huge file is never fully materialized.
    if source == "-":
        raw = sys.stdin.buffer.read(_MAX_PAYLOAD_BYTES + 1)
    else:
        with open(source, "rb") as handle:
            raw = handle.read(_MAX_PAYLOAD_BYTES + 1)
    if len(raw) > _MAX_PAYLOAD_BYTES:
        raise lib.ArtefactError(f"payload exceeds {_MAX_PAYLOAD_BYTES} bytes — refusing to write")
    text = raw.decode("utf-8")
    data = json.loads(text)
    if not isinstance(data, dict):
        raise lib.ArtefactError("payload must be a JSON object")
    return data


def _cmd_write(args: argparse.Namespace) -> int:
    project_root = Path(args.project_root).resolve()
    schema = lib.load_schema(_PLUGIN_CONFIG)

    # Reject a hostile slug before it is ever interpolated into a path.
    try:
        lib.safe_slug(args.slug)
    except lib.ArtefactError as exc:
        print(f"artefact: {exc}", file=sys.stderr)
        return 3

    # ValueError covers UnicodeDecodeError and json.JSONDecodeError.
    try:
        payload = _read_payload(args.payload)
    except (OSError, ValueError, lib.ArtefactError) as exc:
        print(f"artefact: {exc}", file=sys.stderr)
        return 3

    json_path = lib.artefact_json_path(project_root, args.type, args.slug)
    created = None
    if json_path.exists():  # preserve the original creation date on update
        try:
            created = lib.read_envelope(json_path).get("created")
        except lib.ArtefactError:
            created = None

    specialists = [s.strip() for s in args.specialists.split(",") if s.strip()] if args.specialists else []
    try:
        env = lib.build_envelope(
            args.type, args.slug, args.title, args.status, payload, specialists, created
        )
    except lib.ArtefactError as exc:
        print(f"artefact: {exc}", file=sys.stderr)
        return 3

    errors = lib.validate_envelope(env, schema)
    if errors:
        print(f"artefact: {args.type}/{args.slug} failed validation:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 2

    # Defense in depth: every written path must resolve inside .hyperflow/.
    hf_root = (project_root / ".hyperflow").resolve()
    stub = None if args.no_stub else lib.stub_path(project_root, args.type, args.slug)
    for target in (json_path, stub):
        if target is not None and not target.resolve().is_relative_to(hf_root):
            print(f"artefact: refusing to write outside .hyperflow/: {target}", file=sys.stderr)
            return 3

    try:
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(env, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        if stub is not None:
            stub.parent.mkdir(parents=True, exist_ok=True)
            stub.write_text(_stub_content(env), encoding="utf-8")
    except OSError as exc:
        print(f"artefact: write failed: {exc}", file=sys.stderr)
        return 3

    print(f"Artefact written → hyperflow view {args.slug}  ({json_path})")
    return 0


def _cmd_check(args: argparse.Namespace) -> int:
    project_root = Path(args.project_root).resolve()
    schema = lib.load_schema(_PLUGIN_CONFIG)
    problems: list[str] = []
    count = 0

    for path, env, err in lib.iter_artefacts(project_root):
        count += 1
        rel = path.relative_to(project_root)
        if err is not None:
            problems.append(f"{rel}: unreadable ({err})")
            continue
        errors = lib.validate_envelope(env, schema)
        problems.extend(f"{rel}: {e}" for e in errors)
        if isinstance(env, dict) and env.get("type") in lib.TYPES:
            stub = lib.stub_path(project_root, env["type"], env.get("slug", ""))
            if stub is not None and not stub.exists():
                problems.append(f"{rel}: stub missing at {stub.relative_to(project_root)}")

    if problems:
        print(f"artefact check: {len(problems)} problem(s) across {count} artefact(s):", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1
    print(f"artefact check: {count} artefact(s) OK")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="artefact.py", description="Write/validate compact JSON artefacts.")
    sub = parser.add_subparsers(dest="command", required=True)

    w = sub.add_parser("write", help="Validate + stamp + write a JSON artefact and its stub.")
    w.add_argument("type", choices=lib.TYPES)
    w.add_argument("slug")
    w.add_argument("--title", required=True)
    w.add_argument("--status", required=True)
    w.add_argument("--specialists", default="")
    w.add_argument("--payload", default="-", help="'-' for stdin (default) or a path.")
    w.add_argument("--project-root", default=".")
    w.add_argument("--no-stub", action="store_true", help="Write JSON only, skip the markdown stub.")
    w.set_defaults(func=_cmd_write)

    c = sub.add_parser("check", help="Validate every artefact + stub coherence.")
    c.add_argument("--project-root", default=".")
    c.set_defaults(func=_cmd_check)
    return parser


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv[1:])
    try:
        return args.func(args)
    except lib.ArtefactError as exc:
        print(f"artefact: {exc}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main(sys.argv))
