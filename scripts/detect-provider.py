#!/usr/bin/env python3
"""detect-provider.py — deterministic provider + installation-mode resolver.

Resolves which host Hyperflow is running on, how the plugin was installed, and
which canonical operations are effective after intersecting registry candidates
with an optional live tool inventory.

Precedence (highest first):
  1. Explicit plugin-root environment variables (CODEX_PLUGIN_ROOT,
     CLAUDE_PLUGIN_ROOT, OPENCODE_PLUGIN_ROOT, GROK_PLUGIN_ROOT,
     ANTIGRAVITY_PLUGIN_ROOT, CURSOR_PLUGIN_ROOT).
     When both CODEX_PLUGIN_ROOT and CLAUDE_PLUGIN_ROOT are set and non-empty,
     CODEX_PLUGIN_ROOT wins (matches hooks/session-start fallback chain).
  2. Specific host environment keys and prefixes declared in
     config/providers.json (more specific prefixes beat shorter ones; first
     matching provider in registry order wins among equal strength).
  3. Filesystem path markers under --root or the resolved plugin root.

Install mode (path-based; .git alone never decides marketplace vs source):
  - codex-marketplace  — root under .codex/plugins/cache or Codex marketplace paths
  - claude-marketplace — root under .claude/plugins/cache or Claude marketplace paths
  - source-checkout    — git work tree outside marketplace cache paths
  - unknown            — everything else

Live inventory:
  --tools TOOL1,TOOL2 or --tools-file PATH (JSON array of tool name strings).
  With inventory: each operation gets available true/false and selected tool
  (first candidate present). Unknown inventory entries are ignored.
  Without inventory (None): candidates are returned without available=true claims.

Python 3 stdlib only. No pip deps. Deterministic JSON (sorted keys).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_PLUGIN_ROOT = SCRIPT_DIR.parent
PROVIDERS_PATH = DEFAULT_PLUGIN_ROOT / "config" / "providers.json"
PROVIDERS_SCHEMA_PATH = DEFAULT_PLUGIN_ROOT / "config" / "providers.schema.json"

# Path fragments that identify marketplace installs. Matched against the
# resolved absolute root with both POSIX separators and os.sep normalized.
CODEX_MARKETPLACE_MARKERS = (
    "/.codex/plugins/cache",
    "/.codex/.tmp/marketplaces",
)
CLAUDE_MARKETPLACE_MARKERS = (
    "/.claude/plugins/cache",
    "/.claude/plugins/marketplaces",
)

# Provider keys considered when ranking explicit plugin-root env vars.
# Codex wins over Claude when both roots are set (session-start parity).
PLUGIN_ROOT_PRECEDENCE = (
    "codex",
    "claude-code",
    "opencode",
    "grok",
    "antigravity",
    "cursor",
)

INSTALL_MODES = (
    "source-checkout",
    "codex-marketplace",
    "claude-marketplace",
    "unknown",
)

SCHEMA_KEYWORDS_ENFORCED = frozenset(
    {"type", "required", "properties", "items", "enum", "minItems", "pattern"}
)
SCHEMA_KEYWORDS_ANNOTATION = frozenset(
    {"$schema", "$id", "$comment", "title", "description", "examples", "default"}
)


# ─── Schema subset (mirrors scripts/validate-plugin.py) ───────────────────────


def _type_ok(value: object, t: str) -> bool:
    if t == "object":
        return isinstance(value, dict)
    if t == "array":
        return isinstance(value, list)
    if t == "string":
        return isinstance(value, str)
    if t == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if t == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if t == "boolean":
        return isinstance(value, bool)
    if t == "null":
        return value is None
    return True


def validate_against_schema(
    instance: object, schema: dict, path: str, errors: list[str]
) -> None:
    """Compact zero-dep JSON-Schema subset validator."""
    here = path or "<root>"

    unsupported = sorted(
        set(schema) - SCHEMA_KEYWORDS_ENFORCED - SCHEMA_KEYWORDS_ANNOTATION
    )
    if unsupported:
        errors.append(
            f"{here}: schema uses keyword(s) {unsupported} that this validator "
            "does not enforce"
        )

    declared = schema.get("type")
    if declared is not None:
        types = declared if isinstance(declared, list) else [declared]
        if not any(_type_ok(instance, t) for t in types):
            errors.append(
                f"{here}: expected type {types}, got {type(instance).__name__}"
            )
            return

    enum = schema.get("enum")
    if enum is not None and instance not in enum:
        errors.append(f"{here}: value {instance!r} not in enum {enum}")

    if isinstance(instance, str):
        pattern = schema.get("pattern")
        if pattern is not None and not re.fullmatch(pattern, instance):
            errors.append(
                f"{here}: {instance!r} does not match pattern {pattern!r}"
            )

    if isinstance(instance, dict):
        for req in schema.get("required", []):
            if req not in instance:
                errors.append(f"{here}: missing required property '{req}'")
        for key, subschema in schema.get("properties", {}).items():
            if key in instance:
                child = f"{path}.{key}" if path else key
                validate_against_schema(instance[key], subschema, child, errors)

    if isinstance(instance, list):
        min_items = schema.get("minItems")
        if isinstance(min_items, int) and len(instance) < min_items:
            errors.append(
                f"{here}: array has {len(instance)} item(s), minimum {min_items}"
            )
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for i, item in enumerate(instance):
                validate_against_schema(
                    item, item_schema, f"{path}[{i}]", errors
                )


# ─── Registry load ────────────────────────────────────────────────────────────


def load_registry(
    plugin_root: Path | None = None,
) -> tuple[dict[str, Any], list[str]]:
    """Load and schema-validate config/providers.json. Returns (data, errors)."""
    root = plugin_root or DEFAULT_PLUGIN_ROOT
    providers_path = root / "config" / "providers.json"
    schema_path = root / "config" / "providers.schema.json"
    errors: list[str] = []

    if not providers_path.is_file():
        return {}, [f"missing providers registry: {providers_path}"]
    if not schema_path.is_file():
        return {}, [f"missing providers schema: {schema_path}"]

    try:
        data = json.loads(providers_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return {}, [f"providers.json is not valid JSON: {exc}"]

    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return {}, [f"providers.schema.json is not valid JSON: {exc}"]

    if not isinstance(schema, dict):
        return {}, ["providers.schema.json root must be an object"]

    validate_against_schema(data, schema, "", errors)
    if errors:
        return {}, errors
    if not isinstance(data, dict):
        return {}, ["providers.json root must be an object"]
    return data, []


def providers_by_key(registry: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for entry in registry.get("providers", []):
        if isinstance(entry, dict) and isinstance(entry.get("key"), str):
            out[entry["key"]] = entry
    return out


# ─── Detection ────────────────────────────────────────────────────────────────


def _env_has_prefix(environ: Mapping[str, str], prefix: str) -> bool:
    needle = f"{prefix}_"
    return any(key == prefix or key.startswith(needle) for key in environ)


def _nonempty(environ: Mapping[str, str], key: str) -> str | None:
    value = environ.get(key)
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _plugin_root_hits(
    providers: Sequence[Mapping[str, Any]],
    environ: Mapping[str, str],
) -> list[tuple[str, str, str]]:
    """Return (provider_key, env_var, path) for every set plugin-root env."""
    hits: list[tuple[str, str, str]] = []
    for entry in providers:
        key = entry.get("key")
        signals = entry.get("signals") or {}
        if not isinstance(key, str) or not isinstance(signals, dict):
            continue
        for env_name in signals.get("plugin_root_env") or []:
            if not isinstance(env_name, str):
                continue
            value = _nonempty(environ, env_name)
            if value is not None:
                hits.append((key, env_name, value))
    return hits


def _rank_provider(key: str) -> int:
    try:
        return PLUGIN_ROOT_PRECEDENCE.index(key)
    except ValueError:
        return len(PLUGIN_ROOT_PRECEDENCE)


def detect_provider(
    registry: Mapping[str, Any],
    environ: Mapping[str, str] | None = None,
    root: Path | None = None,
) -> dict[str, Any]:
    """Detect provider key and matching signals from env + filesystem.

    Returns a dict with keys: provider, matched_signals, plugin_root,
    detection_tier (plugin_root | env | path_marker | unknown).
    """
    env = dict(environ if environ is not None else os.environ)
    providers = [
        p for p in registry.get("providers", []) if isinstance(p, dict)
    ]
    matched: list[str] = []
    plugin_root: str | None = None

    # Tier 1 — explicit plugin root env
    root_hits = _plugin_root_hits(providers, env)
    if root_hits:
        root_hits.sort(key=lambda item: (_rank_provider(item[0]), item[1]))
        provider_key, env_name, path = root_hits[0]
        matched.append(env_name)
        # Include every root env that fired for transparency.
        for other_key, other_env, _other_path in root_hits[1:]:
            if other_env not in matched:
                matched.append(other_env)
            # Record that a competing root was present.
            del other_key  # ranked loser; kept only for signal list
        return {
            "provider": provider_key,
            "matched_signals": matched,
            "plugin_root": path,
            "detection_tier": "plugin_root",
        }

    # Tier 2 — specific env keys, then prefixes
    for entry in providers:
        key = entry.get("key")
        signals = entry.get("signals") or {}
        if not isinstance(key, str) or not isinstance(signals, dict):
            continue
        for env_name in signals.get("env_keys") or []:
            if isinstance(env_name, str) and _nonempty(env, env_name):
                matched.append(env_name)
                return {
                    "provider": key,
                    "matched_signals": matched,
                    "plugin_root": None,
                    "detection_tier": "env",
                }

    # Prefer longer prefixes (CLAUDE_CODE before CLAUDE) so nested prefixes
    # do not steal a more specific host identity.
    prefix_hits: list[tuple[int, int, str, str]] = []
    for index, entry in enumerate(providers):
        key = entry.get("key")
        signals = entry.get("signals") or {}
        if not isinstance(key, str) or not isinstance(signals, dict):
            continue
        for prefix in signals.get("env_prefixes") or []:
            if not isinstance(prefix, str):
                continue
            if _env_has_prefix(env, prefix):
                prefix_hits.append((-len(prefix), index, key, prefix))
    if prefix_hits:
        prefix_hits.sort()
        _neg_len, _idx, key, prefix = prefix_hits[0]
        matched.append(f"prefix:{prefix}")
        return {
            "provider": key,
            "matched_signals": matched,
            "plugin_root": None,
            "detection_tier": "env",
        }

    # Tier 3 — path markers under resolved root
    probe = root
    if probe is None:
        for env_name in (
            "CODEX_PLUGIN_ROOT",
            "CLAUDE_PLUGIN_ROOT",
            "OPENCODE_PLUGIN_ROOT",
            "GROK_PLUGIN_ROOT",
            "ANTIGRAVITY_PLUGIN_ROOT",
            "CURSOR_PLUGIN_ROOT",
        ):
            value = _nonempty(env, env_name)
            if value is not None:
                probe = Path(value)
                break
    if probe is not None:
        probe_text = _normalize_path_text(probe)
        for entry in providers:
            key = entry.get("key")
            signals = entry.get("signals") or {}
            if not isinstance(key, str) or not isinstance(signals, dict):
                continue
            for marker in signals.get("path_markers") or []:
                if not isinstance(marker, str) or not marker:
                    continue
                if marker in probe_text or (probe / marker).exists():
                    matched.append(f"path:{marker}")
                    return {
                        "provider": key,
                        "matched_signals": matched,
                        "plugin_root": str(probe),
                        "detection_tier": "path_marker",
                    }

    return {
        "provider": "unknown",
        "matched_signals": matched,
        "plugin_root": str(root) if root is not None else None,
        "detection_tier": "unknown",
    }


def _normalize_path_text(path: Path | str) -> str:
    text = str(path)
    text = text.replace("\\", "/")
    # Collapse duplicate slashes for stable marker matching.
    while "//" in text:
        text = text.replace("//", "/")
    return text


def detect_install_mode(
    plugin_root: Path | str | None,
    environ: Mapping[str, str] | None = None,
) -> str:
    """Classify how Hyperflow was installed for the resolved plugin root.

    Marketplace paths remain marketplace even when a `.git` directory exists.
    """
    if plugin_root is None:
        return "unknown"

    root = Path(plugin_root).expanduser()
    try:
        resolved = root.resolve()
    except OSError:
        resolved = root

    text = _normalize_path_text(resolved)

    for marker in CODEX_MARKETPLACE_MARKERS:
        if marker in text:
            return "codex-marketplace"
    for marker in CLAUDE_MARKETPLACE_MARKERS:
        if marker in text:
            return "claude-marketplace"

    # Also accept marketplace markers expressed relative to HOME without
    # hard-coding a user home in fixtures: check env HOME when present.
    env = environ if environ is not None else os.environ
    home = _nonempty(env, "HOME")
    if home:
        home_text = _normalize_path_text(home)
        rel = text
        if text.startswith(home_text):
            rel = text[len(home_text) :]
            if not rel.startswith("/"):
                rel = "/" + rel
            for marker in CODEX_MARKETPLACE_MARKERS:
                if marker in rel or text.endswith(marker.lstrip("/")):
                    return "codex-marketplace"
            for marker in CLAUDE_MARKETPLACE_MARKERS:
                if marker in rel or text.endswith(marker.lstrip("/")):
                    return "claude-marketplace"

    git_dir = resolved / ".git"
    if git_dir.exists():
        return "source-checkout"

    return "unknown"


# ─── Operation resolution ─────────────────────────────────────────────────────


def resolve_operations(
    provider_entry: Mapping[str, Any] | None,
    inventory: Sequence[str] | None,
    canonical_operations: Sequence[str],
) -> dict[str, Any]:
    """Intersect candidate mappings with live inventory.

    inventory is None  → no availability claims (selected null, available null)
    inventory is list  → available true/false; selected first present candidate
    Unknown inventory names are ignored.
    """
    operations = (
        provider_entry.get("operations")
        if isinstance(provider_entry, Mapping)
        else None
    )
    if not isinstance(operations, dict):
        operations = {}

    live: set[str] | None
    if inventory is None:
        live = None
    else:
        live = {name for name in inventory if isinstance(name, str)}

    result: dict[str, Any] = {}
    for op in canonical_operations:
        candidates_raw = operations.get(op, [])
        candidates = [
            c for c in candidates_raw if isinstance(c, str)
        ] if isinstance(candidates_raw, list) else []

        if live is None:
            result[op] = {
                "available": None,
                "candidates": list(candidates),
                "selected": None,
            }
            continue

        selected = None
        for candidate in candidates:
            if candidate in live:
                selected = candidate
                break
        result[op] = {
            "available": selected is not None,
            "candidates": list(candidates),
            "selected": selected,
        }
    return result


def build_descriptor(
    registry: Mapping[str, Any],
    environ: Mapping[str, str] | None = None,
    root: Path | None = None,
    inventory: Sequence[str] | None = None,
) -> dict[str, Any]:
    """Full machine-readable session descriptor."""
    detection = detect_provider(registry, environ=environ, root=root)
    provider_key = detection["provider"]
    by_key = providers_by_key(registry)
    entry = by_key.get(provider_key)

    plugin_root = detection.get("plugin_root")
    if plugin_root is None and root is not None:
        plugin_root = str(root)

    install_mode = detect_install_mode(plugin_root, environ=environ)

    canonical = [
        op
        for op in registry.get("canonical_operations", [])
        if isinstance(op, str)
    ]
    if not canonical and entry is not None:
        ops = entry.get("operations") or {}
        if isinstance(ops, dict):
            canonical = sorted(ops.keys())

    effective = resolve_operations(entry, inventory, canonical)

    candidates_map = {
        op: effective[op]["candidates"] for op in effective
    }

    lifecycle = {}
    degraded = {}
    if isinstance(entry, Mapping):
        life = entry.get("lifecycle_events")
        if isinstance(life, dict):
            lifecycle = {
                k: list(v) if isinstance(v, list) else v
                for k, v in sorted(life.items())
            }
        policy = entry.get("degraded_policy")
        if isinstance(policy, dict):
            degraded = {k: policy[k] for k in sorted(policy.keys())}

    return {
        "candidates": {k: candidates_map[k] for k in sorted(candidates_map)},
        "detection_tier": detection["detection_tier"],
        "install_mode": install_mode,
        "lifecycle_events": lifecycle,
        "operations": {k: effective[k] for k in sorted(effective)},
        "plugin_root": plugin_root,
        "provider": provider_key,
        "registry_version": registry.get("version"),
        "signals": {
            "matched": list(detection["matched_signals"]),
            "plugin_root_env": plugin_root,
        },
        "degraded_policy": degraded,
        "inventory_provided": inventory is not None,
        "inventory_size": len(inventory) if inventory is not None else 0,
    }


# ─── CLI ──────────────────────────────────────────────────────────────────────


def _parse_tools_csv(raw: str) -> list[str]:
    parts = [p.strip() for p in raw.split(",")]
    return [p for p in parts if p]


def _load_tools_file(path: Path) -> tuple[list[str] | None, str | None]:
    """Return (tools, error). On failure tools is None and error is a message."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        return None, f"cannot read --tools-file: {exc}"
    except json.JSONDecodeError as exc:
        return None, f"--tools-file is not valid JSON: {exc}"
    if not isinstance(data, list):
        return None, "--tools-file must be a JSON array"
    tools: list[str] = []
    for item in data:
        if isinstance(item, str) and item:
            tools.append(item)
        # non-strings silently ignored (unknown future inventory shapes)
    return tools, None

def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="detect-provider.py",
        description=(
            "Resolve Hyperflow provider identity, install mode, and effective "
            "operations after intersecting registry candidates with an optional "
            "live tool inventory."
        ),
        epilog=(
            "Detection precedence: explicit plugin-root env "
            "(CODEX_PLUGIN_ROOT wins over CLAUDE_PLUGIN_ROOT when both set) > "
            "host env keys/prefixes > path markers. Marketplace cache paths "
            "remain marketplace even if .git exists."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=None,
        help="Plugin root path used for install-mode and path-marker detection",
    )
    parser.add_argument(
        "--tools",
        default=None,
        help="Comma-separated live tool inventory (overrides --tools-file)",
    )
    parser.add_argument(
        "--tools-file",
        type=Path,
        default=None,
        help="Path to JSON array of live tool names",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        default=True,
        help="Emit machine-readable JSON (default)",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        default=False,
        help="Pretty-print JSON with indentation",
    )
    parser.add_argument(
        "--registry",
        type=Path,
        default=None,
        help="Override path to providers.json (default: <root>/config/providers.json)",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)

    plugin_root = args.root
    if plugin_root is not None:
        plugin_root = plugin_root.expanduser()

    registry_root = plugin_root or DEFAULT_PLUGIN_ROOT
    if args.registry is not None:
        # Load from a specific file; schema still expected beside it or under root.
        reg_path = args.registry.expanduser()
        try:
            data = json.loads(reg_path.read_text(encoding="utf-8"))
        except OSError as exc:
            print(f"detect-provider: cannot read registry: {exc}", file=sys.stderr)
            return 2
        except json.JSONDecodeError as exc:
            print(
                f"detect-provider: registry is not valid JSON: {exc}",
                file=sys.stderr,
            )
            return 2
        schema_path = reg_path.parent / "providers.schema.json"
        if not schema_path.is_file():
            schema_path = DEFAULT_PLUGIN_ROOT / "config" / "providers.schema.json"
        try:
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"detect-provider: schema load failure: {exc}", file=sys.stderr)
            return 2
        errors: list[str] = []
        validate_against_schema(data, schema, "", errors)
        if errors:
            for err in errors:
                print(f"detect-provider: schema: {err}", file=sys.stderr)
            return 2
        registry = data if isinstance(data, dict) else {}
    else:
        registry, errors = load_registry(registry_root)
        if errors:
            for err in errors:
                print(f"detect-provider: {err}", file=sys.stderr)
            return 2

    inventory: list[str] | None = None
    if args.tools is not None:
        inventory = _parse_tools_csv(args.tools)
    elif args.tools_file is not None:
        inventory, tools_err = _load_tools_file(args.tools_file.expanduser())
        if tools_err is not None:
            print(f"detect-provider: {tools_err}", file=sys.stderr)
            return 2
    descriptor = build_descriptor(
        registry,
        environ=os.environ,
        root=plugin_root,
        inventory=inventory,
    )

    if args.pretty:
        text = json.dumps(descriptor, indent=2, sort_keys=True, ensure_ascii=True)
    else:
        text = json.dumps(descriptor, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
