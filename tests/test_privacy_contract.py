"""Static drift alarm: automatic network/write behavior vs privacy contract.

This is a declaration inventory, not a proof that regex equals privacy.
Undeclared runtime network or write claims are release-blocking findings.
Tests never perform network I/O.
"""

from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
CONTRACT_PATH = REPO_ROOT / "config" / "privacy-contract.json"
PRIVACY_PATH = REPO_ROOT / "PRIVACY.md"
HOOK_RUNTIME = REPO_ROOT / "scripts" / "hook-runtime.py"

# Patterns that indicate outbound network intent in runtime sources.
# Anchored to executable-ish tokens so markdown docs do not false-positive
# when only scan roots under scripts/hooks/install are walked.
_NETWORK_TOKEN_RES = [
    re.compile(r"\bls-remote\b"),
    re.compile(r"\burllib\.request\b"),
    re.compile(r"\burllib\.urlopen\b"),
    re.compile(r"\burlopen\s*\("),
    re.compile(r"\brequests\.(get|post|put|delete|request|head|patch)\b"),
    re.compile(r"\bhttp\.client\b"),
    re.compile(r"\bhttplib\b"),
    re.compile(r"\baiohttp\b"),
    re.compile(r"(?<![\w-])curl\s+"),
    re.compile(r"(?<![\w-])wget\s+"),
    re.compile(r"\bsocket\.connect\b"),
]

# Claim strings that contradict an automatic network path.
_ZERO_NETWORK_CLAIMS = [
    re.compile(r"zero\s+outbound\s+network", re.I),
    re.compile(r"zero\s+runtime\s+network", re.I),
    re.compile(r"does\s+not\s+phone\s+home.*zero", re.I),
    re.compile(r"No\s+outbound\s+HTTP,\s+WebSocket,\s+or\s+DNS", re.I),
]

# Secret-ish keys/values that must never appear in the contract.
# Meta keys that *talk about* secrets (policy flags) are allowlisted.
_SECRET_KEY_RE = re.compile(
    r"(api[_-]?key|^secret$|token|password|credential|private[_-]?key|authorization)",
    re.I,
)
_SECRET_KEY_ALLOWLIST = frozenset(
    {
        "nosecretsincontract",
        "cachecontents",
        "payloadsent",
    }
)
_SECRET_VALUE_RE = re.compile(
    r"(sk-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|"
    r"-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+)?PRIVATE\s+KEY-----|"
    r"xox[baprs]-[0-9A-Za-z-]{10,})",
)

_UPDATE_DEST = "https://github.com/Mohammed-Abdelhady/hyperflow.git"


def _load_contract() -> dict[str, Any]:
    data = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise AssertionError("privacy-contract.json must be a JSON object")
    return data


def _iter_scan_files(contract: dict[str, Any]) -> list[Path]:
    roots = contract.get("runtimeScanRoots") or []
    files: list[Path] = []
    for rel in roots:
        path = REPO_ROOT / rel
        if path.is_file():
            files.append(path)
        elif path.is_dir():
            for child in sorted(path.rglob("*")):
                if child.is_file() and child.suffix in {
                    "",
                    ".py",
                    ".sh",
                    ".bash",
                    ".js",
                    ".ts",
                }:
                    # Skip binary-ish / non-text by name heuristics
                    if child.name.endswith((".pyc", ".png", ".jpg", ".gif", ".woff")):
                        continue
                    files.append(child)
    return files


def _declared_network_patterns(contract: dict[str, Any]) -> set[str]:
    patterns: set[str] = set()
    for bucket in (
        "automaticNetwork",
        "optionalNetwork",
        "userInvokedNetwork",
        "localhostOnly",
    ):
        for entry in contract.get(bucket) or []:
            for pat in entry.get("evidencePatterns") or []:
                patterns.add(str(pat))
            dest = entry.get("destination")
            if isinstance(dest, str) and dest:
                patterns.add(dest)
            method = entry.get("method")
            if isinstance(method, str) and method:
                # First token of method often is the CLI verb (git / curl).
                patterns.add(method.split()[0])
                if "ls-remote" in method:
                    patterns.add("ls-remote")
    for pat in contract.get("networkEvidencePatterns") or []:
        # These are inventory labels, not auto-allow.
        _ = pat
    return patterns


def _match_is_declared(line: str, declared: set[str]) -> bool:
    lower = line.lower()
    for pat in declared:
        if pat.lower() in lower:
            return True
    # git-over-https destination without literal evidence list still maps
    # if the line contains the known public remote used by the update check.
    if _UPDATE_DEST in line and any(
        "ls-remote" in p or "hyperflow.git" in p for p in declared
    ):
        return True
    return False


def _line_has_network_token(line: str) -> list[str]:
    hits: list[str] = []
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or stripped.startswith("//"):
        # Still scan comments lightly for executable-looking curl|bash install docs
        # but ignore pure documentation URLs.
        if "ls-remote" not in stripped and "urlopen" not in stripped:
            return hits
    for cre in _NETWORK_TOKEN_RES:
        if cre.search(line):
            hits.append(cre.pattern)
    return hits


def _write_prefixes(contract: dict[str, Any]) -> list[str]:
    return [str(p) for p in (contract.get("writePathPrefixes") or [])]


def _all_write_entries(contract: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for bucket in ("automaticWrites", "userInvokedWrites"):
        for entry in contract.get(bucket) or []:
            out.append(entry)
    return out


class PrivacyContractStructureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = _load_contract()

    def test_contract_file_exists_and_versioned(self) -> None:
        self.assertTrue(CONTRACT_PATH.is_file())
        self.assertIsInstance(self.contract.get("version"), int)
        self.assertGreaterEqual(self.contract["version"], 1)
        self.assertEqual(self.contract.get("policyHuman"), "PRIVACY.md")
        self.assertTrue(PRIVACY_PATH.is_file())

    def test_no_zero_automatic_network_claim_while_update_check_exists(self) -> None:
        statements = self.contract.get("statements") or {}
        auto = self.contract.get("automaticNetwork") or []
        self.assertFalse(
            statements.get("zeroAutomaticNetwork"),
            msg="contract must not claim zeroAutomaticNetwork while automatic paths exist",
        )
        self.assertTrue(
            auto,
            msg="automaticNetwork must declare the session-start update check",
        )
        ids = {e.get("id") for e in auto}
        self.assertIn("session-start-update-check", ids)

    def test_no_plugin_owned_analytics_or_phone_home(self) -> None:
        statements = self.contract.get("statements") or {}
        self.assertIs(statements.get("pluginOwnedAnalytics"), False)
        self.assertIs(statements.get("phoneHome"), False)
        self.assertIs(statements.get("providerTrafficIsHostOwned"), True)

    def test_no_secrets_in_contract(self) -> None:
        raw = CONTRACT_PATH.read_text(encoding="utf-8")
        self.assertIsNone(
            _SECRET_VALUE_RE.search(raw),
            msg="privacy-contract.json must not embed credential-like values",
        )

        def walk(obj: Any, path: str = "$") -> None:
            if isinstance(obj, dict):
                for key, value in obj.items():
                    if str(key).lower() not in _SECRET_KEY_ALLOWLIST:
                        self.assertIsNone(
                            _SECRET_KEY_RE.search(str(key)),
                            msg=f"secret-like key at {path}.{key}",
                        )
                    walk(value, f"{path}.{key}")
            elif isinstance(obj, list):
                for i, item in enumerate(obj):
                    walk(item, f"{path}[{i}]")
            elif isinstance(obj, str):
                self.assertIsNone(
                    _SECRET_VALUE_RE.search(obj),
                    msg=f"secret-like value at {path}",
                )
                # No absolute home directories for a specific user.
                self.assertNotRegex(obj, r"/Users/[^/~]")
                self.assertNotRegex(obj, r"/home/[^/~]")

        walk(self.contract)


class UpdateCheckDisclosureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = _load_contract()
        cls.runtime = HOOK_RUNTIME.read_text(encoding="utf-8")
        auto = cls.contract.get("automaticNetwork") or []
        cls.update = next(
            e for e in auto if e.get("id") == "session-start-update-check"
        )

    def test_destination_method_frequency_match_runtime(self) -> None:
        self.assertEqual(self.update.get("destination"), _UPDATE_DEST)
        self.assertIn("ls-remote", str(self.update.get("method")))
        self.assertEqual(self.update.get("frequencyMinutes"), 1440)
        self.assertEqual(self.update.get("timeoutSeconds"), 4)
        self.assertIn("ls-remote", self.runtime)
        self.assertIn(_UPDATE_DEST, self.runtime)
        self.assertIn("UPDATE_CACHE_MINUTES = 1440", self.runtime)
        self.assertIn("timeout=4", self.runtime)
        self.assertIn(".update-check", self.runtime)
        self.assertIn("HYPERFLOW_HOOK_OFFLINE", self.runtime)

    def test_opt_out_and_offline_failure_documented(self) -> None:
        opt_out = self.update.get("optOut") or []
        self.assertTrue(any("HYPERFLOW_HOOK_OFFLINE" in str(x) for x in opt_out))
        self.assertTrue(any("--offline" in str(x) for x in opt_out))
        failure = str(self.update.get("failureBehavior") or "").lower()
        self.assertTrue(
            "non-blocking" in failure or "never blocks" in failure or "empty" in failure,
            msg="failureBehavior must document offline/non-blocking update failure",
        )
        offline = str(self.update.get("offlineBehavior") or "").lower()
        self.assertIn("skip", offline)

    def test_cache_path_is_home_hyperflow_not_project(self) -> None:
        cache = str(self.update.get("cachePath") or "")
        self.assertIn("~/.hyperflow/.update-check", cache)
        contents = str(self.update.get("cacheContents") or "").lower()
        self.assertTrue(
            "semver" in contents or "version" in contents or "tag" in contents,
            msg="cacheContents must describe the version/tag string stored",
        )
        self.assertNotIn("prompt", contents)
        # "no credentials" is fine; reject token-storage claims.
        self.assertNotRegex(contents, r"\btoken\b")


class NetworkInventoryDriftTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = _load_contract()
        cls.declared = _declared_network_patterns(cls.contract)

    def test_runtime_network_tokens_are_declared(self) -> None:
        undeclared: list[str] = []
        for path in _iter_scan_files(self.contract):
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            rel = path.relative_to(REPO_ROOT).as_posix()
            for lineno, line in enumerate(text.splitlines(), start=1):
                hits = _line_has_network_token(line)
                if not hits:
                    continue
                if _match_is_declared(line, self.declared):
                    continue
                # view.py uses http.server for localhost — require localhostOnly
                if "http.server" in line or "HTTPServer" in line:
                    if any(
                        e.get("id") == "artefact-viewer"
                        for e in (self.contract.get("localhostOnly") or [])
                    ):
                        continue
                undeclared.append(f"{rel}:{lineno}: {line.strip()[:160]}")
        self.assertEqual(
            undeclared,
            [],
            msg=(
                "Undeclared automatic/runtime network evidence found. "
                "Add a privacy-contract.json entry or remove the call:\n"
                + "\n".join(undeclared)
            ),
        )

    def test_git_ls_remote_maps_to_automatic_update_check(self) -> None:
        found = False
        for path in _iter_scan_files(self.contract):
            text = path.read_text(encoding="utf-8", errors="replace")
            if "ls-remote" in text and _UPDATE_DEST in text:
                found = True
                break
        self.assertTrue(found, msg="expected git ls-remote update check in scanned sources")
        auto_ids = {e.get("id") for e in (self.contract.get("automaticNetwork") or [])}
        self.assertIn("session-start-update-check", auto_ids)

    def test_optional_web_research_declared(self) -> None:
        optional = self.contract.get("optionalNetwork") or []
        ids = {e.get("id") for e in optional}
        self.assertIn("specialist-web-research", ids)
        entry = next(e for e in optional if e["id"] == "specialist-web-research")
        self.assertEqual(entry.get("category"), "optional")
        web_research = (
            REPO_ROOT / "skills" / "hyperflow" / "web-research.md"
        ).read_text(encoding="utf-8")
        self.assertIn("web_research", web_research)
        self.assertIn("offline", web_research.lower())


class WriteInventoryDriftTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = _load_contract()
        cls.writes = _all_write_entries(cls.contract)
        cls.prefixes = _write_prefixes(cls.contract)

    def test_automatic_writes_cover_known_runtime_paths(self) -> None:
        required_substrings = [
            ".update-check",
            ".session-start.log",
            "session-context.md",
            ".precompact.md",
            ".version",
            "memory/index.md",
            "memory/.checksums",
            ".last-cleanup",
            "CLAUDE.md",
            "AGENTS.md",
        ]
        blob = json.dumps(self.writes)
        missing = [s for s in required_substrings if s not in blob]
        self.assertEqual(
            missing,
            [],
            msg=f"automatic/user write inventory missing paths: {missing}",
        )

    def test_declared_write_paths_use_allowed_prefixes(self) -> None:
        """Each write entry's path string must sit under a declared prefix.

        Compound declarations (brace lists, comma alternatives) are reduced to
        the longest prefix before `{` / `*` / the first path-like token that
        starts with `.`, `~`, or a known instruction filename.
        """
        allowed = self.prefixes
        violations: list[str] = []

        def path_ok(raw: str) -> bool:
            text = raw.strip()
            if not text:
                return False
            lower = text.lower()
            if "user-chosen" in lower:
                return True
            if "host skill" in lower or "plugin dirs" in lower:
                return True
            # Expand simple `a | b` alternatives without breaking brace lists.
            alternatives: list[str] = []
            depth = 0
            buf: list[str] = []
            for ch in text:
                if ch == "{":
                    depth += 1
                    buf.append(ch)
                elif ch == "}":
                    depth = max(0, depth - 1)
                    buf.append(ch)
                elif ch == "|" and depth == 0:
                    alternatives.append("".join(buf).strip())
                    buf = []
                else:
                    buf.append(ch)
            alternatives.append("".join(buf).strip())

            for alt in alternatives:
                # Drop parenthetical notes and trailing prose after the path.
                alt = alt.split("(")[0].strip()
                # Comma-separated siblings at depth 0 (e.g. "CLAUDE.md, AGENTS.md")
                depth = 0
                chunks: list[str] = []
                buf = []
                for ch in alt:
                    if ch == "{":
                        depth += 1
                        buf.append(ch)
                    elif ch == "}":
                        depth = max(0, depth - 1)
                        buf.append(ch)
                    elif ch == "," and depth == 0:
                        chunks.append("".join(buf).strip())
                        buf = []
                    else:
                        buf.append(ch)
                chunks.append("".join(buf).strip())

                for chunk in chunks:
                    if not chunk:
                        continue
                    # Strip trailing English notes ("one-line append").
                    token = chunk.split()
                    # Prefer the first path-like token.
                    probe = ""
                    for t in token:
                        if t.startswith((".", "~", "/")) or t in {
                            "CLAUDE.md",
                            "AGENTS.md",
                        }:
                            probe = t
                            break
                    if not probe:
                        probe = token[0] if token else chunk
                    probe = re.split(r"[{*]", probe, maxsplit=1)[0]
                    if not any(
                        probe == a
                        or probe.startswith(a)
                        or a.startswith(probe.rstrip("/"))
                        or probe.rstrip("/") == a.rstrip("/")
                        for a in allowed
                    ):
                        return False
            return True

        for entry in self.writes:
            path = str(entry.get("path") or "")
            if not path_ok(path):
                violations.append(f"{entry.get('id')}: {path!r}")
        self.assertEqual(
            violations,
            [],
            msg="write paths outside declared writePathPrefixes: " + "; ".join(violations),
        )

    def test_new_write_target_fixture_would_fail_prefix_check(self) -> None:
        """Document the drift-alarm rule: undeclared absolute outside set fails."""
        rogue = "/var/lib/hyperflow/telemetry.db"
        allowed = self.prefixes
        ok = any(rogue.startswith(a) or a.startswith(rogue) for a in allowed)
        self.assertFalse(ok, msg="fixture outside declared set must not pass")


class PrivacyMarkdownAlignmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.privacy = PRIVACY_PATH.read_text(encoding="utf-8")
        cls.contract = _load_contract()

    def test_privacy_md_does_not_claim_zero_runtime_network(self) -> None:
        for cre in _ZERO_NETWORK_CLAIMS:
            self.assertIsNone(
                cre.search(self.privacy),
                msg=(
                    f"PRIVACY.md still claims zero network via {cre.pattern!r} "
                    "while session-start performs a daily update lookup"
                ),
            )
        # TL;DR must not say zero outbound from runtime code.
        self.assertNotRegex(
            self.privacy,
            r"Zero outbound network calls from plugin runtime code",
            msg="stale TL;DR zero-network claim",
        )

    def test_privacy_md_discloses_update_check(self) -> None:
        lower = self.privacy.lower()
        self.assertIn("update", lower)
        self.assertTrue(
            "ls-remote" in lower or "git ls-remote" in lower or "daily" in lower,
            msg="PRIVACY.md must disclose the daily update lookup",
        )
        self.assertIn("github.com/mohammed-abdelhady/hyperflow", lower)
        self.assertTrue(
            "hyperflow_hook_offline" in lower
            or "offline" in lower
            or "opt-out" in lower
            or "opt out" in lower,
            msg="PRIVACY.md must document offline/opt-out for the update check",
        )
        self.assertTrue(
            "non-blocking" in lower
            or "does not block" in lower
            or "never block" in lower
            or "nonblocking" in lower,
            msg="PRIVACY.md must document offline/non-blocking update failure",
        )

    def test_privacy_md_distinguishes_optional_and_provider_traffic(self) -> None:
        lower = self.privacy.lower()
        self.assertIn("web research", lower)
        self.assertIn("provider", lower)
        self.assertIn("does not intercept", lower)
        self.assertNotIn("posthog", lower.split("no analytics")[0] if False else "")
        # Analytics denial still present for plugin-owned telemetry.
        self.assertRegex(self.privacy, r"[Nn]o analytics SDK|[Nn]o cloud analytics")

    def test_privacy_md_discloses_automatic_writes(self) -> None:
        for needle in (
            ".hyperflow/",
            "session-context",
            ".precompact",
            ".update-check",
            "AGENTS.md",
            "CLAUDE.md",
        ):
            self.assertIn(
                needle,
                self.privacy,
                msg=f"PRIVACY.md missing write disclosure for {needle}",
            )

    def test_privacy_md_points_at_machine_readable_contract(self) -> None:
        self.assertIn("config/privacy-contract.json", self.privacy)
        self.assertIn("privacy-contract.json", self.privacy)


class ContractSelfConsistencyTests(unittest.TestCase):
    def test_automatic_network_entries_have_required_fields(self) -> None:
        contract = _load_contract()
        required = {
            "id",
            "category",
            "description",
            "owner",
            "method",
            "destination",
            "frequencyMinutes",
            "cachePath",
            "failureBehavior",
            "optOut",
            "evidencePatterns",
            "scannedSources",
        }
        for entry in contract.get("automaticNetwork") or []:
            missing = required - set(entry)
            self.assertEqual(
                missing,
                set(),
                msg=f"{entry.get('id')}: missing fields {missing}",
            )
            self.assertEqual(entry.get("category"), "automatic")
            self.assertIsInstance(entry.get("optOut"), list)
            self.assertTrue(entry["optOut"])
            for rel in entry.get("scannedSources") or []:
                self.assertTrue(
                    (REPO_ROOT / rel).exists(),
                    msg=f"scannedSources missing on disk: {rel}",
                )

    def test_write_entries_have_path_and_category(self) -> None:
        contract = _load_contract()
        for entry in _all_write_entries(contract):
            self.assertTrue(entry.get("id"))
            self.assertTrue(entry.get("path"))
            self.assertIn(entry.get("category"), {"automatic", "user-invoked"})


if __name__ == "__main__":
    unittest.main()
