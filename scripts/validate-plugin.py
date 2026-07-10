#!/usr/bin/env python3
"""Validate manifests, skill frontmatter, hooks, and README links. Used by CI."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parent.parent
ERRORS: list[str] = []
WARNINGS: list[str] = []


def fail(msg: str) -> None:
    ERRORS.append(msg)
    print(f"  FAIL  {msg}", file=sys.stderr)


def warn(msg: str) -> None:
    WARNINGS.append(msg)
    print(f"  WARN  {msg}")


def section(title: str, fn: Callable[[], None]) -> None:
    print(f"\n>>> {title}")
    before = len(ERRORS)
    fn()
    if len(ERRORS) == before:
        print(f"  OK    {title}")


PLUGIN_JSON_REQUIRED = ["name", "version", "description", "author", "homepage", "repository", "license"]


def check_plugin_json() -> None:
    path = ROOT / ".claude-plugin" / "plugin.json"
    if not path.exists():
        fail(f"missing {path.relative_to(ROOT)}")
        return
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        fail(f".claude-plugin/plugin.json is not valid JSON: {e}")
        return
    for field in PLUGIN_JSON_REQUIRED:
        if field not in data:
            fail(f".claude-plugin/plugin.json missing required field: {field}")
    if data.get("name") != "hyperflow":
        fail(f".claude-plugin/plugin.json name is '{data.get('name')}', expected 'hyperflow'")
    version = data.get("version", "")
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        fail(f".claude-plugin/plugin.json version '{version}' is not strict semver MAJOR.MINOR.PATCH")


def check_codex_plugin_json() -> None:
    path = ROOT / ".codex-plugin" / "plugin.json"
    if not path.exists():
        fail(f"missing {path.relative_to(ROOT)}")
        return
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        fail(f".codex-plugin/plugin.json is not valid JSON: {e}")
        return
    for field in PLUGIN_JSON_REQUIRED:
        if field not in data:
            fail(f".codex-plugin/plugin.json missing required field: {field}")
    if data.get("name") != "hyperflow":
        fail(f".codex-plugin/plugin.json name is '{data.get('name')}', expected 'hyperflow'")
    version = data.get("version", "")
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        fail(f".codex-plugin/plugin.json version '{version}' is not strict semver MAJOR.MINOR.PATCH")

    claude_plugin = ROOT / ".claude-plugin" / "plugin.json"
    if claude_plugin.exists():
        claude_version = json.loads(claude_plugin.read_text()).get("version")
        if version != claude_version:
            fail(f".codex-plugin/plugin.json version '{version}' != .claude-plugin/plugin.json version '{claude_version}'")


def check_marketplace_json() -> None:
    path = ROOT / ".claude-plugin" / "marketplace.json"
    if not path.exists():
        fail(f"missing {path.relative_to(ROOT)}")
        return
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        fail(f".claude-plugin/marketplace.json is not valid JSON: {e}")
        return

    if "plugins" not in data or not isinstance(data["plugins"], list):
        fail(".claude-plugin/marketplace.json has no 'plugins' array")
        return

    hits = [p for p in data["plugins"] if p.get("name") == "hyperflow"]
    if not hits:
        fail(".claude-plugin/marketplace.json has no 'hyperflow' plugin entry")
        return
    if len(hits) > 1:
        fail(f".claude-plugin/marketplace.json has {len(hits)} 'hyperflow' entries (expected 1)")

    entry = hits[0]
    for required in ("name", "version", "source", "description"):
        if required not in entry:
            fail(f"marketplace.json hyperflow entry missing required field: {required}")

    plugin_json = ROOT / ".claude-plugin" / "plugin.json"
    if plugin_json.exists():
        plugin_version = json.loads(plugin_json.read_text()).get("version")
        if entry.get("version") != plugin_version:
            fail(
                f"marketplace.json hyperflow entry version '{entry.get('version')}' "
                f"!= plugin.json version '{plugin_version}'"
            )

    metadata_version = data.get("metadata", {}).get("version")
    if metadata_version and metadata_version != entry.get("version"):
        fail(
            f"marketplace.json metadata.version '{metadata_version}' "
            f"!= hyperflow entry version '{entry.get('version')}'"
        )

    source = entry.get("source")
    if isinstance(source, dict):
        if source.get("source") == "url" and not source.get("url", "").startswith("https://"):
            fail(f"marketplace.json hyperflow source.url is not https://: {source.get('url')}")


def check_package_json() -> None:
    path = ROOT / "package.json"
    if not path.exists():
        return
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        fail(f"package.json is not valid JSON: {e}")
        return
    plugin_version = json.loads((ROOT / ".claude-plugin" / "plugin.json").read_text()).get("version")
    if data.get("version") != plugin_version:
        fail(f"package.json version '{data.get('version')}' != plugin.json version '{plugin_version}'")


FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


def parse_simple_yaml(text: str) -> dict[str, str]:
    # Tiny key:value parser. Avoids the PyYAML dep so CI needs no pip install.
    out: dict[str, str] = {}
    for line in text.splitlines():
        if not line.strip() or line.strip().startswith("#"):
            continue
        if ":" in line:
            k, _, v = line.partition(":")
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def check_skills() -> None:
    skills_dir = ROOT / "skills"
    if not skills_dir.is_dir():
        fail("skills/ directory missing")
        return

    skill_files = sorted(skills_dir.glob("*/SKILL.md"))
    if not skill_files:
        fail("no skills/*/SKILL.md files found")
        return

    for skill in skill_files:
        rel = skill.relative_to(ROOT)
        content = skill.read_text()
        match = FRONTMATTER_RE.match(content)
        if not match:
            fail(f"{rel} has no YAML frontmatter block")
            continue
        fm = parse_simple_yaml(match.group(1))
        if "name" not in fm:
            fail(f"{rel} frontmatter missing 'name' field")
        if "description" not in fm:
            fail(f"{rel} frontmatter missing 'description' field")
        expected_name = skill.parent.name
        if fm.get("name") and fm["name"] != expected_name:
            warn(f"{rel} frontmatter name '{fm['name']}' != directory '{expected_name}'")


def check_hooks() -> None:
    path = ROOT / "hooks" / "hooks.json"
    if not path.exists():
        return
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        fail(f"hooks/hooks.json is not valid JSON: {e}")
        return

    for event_name, event_blocks in data.get("hooks", {}).items():
        for block in event_blocks:
            for hook in block.get("hooks", []):
                cmd = hook.get("command", "")
                if cmd.startswith("sh -c "):
                    continue
                resolved = (
                    cmd.replace("${CODEX_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}", str(ROOT))
                    .replace("${CLAUDE_PLUGIN_ROOT}", str(ROOT))
                    .replace("${CODEX_PLUGIN_ROOT}", str(ROOT))
                    .strip()
                    .strip('"')
                )
                script_path = Path(resolved.split()[0]) if resolved else None
                if script_path and not script_path.exists():
                    fail(f"hooks.json {event_name} references non-existent script: {script_path}")
                elif script_path and not script_path.is_file():
                    fail(f"hooks.json {event_name} script is not a regular file: {script_path}")


RELATIVE_LINK_RE = re.compile(r"\[[^\]]+\]\(([^)#]+?)(?:#[^)]+)?\)")


def check_readme_links() -> None:
    readme = ROOT / "README.md"
    if not readme.exists():
        fail("README.md missing")
        return
    content = readme.read_text()
    for href in RELATIVE_LINK_RE.findall(content):
        if href.startswith(("http://", "https://", "mailto:", "#", "?")):
            continue
        target = (ROOT / href).resolve()
        if not target.exists():
            fail(f"README.md broken link → {href}")


FEATURES_PATH = ROOT / "config" / "features.json"
FEATURES_SCHEMA_PATH = ROOT / "config" / "features.schema.json"
PROVIDER_COUNT_RE = re.compile(r"\b(\d+)\s+providers?\b", re.IGNORECASE)


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


def validate_against_schema(instance: object, schema: dict, path: str, errors: list[str]) -> None:
    # Compact, zero-dependency JSON-Schema subset validator (type / required /
    # properties / items / enum / minItems / pattern). Deliberately no pip dep so
    # CI stays install-free, mirroring parse_simple_yaml above.
    here = path or "<root>"
    declared = schema.get("type")
    if declared is not None:
        types = declared if isinstance(declared, list) else [declared]
        if not any(_type_ok(instance, t) for t in types):
            errors.append(f"{here}: expected type {types}, got {type(instance).__name__}")
            return  # remaining keywords assume the type matched

    enum = schema.get("enum")
    if enum is not None and instance not in enum:
        errors.append(f"{here}: value {instance!r} not in enum {enum}")

    if isinstance(instance, str):
        pattern = schema.get("pattern")
        if pattern is not None and not re.search(pattern, instance):
            errors.append(f"{here}: {instance!r} does not match pattern {pattern!r}")

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
            errors.append(f"{here}: array has {len(instance)} item(s), minimum {min_items}")
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for i, item in enumerate(instance):
                validate_against_schema(item, item_schema, f"{path}[{i}]", errors)


def check_features() -> None:
    if not FEATURES_PATH.exists():
        fail("config/features.json missing")
        return
    try:
        data = json.loads(FEATURES_PATH.read_text())
    except json.JSONDecodeError as e:
        fail(f"config/features.json is not valid JSON: {e}")
        return

    # (a) Validate features.json against its schema when the schema is present.
    if FEATURES_SCHEMA_PATH.exists():
        try:
            schema = json.loads(FEATURES_SCHEMA_PATH.read_text())
        except json.JSONDecodeError as e:
            fail(f"config/features.schema.json is not valid JSON: {e}")
            schema = None
        if isinstance(schema, dict):
            schema_errors: list[str] = []
            validate_against_schema(data, schema, "", schema_errors)
            for err in schema_errors:
                fail(f"features.json schema: {err}")
    else:
        warn("config/features.schema.json not found — schema validation skipped")

    # (b) Set-equality: skills/*/ dirs must exactly match features.json skills[].
    skill_dirs = {p.parent.name for p in (ROOT / "skills").glob("*/SKILL.md")}
    registered: set[str] = set()
    for entry in data.get("skills", []):
        name = entry.get("name")
        command = entry.get("command", "")
        cmd_tail = command.rsplit(":", 1)[-1] if ":" in command else ""
        if name and cmd_tail and name != cmd_tail:
            fail(f"features.json skill name '{name}' != command tail '{cmd_tail}' ({command})")
        chosen = name or cmd_tail
        if chosen:
            registered.add(chosen)

    for missing in sorted(skill_dirs - registered):
        fail(f"skills/{missing}/ exists but is not registered in features.json skills[]")
    for extra in sorted(registered - skill_dirs):
        fail(f"features.json registers skill '{extra}' but skills/{extra}/ does not exist")

    # (c) Every registered skill must be documented in README.md.
    readme = ROOT / "README.md"
    readme_text = readme.read_text() if readme.exists() else ""
    for name in sorted(registered):
        if f"hyperflow:{name}" not in readme_text:
            fail(f"features.json skill '{name}' is not referenced in README.md (expected 'hyperflow:{name}')")

    # (d) Any literal "N provider(s)" claim must match providers[] length.
    provider_count = len(data.get("providers", []))
    for source in (FEATURES_PATH, ROOT / ".claude-plugin" / "plugin.json", ROOT / ".codex-plugin" / "plugin.json"):
        if not source.exists():
            continue
        for match in PROVIDER_COUNT_RE.finditer(source.read_text()):
            claimed = int(match.group(1))
            if claimed != provider_count:
                fail(
                    f"{source.relative_to(ROOT)} claims '{match.group(0)}' "
                    f"but providers[] has {provider_count} entries"
                )


def main() -> int:
    print(f"Validating hyperflow plugin at {ROOT}")
    section("plugin.json", check_plugin_json)
    section("codex plugin.json", check_codex_plugin_json)
    section("marketplace.json", check_marketplace_json)
    section("package.json", check_package_json)
    section("SKILL.md frontmatter", check_skills)
    section("config/features.json", check_features)
    section("hooks.json", check_hooks)
    section("README.md internal links", check_readme_links)

    print()
    if ERRORS:
        print(f"FAILED — {len(ERRORS)} error(s), {len(WARNINGS)} warning(s).")
        return 1
    if WARNINGS:
        print(f"PASSED with {len(WARNINGS)} warning(s).")
    else:
        print("PASSED — all checks clean.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
