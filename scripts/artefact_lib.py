#!/usr/bin/env python3
"""
artefact_lib.py — shared helpers for the compact-JSON artefact contract.

The single source of truth for reading the envelope schema, validating an
artefact against it (stdlib only — no jsonschema dependency), building the
stamped envelope, resolving canonical paths, and rendering the slim markdown
stub. Both scripts/artefact.py (writer) and scripts/render-artefact.py
(markdown renderer) import this module.

Stdlib only. No network. Writes nothing itself — callers own I/O.
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path
from typing import Any

TYPES = ["spec", "task", "feature", "dispatch", "audit", "memory", "review"]

# Types whose canonical artefact IS a single markdown file that becomes the
# slim stub. Others (dispatch, review, memory) are stored as JSON only in v1 —
# memory in particular must never overwrite the hand-maintained memory files.
_STUB_RELPATH = {
    "spec": "specs/{slug}.md",
    "task": "tasks/{slug}.md",
    "audit": "audits/{slug}.md",
    "feature": "features/{slug}/feature.md",
}


class ArtefactError(Exception):
    """Raised on schema load / validation / path problems."""


def schema_path(config_dir: Path) -> Path:
    return config_dir / "artefact.schema.json"


def load_schema(config_dir: Path) -> dict[str, Any]:
    path = schema_path(config_dir)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ArtefactError(f"cannot read schema {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise ArtefactError(f"schema {path} is not valid JSON: {exc}") from exc


# --------------------------------------------------------------------------- #
# Minimal JSON-Schema validator (the keyword subset our schema actually uses)
# --------------------------------------------------------------------------- #

_TYPE_CHECKS = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    "boolean": lambda v: isinstance(v, bool),
    # bool is a subclass of int — exclude it from integer/number.
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
}


def _resolve(ref: str, root: dict[str, Any]) -> dict[str, Any]:
    if not ref.startswith("#/"):
        raise ArtefactError(f"unsupported $ref: {ref}")
    node: Any = root
    for part in ref[2:].split("/"):
        node = node[part]
    return node


def _check(inst: Any, sch: dict[str, Any], root: dict[str, Any], path: str, errors: list[str]) -> None:
    if "$ref" in sch:
        sch = _resolve(sch["$ref"], root)
    loc = path or "<root>"

    if "const" in sch and inst != sch["const"]:
        errors.append(f"{loc}: expected const {sch['const']!r}, got {inst!r}")
    if "enum" in sch and inst not in sch["enum"]:
        errors.append(f"{loc}: {inst!r} is not one of {sch['enum']}")

    expected = sch.get("type")
    if expected and not _TYPE_CHECKS[expected](inst):
        errors.append(f"{loc}: expected {expected}, got {type(inst).__name__}")
        return  # type mismatch — deeper checks would be noise

    if expected == "object" and isinstance(inst, dict):
        props = sch.get("properties", {})
        for req in sch.get("required", []):
            if req not in inst:
                errors.append(f"{loc}: missing required property '{req}'")
        if sch.get("additionalProperties") is False:
            for key in inst:
                if key not in props:
                    errors.append(f"{loc}: unexpected property '{key}'")
        for key, value in inst.items():
            if key in props:
                _check(value, props[key], root, f"{loc}.{key}", errors)

    if expected == "array" and isinstance(inst, list):
        item_schema = sch.get("items")
        if item_schema:
            for i, element in enumerate(inst):
                _check(element, item_schema, root, f"{loc}[{i}]", errors)


def validate_envelope(env: Any, schema: dict[str, Any]) -> list[str]:
    """Validate the full envelope, then the payload against $defs[type]."""
    errors: list[str] = []
    _check(env, schema, schema, "", errors)
    if isinstance(env, dict):
        art_type = env.get("type")
        payload = env.get("payload")
        if art_type in TYPES and isinstance(payload, dict):
            _check(payload, {"$ref": f"#/$defs/{art_type}"}, schema, "payload", errors)
    return errors


# --------------------------------------------------------------------------- #
# Envelope build + paths + stub
# --------------------------------------------------------------------------- #


def _today() -> str:
    return datetime.date.today().isoformat()


def build_envelope(
    art_type: str,
    slug: str,
    title: str,
    status: str,
    payload: dict[str, Any],
    specialists: list[str] | None = None,
    created: str | None = None,
) -> dict[str, Any]:
    if art_type not in TYPES:
        raise ArtefactError(f"unknown artefact type: {art_type} (expected one of {TYPES})")
    return {
        "hf": 1,
        "type": art_type,
        "slug": slug,
        "title": title,
        "status": status,
        "created": created or _today(),
        "updated": _today(),
        "specialists": specialists or [],
        "payload": payload,
    }


def artefact_json_path(project_root: Path, art_type: str, slug: str) -> Path:
    return project_root / ".hyperflow" / "artefacts" / art_type / f"{slug}.json"


def stub_path(project_root: Path, art_type: str, slug: str) -> Path | None:
    rel = _STUB_RELPATH.get(art_type)
    if rel is None:
        return None
    return project_root / ".hyperflow" / rel.format(slug=slug)


def render_stub(env: dict[str, Any]) -> str:
    """The <=6-line greppable/diffable markdown stub. Rich detail is in the JSON."""
    art_type = env["type"]
    slug = env["slug"]
    return (
        f"# {env['title']}\n\n"
        f"Status: {env['status']} · {art_type} · updated {env.get('updated', '')}\n"
        f"Visual artefact: run `hyperflow view {slug}` "
        f"(or `render-artefact.py {slug}` for markdown)\n"
        f"Data: `.hyperflow/artefacts/{art_type}/{slug}.json`\n"
    )


def read_envelope(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ArtefactError(f"cannot read artefact {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise ArtefactError(f"artefact {path} is not valid JSON: {exc}") from exc


def iter_artefacts(project_root: Path):
    """Yield (path, envelope) for every artefact JSON under .hyperflow/artefacts/."""
    base = project_root / ".hyperflow" / "artefacts"
    if not base.is_dir():
        return
    for path in sorted(base.rglob("*.json")):
        yield path, read_envelope(path)
