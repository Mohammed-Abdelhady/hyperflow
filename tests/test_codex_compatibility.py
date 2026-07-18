"""Unit tests for Codex compatibility policy + App attestation schema (T13)."""

from __future__ import annotations

import json
import re
import stat
import subprocess
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
COMPAT = REPO_ROOT / "config" / "codex-compatibility.json"
ATTEST_SCHEMA = REPO_ROOT / "tests" / "fixtures" / "codex" / "app-attestation.schema.json"
APP_SH = REPO_ROOT / "scripts" / "test-codex-app.sh"
SMOKE = REPO_ROOT / "tests" / "codex" / "app_server_smoke.py"

_TYPE_CHECKS = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    "boolean": lambda v: isinstance(v, bool),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "null": lambda v: v is None,
}


def _load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _check(inst: Any, sch: dict[str, Any], errors: list[str], path: str = "") -> None:
    if "type" in sch:
        expected = sch["type"]
        if isinstance(expected, list):
            if not any(_TYPE_CHECKS.get(t, lambda _v: False)(inst) for t in expected):
                errors.append(f"{path}: type")
                return
        elif expected in _TYPE_CHECKS and not _TYPE_CHECKS[expected](inst):
            errors.append(f"{path}: type {expected}")
            return
    if "const" in sch and inst != sch["const"]:
        errors.append(f"{path}: const")
    if "enum" in sch and inst not in sch["enum"]:
        errors.append(f"{path}: enum")
    if "pattern" in sch and isinstance(inst, str) and not re.fullmatch(sch["pattern"], inst):
        errors.append(f"{path}: pattern")
    if "minLength" in sch and isinstance(inst, str) and len(inst) < sch["minLength"]:
        errors.append(f"{path}: minLength")
    if "minItems" in sch and isinstance(inst, list) and len(inst) < sch["minItems"]:
        errors.append(f"{path}: minItems")

    is_object = sch.get("type") == "object" or (
        isinstance(sch.get("type"), list) and "object" in sch["type"] and isinstance(inst, dict)
    ) or any(k in sch for k in ("properties", "required", "additionalProperties"))
    if is_object and isinstance(inst, dict):
        props = sch.get("properties") or {}
        for req in sch.get("required") or []:
            if req not in inst:
                errors.append(f"{path}: missing {req}")
        if sch.get("additionalProperties") is False:
            for key in inst:
                if key not in props:
                    errors.append(f"{path}: extra {key}")
        for key, value in inst.items():
            if key in props:
                _check(value, props[key], errors, f"{path}.{key}" if path else key)

    if (sch.get("type") == "array" or "items" in sch) and isinstance(inst, list):
        item = sch.get("items")
        if isinstance(item, dict):
            for i, el in enumerate(inst):
                _check(el, item, errors, f"{path}[{i}]")


def _sample_attestation(*, with_provenance: bool = True, expired: bool = False) -> dict[str, Any]:
    commit = "a" * 40
    now = datetime.now(timezone.utc)
    if expired:
        created = now - timedelta(days=40)
        expires = now - timedelta(days=1)
    else:
        created = now
        expires = now + timedelta(days=30)
    att: dict[str, Any] = {
        "schemaVersion": 1,
        "kind": "codex-desktop-app-attestation",
        "certificateId": "cert-unit-0001",
        "issuer": "github-actions:codex-app-conformance",
        "reviewer": "devops-reviewer",
        "commit": commit,
        "tag": None,
        "createdAt": created.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "expiresAt": expires.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "evidenceDigestSha256": "b" * 64,
        "immutableCiRef": "https://github.com/Mohammed-Abdelhady/hyperflow/actions/runs/99",
        "platform": {"os": "macos", "arch": "aarch64"},
        "appBuild": {
            "product": "codex-desktop",
            "version": "0.0.0-fixture",
            "buildId": "build-1",
            "channel": "dev",
        },
        "pluginVersion": "5.14.0",
        "redaction": {"status": "redacted", "rules": ["paths", "tokens"]},
        "checks": [{"id": "install", "result": "pass"}],
    }
    if with_provenance:
        att["provenance"] = {
            "kind": "github-actions",
            "repository": "Mohammed-Abdelhady/hyperflow",
            "runId": "99",
            "workflow": "codex-app-conformance.yml",
            "workflowRef": f"Mohammed-Abdelhady/hyperflow/.github/workflows/codex-app-conformance.yml@{commit}",
            "job": "app-attestation",
            "sha": commit,
            "artifactName": "codex-app-attestation",
            "artifactDigestSha256": "c" * 64,
        }
    return att


class CompatibilityLoadingTests(unittest.TestCase):
    def test_file_exists_and_loads(self) -> None:
        self.assertTrue(COMPAT.is_file())
        data = _load(COMPAT)
        self.assertEqual(data.get("kind"), "codex-compatibility-policy")
        self.assertEqual(data.get("schemaVersion"), 1)

    def test_cli_lanes_present(self) -> None:
        data = _load(COMPAT)
        lanes = data["cli"]["lanes"]
        for name in ("minimum", "currentStable", "latestStable"):
            self.assertIn(name, lanes)
            self.assertIn("osArch", lanes[name])
            self.assertIn("status", lanes[name])
            self.assertIn("certificateIds", lanes[name])

    def test_windows_wsl_unsupported(self) -> None:
        data = _load(COMPAT)
        unsupported = data["platformPolicy"]["unsupportedUntilCertified"]
        oss = {(r["os"], r["arch"]) for r in unsupported}
        self.assertIn(("windows", "x86_64"), oss)
        self.assertIn(("wsl", "x86_64"), oss)
        self.assertTrue(data["policy"]["windowsAndWslUnsupportedUntilCertified"])

    def test_app_rows_separate_from_cli(self) -> None:
        data = _load(COMPAT)
        self.assertTrue(data["policy"]["neverInferAppFromCli"])
        self.assertTrue(data["policy"]["neverInferAppFromAppServer"])
        self.assertTrue(data["appServer"]["independentOfCli"])
        self.assertTrue(data["desktopApp"]["independentOfCli"])
        self.assertTrue(data["desktopApp"]["independentOfAppServer"])
        # Initial state: no App certification without certificates
        self.assertEqual(data["desktopApp"]["status"], "uncertified")
        self.assertEqual(data["desktopApp"]["builds"], [])
        # CLI lanes uncertified without certificate IDs
        for lane in data["cli"]["lanes"].values():
            if lane.get("status") == "certified":
                self.assertTrue(lane.get("certificateIds"))

    def test_research_context_not_certified(self) -> None:
        data = _load(COMPAT)
        ctx = data["researchContext"]
        self.assertEqual(ctx["observedCliVersion"], "0.141.0")
        self.assertEqual(ctx["certificationStatus"], "not-certified")
        floor = data["cli"]["lanes"]["minimum"]["evidenceDerivedFloor"]
        self.assertFalse(floor["certified"])

    def test_cli_success_does_not_imply_app(self) -> None:
        """Simulated CLI certificate presence must not flip desktop App status."""
        data = _load(COMPAT)
        # Even if we imagine CLI certified, file must not auto-set App
        data["cli"]["lanes"]["currentStable"]["status"] = "certified"
        data["cli"]["lanes"]["currentStable"]["certificateIds"] = ["cli-cert-1"]
        # Policy still requires independent App attestation
        self.assertNotEqual(data["desktopApp"]["status"], "certified")
        self.assertEqual(data["desktopApp"]["builds"], [])


class AttestationSchemaTests(unittest.TestCase):
    def test_schema_exists(self) -> None:
        self.assertTrue(ATTEST_SCHEMA.is_file())
        schema = _load(ATTEST_SCHEMA)
        self.assertEqual(schema.get("title"), "Hyperflow Codex desktop App attestation")
        required = set(schema["required"])
        for key in (
            "issuer",
            "reviewer",
            "commit",
            "tag",
            "createdAt",
            "expiresAt",
            "evidenceDigestSha256",
            "immutableCiRef",
            "platform",
            "appBuild",
            "pluginVersion",
            "redaction",
            "provenance",
        ):
            self.assertIn(key, required)

    def test_valid_sample_matches_schema(self) -> None:
        schema = _load(ATTEST_SCHEMA)
        errors: list[str] = []
        _check(_sample_attestation(with_provenance=True), schema, errors)
        self.assertEqual(errors, [], msg=errors)

    def test_missing_provenance_fails_schema(self) -> None:
        schema = _load(ATTEST_SCHEMA)
        errors: list[str] = []
        _check(_sample_attestation(with_provenance=False), schema, errors)
        self.assertTrue(any("provenance" in e for e in errors), msg=errors)

    def test_hand_written_without_provenance_rejected_by_script(self) -> None:
        self.assertTrue(APP_SH.is_file())
        mode = APP_SH.stat().st_mode
        self.assertTrue(mode & (stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH))
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "hand.json"
            path.write_text(
                json.dumps(_sample_attestation(with_provenance=False), indent=2) + "\n",
                encoding="utf-8",
            )
            proc = subprocess.run(
                [str(APP_SH), "--attestation", str(path)],
                capture_output=True,
                text=True,
                check=False,
                cwd=str(REPO_ROOT),
            )
            self.assertNotEqual(proc.returncode, 0, msg=proc.stdout + proc.stderr)
            combined = proc.stdout + proc.stderr
            self.assertRegex(combined, r"FAIL|VERIFY_FAIL|provenance|missing", msg=combined)

    def test_script_self_test(self) -> None:
        proc = subprocess.run(
            [str(APP_SH), "--self-test"],
            capture_output=True,
            text=True,
            check=False,
            cwd=str(REPO_ROOT),
        )
        self.assertEqual(proc.returncode, 0, msg=proc.stdout + proc.stderr)
        self.assertIn("hand-written without provenance rejected", proc.stdout)


class AppServerSmokeOfflineTests(unittest.TestCase):
    def test_smoke_script_exists(self) -> None:
        self.assertTrue(SMOKE.is_file())

    def test_offline_static_passes(self) -> None:
        proc = subprocess.run(
            [str(SMOKE), "--offline-static"],
            capture_output=True,
            text=True,
            check=False,
            cwd=str(REPO_ROOT),
            timeout=120,
        )
        self.assertEqual(proc.returncode, 0, msg=proc.stdout + proc.stderr)
        self.assertIn("mode=offline-static", proc.stdout)
        self.assertIn("PASS: compatibility policy independence", proc.stdout)


if __name__ == "__main__":
    unittest.main()
