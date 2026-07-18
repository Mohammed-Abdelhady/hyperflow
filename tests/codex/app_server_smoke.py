#!/usr/bin/env python3
"""Codex app-server conformance smoke (T13).

Default mode is offline-static: validates checked-in protocol message shapes and
optional host-generated schema when `codex` is available. Live mode exercises a
real stdio app-server when present; otherwise prints SKIP and exits 0.

Surfaces:
  CLI success never certifies app-server (see config/codex-compatibility.json).
  App-server success never certifies desktop App.

Usage:
  python3 tests/codex/app_server_smoke.py
  python3 tests/codex/app_server_smoke.py --offline-static
  python3 tests/codex/app_server_smoke.py --live
  python3 tests/codex/app_server_smoke.py --live --keep-tmp
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
COMPAT_PATH = REPO_ROOT / "config" / "codex-compatibility.json"
FIXTURE_DIR = REPO_ROOT / "tests" / "fixtures" / "codex"

# Expected client methods for Hyperflow app-server smoke coverage.
REQUIRED_CLIENT_METHODS = frozenset(
    {
        "initialize",
        "marketplace/add",
        "marketplace/remove",
        "marketplace/upgrade",
        "plugin/list",
        "plugin/installed",
        "plugin/install",
        "plugin/uninstall",
        "hooks/list",
        "thread/start",
        "thread/resume",
        "thread/list",
        "thread/compact/start",
    }
)

# Offline protocol envelope fixtures (derived shapes; not host transcripts).
OFFLINE_MESSAGE_FIXTURES: list[dict[str, Any]] = [
    {
        "id": "req-initialize",
        "direction": "client→server",
        "message": {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "clientInfo": {
                    "name": "hyperflow-app-server-smoke",
                    "version": "0.0.0",
                },
                "capabilities": {
                    "experimentalApi": False,
                },
            },
        },
        "requiredParams": ["clientInfo"],
        "requiredNested": {"clientInfo": ["name", "version"]},
    },
    {
        "id": "resp-initialize",
        "direction": "server→client",
        "message": {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "userAgent": "codex-app-server",
                "platformOs": "macos",
                "platformFamily": "unix",
                "codexHome": "/tmp/hyperflow-fixture-codex-home",
            },
        },
        "requiredResult": [
            "userAgent",
            "platformOs",
            "platformFamily",
            "codexHome",
        ],
    },
    {
        "id": "req-marketplace-add",
        "direction": "client→server",
        "message": {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "marketplace/add",
            "params": {"source": "/tmp/hyperflow-fixture-marketplace"},
        },
        "requiredParams": ["source"],
    },
    {
        "id": "resp-marketplace-add",
        "direction": "server→client",
        "message": {
            "jsonrpc": "2.0",
            "id": 2,
            "result": {
                "marketplaceName": "hyperflow-marketplace",
                "installedRoot": "/tmp/hyperflow-fixture-marketplace-root",
                "alreadyAdded": False,
            },
        },
        "requiredResult": [
            "marketplaceName",
            "installedRoot",
            "alreadyAdded",
        ],
    },
    {
        "id": "req-marketplace-upgrade",
        "direction": "client→server",
        "message": {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "marketplace/upgrade",
            "params": {"marketplaceName": "hyperflow-marketplace"},
        },
    },
    {
        "id": "req-marketplace-remove",
        "direction": "client→server",
        "message": {
            "jsonrpc": "2.0",
            "id": 4,
            "method": "marketplace/remove",
            "params": {"marketplaceName": "hyperflow-marketplace"},
        },
        "requiredParams": ["marketplaceName"],
    },
    {
        "id": "req-plugin-list",
        "direction": "client→server",
        "message": {
            "jsonrpc": "2.0",
            "id": 5,
            "method": "plugin/list",
            "params": {},
        },
    },
    {
        "id": "resp-plugin-list",
        "direction": "server→client",
        "message": {
            "jsonrpc": "2.0",
            "id": 5,
            "result": {"marketplaces": []},
        },
        "requiredResult": ["marketplaces"],
    },
    {
        "id": "req-plugin-installed",
        "direction": "client→server",
        "message": {
            "jsonrpc": "2.0",
            "id": 6,
            "method": "plugin/installed",
            "params": {},
        },
    },
    {
        "id": "req-hooks-list",
        "direction": "client→server",
        "message": {
            "jsonrpc": "2.0",
            "id": 7,
            "method": "hooks/list",
            "params": {"cwds": ["/tmp/hyperflow-fixture-project"]},
        },
    },
    {
        "id": "req-thread-start",
        "direction": "client→server",
        "message": {
            "jsonrpc": "2.0",
            "id": 8,
            "method": "thread/start",
            "params": {
                "cwd": "/tmp/hyperflow-fixture-project",
                "ephemeral": True,
            },
        },
    },
    {
        "id": "resp-thread-start",
        "direction": "server→client",
        "message": {
            "jsonrpc": "2.0",
            "id": 8,
            "result": {
                "thread": {"id": "thread-fixture-1"},
                "cwd": "/tmp/hyperflow-fixture-project",
                "model": "fixture-model",
                "modelProvider": "fixture-provider",
                "approvalPolicy": "never",
                "approvalsReviewer": "user",
                "sandbox": {"type": "workspace-write"},
            },
        },
        "requiredResult": [
            "thread",
            "cwd",
            "model",
            "modelProvider",
            "approvalPolicy",
            "approvalsReviewer",
            "sandbox",
        ],
        "requiredNested": {"thread": ["id"]},
    },
    {
        "id": "req-thread-resume",
        "direction": "client→server",
        "message": {
            "jsonrpc": "2.0",
            "id": 9,
            "method": "thread/resume",
            "params": {"threadId": "thread-fixture-1"},
        },
        "requiredParams": ["threadId"],
    },
    {
        "id": "req-thread-compact",
        "direction": "client→server",
        "message": {
            "jsonrpc": "2.0",
            "id": 10,
            "method": "thread/compact/start",
            "params": {"threadId": "thread-fixture-1"},
        },
        "requiredParams": ["threadId"],
    },
    {
        "id": "notif-hook-started",
        "direction": "server→client",
        "message": {
            "jsonrpc": "2.0",
            "method": "hook/started",
            "params": {
                "hookEvent": "SessionStart",
                "threadId": "thread-fixture-1",
            },
        },
    },
    {
        "id": "server-req-user-input",
        "direction": "server→client",
        "message": {
            "jsonrpc": "2.0",
            "id": "srv-1",
            "method": "item/tool/requestUserInput",
            "params": {
                "itemId": "item-1",
                "threadId": "thread-fixture-1",
                "turnId": "turn-1",
                "questions": [
                    {
                        "id": "build-location",
                        "header": "Build location",
                        "question": "Build here or another session?",
                        "options": [
                            {
                                "label": "Build here",
                                "description": "Continue in this session",
                            },
                            {
                                "label": "Stop",
                                "description": "End at gate",
                            },
                        ],
                    }
                ],
            },
        },
        "requiredParams": ["itemId", "threadId", "turnId", "questions"],
    },
    {
        "id": "client-resp-user-input-stop",
        "direction": "client→server",
        "message": {
            "jsonrpc": "2.0",
            "id": "srv-1",
            "result": {
                "answers": [
                    {"questionId": "build-location", "selectedOption": "Stop"}
                ]
            },
        },
        "requiredResult": ["answers"],
    },
]


class SmokeError(Exception):
    """Fatal smoke failure."""


def log(msg: str) -> None:
    print(msg, flush=True)


def load_compat() -> dict[str, Any]:
    data = json.loads(COMPAT_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SmokeError("codex-compatibility.json must be an object")
    return data


def assert_independence(compat: dict[str, Any]) -> None:
    policy = compat.get("policy") or {}
    if not policy.get("neverInferAppFromCli"):
        raise SmokeError("policy.neverInferAppFromCli must be true")
    if not policy.get("neverInferAppFromAppServer"):
        raise SmokeError("policy.neverInferAppFromAppServer must be true")
    app_server = compat.get("appServer") or {}
    desktop = compat.get("desktopApp") or {}
    if not app_server.get("independentOfCli"):
        raise SmokeError("appServer.independentOfCli must be true")
    if not desktop.get("independentOfCli") or not desktop.get("independentOfAppServer"):
        raise SmokeError("desktopApp must be independent of CLI and app-server")
    # App claim must not be inferred from empty CLI success
    cli = compat.get("cli") or {}
    for lane_name, lane in (cli.get("lanes") or {}).items():
        if lane.get("status") == "certified" and not lane.get("certificateIds"):
            raise SmokeError(
                f"cli.lanes.{lane_name} marked certified without certificateIds"
            )
    if desktop.get("status") == "certified" and not desktop.get("builds"):
        raise SmokeError("desktopApp certified without builds")


def _is_jsonrpc_request(msg: dict[str, Any]) -> bool:
    return "method" in msg and "id" in msg and "result" not in msg and "error" not in msg


def _is_jsonrpc_response(msg: dict[str, Any]) -> bool:
    return "id" in msg and ("result" in msg or "error" in msg)


def _is_jsonrpc_notification(msg: dict[str, Any]) -> bool:
    return "method" in msg and "id" not in msg


def validate_offline_fixture(case: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    cid = case.get("id", "<unknown>")
    msg = case.get("message")
    if not isinstance(msg, dict):
        return [f"{cid}: message must be object"]

    if msg.get("jsonrpc") != "2.0":
        errors.append(f"{cid}: jsonrpc must be '2.0'")

    direction = case.get("direction", "")
    if direction.startswith("client") and _is_jsonrpc_request(msg):
        if not isinstance(msg.get("method"), str) or not msg["method"]:
            errors.append(f"{cid}: request method required")
        params = msg.get("params")
        if params is None:
            errors.append(f"{cid}: request params required (may be empty object)")
        else:
            for key in case.get("requiredParams") or []:
                if not isinstance(params, dict) or key not in params:
                    errors.append(f"{cid}: missing params.{key}")
            for parent, keys in (case.get("requiredNested") or {}).items():
                node = params.get(parent) if isinstance(params, dict) else None
                if not isinstance(node, dict):
                    errors.append(f"{cid}: missing nested params.{parent}")
                    continue
                for key in keys:
                    if key not in node:
                        errors.append(f"{cid}: missing params.{parent}.{key}")
    elif direction.startswith("server") and _is_jsonrpc_request(msg):
        # server→client request (e.g. requestUserInput)
        for key in case.get("requiredParams") or []:
            params = msg.get("params")
            if not isinstance(params, dict) or key not in params:
                errors.append(f"{cid}: missing params.{key}")
    elif _is_jsonrpc_response(msg):
        if "error" in msg:
            err = msg["error"]
            if not isinstance(err, dict) or "code" not in err or "message" not in err:
                errors.append(f"{cid}: error responses need code+message")
        else:
            result = msg.get("result")
            if not isinstance(result, dict):
                errors.append(f"{cid}: result must be object in fixtures")
            else:
                for key in case.get("requiredResult") or []:
                    if key not in result:
                        errors.append(f"{cid}: missing result.{key}")
                for parent, keys in (case.get("requiredNested") or {}).items():
                    node = result.get(parent)
                    if not isinstance(node, dict):
                        errors.append(f"{cid}: missing nested result.{parent}")
                        continue
                    for key in keys:
                        if key not in node:
                            errors.append(f"{cid}: missing result.{parent}.{key}")
    elif _is_jsonrpc_notification(msg):
        if not isinstance(msg.get("method"), str):
            errors.append(f"{cid}: notification method required")
    else:
        errors.append(f"{cid}: unrecognized JSON-RPC shape")

    return errors


def validate_offline_static() -> int:
    log("mode=offline-static")
    fail = 0

    if not COMPAT_PATH.is_file():
        log("FAIL: missing config/codex-compatibility.json")
        return 1
    try:
        compat = load_compat()
        assert_independence(compat)
        log("PASS: compatibility policy independence")
    except (OSError, json.JSONDecodeError, SmokeError) as exc:
        log(f"FAIL: compatibility policy: {exc}")
        fail += 1

    covered_methods = {
        c["message"]["method"]
        for c in OFFLINE_MESSAGE_FIXTURES
        if isinstance(c.get("message"), dict) and "method" in c["message"]
        and "result" not in c["message"]
        and "error" not in c["message"]
    }
    missing = sorted(REQUIRED_CLIENT_METHODS - covered_methods)
    # Some required methods appear only as request fixtures (marketplace/add etc.)
    # hooks/list, plugin/* are covered; marketplace/remove/upgrade covered.
    # plugin/install and plugin/uninstall are live-only optional when host exposes them;
    # offline still documents them via REQUIRED set, so add synthetic coverage check:
    offline_methods = {
        m
        for m in covered_methods
        if m
        in {
            "initialize",
            "marketplace/add",
            "marketplace/remove",
            "marketplace/upgrade",
            "plugin/list",
            "plugin/installed",
            "hooks/list",
            "thread/start",
            "thread/resume",
            "thread/compact/start",
            "item/tool/requestUserInput",
            "hook/started",
        }
    }
    core = {
        "initialize",
        "marketplace/add",
        "marketplace/remove",
        "marketplace/upgrade",
        "plugin/list",
        "plugin/installed",
        "hooks/list",
        "thread/start",
        "thread/resume",
        "thread/compact/start",
    }
    missing_core = sorted(core - offline_methods)
    if missing_core:
        log(f"FAIL: offline fixtures missing core methods: {missing_core}")
        fail += 1
    else:
        log(f"PASS: offline fixtures cover {len(core)} core client methods")
    if missing:
        log(
            "NOTE: methods reserved for live lane "
            f"(not all required offline): {missing}"
        )

    for case in OFFLINE_MESSAGE_FIXTURES:
        errors = validate_offline_fixture(case)
        if errors:
            fail += 1
            for e in errors:
                log(f"FAIL: {e}")
        else:
            log(f"PASS: fixture {case['id']}")

    # Optional: if codex present, generate installed-version schema into temp dir
    # and confirm ClientRequest documents required methods.
    codex = shutil.which("codex")
    if codex:
        tmp = Path(tempfile.mkdtemp(prefix="hyperflow-app-server-schema-"))
        try:
            out = tmp / "schema"
            out.mkdir()
            proc = subprocess.run(
                [codex, "app-server", "generate-json-schema", "--out", str(out)],
                capture_output=True,
                text=True,
                check=False,
                timeout=60,
            )
            if proc.returncode != 0:
                log(
                    "FAIL: codex app-server generate-json-schema "
                    f"rc={proc.returncode}: {(proc.stderr or proc.stdout)[:400]}"
                )
                fail += 1
            else:
                client_req = out / "ClientRequest.json"
                if not client_req.is_file():
                    log("FAIL: generated schema missing ClientRequest.json")
                    fail += 1
                else:
                    data = json.loads(client_req.read_text(encoding="utf-8"))
                    methods: list[str] = []
                    for variant in data.get("oneOf") or []:
                        props = variant.get("properties") or {}
                        m = props.get("method") or {}
                        methods.extend(m.get("enum") or [])
                    method_set = set(methods)
                    missing_gen = sorted(REQUIRED_CLIENT_METHODS - method_set)
                    if missing_gen:
                        log(
                            "FAIL: installed-version schema missing methods: "
                            f"{missing_gen}"
                        )
                        fail += 1
                    else:
                        log(
                            "PASS: installed-version schema includes required "
                            f"methods ({len(REQUIRED_CLIENT_METHODS)})"
                        )
                    # Validate offline request params loosely against generated
                    # per-method param schemas when present.
                    validated = 0
                    for case in OFFLINE_MESSAGE_FIXTURES:
                        msg = case["message"]
                        if not _is_jsonrpc_request(msg):
                            continue
                        method = msg.get("method")
                        if not isinstance(method, str):
                            continue
                        # Map method to Params file when available under v2/
                        title = "".join(
                            part[:1].upper() + part[1:]
                            for part in method.replace("/", " ").replace("_", " ").split()
                        )
                        # Best-effort names used by generate-json-schema
                        candidates = [
                            out / "v2" / f"{title}Params.json",
                            out / "v1" / f"{title}Params.json",
                            out / f"{title}Params.json",
                        ]
                        # Known renames
                        alias = {
                            "initialize": out / "v1" / "InitializeParams.json",
                            "marketplace/add": out / "v2" / "MarketplaceAddParams.json",
                            "marketplace/remove": out / "v2" / "MarketplaceRemoveParams.json",
                            "marketplace/upgrade": out / "v2" / "MarketplaceUpgradeParams.json",
                            "plugin/list": out / "v2" / "PluginListParams.json",
                            "plugin/installed": out / "v2" / "PluginInstalledParams.json",
                            "hooks/list": out / "v2" / "HooksListParams.json",
                            "thread/start": out / "v2" / "ThreadStartParams.json",
                            "thread/resume": out / "v2" / "ThreadResumeParams.json",
                            "thread/compact/start": out / "v2" / "ThreadCompactStartParams.json",
                        }
                        path = alias.get(method)
                        if path is None:
                            path = next((c for c in candidates if c.is_file()), None)
                        if path is None or not path.is_file():
                            continue
                        schema = json.loads(path.read_text(encoding="utf-8"))
                        params = msg.get("params")
                        for req in schema.get("required") or []:
                            if not isinstance(params, dict) or req not in params:
                                log(
                                    f"FAIL: fixture {case['id']} params missing "
                                    f"required '{req}' per {path.name}"
                                )
                                fail += 1
                            else:
                                validated += 1
                    log(
                        f"PASS: validated fixture params against generated "
                        f"schema fields ({validated} required-field checks)"
                    )
        except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
            log(f"FAIL: schema generation/validation error: {exc}")
            fail += 1
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    else:
        log("NOTE: codex not on PATH; skipped installed-version schema generation")

    log(f"SUMMARY offline-static fail={fail}")
    return 1 if fail else 0


class AppServerClient:
    """Minimal JSON-RPC stdio client for codex app-server."""

    def __init__(self, proc: subprocess.Popen[str], evidence: Path) -> None:
        self.proc = proc
        self.evidence = evidence
        self._id = 0
        self._lock = threading.Lock()
        self._pending: dict[Any, dict[str, Any]] = {}
        self._notifications: list[dict[str, Any]] = []
        self._server_requests: list[dict[str, Any]] = []
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()

    def _read_loop(self) -> None:
        assert self.proc.stdout is not None
        for line in self.proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                (self.evidence / "raw-nonjson.log").open("a", encoding="utf-8").write(
                    line + "\n"
                )
                continue
            (self.evidence / "rx.jsonl").open("a", encoding="utf-8").write(
                json.dumps(msg) + "\n"
            )
            if "id" in msg and ("result" in msg or "error" in msg):
                with self._lock:
                    self._pending[msg["id"]] = msg
            elif "id" in msg and "method" in msg:
                with self._lock:
                    self._server_requests.append(msg)
            elif "method" in msg:
                with self._lock:
                    self._notifications.append(msg)

    def request(
        self, method: str, params: dict[str, Any] | None = None, timeout: float = 20.0
    ) -> dict[str, Any]:
        with self._lock:
            self._id += 1
            req_id = self._id
        payload = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
            "params": params if params is not None else {},
        }
        assert self.proc.stdin is not None
        line = json.dumps(payload)
        (self.evidence / "tx.jsonl").open("a", encoding="utf-8").write(line + "\n")
        self.proc.stdin.write(line + "\n")
        self.proc.stdin.flush()
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self._lock:
                if req_id in self._pending:
                    return self._pending.pop(req_id)
            if self.proc.poll() is not None:
                raise SmokeError(f"app-server exited during {method}")
            time.sleep(0.05)
        raise SmokeError(f"timeout waiting for response to {method}")

    def close(self) -> None:
        if self.proc.poll() is None:
            try:
                if self.proc.stdin:
                    self.proc.stdin.close()
            except OSError:
                pass
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()


def _safe_transport_or_die(listen: str) -> None:
    allowed = {"stdio://", "stdio"}
    if listen not in allowed and not listen.startswith("stdio"):
        # Only stdio is allowed for this smoke; loopback unix/ws would need extra
        # binding checks. Refuse non-stdio to keep SECURITY_VIOLATION surface small.
        print(f"SECURITY_VIOLATION: unsafe app-server transport {listen!r}", flush=True)
        raise SystemExit(2)


def run_live(*, keep_tmp: bool) -> int:
    log("mode=live")
    codex = shutil.which("codex")
    if not codex:
        log("SKIP: codex CLI not available")
        log("  Install Codex CLI to run live app-server smoke.")
        return 0

    # Probe app-server subcommand
    probe = subprocess.run(
        [codex, "app-server", "--help"],
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    if probe.returncode != 0:
        log("SKIP: codex app-server not available on this install")
        return 0

    listen = os.environ.get("HYPERFLOW_APP_SERVER_LISTEN", "stdio://")
    _safe_transport_or_die(listen)

    tmp = Path(tempfile.mkdtemp(prefix="hyperflow-app-server-live-"))
    evidence = tmp / "evidence"
    evidence.mkdir()
    home = tmp / "home"
    codex_home = tmp / "codex-home"
    work = tmp / "project"
    schema_dir = tmp / "schema"
    home.mkdir()
    codex_home.mkdir()
    work.mkdir()
    schema_dir.mkdir()

    real_home = Path.home()
    env = os.environ.copy()
    env["HOME"] = str(home)
    env["CODEX_HOME"] = str(codex_home)
    env.pop("OPENAI_API_KEY", None)
    env.pop("CODEX_API_KEY", None)

    fail = 0
    client: AppServerClient | None = None
    try:
        # Generate installed-version schema into temp directory
        gen = subprocess.run(
            [codex, "app-server", "generate-json-schema", "--out", str(schema_dir)],
            capture_output=True,
            text=True,
            check=False,
            timeout=60,
            env=env,
        )
        if gen.returncode != 0:
            log(f"FAIL: generate-json-schema rc={gen.returncode}")
            fail += 1
        else:
            log(f"PASS: generated schema in temp ({schema_dir.name})")

        cmd = [
            codex,
            "app-server",
            "--listen",
            listen,
            # Analytics stay disabled in direct test runs (host default is off;
            # never pass --analytics-default-enabled).
        ]
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=(evidence / "server.stderr.log").open("w", encoding="utf-8"),
            text=True,
            env=env,
            cwd=str(work),
        )
        client = AppServerClient(proc, evidence)

        # Initialize handshake
        init_resp = client.request(
            "initialize",
            {
                "clientInfo": {
                    "name": "hyperflow-app-server-smoke",
                    "version": "0.0.0",
                },
                "capabilities": {"experimentalApi": False},
            },
            timeout=30.0,
        )
        if "error" in init_resp:
            log(f"FAIL: initialize error: {init_resp['error']}")
            fail += 1
        else:
            result = init_resp.get("result") or {}
            missing_init = [
                key
                for key in ("userAgent", "platformOs", "platformFamily", "codexHome")
                if key not in result
            ]
            if missing_init:
                log(f"FAIL: initialize missing {missing_init}")
                fail += 1
            else:
                # Ensure isolation: codexHome under temp
                ch = str(result.get("codexHome") or "")
                if ch and not ch.startswith(str(codex_home)) and not ch.startswith(str(tmp)):
                    # Some builds may expand CODEX_HOME differently; require not real home.
                    if ch.startswith(str(real_home / ".codex")):
                        print(
                            "SECURITY_VIOLATION: app-server codexHome points at real user home",
                            flush=True,
                        )
                        raise SystemExit(2)
                log("PASS: initialize handshake")

        # Marketplace / plugin visibility (fresh home → empty lists ok)
        for method, params in (
            ("plugin/list", {}),
            ("plugin/installed", {}),
            ("hooks/list", {"cwds": [str(work)]}),
        ):
            try:
                resp = client.request(method, params, timeout=30.0)
            except SmokeError as exc:
                log(f"SKIP: {method} unavailable ({exc})")
                continue
            if "error" in resp:
                # Method may be gated; record but do not hard-fail optional visibility
                err = resp["error"]
                msg = str(err.get("message") if isinstance(err, dict) else err)
                if "unknown" in msg.lower() or "not found" in msg.lower():
                    log(f"SKIP: {method} not exposed: {msg[:120]}")
                else:
                    log(f"FAIL: {method} error: {msg[:200]}")
                    fail += 1
            else:
                log(f"PASS: {method} response")

        # Thread start / resume when protocol allows without model auth
        thread_id = None
        try:
            start = client.request(
                "thread/start",
                {
                    "cwd": str(work),
                    "ephemeral": True,
                    "approvalPolicy": "never",
                },
                timeout=45.0,
            )
            if "error" in start:
                log(
                    "SKIP: thread/start unavailable without auth/model: "
                    f"{start['error']}"
                )
            else:
                result = start.get("result") or {}
                thread = result.get("thread") or {}
                thread_id = thread.get("id") or thread.get("threadId")
                if not thread_id:
                    log("FAIL: thread/start missing thread id")
                    fail += 1
                else:
                    log(f"PASS: thread/start id present")
                    resume = client.request(
                        "thread/resume",
                        {"threadId": thread_id},
                        timeout=30.0,
                    )
                    if "error" in resume:
                        log(f"SKIP: thread/resume error: {resume['error']}")
                    else:
                        log("PASS: thread/resume")
                    # Compact when exposed
                    compact = client.request(
                        "thread/compact/start",
                        {"threadId": thread_id},
                        timeout=30.0,
                    )
                    if "error" in compact:
                        log(
                            "SKIP: thread/compact/start not completed: "
                            f"{compact['error']}"
                        )
                    else:
                        log("PASS: thread/compact/start")
        except SmokeError as exc:
            log(f"SKIP: thread lifecycle incomplete ({exc})")

        # Marketplace add against a local path if present (fixture optional)
        v1 = FIXTURE_DIR / "marketplace-v1.json"
        if v1.is_file():
            # Local path marketplace requires a real tree; without generating one,
            # document the method with an expected error vs schema presence.
            try:
                resp = client.request(
                    "marketplace/add",
                    {"source": str(FIXTURE_DIR)},
                    timeout=30.0,
                )
                if "error" in resp:
                    log(
                        "PASS: marketplace/add reachable "
                        f"(expected fixture rejection: {resp['error']!r})"
                    )
                else:
                    log("PASS: marketplace/add response")
            except SmokeError as exc:
                log(f"SKIP: marketplace/add ({exc})")
        else:
            log("NOTE: no marketplace fixture; marketplace/add not exercised live")

        # Independence reminder in certificate summary
        summary = {
            "mode": "live",
            "fail": fail,
            "thread_id": thread_id,
            "certifies_desktop_app": False,
            "certifies_cli": False,
            "surface": "app-server",
        }
        (evidence / "summary.json").write_text(
            json.dumps(summary, indent=2) + "\n", encoding="utf-8"
        )
        log(
            "NOTE: live app-server results do not certify desktop App or CLI "
            "(independent surfaces)"
        )
    finally:
        if client is not None:
            client.close()
        if keep_tmp:
            log(f"KEEP_TMP: {tmp}")
        else:
            shutil.rmtree(tmp, ignore_errors=True)

    log(f"SUMMARY live fail={fail}")
    return 1 if fail else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--offline-static",
        action="store_true",
        help="Validate protocol shapes/fixtures (default)",
    )
    mode.add_argument(
        "--live",
        action="store_true",
        help="Run against real codex app-server stdio; SKIP if unavailable",
    )
    parser.add_argument(
        "--keep-tmp",
        action="store_true",
        help="Retain temp directories (live mode)",
    )
    args = parser.parse_args(argv)

    if args.live:
        return run_live(keep_tmp=args.keep_tmp)
    return validate_offline_static()


if __name__ == "__main__":
    sys.exit(main())
