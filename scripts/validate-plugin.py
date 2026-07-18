#!/usr/bin/env python3
"""Validate manifests, skill frontmatter, hooks, and README links. Used by CI."""

from __future__ import annotations

import importlib.util
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
CODEX_SCHEMA_PATH = ROOT / "config" / "codex-plugin.schema.json"
CODEX_PLUGIN_PATH = ROOT / ".codex-plugin" / "plugin.json"
RETIRED_SKILL_TARGETS = frozenset({"spec", "scope"})
# Codex public-router aliases that session-start and portable SKILL.md must keep
# discoverable. Extended when new public skills are wired into the Codex table.
REQUIRED_CODEX_ALIAS_TARGETS = frozenset(
    {
        "plan",
        "dispatch",
        "workflow",
        "trace",
        "audit",
        "deploy",
        "cache",
        "status",
        "sticky",
        "bridge",
        "flush",
        "reap",
        "handoff",
        "background",
        "scaffold",
    }
)
# Canonical chain edges (from → to). Targets and sources must be real skills;
# retired names never appear here.
REQUIRED_CHAIN_TRANSITIONS = (
    ("issue", "plan"),
    ("design", "plan"),
    ("plan", "dispatch"),
    ("dispatch", "audit"),
    ("dispatch", "deploy"),
    ("audit", "plan"),
    ("pr", "audit"),
)
# Manifest string fields that, when present, must be plugin-relative paths.
CODEX_PATH_FIELDS = ("skills", "hooks", "apps", "mcpServers")
CODEX_INTERFACE_PATH_FIELDS = ("composerIcon", "logo", "logoDark")


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


def plugin_path_errors(root: Path, rel: str, field: str) -> list[str]:
    """Return errors if rel is not a contained, existing path under root."""
    errors: list[str] = []
    if not isinstance(rel, str):
        errors.append(f"{field}: path must be a string, got {type(rel).__name__}")
        return errors
    if not rel.startswith("./"):
        errors.append(f"{field}: path must start with './' (got {rel!r})")
        return errors
    parts = Path(rel).parts
    if ".." in parts:
        errors.append(f"{field}: path escapes plugin root: {rel}")
        return errors
    # Absolute / rooted escapes (./ then absolute via resolve tricks).
    candidate = (root / rel).resolve()
    root_resolved = root.resolve()
    try:
        candidate.relative_to(root_resolved)
    except ValueError:
        errors.append(f"{field}: path escapes plugin root: {rel}")
        return errors
    if not candidate.exists():
        errors.append(f"{field}: path does not exist: {rel}")
        return errors
    return errors


def collect_version_sources(root: Path) -> dict[str, str | None]:
    """Map of version-bearing surfaces → version string or None if missing/unreadable."""
    out: dict[str, str | None] = {}

    def _read_json_version(path: Path, key: str = "version") -> str | None:
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        val = data.get(key)
        return val if isinstance(val, str) else None

    out["package.json"] = _read_json_version(root / "package.json")
    out[".claude-plugin/plugin.json"] = _read_json_version(root / ".claude-plugin" / "plugin.json")
    out[".codex-plugin/plugin.json"] = _read_json_version(root / ".codex-plugin" / "plugin.json")
    out["config/features.json"] = _read_json_version(root / "config" / "features.json")

    version_file = root / "skills" / "hyperflow" / "VERSION"
    if version_file.exists():
        try:
            out["skills/hyperflow/VERSION"] = version_file.read_text(encoding="utf-8").strip()
        except OSError:
            out["skills/hyperflow/VERSION"] = None
    else:
        out["skills/hyperflow/VERSION"] = None

    marketplace = root / ".claude-plugin" / "marketplace.json"
    market_version: str | None = None
    if marketplace.exists():
        try:
            data = json.loads(marketplace.read_text(encoding="utf-8"))
            hits = [p for p in data.get("plugins", []) if isinstance(p, dict) and p.get("name") == "hyperflow"]
            if hits:
                v = hits[0].get("version")
                market_version = v if isinstance(v, str) else None
        except (OSError, json.JSONDecodeError):
            market_version = None
    out["marketplace.json#hyperflow"] = market_version
    return out


def version_parity_errors(root: Path) -> list[str]:
    sources = collect_version_sources(root)
    present = {k: v for k, v in sources.items() if v}
    if not present:
        return ["version parity: no version sources readable"]
    errors: list[str] = []
    for label, val in sources.items():
        if val is None:
            errors.append(f"version parity: missing version at {label}")
    versions = set(present.values())
    if len(versions) > 1:
        detail = ", ".join(f"{k}={v!r}" for k, v in sorted(present.items()))
        errors.append(f"version parity: drift across surfaces — {detail}")
    return errors


def check_codex_manifest(root: Path) -> list[str]:
    """Schema, path containment, hooks field, and name checks for the Codex manifest."""
    errors: list[str] = []
    path = root / ".codex-plugin" / "plugin.json"
    if not path.exists():
        return ["missing .codex-plugin/plugin.json"]
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return [f".codex-plugin/plugin.json is not valid JSON: {e}"]

    schema_path = root / "config" / "codex-plugin.schema.json"
    if not schema_path.exists():
        errors.append("config/codex-plugin.schema.json missing")
    else:
        try:
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            errors.append(f"config/codex-plugin.schema.json is not valid JSON: {e}")
            schema = None
        if isinstance(schema, dict):
            comment = schema.get("$comment", "")
            if isinstance(comment, str) and "official" in comment.lower() and "NOT" not in comment and "not" not in comment.lower():
                # Soft guard: derived schemas must not claim to be official.
                if re.search(r"\bofficial\b", comment, re.I) and not re.search(
                    r"\b(NOT|not)\b.*\bofficial\b|\bofficial\b.*\b(NOT|not)\b|never label.*official|not an official",
                    comment,
                    re.I,
                ):
                    errors.append(
                        "config/codex-plugin.schema.json $comment appears to claim official status "
                        "without a clear NOT-official disclaimer"
                    )
            schema_errors: list[str] = []
            validate_against_schema(data, schema, "", schema_errors)
            for err in schema_errors:
                errors.append(f"codex plugin.json schema: {err}")

    for field in PLUGIN_JSON_REQUIRED:
        if field not in data:
            errors.append(f".codex-plugin/plugin.json missing required field: {field}")
    if data.get("name") != "hyperflow":
        errors.append(
            f".codex-plugin/plugin.json name is '{data.get('name')}', expected 'hyperflow'"
        )
    version = data.get("version", "")
    if not re.fullmatch(r"\d+\.\d+\.\d+", str(version)):
        errors.append(
            f".codex-plugin/plugin.json version '{version}' is not strict semver MAJOR.MINOR.PATCH"
        )

    # Certified lanes require an explicit hooks registration path.
    hooks_rel = data.get("hooks")
    if hooks_rel is None:
        errors.append(
            '.codex-plugin/plugin.json missing required field: hooks (expected "./hooks/hooks.json")'
        )
    elif hooks_rel != "./hooks/hooks.json":
        errors.append(
            f'.codex-plugin/plugin.json hooks is {hooks_rel!r}, expected "./hooks/hooks.json"'
        )

    for field in CODEX_PATH_FIELDS:
        if field in data and isinstance(data[field], str):
            errors.extend(plugin_path_errors(root, data[field], f".codex-plugin/plugin.json {field}"))

    interface = data.get("interface")
    if isinstance(interface, dict):
        for field in CODEX_INTERFACE_PATH_FIELDS:
            val = interface.get(field)
            if isinstance(val, str) and val.startswith("./"):
                errors.extend(
                    plugin_path_errors(root, val, f".codex-plugin/plugin.json interface.{field}")
                )
        shots = interface.get("screenshots")
        if isinstance(shots, list):
            for i, shot in enumerate(shots):
                if isinstance(shot, str) and shot.startswith("./"):
                    errors.extend(
                        plugin_path_errors(
                            root, shot, f".codex-plugin/plugin.json interface.screenshots[{i}]"
                        )
                    )

    errors.extend(version_parity_errors(root))
    return errors


def check_codex_plugin_json() -> None:
    for err in check_codex_manifest(ROOT):
        fail(err)


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


HOOK_NAME_RE = re.compile(r"\bhook=([A-Za-z0-9_-]+)")
HOOKS_PATH_RE = re.compile(r"hooks/([A-Za-z0-9_-]+)")
SH_C_RE = re.compile(r"""(?:^|\s)sh\s+-c\s+(?:'([^']*)'|"([^"]*)")""", re.DOTALL)


def extract_hook_script_refs(command: str) -> set[str]:
    """Extract hook script basenames referenced by a hooks.json command.

    Handles both direct paths and ``sh -c 'hook=session-start; … hooks/$hook'``
    wrappers used for multi-root discovery.
    """
    names: set[str] = set()
    if not command:
        return names

    for match in HOOK_NAME_RE.finditer(command):
        names.add(match.group(1))
    for match in HOOKS_PATH_RE.finditer(command):
        names.add(match.group(1))

    # Peel sh -c payloads and re-scan (idempotent with the whole-command scan).
    for match in SH_C_RE.finditer(command):
        payload = match.group(1) or match.group(2) or ""
        for inner in HOOK_NAME_RE.finditer(payload):
            names.add(inner.group(1))
        for inner in HOOKS_PATH_RE.finditer(payload):
            names.add(inner.group(1))
    return names


def check_hooks_at(root: Path) -> list[str]:
    """Validate hooks registration, required scripts, and command path refs."""
    errors: list[str] = []

    # Manifest-declared hooks path (Codex certified lanes).
    codex_path = root / ".codex-plugin" / "plugin.json"
    if codex_path.exists():
        try:
            manifest = json.loads(codex_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            manifest = {}
        hooks_rel = manifest.get("hooks")
        if isinstance(hooks_rel, str):
            errors.extend(plugin_path_errors(root, hooks_rel, "codex hooks"))
            if hooks_rel == "./hooks/hooks.json":
                # also ensure the json is parseable below
                pass

    required_scripts = ("session-start", "pre-compact")
    for name in required_scripts:
        script = root / "hooks" / name
        if not script.exists():
            errors.append(f"hooks/{name} missing (required hook script)")
        elif not script.is_file():
            errors.append(f"hooks/{name} is not a regular file")

    path = root / "hooks" / "hooks.json"
    if not path.exists():
        errors.append("hooks/hooks.json missing")
        return errors
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        errors.append(f"hooks/hooks.json is not valid JSON: {e}")
        return errors

    for event_name, event_blocks in data.get("hooks", {}).items():
        if not isinstance(event_blocks, list):
            continue
        for block in event_blocks:
            if not isinstance(block, dict):
                continue
            for hook in block.get("hooks", []):
                if not isinstance(hook, dict):
                    continue
                cmd = hook.get("command", "")
                if not isinstance(cmd, str):
                    continue

                # Always extract refs from sh -c wrappers — never skip them.
                for name in extract_hook_script_refs(cmd):
                    script = root / "hooks" / name
                    if not script.exists():
                        errors.append(
                            f"hooks.json {event_name} references non-existent hook script: hooks/{name}"
                        )
                    elif not script.is_file():
                        errors.append(
                            f"hooks.json {event_name} hook script is not a regular file: hooks/{name}"
                        )

                if cmd.startswith("sh -c "):
                    continue  # path extraction above is the check for wrappers

                resolved = (
                    cmd.replace("${CODEX_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}", str(root))
                    .replace("${CLAUDE_PLUGIN_ROOT}", str(root))
                    .replace("${CODEX_PLUGIN_ROOT}", str(root))
                    .strip()
                    .strip('"')
                )
                if not resolved:
                    continue
                script_path = Path(resolved.split()[0])
                if not script_path.is_absolute():
                    script_path = (root / script_path).resolve()
                if not script_path.exists():
                    errors.append(
                        f"hooks.json {event_name} references non-existent script: {script_path}"
                    )
                elif not script_path.is_file():
                    errors.append(
                        f"hooks.json {event_name} script is not a regular file: {script_path}"
                    )
    return errors


def check_hooks() -> None:
    for err in check_hooks_at(ROOT):
        fail(err)


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


# Keywords this validator actually enforces, plus annotation keywords that carry no
# constraint. Anything else in the schema would be silently ignored — a check that
# passes while the constraint it names goes unenforced — so it is rejected instead.
SCHEMA_KEYWORDS_ENFORCED = frozenset(
    {"type", "required", "properties", "items", "enum", "minItems", "pattern"}
)
SCHEMA_KEYWORDS_ANNOTATION = frozenset(
    {"$schema", "$id", "$comment", "title", "description", "examples", "default"}
)


def validate_against_schema(instance: object, schema: dict, path: str, errors: list[str]) -> None:
    # Compact, zero-dependency JSON-Schema subset validator (type / required /
    # properties / items / enum / minItems / pattern). Deliberately no pip dep so
    # CI stays install-free, mirroring parse_simple_yaml above.
    here = path or "<root>"

    unsupported = sorted(
        set(schema) - SCHEMA_KEYWORDS_ENFORCED - SCHEMA_KEYWORDS_ANNOTATION
    )
    if unsupported:
        errors.append(
            f"{here}: schema uses keyword(s) {unsupported} that this validator does not "
            "enforce — add support in validate_against_schema or drop them, never leave "
            "them silently unchecked"
        )

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
        # fullmatch, not search: Python's `$` also matches before a trailing newline,
        # so an anchored pattern would accept "1.2.3\n".
        if pattern is not None and not re.fullmatch(pattern, instance):
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


def check_portable_doctrine() -> None:
    # templates/claude-md-doctrine.md is generated from skills/hyperflow/DOCTRINE.md
    # by scripts/generate-portable-doctrine.py. Import that generator by path (the
    # scripts/ dir is not a package, mirroring how tests load auto-bridge.py) and
    # run its --check equivalent so a hand-edit that drifts the template from the
    # canonical doctrine fails CI with an actionable remediation message.
    gen_path = ROOT / "scripts" / "generate-portable-doctrine.py"
    if not gen_path.exists():
        fail("scripts/generate-portable-doctrine.py missing")
        return
    try:
        spec = importlib.util.spec_from_file_location("generate_portable_doctrine", gen_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    except (OSError, SyntaxError) as e:
        fail(f"could not load generate-portable-doctrine.py: {e}")
        return
    for err in module.check(ROOT):
        fail(err)
DOCS_PAGES = ["index.html", "installation.html", "orchestration.html", "404.html"]
FOOTER_VERSION_RE = re.compile(r'footer-version">v([0-9.]+)<')
LOCAL_REF_RE = re.compile(r'(?:href|src|poster)="([^"]+)"')
NUM_WORDS = {
    15: "Fifteen", 16: "Sixteen", 17: "Seventeen", 18: "Eighteen", 19: "Nineteen",
    20: "Twenty", 21: "Twenty-one", 22: "Twenty-two", 23: "Twenty-three", 24: "Twenty-four",
}


def check_docs_site() -> None:
    plugin_version = json.loads((ROOT / ".claude-plugin" / "plugin.json").read_text())["version"]
    docs = ROOT / "docs"
    for page in DOCS_PAGES:
        path = docs / page
        if not path.exists():
            fail(f"docs/{page} missing")
            continue
        content = path.read_text()
        m = FOOTER_VERSION_RE.search(content)
        if not m:
            fail(f"docs/{page} has no footer-version span")
        elif m.group(1) != plugin_version:
            fail(f"docs/{page} footer says v{m.group(1)} but plugin.json is {plugin_version}")
        h1_count = len(re.findall(r"<h1[ >]", content))
        if h1_count != 1:
            fail(f"docs/{page} has {h1_count} h1 elements (want exactly 1)")
        for ref in LOCAL_REF_RE.findall(content):
            if ref.startswith(("http://", "https://", "mailto:", "#", "data:")):
                continue
            target = ref.split("#", 1)[0].split("?", 1)[0]
            if target and not (docs / target).exists():
                fail(f"docs/{page} broken local ref → {ref}")
    sitemap = docs / "sitemap.xml"
    if not sitemap.exists():
        fail("docs/sitemap.xml missing")
    else:
        for lastmod in re.findall(r"<lastmod>([^<]+)</lastmod>", sitemap.read_text()):
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", lastmod):
                fail(f"docs/sitemap.xml invalid lastmod: {lastmod}")


def check_skill_count() -> None:
    actual = len(list((ROOT / "skills").glob("*/SKILL.md")))
    readme = (ROOT / "README.md").read_text()
    word = NUM_WORDS.get(actual)
    if word is None:
        warn(f"skill count {actual} outside NUM_WORDS map — extend it in validate-plugin.py")
    elif f"{word} skills" not in readme:
        fail(f"README.md does not say '{word} skills' (skills/ has {actual} SKILL.md files)")
    for n, stale_word in NUM_WORDS.items():
        if n != actual and f"{stale_word} skills" in readme:
            fail(f"README.md still says '{stale_word} skills' but skills/ has {actual}")
    plugin_desc = json.loads((ROOT / ".claude-plugin" / "plugin.json").read_text())["description"]
    m = re.search(r"(\d+) skills", plugin_desc)
    if m and int(m.group(1)) != actual:
        fail(f"plugin.json description says '{m.group(1)} skills' but skills/ has {actual}")


# ---------------------------------------------------------------------------
# Public router closure (aliases + chain transitions)
# ---------------------------------------------------------------------------

# Backtick skill token, allowing optional trailing annotation: `workflow` (note)
ALIAS_RUN_TOKEN_RE = re.compile(r"`([a-z][a-z0-9-]*)`")
# Explicit chain edge in prose or tables: `scope` → `dispatch` or scope -> dispatch
CHAIN_EDGE_RE = re.compile(
    r"(?:`([a-z][a-z0-9-]*)`|([a-z][a-z0-9-]*))\s*(?:→|->)\s*(?:`([a-z][a-z0-9-]*)`|([a-z][a-z0-9-]*))"
)


def public_skill_names(root: Path) -> set[str]:
    """Skills registered in features.json and/or present as skills/*/SKILL.md."""
    names: set[str] = set()
    skills_dir = root / "skills"
    if skills_dir.is_dir():
        for skill in skills_dir.glob("*/SKILL.md"):
            names.add(skill.parent.name)
    features_path = root / "config" / "features.json"
    if features_path.exists():
        try:
            data = json.loads(features_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            data = {}
        for entry in data.get("skills", []):
            if isinstance(entry, dict) and isinstance(entry.get("name"), str):
                names.add(entry["name"])
    return names


def parse_alias_run_targets(text: str) -> set[str]:
    """Extract skill targets from markdown tables with a Run column.

    Looks for rows shaped like ``| … | `skill` |`` under a header that
    contains a ``Run`` column (portable router + Codex session-start tables).
    Shell-escaped backticks (``\\`plan\\``` inside hooks/session-start) are
    normalized before token extraction.
    """
    # Normalize shell-escaped backticks so session-start payloads parse as MD.
    normalized = text.replace("\\`", "`")
    targets: set[str] = set()
    lines = normalized.splitlines()
    in_run_table = False
    run_col = -1
    for line in lines:
        stripped = line.strip()
        if not stripped.startswith("|"):
            in_run_table = False
            run_col = -1
            continue
        cells = [c.strip() for c in stripped.strip("|").split("|")]
        # Header row detection
        lower_cells = [c.lower() for c in cells]
        if any(c.replace(" ", "") == "run" or c == "run" for c in lower_cells):
            in_run_table = True
            run_col = next(
                (i for i, c in enumerate(lower_cells) if c.replace(" ", "") == "run" or c == "run"),
                -1,
            )
            continue
        if not in_run_table or run_col < 0:
            continue
        # Skip separator rows
        if all(re.fullmatch(r":?-+:?", c or "") for c in cells):
            continue
        if run_col >= len(cells):
            continue
        cell = cells[run_col]
        # First backtick token is the skill target; ignore parenthetical notes.
        match = ALIAS_RUN_TOKEN_RE.search(cell)
        if match:
            targets.add(match.group(1))
    return targets


def parse_chain_edges(text: str) -> set[tuple[str, str]]:
    """Parse ``from → to`` / ``from -> to`` skill edges from documentation text."""
    edges: set[tuple[str, str]] = set()
    for match in CHAIN_EDGE_RE.finditer(text):
        src = match.group(1) or match.group(2)
        dst = match.group(3) or match.group(4)
        if src and dst:
            edges.add((src, dst))
    return edges


def check_router_closure(
    root: Path,
    *,
    required_aliases: frozenset[str] | None = None,
    required_transitions: tuple[tuple[str, str], ...] | None = None,
    retired: frozenset[str] | None = None,
    scan_chain_docs: bool = False,
) -> list[str]:
    """Public skill discovery, alias resolution, and retired-target rejection.

    Parameters allow tests to inject incomplete alias tables / stale edges.
    When ``scan_chain_docs`` is True, also reject retired names found as
    active chain edges in session-start / SKILL.md prose (used by unit tests
    with fixtures; live repo validation keeps this False until T5 rewrites
    historical ``scope → dispatch`` narrative).
    """
    errors: list[str] = []
    expected_aliases = required_aliases if required_aliases is not None else REQUIRED_CODEX_ALIAS_TARGETS
    transitions = (
        required_transitions if required_transitions is not None else REQUIRED_CHAIN_TRANSITIONS
    )
    retired_targets = retired if retired is not None else RETIRED_SKILL_TARGETS

    skills = public_skill_names(root)
    if not skills:
        errors.append("router: no public skills discovered under skills/ or features.json")
        return errors

    for name in sorted(skills):
        skill_md = root / "skills" / name / "SKILL.md"
        if not skill_md.is_file():
            errors.append(f"router: public skill '{name}' has no discoverable skills/{name}/SKILL.md")
        if name in retired_targets:
            errors.append(
                f"router: retired skill name '{name}' is registered as an active skill "
                f"(reintroduce only with a real skills/{name}/ tree and explicit un-retire)"
            )

    # Alias tables: portable SKILL.md + Codex injection. After the session-start
    # thin-launcher refactor, the Codex alias markdown lives in hook-runtime.py;
    # session-start still counts for fixtures / older trees that embed the table.
    # hook-runtime is optional so minimal test fixtures without scripts/ stay valid.
    required_alias_sources: list[tuple[str, Path]] = [
        ("skills/hyperflow/SKILL.md", root / "skills" / "hyperflow" / "SKILL.md"),
        ("hooks/session-start", root / "hooks" / "session-start"),
    ]
    optional_alias_sources: list[tuple[str, Path]] = [
        ("scripts/hook-runtime.py", root / "scripts" / "hook-runtime.py"),
    ]
    sources = required_alias_sources + [
        (label, path) for label, path in optional_alias_sources if path.exists()
    ]
    all_alias_targets: set[str] = set()
    for label, path in sources:
        if not path.exists():
            errors.append(f"router: alias source missing: {label}")
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as e:
            errors.append(f"router: could not read {label}: {e}")
            continue
        targets = parse_alias_run_targets(text)
        all_alias_targets |= targets
        for target in sorted(targets):
            if target in retired_targets:
                errors.append(
                    f"router: alias table in {label} targets retired skill '{target}'"
                )
            elif target not in skills:
                errors.append(
                    f"router: alias table in {label} targets unresolved skill '{target}'"
                )

    missing_aliases = expected_aliases - all_alias_targets
    for name in sorted(missing_aliases):
        errors.append(
            f"router: missing public alias for skill '{name}' "
            f"(required in Codex/portable alias tables)"
        )

    # Required chain transitions must resolve to real, non-retired skills.
    for src, dst in transitions:
        for node, role in ((src, "source"), (dst, "target")):
            if node in retired_targets:
                errors.append(
                    f"router: chain transition {src} → {dst} uses retired {role} '{node}'"
                )
            elif node not in skills:
                errors.append(
                    f"router: chain transition {src} → {dst} {role} '{node}' is not a public skill"
                )

    if scan_chain_docs:
        for label, path in sources:
            if not path.exists():
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except OSError:
                continue
            for src, dst in parse_chain_edges(text):
                if src in retired_targets or dst in retired_targets:
                    errors.append(
                        f"router: stale chain edge {src} → {dst} in {label} "
                        f"(retired target still referenced as active)"
                    )

    return errors


def check_router() -> None:
    for err in check_router_closure(ROOT):
        fail(err)


def main() -> int:
    print(f"Validating hyperflow plugin at {ROOT}")
    section("plugin.json", check_plugin_json)
    section("codex plugin.json", check_codex_plugin_json)
    section("marketplace.json", check_marketplace_json)
    section("package.json", check_package_json)
    section("SKILL.md frontmatter", check_skills)
    section("config/features.json", check_features)
    section("portable doctrine template", check_portable_doctrine)
    section("hooks.json", check_hooks)
    section("public router closure", check_router)
    section("README.md internal links", check_readme_links)
    section("docs site version + refs", check_docs_site)
    section("skill count consistency", check_skill_count)

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
