#!/usr/bin/env python3
"""Deterministic, conservative routing for obvious small tasks.

The router only selects ``inline_fast`` when the caller has observed enough
local facts to prove the task is clear, reversible, and limited to one or two
ordinary files. Every uncertain or sensitive case falls back to the existing
classifier path.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import re
import sys
from pathlib import Path, PurePosixPath
from typing import Iterable


EXPLICIT_HYPERFLOW_RE = re.compile(
    r"^(?:/hyperflow(?::|-)|hyperflow\s+"
    r"(?:plan|dispatch|workflow|trace|audit|deploy|scaffold|scope|spec)\b)",
    re.IGNORECASE,
)
FULL_MODE_RE = re.compile(
    r"(?:^|\s)(?:--thorough|depth=max|(?:--)?mode=(?:default|thorough))(?:\s|$)",
    re.IGNORECASE,
)
AMBIGUITY_RE = re.compile(
    r"\b(?:maybe|perhaps|not sure|unsure|what if|should we|how should|"
    r"explore|brainstorm|pick an approach|best approach|figure out)\b",
    re.IGNORECASE,
)
SECURITY_RE = re.compile(
    r"\b(?:auth(?:entication|orization)?|oauth|jwt|session|cookie|csrf|"
    r"password|credential|secret|token|crypto|encryption|permission|"
    r"access control|pii|payment|billing|vulnerabilit(?:y|ies))\b",
    re.IGNORECASE,
)
INTEGRATION_RE = re.compile(
    r"\b(?:cross[- ]cutting|system[- ]wide|multi[- ]service|multiple services|"
    r"api contract|shared state|database schema|deployment|infrastructure|"
    r"distributed|end[- ]to[- ]end|integration)\b",
    re.IGNORECASE,
)
MIGRATION_RE = re.compile(r"\b(?:migration|migrate|schema change)\b", re.IGNORECASE)

GENERATED_NAMES = {
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lock",
    "bun.lockb",
    "composer.lock",
    "poetry.lock",
    "cargo.lock",
    "changelog.md",
}
GENERATED_DIRS = {
    "dist",
    "build",
    "coverage",
    "generated",
    "node_modules",
    "vendor",
}
MIGRATION_DIRS = {"migration", "migrations", "migrate"}
TRIAGE_SOURCE = "deterministic"
BLOCKED_FILE_PATTERNS = (
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "*.jks",
    "credentials.json",
    "service-account*.json",
    "*-secret.json",
    "*-secret.yaml",
    "~/.ssh/*",
    "~/.gnupg/*",
    "id_rsa*",
    "id_ed25519*",
    "*.gpg",
    ".npmrc",
    ".pypirc",
    ".docker/config.json",
    "*.keychain",
    "*-credentials",
    "~/.aws/credentials",
    "~/.azure/*",
    "~/.config/gcloud/*",
    "~/.kube/config",
)
ADDITIONAL_BLOCKED_SUFFIXES = {".crt", ".cer", ".cert", ".der"}


def _normalize_files(files: Iterable[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in files:
        value = raw.strip().replace("\\", "/")
        while value.startswith("./"):
            value = value[2:]
        if value and value not in seen:
            normalized.append(value)
            seen.add(value)
    return normalized


def _is_generated_surface(path: str) -> bool:
    pure = PurePosixPath(path)
    parts = {part.lower() for part in pure.parts}
    name = pure.name.lower()
    return (
        name in GENERATED_NAMES
        or bool(parts & GENERATED_DIRS)
        or ".generated." in name
        or name.endswith((".generated", ".min.js", ".min.css"))
    )


def _is_migration_surface(path: str) -> bool:
    return bool({part.lower() for part in PurePosixPath(path).parts} & MIGRATION_DIRS)


def _unsafe_path_reason(path: str, project_root: str | Path | None) -> str | None:
    """Return why an observed path is unsafe for foreground mutation."""

    pure = PurePosixPath(path)
    lowered_parts = tuple(part.lower() for part in pure.parts)
    name = pure.name.lower()
    if pure.is_absolute() or path.startswith("~/") or re.match(r"^[a-zA-Z]:/", path):
        return "absolute_path"
    if ".." in pure.parts:
        return "parent_traversal"
    if ".git" in lowered_parts:
        return "git_surface"
    normalized_lower = pure.as_posix().lower()
    matches_config_pattern = any(
        fnmatch.fnmatchcase(
            normalized_lower if "/" in pattern else name,
            pattern.lower(),
        )
        for pattern in BLOCKED_FILE_PATTERNS
    )
    if matches_config_pattern or pure.suffix.lower() in ADDITIONAL_BLOCKED_SUFFIXES:
        return "blocked_file"
    if "credential" in name or "secret" in name:
        return "blocked_file"
    if "service-account" in name and name.endswith(".json"):
        return "blocked_file"

    if project_root is not None:
        try:
            root = Path(project_root).expanduser().resolve(strict=True)
        except (OSError, RuntimeError):
            return "invalid_project_root"
        if not root.is_dir():
            return "invalid_project_root"
        candidate = root.joinpath(*pure.parts)
        try:
            resolved = candidate.resolve(strict=False)
            resolved.relative_to(root)
        except (OSError, RuntimeError, ValueError):
            return "symlink_or_outside_project"

        current = root
        for part in pure.parts:
            current = current / part
            try:
                if current.is_symlink():
                    return "symlink_or_outside_project"
            except OSError:
                return "symlink_or_outside_project"
    return None


def route_task(
    request: str,
    *,
    files: Iterable[str] = (),
    risk: str = "unknown",
    clarity: str = "unknown",
    security: bool = False,
    integration_risk: bool = False,
    thorough: bool = False,
    explicit_hyperflow: bool | None = None,
    project_root: str | Path | None = None,
) -> dict[str, object]:
    """Return an ``inline_fast`` or ``classifier`` routing decision.

    ``risk`` must be ``reversible`` and ``clarity`` must be ``clear`` for the
    fast path. Unknown observations deliberately fail closed.
    """

    normalized_files = _normalize_files(files)
    stripped = request.strip()
    reasons: list[str] = []

    detected_explicit = bool(EXPLICIT_HYPERFLOW_RE.search(stripped))
    if explicit_hyperflow or detected_explicit:
        reasons.append("explicit_hyperflow_command")
    if not stripped:
        reasons.append("empty_request")
    if thorough or FULL_MODE_RE.search(stripped):
        reasons.append("full_mode")
    if risk != "reversible":
        reasons.append("risk_not_observed_reversible")
    if clarity != "clear" or AMBIGUITY_RE.search(stripped):
        reasons.append("clarity_not_observed_clear")
    if not 1 <= len(normalized_files) <= 2:
        reasons.append("observed_file_scope_not_1_to_2")
    if security or SECURITY_RE.search(stripped):
        reasons.append("security_surface")
    if integration_risk or INTEGRATION_RE.search(stripped):
        reasons.append("integration_surface")
    if MIGRATION_RE.search(stripped) or any(
        _is_migration_surface(path) for path in normalized_files
    ):
        reasons.append("migration_surface")
    if any(_is_generated_surface(path) for path in normalized_files):
        reasons.append("generated_surface")
    unsafe_reasons = {
        reason
        for path in normalized_files
        if (reason := _unsafe_path_reason(path, project_root)) is not None
    }
    reasons.extend(sorted(unsafe_reasons))

    if reasons:
        return {
            "route": "classifier",
            "confidence": "fallback",
            "reasons": reasons,
            "observed_files": normalized_files,
        }

    return {
        "route": "inline_fast",
        "confidence": "high",
        "reasons": ["clear_reversible_non_sensitive_1_to_2_file_scope"],
        "observed_files": normalized_files,
        "triage_source": TRIAGE_SOURCE,
        "types": [],
        "personas": [],
        "specialists": [],
        "complexity": "trivial",
        "risk": "reversible",
        "scope": "single-file" if len(normalized_files) == 1 else "multi-file",
        "ambiguity": 0.0,
        "brainstormDepth": "none",
        "flow": "fast",
        "estimatedWorkers": 0,
        "estimatedBatches": 1,
        "budget": 10_000,
        "security": False,
        "integration_risk": False,
        "rationale": "Observed clear, reversible 1-2-file scope on ordinary project files.",
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("request", nargs="?", help="User request; stdin when omitted")
    parser.add_argument("--file", action="append", default=[], dest="files")
    parser.add_argument(
        "--risk", choices=("reversible", "irreversible", "unknown"), default="unknown"
    )
    parser.add_argument(
        "--clarity", choices=("clear", "ambiguous", "unknown"), default="unknown"
    )
    parser.add_argument("--security", action="store_true")
    parser.add_argument("--integration-risk", action="store_true")
    parser.add_argument("--thorough", action="store_true")
    parser.add_argument("--explicit-hyperflow", action="store_true")
    parser.add_argument("--project-root")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    request = args.request if args.request is not None else sys.stdin.read()
    result = route_task(
        request,
        files=args.files,
        risk=args.risk,
        clarity=args.clarity,
        security=args.security,
        integration_risk=args.integration_risk,
        thorough=args.thorough,
        explicit_hyperflow=True if args.explicit_hyperflow else None,
        project_root=args.project_root,
    )
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
