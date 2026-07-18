"""Schema tests for the config cleanup block (stdlib only).

Mirrors the zero-dep subset validators used elsewhere (artefact_lib /
test_codex_compatibility) with the keyword set config/schema.json actually
uses: type, properties, required, additionalProperties, enum, minimum,
maximum, items, $ref.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = REPO_ROOT / "config" / "schema.json"

_TYPE_CHECKS = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    "boolean": lambda v: isinstance(v, bool),
    # bool is a subclass of int — exclude it from integer/number.
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "null": lambda v: v is None,
}

CLEANUP_KEYS = (
    "auto",
    "staleDays",
    "pruneDays",
    "reapOnComplete",
    "usageRetentionDays",
    "logMaxLines",
    "dryRun",
)

FULL_CLEANUP = {
    "auto": True,
    "staleDays": 7,
    "pruneDays": 30,
    "reapOnComplete": True,
    "usageRetentionDays": 30,
    "logMaxLines": 2000,
    "dryRun": False,
}


def _load_schema() -> dict[str, Any]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def _resolve(ref: str, root: dict[str, Any]) -> dict[str, Any]:
    if not ref.startswith("#/"):
        raise ValueError(f"unsupported $ref: {ref}")
    node: Any = root
    for part in ref[2:].split("/"):
        node = node[part]
    if not isinstance(node, dict):
        raise ValueError(f"$ref {ref} did not resolve to an object")
    return node


def _check(
    inst: Any,
    sch: dict[str, Any],
    root: dict[str, Any],
    path: str,
    errors: list[str],
) -> None:
    # Sibling keywords next to $ref are kept (config/schema.json uses
    # $ref-with-siblings on phaseCaps profiles).
    if "$ref" in sch:
        resolved = _resolve(sch["$ref"], root)
        merged = {**resolved, **{k: v for k, v in sch.items() if k != "$ref"}}
        sch = merged

    loc = path or "<root>"

    if "const" in sch and inst != sch["const"]:
        errors.append(f"{loc}: expected const {sch['const']!r}, got {inst!r}")
    if "enum" in sch and inst not in sch["enum"]:
        errors.append(f"{loc}: {inst!r} is not one of {sch['enum']}")

    expected = sch.get("type")
    if expected is not None:
        types = expected if isinstance(expected, list) else [expected]
        if not any(_TYPE_CHECKS.get(t, lambda _v: False)(inst) for t in types):
            errors.append(f"{loc}: expected {types}, got {type(inst).__name__}")
            return

    if isinstance(inst, (int, float)) and not isinstance(inst, bool):
        if "minimum" in sch and inst < sch["minimum"]:
            errors.append(f"{loc}: {inst} < minimum {sch['minimum']}")
        if "maximum" in sch and inst > sch["maximum"]:
            errors.append(f"{loc}: {inst} > maximum {sch['maximum']}")

    is_object = expected == "object" or (
        expected is None
        and any(k in sch for k in ("properties", "required", "additionalProperties"))
    )
    is_array = expected == "array" or (expected is None and "items" in sch)

    if is_object and isinstance(inst, dict):
        props = sch.get("properties") or {}
        for req in sch.get("required") or []:
            if req not in inst:
                errors.append(f"{loc}: missing required property '{req}'")
        if sch.get("additionalProperties") is False:
            for key in inst:
                if key not in props:
                    errors.append(f"{loc}: unexpected property '{key}'")
        for key, value in inst.items():
            if key in props:
                child = f"{loc}.{key}" if path else key
                _check(value, props[key], root, child, errors)

    if is_array and isinstance(inst, list):
        item_schema = sch.get("items")
        if isinstance(item_schema, dict):
            for i, element in enumerate(inst):
                _check(element, item_schema, root, f"{loc}[{i}]", errors)


def validate(instance: Any, schema: dict[str, Any] | None = None) -> list[str]:
    sch = schema if schema is not None else _load_schema()
    errors: list[str] = []
    _check(instance, sch, sch, "", errors)
    return errors


class CleanupSchemaStructureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = _load_schema()
        self.cleanup = self.schema["properties"]["cleanup"]
        self.props = self.cleanup["properties"]

    def test_cleanup_block_mirrors_memory_shape(self) -> None:
        self.assertEqual(self.cleanup["type"], "object")
        self.assertIs(self.cleanup.get("additionalProperties"), False)
        self.assertIs(self.schema.get("additionalProperties"), False)
        memory = self.schema["properties"]["memory"]
        self.assertEqual(memory.get("additionalProperties"), False)

    def test_cleanup_property_defaults_and_bounds(self) -> None:
        expected = {
            "auto": ("boolean", True, None),
            "staleDays": ("integer", 7, 1),
            "pruneDays": ("integer", 30, 1),
            "reapOnComplete": ("boolean", True, None),
            "usageRetentionDays": ("integer", 30, 1),
            "logMaxLines": ("integer", 2000, 100),
            "dryRun": ("boolean", False, None),
        }
        self.assertEqual(tuple(self.props), CLEANUP_KEYS)
        for key, (typ, default, minimum) in expected.items():
            with self.subTest(key=key):
                node = self.props[key]
                self.assertEqual(node["type"], typ)
                self.assertEqual(node["default"], default)
                if minimum is None:
                    self.assertNotIn("minimum", node)
                else:
                    self.assertEqual(node["minimum"], minimum)


class CleanupValidationTests(unittest.TestCase):
    def test_full_cleanup_block_validates(self) -> None:
        errors = validate({"cleanup": FULL_CLEANUP})
        self.assertEqual(errors, [], msg=f"schema errors: {errors}")

    def test_unknown_cleanup_key_rejected(self) -> None:
        errors = validate({"cleanup": {"reapOnComplete": True, "bogus": 1}})
        self.assertTrue(errors, msg="expected rejection for additionalProperties")
        self.assertTrue(
            any("bogus" in e for e in errors),
            msg=f"expected 'bogus' in errors, got {errors}",
        )

    def test_log_max_lines_below_minimum_rejected(self) -> None:
        errors = validate({"cleanup": {"logMaxLines": 10}})
        self.assertTrue(errors, msg="expected rejection for logMaxLines minimum")
        self.assertTrue(
            any("logMaxLines" in e and "minimum" in e for e in errors),
            msg=f"expected minimum error for logMaxLines, got {errors}",
        )

    def test_empty_config_valid(self) -> None:
        errors = validate({})
        self.assertEqual(errors, [], msg=f"schema errors: {errors}")

    def test_partial_cleanup_valid(self) -> None:
        errors = validate({"cleanup": {}})
        self.assertEqual(errors, [], msg=f"schema errors: {errors}")
        errors = validate({"cleanup": {"auto": False, "staleDays": 1}})
        self.assertEqual(errors, [], msg=f"schema errors: {errors}")

    def test_existing_top_level_blocks_still_validate(self) -> None:
        sample = {
            "memory": {"compactionThreshold": 300},
            "context": {
                "windowTokens": 200000,
                "autoCompactMinPercent": 72,
                "autoCompactReadyTtlMinutes": 30,
            },
            "viewer": {
                "enabled": True,
                "port": 7777,
                "markdown": "on-demand",
                "autoOpen": False,
            },
            "handoff": {
                "autoPush": True,
                "remote": "origin",
                "packageDir": ".hyperflow-handoff",
            },
            "cleanup": FULL_CLEANUP,
        }
        errors = validate(sample)
        self.assertEqual(errors, [], msg=f"schema errors: {errors}")

    def test_root_still_rejects_unknown_top_level_keys(self) -> None:
        errors = validate({"notARealBlock": True})
        self.assertTrue(errors)
        self.assertTrue(any("notARealBlock" in e for e in errors))

    def test_stale_days_below_minimum_rejected(self) -> None:
        errors = validate({"cleanup": {"staleDays": 0}})
        self.assertTrue(any("staleDays" in e and "minimum" in e for e in errors))


if __name__ == "__main__":
    unittest.main()
