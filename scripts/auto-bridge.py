#!/usr/bin/env python3
"""
auto-bridge.py — session-start auto-bridge for the hyperflow doctrine block.

Called by hooks/session-start. Reads .hyperflow/.bridge-mode (default: auto), checks
whether the project's instruction file(s) have the current doctrine block, and either:

  * mode=auto    → writes/refreshes the block silently, prints one-line notice
  * mode=manual  → leaves the file alone, prints an advisory when stale
  * mode=off     → does nothing

Provider-aware targets (one block algorithm for both):
  * codex / opencode / cursor / grok / antigravity → AGENTS.md
  * claude-code → CLAUDE.md
  * mixed/unknown → refresh files that already carry a managed block; else
    CLAUDE.md for backward compatibility. Codex-only signals never mutate CLAUDE.md.

Idempotent. Preserves all other content outside the
<!-- hyperflow:doctrine:start --> … <!-- hyperflow:doctrine:end --> markers.

Exits 0 on success or no-op. Exits 0 (not non-zero) on most error paths too,
because the hook is non-blocking by design — a bridge failure must not break
session start. Errors go to stderr; the hook captures them into
.hyperflow/.session-start.log.

Usage:
    auto-bridge.py <plugin-root> <project-root> [--force]
    auto-bridge.py --body-sha <plugin-root>
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import os
import re
import sys
from pathlib import Path

START_MARKER_RE = re.compile(
    r"<!--\s*hyperflow:doctrine:start"
    r"(?:\s+version=(?P<version>[^\s>]+))?"
    r"(?:\s+generated=(?P<generated>[^\s>]+))?"
    r"(?:\s+body-sha=(?P<body_sha>[0-9a-f]+))?"
    r"[^>]*-->",
)
END_MARKER = "<!-- hyperflow:doctrine:end -->"

# Instruction file(s) owned per provider. Codex-family never auto-touches CLAUDE.md.
_PROVIDER_TARGETS: dict[str, tuple[str, ...]] = {
    "codex": ("AGENTS.md",),
    "opencode": ("AGENTS.md",),
    "cursor": ("AGENTS.md",),
    "grok": ("AGENTS.md",),
    "antigravity": ("AGENTS.md",),
    "claude-code": ("CLAUDE.md",),
}

def _body_hash(template: str) -> str:
    """Hash the template body (without per-render substitutions).

    Strips the start-marker line entirely from the hashed content so per-render
    version/timestamp/body-sha values never influence the hash itself.
    """
    body = START_MARKER_RE.sub("", template, count=1)
    return hashlib.sha256(body.encode("utf-8")).hexdigest()[:12]


def _read_version(plugin_root: Path) -> str:
    """Resolve the current plugin version from skills/hyperflow/VERSION."""
    version_file = plugin_root / "skills" / "hyperflow" / "VERSION"
    try:
        return version_file.read_text(encoding="utf-8").strip() or "unknown"
    except OSError:
        return "unknown"


def _read_template(plugin_root: Path) -> str | None:
    """Read the doctrine template; return None if absent."""
    template = plugin_root / "templates" / "claude-md-doctrine.md"
    try:
        return template.read_text(encoding="utf-8")
    except OSError:
        return None


def _read_mode(project_root: Path) -> str:
    """Read .hyperflow/.bridge-mode. Default: auto."""
    path = project_root / ".hyperflow" / ".bridge-mode"
    try:
        value = path.read_text(encoding="utf-8").strip().lower()
        if value in {"auto", "manual", "off"}:
            return value
    except OSError:
        pass
    return "auto"


def _detect_provider_key() -> str | None:
    """Lightweight provider detection from environment (no filesystem secrets).

    Mirrors config/providers.json signal precedence at a coarse grain suitable
    for choosing the instruction-file target. Returns None when unknown.
    """
    # Explicit plugin-root env vars — Codex wins when both roots are set.
    if os.environ.get("CODEX_PLUGIN_ROOT"):
        return "codex"
    if os.environ.get("CLAUDE_PLUGIN_ROOT"):
        return "claude-code"
    if os.environ.get("OPENCODE_PLUGIN_ROOT"):
        return "opencode"
    if os.environ.get("GROK_PLUGIN_ROOT"):
        return "grok"
    if os.environ.get("ANTIGRAVITY_PLUGIN_ROOT"):
        return "antigravity"
    if os.environ.get("CURSOR_PLUGIN_ROOT"):
        return "cursor"

    # Host-specific keys / entrypoints
    if os.environ.get("CODEX_HOME") or os.environ.get("CODEX_SESSION_ID"):
        return "codex"
    if os.environ.get("CLAUDE_CODE_ENTRYPOINT") or os.environ.get("CLAUDE_PROJECT_DIR"):
        return "claude-code"
    if os.environ.get("OPENCODE_CONFIG") or os.environ.get("OPENCODE_DATA"):
        return "opencode"
    if os.environ.get("GROK_AGENT") or os.environ.get("GROK_SUBAGENTS"):
        return "grok"
    if os.environ.get("ANTIGRAVITY_HOME"):
        return "antigravity"
    if os.environ.get("CURSOR_TRACE_ID"):
        return "cursor"

    # Prefix scan (less specific — only if nothing above matched)
    for key, value in os.environ.items():
        if not value:
            continue
        upper = key.upper()
        if upper.startswith("CODEX"):
            return "codex"
        if upper.startswith("CLAUDE_CODE") or upper == "CLAUDE":
            return "claude-code"
        if upper.startswith("OPENCODE"):
            return "opencode"
        if upper.startswith("GROK"):
            return "grok"
        if upper.startswith("ANTIGRAVITY"):
            return "antigravity"
        if upper.startswith("CURSOR"):
            return "cursor"

    return None


def _path_has_doctrine_block(path: Path) -> bool:
    """True when *path* exists and already contains a managed doctrine block."""
    if not path.is_file():
        return False
    try:
        return _find_existing_block(path.read_text(encoding="utf-8")) is not None
    except OSError:
        return False


def _resolve_targets(project_root: Path) -> list[Path]:
    """Return instruction files this session should maintain.

    * claude-code → CLAUDE.md only
    * codex → AGENTS.md only (never automatic CLAUDE.md mutation)
    * other AGENTS-family providers → AGENTS.md; also refresh an *existing*
      CLAUDE.md doctrine block so mixed-surface projects stay current without
      creating CLAUDE.md for AGENTS-only setups
    * unknown → files that already carry a managed block, else CLAUDE.md
      (legacy auto-bridge default)
    """
    provider = _detect_provider_key()
    claude_md = project_root / "CLAUDE.md"
    agents_md = project_root / "AGENTS.md"

    if provider == "claude-code":
        return [claude_md]

    if provider == "codex":
        # Codex-only: never touch CLAUDE.md automatically.
        return [agents_md]

    if provider in _PROVIDER_TARGETS:
        # opencode / cursor / grok / antigravity
        targets = [project_root / name for name in _PROVIDER_TARGETS[provider]]
        if _path_has_doctrine_block(claude_md) and claude_md not in targets:
            targets.append(claude_md)
        return targets

    # Unknown provider: refresh whichever managed blocks already exist.
    existing: list[Path] = []
    for path in (claude_md, agents_md):
        if _path_has_doctrine_block(path):
            existing.append(path)
    if existing:
        return existing
    # Legacy default: CLAUDE.md (prior auto-bridge behavior).
    return [claude_md]


def _find_existing_block(
    content: str,
) -> tuple[int, int, str | None, str | None] | None:
    """Return (start_idx, end_idx_exclusive, version, body_sha) or None.

    Searches the file content for the doctrine markers. Returns character
    positions covering the entire block (start marker line through end marker
    line inclusive), the captured version, and the captured body-sha (if any).
    """
    match = START_MARKER_RE.search(content)
    if not match:
        return None
    start = content.rfind("\n", 0, match.start()) + 1
    end_marker_idx = content.find(END_MARKER, match.end())
    if end_marker_idx == -1:
        return None
    line_end = content.find("\n", end_marker_idx)
    end = line_end + 1 if line_end != -1 else len(content)
    return start, end, match.group("version"), match.group("body_sha")


def _render_block(template: str, version: str, generated_at: str, body_sha: str) -> str:
    """Substitute placeholders + add body-sha to the start marker."""
    rendered = template.replace("__HYPERFLOW_VERSION__", version).replace(
        "__GENERATED_AT__", generated_at
    )
    # Add or replace body-sha=<hash> attribute in the start marker.
    def _patch_marker(m: re.Match) -> str:
        # Always emit a marker that includes version, generated, and body-sha.
        v = m.group("version") or version
        g = m.group("generated") or generated_at
        return (
            f"<!-- hyperflow:doctrine:start version={v} generated={g} "
            f"body-sha={body_sha} source=https://github.com/Mohammed-Abdelhady/hyperflow -->"
        )

    return START_MARKER_RE.sub(_patch_marker, rendered, count=1)


def _apply_block(original: str, new_block: str) -> tuple[str, str]:
    """Return (new_content, action) applying new_block to original file text.

    action is ``generated`` (append/create) or ``refreshed`` (in-place replace).
    Content outside the managed markers is preserved byte-for-byte.
    """
    existing = _find_existing_block(original)
    if existing is None:
        sep = (
            ""
            if original.endswith("\n\n") or not original
            else ("\n" if original.endswith("\n") else "\n\n")
        )
        new_content = original + sep + new_block
        if not new_content.endswith("\n"):
            new_content += "\n"
        return new_content, "generated"

    start, end, _, _ = existing
    prefix = original[:start]
    suffix = original[end:]
    new_content = prefix + new_block
    if not new_content.endswith("\n"):
        new_content += "\n"
    new_content += suffix
    if not new_content.endswith("\n"):
        new_content += "\n"
    return new_content, "refreshed"


def _write_instruction_file(
    target: Path, new_block: str, mode: str
) -> str:
    """Write or replace the doctrine block in *target*. Returns action taken."""
    if target.exists():
        original = target.read_text(encoding="utf-8")
    else:
        original = ""

    new_content, action = _apply_block(original, new_block)

    if mode == "manual":
        # In manual mode we never write; we just compute the would-be action
        # so the caller can print an advisory instead.
        return f"would-{action}"

    target.write_text(new_content, encoding="utf-8")
    return action


def _write_claude_md(project_root: Path, new_block: str, mode: str) -> str:
    """Backward-compatible wrapper — doctrine block in ./CLAUDE.md."""
    return _write_instruction_file(project_root / "CLAUDE.md", new_block, mode)


def _is_fresh(content: str, version: str, body_sha: str, force: bool) -> bool:
    """True when the existing block matches current content and force is off."""
    if force:
        return False
    existing = _find_existing_block(content)
    if not existing:
        return False
    _, _, existing_version, existing_body_sha = existing
    if existing_body_sha and existing_body_sha == body_sha:
        return True
    if existing_body_sha is None and existing_version == version:
        return True
    return False


def _print_body_sha(argv: list[str]) -> int:
    """Print the current template's body-sha — the value stamped into a block's marker.

    Exists so other tools (scripts/verify-downstreams.sh) can ask for the hash rather
    than reimplement it and silently disagree with auto-bridge about freshness.
    """
    if len(argv) < 3:
        print(
            "auto-bridge: usage: auto-bridge.py --body-sha <plugin-root>",
            file=sys.stderr,
        )
        return 2
    template = _read_template(Path(argv[2]))
    if template is None:
        print("auto-bridge: template not found", file=sys.stderr)
        return 2
    print(_body_hash(template))
    return 0


def main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[1] == "--body-sha":
        return _print_body_sha(argv)

    # --force re-stamps the marker even when the body is unchanged. Reserved for this
    # repo's own release commit, where the version label should track the release. User
    # projects must keep the content-keyed no-op so a version bump never churns their
    # instruction files.
    force = "--force" in argv[1:]
    argv = [a for a in argv if a != "--force"]

    if len(argv) < 3:
        print(
            "auto-bridge: usage: auto-bridge.py <plugin-root> <project-root> [--force]\n"
            "                    auto-bridge.py --body-sha <plugin-root>",
            file=sys.stderr,
        )
        return 0  # non-blocking

    plugin_root = Path(argv[1])
    project_root = Path(argv[2])

    if not (project_root / ".hyperflow").is_dir():
        # Project doesn't use hyperflow; nothing to bridge.
        return 0

    mode = _read_mode(project_root)
    if mode == "off":
        return 0

    version = _read_version(plugin_root)
    template = _read_template(plugin_root)
    if template is None:
        print(
            "auto-bridge: template not found at "
            f"{plugin_root}/templates/claude-md-doctrine.md — skipping",
            file=sys.stderr,
        )
        return 0

    generated_at = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    body_sha = _body_hash(template)
    new_block = _render_block(template, version, generated_at, body_sha)

    targets = _resolve_targets(project_root)

    for target in targets:
        # Freshness check (S7 — content-hash invalidation):
        #   1. Matching body-sha → no-op
        #   2. Legacy version-string match when no body-sha
        #   3. --force bypasses both
        if target.exists() and not force:
            try:
                if _is_fresh(
                    target.read_text(encoding="utf-8"), version, body_sha, force
                ):
                    continue
            except OSError:
                pass

        try:
            action = _write_instruction_file(target, new_block, mode)
        except OSError as e:
            print(
                f"auto-bridge: failed to write {target.name} — {e}",
                file=sys.stderr,
            )
            continue

        rel = f"./{target.name}"
        if action.startswith("would-"):
            real_action = action.replace("would-", "")
            print(
                f"hyperflow bridge: {rel} doctrine block would be {real_action} "
                f"(version {version}) — mode=manual, run /hyperflow:bridge refresh to apply"
            )
        else:
            print(
                f"hyperflow bridge: {rel} doctrine block {action} (version {version}) "
                f"— mode=auto · /hyperflow:bridge mode manual to require manual refreshes"
            )

    return 0  # always non-blocking


if __name__ == "__main__":
    sys.exit(main(sys.argv))
