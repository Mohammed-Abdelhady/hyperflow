#!/usr/bin/env python3
"""hook-runtime.py — normalized Hyperflow hook lifecycle core + provider encoders.

Pure-ish core used by thin shell launchers (hooks/session-start, hooks/pre-compact).

Normalized events (config/providers.json lifecycle_event_names):
  session.start | session.after_clear | session.before_compact | session.after_compact

Provider encodings (documented only):
  Claude SessionStart → {"type": "system-prompt-inject", "content": "..."}
  Codex SessionStart  → hookSpecificOutput.SessionStart.additionalContext
                        (+ content dual key for backward-compat host/tests)
  Claude PreCompact block → {"decision": "block", "reason": "..."}
  Codex PreCompact block  → {"continue": false, "stopReason"/"systemMessage": "..."}
                        (+ decision/reason dual keys for Claude-compat)

Security:
  - Payload paths are untrusted; project state writes stay under <project>/.hyperflow
  - Transcript reads are best-effort and never crash the session
  - No credential / blocked-file access

CLI:
  hook-runtime.py session-start [--plugin-root PATH] [--cwd PATH]
  hook-runtime.py pre-compact  [--plugin-root PATH] [--cwd PATH]

Always exits 0 (non-fatal). Malformed payload never corrupts state.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shlex
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_PLUGIN_ROOT = SCRIPT_DIR.parent

# Keep detect-provider import local to the scripts directory without install.
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

try:
    import detect_provider as dp  # type: ignore
except ImportError:  # pragma: no cover - load by path when module name differs
    import importlib.util

    _spec = importlib.util.spec_from_file_location(
        "detect_provider", SCRIPT_DIR / "detect-provider.py"
    )
    assert _spec and _spec.loader
    dp = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(dp)

NORMALIZED_EVENTS = frozenset(
    {
        "session.start",
        "session.after_clear",
        "session.before_compact",
        "session.after_compact",
    }
)

HOST_SESSION_START = frozenset({"SessionStart", "sessionstart", "session_start"})
HOST_PRE_COMPACT = frozenset({"PreCompact", "precompact", "pre_compact", "Pre-Compact"})

# Codex SessionStart source values (official docs).
SOURCE_TO_EVENT = {
    "startup": "session.start",
    "resume": "session.start",
    "clear": "session.after_clear",
    "compact": "session.after_compact",
}

# Claude SessionStart matcher values often mirror these names.
MATCHER_TO_EVENT = {
    "startup": "session.start",
    "clear": "session.after_clear",
    "compact": "session.after_compact",
    "resume": "session.start",
}

UPDATE_CACHE_MINUTES = 1440
PRECOMPACT_RECOVERY_MINUTES = 60
DEFAULT_CONTEXT_WINDOW = 200_000
DEFAULT_AUTO_COMPACT_MIN_PERCENT = 72
DEFAULT_READY_TTL_MINUTES = 30

# Install-mode → update command templates. Source uses a shell-safe quoted root.
UPDATE_COMMANDS = {
    "codex-marketplace": "codex plugin marketplace upgrade hyperflow-marketplace",
    "claude-marketplace": "claude plugin update hyperflow@hyperflow-marketplace",
    # plugin_root is injected via shlex.quote in select_update_command — never raw.
    "source-checkout": "git -C {plugin_root} pull --ff-only",
}

# Cap untrusted transcript reads for auto-compact token estimation.
MAX_TRANSCRIPT_READ_BYTES = 8 * 1024 * 1024


# ─── Data types ───────────────────────────────────────────────────────────────


@dataclass
class HookPayload:
    """Parsed host payload. Fields default safe when missing/malformed."""

    raw: dict[str, Any] = field(default_factory=dict)
    cwd: str = ""
    transcript_path: str = ""
    trigger: str = "auto"
    source: str = ""
    hook_event_name: str = ""
    session_id: str = ""
    model: str = ""
    malformed: bool = False


@dataclass
class CompactDecision:
    """Decision for automatic compaction gating."""

    action: str  # "allow" | "block"
    reason: str = ""
    consume_marker: bool = False


@dataclass
class SessionContext:
    plugin_root: Path
    project_root: Path
    hf_dir: Path | None
    provider: str
    install_mode: str
    version: str
    mode: str  # lean | default | thorough
    home: Path
    event: str


# ─── Payload / event normalization ────────────────────────────────────────────


def parse_payload(raw_text: str | bytes | None) -> HookPayload:
    """Parse stdin JSON. Never raises; malformed → empty payload + flag."""
    if raw_text is None:
        return HookPayload()
    if isinstance(raw_text, bytes):
        try:
            raw_text = raw_text.decode("utf-8", errors="replace")
        except Exception:
            return HookPayload(malformed=True)
    text = raw_text.strip()
    if not text:
        return HookPayload()
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError, ValueError):
        return HookPayload(malformed=True)
    if not isinstance(data, dict):
        return HookPayload(malformed=True)

    cwd = _as_str(data.get("cwd"))
    transcript = _as_str(
        data.get("transcript_path")
        or data.get("transcriptPath")
        or data.get("transcript")
    )
    trigger = _as_str(
        data.get("trigger") or data.get("compaction_trigger") or data.get("source")
    )
    if not trigger:
        trigger = "auto"
    source = _as_str(data.get("source"))
    hook_event = _as_str(
        data.get("hook_event_name") or data.get("hookEventName") or data.get("event")
    )
    return HookPayload(
        raw=data,
        cwd=cwd,
        transcript_path=transcript,
        trigger=trigger.lower(),
        source=source.lower(),
        hook_event_name=hook_event,
        session_id=_as_str(data.get("session_id") or data.get("sessionId")),
        model=_as_str(data.get("model")),
        malformed=False,
    )


def normalize_event(
    host_event: str | None,
    payload: HookPayload,
    *,
    default_for_session: str = "session.start",
) -> str:
    """Map host event + payload → normalized lifecycle event name.

    Unsupported host events return the empty string (caller reports honestly).
    """
    name = (host_event or payload.hook_event_name or "").strip()
    name_key = name.replace("-", "").replace("_", "").lower()

    if name in HOST_SESSION_START or name_key == "sessionstart":
        source = payload.source or payload.trigger
        if source in SOURCE_TO_EVENT:
            return SOURCE_TO_EVENT[source]
        if source in MATCHER_TO_EVENT:
            return MATCHER_TO_EVENT[source]
        return default_for_session

    if name in HOST_PRE_COMPACT or name_key == "precompact":
        return "session.before_compact"

    # Allow callers to pass already-normalized names.
    if name in NORMALIZED_EVENTS:
        return name

    # CLI modes without host name: infer from defaults.
    if not name:
        return default_for_session

    return ""


# ─── Path resolution (untrusted paths contained) ──────────────────────────────


def _as_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def resolve_plugin_root(
    environ: Mapping[str, str] | None = None,
    *,
    explicit: str | Path | None = None,
    fallback: Path | None = None,
) -> Path:
    """Resolve plugin root: explicit → env (CODEX then CLAUDE) → fallback → default."""
    env = environ if environ is not None else os.environ
    if explicit:
        return Path(explicit).expanduser().resolve()
    for key in ("CODEX_PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT", "PLUGIN_ROOT"):
        value = env.get(key, "").strip()
        if value:
            try:
                return Path(value).expanduser().resolve()
            except OSError:
                return Path(value).expanduser()
    if fallback is not None:
        try:
            return fallback.resolve()
        except OSError:
            return fallback
    return DEFAULT_PLUGIN_ROOT


def find_hyperflow_dir(start: Path | str | None) -> Path | None:
    """Walk up from start for .hyperflow/. Stop at git root or filesystem root."""
    if start is None:
        return None
    try:
        d = Path(start).expanduser().resolve()
    except OSError:
        d = Path(start).expanduser()
    # Contain: never follow into blocked credential locations as *search roots*
    # beyond normal project resolution; we only look for .hyperflow directories.
    seen: set[Path] = set()
    while True:
        if d in seen:
            break
        seen.add(d)
        candidate = d / ".hyperflow"
        if candidate.is_dir():
            return candidate
        if (d / ".git").exists():
            return None
        parent = d.parent
        if parent == d:
            break
        d = parent
    return None


def project_root_from_hf(hf_dir: Path | None, cwd: Path) -> Path:
    if hf_dir is not None:
        return hf_dir.parent
    return cwd


def contain_under(path: Path, root: Path) -> Path | None:
    """Return resolved path if it is under root; else None."""
    try:
        resolved = path.expanduser().resolve()
        root_r = root.expanduser().resolve()
    except OSError:
        return None
    try:
        resolved.relative_to(root_r)
    except ValueError:
        return None
    return resolved


def safe_project_state_path(hf_dir: Path, name: str) -> Path | None:
    """Resolve a state file name under .hyperflow only (no path traversal)."""
    if not name or name.startswith("/") or ".." in Path(name).parts:
        return None
    candidate = (hf_dir / name).resolve()
    try:
        candidate.relative_to(hf_dir.resolve())
    except (ValueError, OSError):
        return None
    return candidate


# ─── Provider / install / update ──────────────────────────────────────────────


def detect_runtime_provider(
    environ: Mapping[str, str] | None = None,
    plugin_root: Path | None = None,
) -> tuple[str, str]:
    """Return (provider_key, install_mode). Falls back to shell-style labels."""
    env = dict(environ if environ is not None else os.environ)
    registry, errors = dp.load_registry(plugin_root or DEFAULT_PLUGIN_ROOT)
    if errors or not registry:
        # Fallback detection matching hooks/session-start order.
        pairs = (
            ("CLAUDE_CODE", "claude-code"),
            ("CURSOR", "cursor"),
            ("OPENCODE", "opencode"),
            ("CODEX", "codex"),
            ("ANTIGRAVITY", "antigravity"),
        )
        provider = "unknown"
        for prefix, label in pairs:
            if any(k == prefix or k.startswith(prefix + "_") for k in env):
                provider = label
                break
        install_mode = dp.detect_install_mode(plugin_root, environ=env)
        return provider, install_mode

    detection = dp.detect_provider(registry, environ=env, root=plugin_root)
    provider = detection.get("provider") or "unknown"
    root = detection.get("plugin_root") or (
        str(plugin_root) if plugin_root is not None else None
    )
    install_mode = dp.detect_install_mode(root, environ=env)
    return str(provider), str(install_mode)


def select_update_command(
    install_mode: str,
    plugin_root: Path | str,
    *,
    provider: str = "",
) -> str | None:
    """Choose update command from confirmed install mode only.

    git pull --ff-only only when install_mode is source-checkout.
    Marketplace caches that contain .git remain marketplace.
    unknown → None (no false upgrade path).
    plugin_root is always shell-quoted so metacharacters cannot inject.
    """
    mode = (install_mode or "unknown").strip()
    if mode == "source-checkout":
        quoted = shlex.quote(str(plugin_root))
        return UPDATE_COMMANDS["source-checkout"].format(plugin_root=quoted)
    if mode == "codex-marketplace":
        return UPDATE_COMMANDS["codex-marketplace"]
    if mode == "claude-marketplace":
        return UPDATE_COMMANDS["claude-marketplace"]
    # Provider hint when mode unknown but env clearly marketplace-less source.
    if mode == "unknown" and provider in {"codex", "claude-code"}:
        return None
    return None


def is_safe_transcript_path(
    transcript_path: str | Path,
    *,
    project_root: Path | None = None,
    home: Path | str | None = None,
    environ: Mapping[str, str] | None = None,
) -> bool:
    """Allowlist untrusted transcript_path to known roots only.

    Accepts files under: project_root, home, TMPDIR/temp, and common host
    transcript directories. Rejects path escape and non-files.
    """
    env = environ if environ is not None else os.environ
    try:
        path = Path(transcript_path).expanduser().resolve(strict=False)
    except (OSError, RuntimeError, ValueError):
        return False
    if not path.is_file():
        return False

    # Reject credential-shaped basenames even if they sit under an allowlisted root.
    blocked_names = {
        ".env",
        ".env.local",
        ".env.production",
        "credentials",
        "credentials.json",
        "id_rsa",
        "id_ed25519",
        "id_ecdsa",
        ".npmrc",
        ".pypirc",
        "secrets.yaml",
        "secrets.yml",
        "service-account.json",
    }
    name_l = path.name.lower()
    if name_l in blocked_names or name_l.endswith(".pem") or name_l.endswith(".key"):
        return False
    # Path segments that should never be treated as transcripts.
    blocked_parts = {".ssh", ".aws", ".gnupg", ".docker"}
    try:
        if any(part.lower() in blocked_parts for part in path.parts):
            return False
    except Exception:
        return False

    candidates: list[Path] = []
    if project_root is not None:
        try:
            candidates.append(Path(project_root).resolve())
        except (OSError, RuntimeError):
            pass
    if home is not None:
        try:
            candidates.append(Path(home).expanduser().resolve())
        except (OSError, RuntimeError):
            pass
    for key in ("TMPDIR", "TMP", "TEMP"):
        raw = env.get(key)
        if raw:
            try:
                candidates.append(Path(raw).expanduser().resolve())
            except (OSError, RuntimeError):
                pass
    # Host transcript caches (Claude / Codex) when present as real dirs.
    for fragment in (
        Path.home() / ".claude" / "projects",
        Path.home() / ".codex" / "sessions",
        Path.home() / ".codex" / "transcripts",
    ):
        try:
            if fragment.is_dir():
                candidates.append(fragment.resolve())
        except (OSError, RuntimeError):
            pass

    for root in candidates:
        try:
            path.relative_to(root)
            return True
        except ValueError:
            continue
    return False


def version_tuple(version: str) -> tuple[int, ...]:
    core = version.split("-")[0]
    parts: list[int] = []
    for piece in core.split(".")[:3]:
        try:
            parts.append(int(piece))
        except ValueError:
            parts.append(0)
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts)


def is_newer_version(current: str, latest: str) -> bool:
    try:
        return version_tuple(latest) > version_tuple(current)
    except Exception:
        return False


def read_version(plugin_root: Path) -> str:
    path = plugin_root / "skills" / "hyperflow" / "VERSION"
    try:
        text = path.read_text(encoding="utf-8").strip()
        return text or "unknown"
    except OSError:
        return "unknown"


def resolve_mode(project_root: Path, plugin_root: Path) -> str:
    script = plugin_root / "scripts" / "resolve-mode.py"
    if script.is_file():
        try:
            result = subprocess.run(
                [sys.executable, str(script), str(project_root)],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
            mode = (result.stdout or "").strip().splitlines()
            word = mode[0].strip() if mode else "lean"
            if word in {"lean", "default", "thorough"}:
                return word
        except (OSError, subprocess.SubprocessError):
            pass
    # Inline fallback
    mode_file = project_root / ".hyperflow" / ".mode"
    try:
        word = mode_file.read_text(encoding="utf-8").strip().lower()
        if word in {"lean", "default", "thorough"}:
            return word
    except OSError:
        pass
    return "lean"


# ─── Encoders ─────────────────────────────────────────────────────────────────


def encode_claude_session_start(content: str) -> dict[str, Any]:
    """Claude Code documented SessionStart / system-prompt inject encoding."""
    return {
        "type": "system-prompt-inject",
        "content": content,
    }


def encode_codex_session_start(content: str) -> dict[str, Any]:
    """Codex SessionStart encoding (additionalContext) + backward-compat keys.

    Official shape uses hookSpecificOutput.additionalContext. Dual `type` /
    `content` keys preserve existing host/test parsers that still read the
    Claude-compatible system-prompt-inject envelope.
    """
    return {
        "type": "system-prompt-inject",
        "content": content,
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": content,
        },
    }


def encode_claude_precompact_block(reason: str) -> dict[str, Any]:
    return {"decision": "block", "reason": reason}


def encode_codex_precompact_block(reason: str) -> dict[str, Any]:
    """Codex PreCompact stop encoding + Claude-compat decision/reason dual keys."""
    return {
        "continue": False,
        "stopReason": reason,
        "systemMessage": reason,
        "decision": "block",
        "reason": reason,
    }


def encode_session_start(provider: str, content: str) -> dict[str, Any]:
    if provider == "codex":
        return encode_codex_session_start(content)
    return encode_claude_session_start(content)


def encode_precompact_block(provider: str, reason: str) -> dict[str, Any]:
    if provider == "codex":
        return encode_codex_precompact_block(reason)
    return encode_claude_precompact_block(reason)


def reject_undocumented_encoding(name: str) -> None:
    """Raise ValueError for encodings outside the documented set."""
    allowed = {
        "claude-session-start",
        "codex-session-start",
        "claude-precompact-block",
        "codex-precompact-block",
    }
    if name not in allowed:
        raise ValueError(f"undocumented encoding rejected: {name}")


# ─── Compaction safeguards ────────────────────────────────────────────────────


def _as_int(value: Any, default: int, minimum: int, maximum: int | None = None) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    if parsed < minimum:
        return default
    if maximum is not None and parsed > maximum:
        return default
    return parsed


def load_context_config(home: Path | str | None) -> dict[str, Any]:
    if not home:
        return {}
    config_path = Path(home) / ".hyperflow" / "config.json"
    try:
        with open(config_path, encoding="utf-8") as f:
            cfg = json.load(f)
        raw = cfg.get("context", {})
        return raw if isinstance(raw, dict) else {}
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        return {}


def strings_from_message(value: Any):
    if isinstance(value, str):
        if value.startswith("/") and len(value) < 300:
            return
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from strings_from_message(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            if key in {
                "content",
                "text",
                "thinking",
                "summary",
                "result",
                "message",
                "reason",
            }:
                yield from strings_from_message(item)


def estimate_transcript_tokens(
    transcript_path: Path,
    *,
    max_bytes: int = MAX_TRANSCRIPT_READ_BYTES,
) -> int:
    chars = 0
    bytes_read = 0
    try:
        with open(transcript_path, encoding="utf-8", errors="ignore") as f:
            for line in f:
                encoded = line.encode("utf-8", errors="ignore")
                bytes_read += len(encoded)
                if bytes_read > max_bytes:
                    break
                try:
                    row = json.loads(line)
                except (json.JSONDecodeError, TypeError, ValueError):
                    continue
                if not isinstance(row, dict):
                    continue
                for key in ("message", "content", "tool_input", "tool_result", "summary"):
                    if key in row:
                        for text in strings_from_message(row[key]):
                            chars += len(text)
    except OSError:
        return 0
    if chars <= 0:
        return 0
    return math.ceil(chars / 3.6)


def evaluate_auto_compact(
    trigger: str,
    transcript_path: str | None,
    ready_path: Path | None,
    home: Path | str | None,
    *,
    now: float | None = None,
    environ: Mapping[str, str] | None = None,
) -> CompactDecision | None:
    """Return CompactDecision for auto compact, or None when permissive.

    Manual/unknown triggers → None (always allow; still write snapshot).
    Auto without fresh marker → block.
    Stale marker → consume + block.
    Missing transcript after ready → consume + allow (None) so recovery is not worse.
    Below percent threshold → block (marker kept).
    At/above threshold → allow and consume marker.
    """
    env = environ if environ is not None else os.environ
    trig = (trigger or "auto").lower()
    if trig not in {"auto", "automatic"}:
        return None

    context_cfg = load_context_config(home)
    window = _as_int(
        env.get("HYPERFLOW_CONTEXT_WINDOW_TOKENS") or context_cfg.get("windowTokens"),
        DEFAULT_CONTEXT_WINDOW,
        10000,
    )
    min_percent = _as_int(
        env.get("HYPERFLOW_AUTO_COMPACT_MIN_PERCENT")
        or context_cfg.get("autoCompactMinPercent"),
        DEFAULT_AUTO_COMPACT_MIN_PERCENT,
        1,
        99,
    )
    ready_ttl_minutes = _as_int(
        env.get("HYPERFLOW_AUTO_COMPACT_READY_TTL_MINUTES")
        or context_cfg.get("autoCompactReadyTtlMinutes"),
        DEFAULT_READY_TTL_MINUTES,
        1,
        1440,
    )

    if ready_path is None or not ready_path.is_file():
        return CompactDecision(
            action="block",
            reason=(
                "Hyperflow skipped automatic compaction: dispatch has not reached its "
                "end-of-chain gate yet. Continue the run; dispatch marks compact "
                "readiness only after wrap-up."
            ),
            consume_marker=False,
        )

    clock = time.time() if now is None else now
    try:
        age_seconds = clock - ready_path.stat().st_mtime
    except OSError:
        age_seconds = ready_ttl_minutes * 60 + 1

    if age_seconds > ready_ttl_minutes * 60:
        return CompactDecision(
            action="block",
            reason=(
                "Hyperflow skipped automatic compaction: the dispatch-end compact "
                f"marker is older than {ready_ttl_minutes} minutes. Continue the run; "
                "the next completed dispatch will refresh it."
            ),
            consume_marker=True,
        )

    if not transcript_path:
        return CompactDecision(action="allow", reason="", consume_marker=True)

    tpath = Path(transcript_path)
    # Untrusted host path: allowlist roots + regular file + size-capped read.
    project_guess: Path | None = None
    if ready_path is not None:
        try:
            # ready_path is typically <project>/.hyperflow/.dispatch-auto-compact-ready
            project_guess = ready_path.resolve().parent.parent
        except (OSError, RuntimeError):
            project_guess = None
    if not is_safe_transcript_path(
        tpath,
        project_root=project_guess,
        home=home,
        environ=env,
    ):
        return CompactDecision(action="allow", reason="", consume_marker=True)

    tokens = estimate_transcript_tokens(tpath)
    if tokens <= 0:
        # Permissive when estimate fails — doctrine: do not worsen true recovery.
        return CompactDecision(action="allow", reason="", consume_marker=False)

    percent = min(100, math.ceil(tokens * 100 / window))
    if percent < min_percent:
        return CompactDecision(
            action="block",
            reason=(
                f"Hyperflow skipped automatic compaction: estimated context usage is "
                f"{percent}% ({tokens:,}/{window:,} tokens), below the configured "
                f"{min_percent}% threshold. Continue the run; compact closer to the limit."
            ),
            consume_marker=False,
        )

    return CompactDecision(action="allow", reason="", consume_marker=True)


def consume_marker(path: Path | None) -> None:
    if path is None:
        return
    try:
        path.unlink(missing_ok=True)  # type: ignore[call-arg]
    except TypeError:
        # Python <3.8 style
        try:
            if path.is_file():
                path.unlink()
        except OSError:
            pass
    except OSError:
        pass


# ─── Session content builders ─────────────────────────────────────────────────


def _codex_entries() -> str:
    return """## Codex function aliases

Codex loads Hyperflow as plugin skills, not as native Claude-style slash commands. Treat these user messages as aliases and run the matching skill workflow inline:

| User says | Run |
|---|---|
| `/hyperflow:plan`, `hyperflow plan` | `plan` |
| `/hyperflow:dispatch`, `hyperflow dispatch` | `dispatch` |
| `/hyperflow:workflow`, `hyperflow workflow` | `workflow` (Codex portable big-task workflow adapter) |
| `/hyperflow:trace`, `hyperflow trace` | `trace` |
| `/hyperflow:audit`, `hyperflow audit` | `audit` |
| `/hyperflow:deploy`, `hyperflow deploy` | `deploy` |
| `/hyperflow:cache`, `hyperflow cache` | `cache` |
| `/hyperflow:status`, `hyperflow status` | `status` |
| `/hyperflow:sticky`, `hyperflow sticky` | `sticky` |
| `/hyperflow:bridge`, `hyperflow bridge` | `bridge` |
| `/hyperflow:flush`, `hyperflow flush` | `flush` |
| `/hyperflow:handoff`, `hyperflow handoff` | `handoff` |
| `/hyperflow:background`, `hyperflow background` | `background` |
| `/hyperflow:scaffold`, `hyperflow scaffold` | `scaffold` |

Never answer that `/hyperflow:*` is an unknown command in Codex. Strip the alias, load `skills/<name>/SKILL.md`, and follow that workflow.

## Codex subagents and auto-chain

If the runtime exposes Codex multi-agent tools, map Hyperflow `Agent` calls to Codex subagents: worker/searcher/writer roles use worker or explorer subagents, and independent sibling workers run in parallel where possible. If the callable tool is named `multi_agent_v1.spawn_agent`, use `agent_type: worker` for implementer/writer execution and `agent_type: explorer` for search/codebase research. Every agent runs on the current session model — there is no thinking/worker model split.

If subagent tools are unavailable in this session, emulate worker/reviewer phases inline with clear labels and continue.

For `/hyperflow:workflow`, use the Codex portable workflow adapter: research and planning, `.hyperflow/tasks/` progress tracking when needed, parallel subagents when exposed, inline worker/reviewer phases otherwise, adversarial verification, quality gates, per-task conventional commits, and final synthesis. Do not describe this as native Claude Code dynamic workflow support.

Codex may not expose Claude Code's `Skill` handoff tool. Treat handoffs as inline continuation: `plan → dispatch`; selected `audit` / `deploy` follow-ups run inline; audit fix gates continue into `plan`. Do not stop with "Skill tool unavailable".

If `AskUserQuestion` is unavailable, print required gates as concise `Hyperflow Question` chat blocks and wait for the user's answer."""


def _claude_entries() -> str:
    return """## Direct entries

| Command | When to use |
|---|---|
| `/hyperflow:scaffold` | First-time setup — analyze project, build `.hyperflow/` cache, install shims |
| `/hyperflow:plan` | Design + decompose — sharpen the prompt, design the approach, write the batch file in `.hyperflow/tasks/` (bounces straight to decomposition when clear) |
| `/hyperflow:dispatch` | Run a planned task: dispatch workers in parallel with reviews at every step |
| `/hyperflow:workflow` | Big-task workflow lane: Claude Code native workflows; Codex/OpenCode portable adapter |
| `/hyperflow:trace` | Systematic root-cause analysis for any bug or test failure |
| `/hyperflow:audit` | Multi-level code review (L1–L5) on a diff, file, or PR |
| `/hyperflow:deploy` | Pre-push gates + commit + release + push |
| `/hyperflow:cache` | Read or curate `.hyperflow/memory/` |"""


def build_base_content(provider: str, version: str, mode: str, hf_dir: Path | None) -> str:
    tool_name = provider if provider != "unknown" else "unknown"
    if provider == "codex":
        invoke = (
            "Hyperflow is installed. Invoke it by saying `hyperflow <function>` "
            "or by typing a `/hyperflow:*` alias."
        )
        direct = _codex_entries()
    else:
        invoke = (
            "Hyperflow is installed. It is **not** always-on — invoke a skill "
            "explicitly when you need it."
        )
        direct = _claude_entries()

    full = f"""<!-- hyperflow-runtime: {tool_name} -->
# Hyperflow v{version}

{invoke}

## Canonical chain

Start from any skill — chain-starters auto-advance forward through the chain (with one Step-0 question: auto or manual).

`scaffold` → `spec` → `scope` → `dispatch` → `audit` → `deploy`

{direct}

## Big-task workflows

Route big tasks to `/hyperflow:workflow`: `flow=deep`, `flow=scientific`, `scope=system-wide`, large migrations, repo-wide audits, high-confidence verification, or prompts that say `run a workflow` / `dynamic workflow` / `big task`. In Claude Code v2.1.154 or later, the workflow skill asks the native dynamic workflow runtime to create a background workflow with Hyperflow research, parallel implementation or investigation, adversarial verification, quality gates, and final synthesis. Do not set `/effort ultracode` or `xhigh` automatically; the user may enable `/effort ultracode` manually for session-wide automatic workflow selection.

In Codex and OpenCode, `/hyperflow:workflow` runs the portable workflow adapter instead of native dynamic workflows. It keeps the same phases, uses provider subagents/tasks when exposed, falls back to inline worker/reviewer phases, runs quality gates, and commits each accepted unit separately. If the active runtime cannot preserve those phases, use the normal `scope → dispatch` path instead.

Shared doctrine (autonomy rules, output style, security) lives in [skills/hyperflow/DOCTRINE.md](skills/hyperflow/DOCTRINE.md) and is referenced by each skill when invoked."""

    if mode == "lean":
        if hf_dir is not None:
            lean_context = (
                "Project context stays on disk: `.hyperflow/memory/session-context.md`; "
                "memory index: `.hyperflow/memory/index.md`; active work: `.hyperflow/tasks/`. "
                "Read only what the task needs."
            )
        else:
            lean_context = (
                "No `.hyperflow/` cache is present. Use `/hyperflow:scaffold` when "
                "project analysis is needed."
            )
        return f"""<!-- hyperflow-runtime: {tool_name} -->
# Hyperflow v{version} · lean

Treat `/hyperflow:<name>` and `hyperflow <name>` as aliases for `skills/<name>/SKILL.md`; load the requested skill and `skills/hyperflow/DOCTRINE.md` on demand. Auto-route intent: brainstorm/design/scope/decompose → plan; build/add/refactor → inspect then run deterministic fast preflight (inline-fast or plan); debug/fix → trace; audit/review → audit; ship/push/release/deploy → deploy; big/system-wide → workflow. In Codex, map Agent calls to available subagents and run equivalent worker/reviewer phases inline when subagents are unavailable.

{lean_context}"""
    return full


def _run_helper(
    plugin_root: Path,
    script_name: str,
    args: Sequence[str],
    log_path: Path | None,
    *,
    timeout: int = 60,
) -> str:
    script = plugin_root / "scripts" / script_name
    if not script.is_file():
        return ""
    try:
        result = subprocess.run(
            [sys.executable, str(script), *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        if log_path is not None and result.stderr:
            try:
                with open(log_path, "a", encoding="utf-8") as log:
                    log.write(result.stderr)
            except OSError:
                pass
        return (result.stdout or "").strip()
    except (OSError, subprocess.SubprocessError) as exc:
        if log_path is not None:
            try:
                with open(log_path, "a", encoding="utf-8") as log:
                    log.write(f"{script_name}: {exc}\n")
            except OSError:
                pass
        return ""


def _file_mtime_within(path: Path, minutes: float, now: float | None = None) -> bool:
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return False
    clock = time.time() if now is None else now
    return (clock - mtime) <= minutes * 60


def _head_text(path: Path, lines: int) -> str:
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            out: list[str] = []
            for i, line in enumerate(f):
                if i >= lines:
                    break
                out.append(line.rstrip("\n"))
            return "\n".join(out)
    except OSError:
        return ""


def _append_section(content: str, title: str, body: str) -> str:
    body = body.rstrip()
    if not body:
        return content
    return f"{content}\n\n## {title}\n{body}"


def write_session_context(hf_dir: Path, log_path: Path | None) -> None:
    memory = hf_dir / "memory"
    if not memory.is_dir():
        return
    parts: list[str] = []
    for label, filename in (
        ("Profile", "profile.md"),
        ("Architecture", "architecture.md"),
        ("Conventions", "conventions.md"),
    ):
        parts.append(f"## {label}")
        src = hf_dir / filename
        if src.is_file():
            try:
                lines = src.read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                lines = []
            parts.extend(lines[:500])
            if len(lines) > 500:
                parts.append(
                    f"<!-- truncated: {filename} has {len(lines)} lines, showing first 500 -->"
                )
        else:
            parts.append(
                f"<!-- .hyperflow/{filename} not found — run /hyperflow:scaffold to populate -->"
            )
        parts.append("")
    try:
        (memory / "session-context.md").write_text("\n".join(parts) + "\n", encoding="utf-8")
    except OSError as exc:
        if log_path is not None:
            try:
                with open(log_path, "a", encoding="utf-8") as log:
                    log.write(f"session-context: {exc}\n")
            except OSError:
                pass


def memory_compaction_advisory(hf_dir: Path, home: Path, log_path: Path | None) -> str:
    checksums_path = hf_dir / "memory" / ".checksums"
    if not checksums_path.is_file():
        return ""
    threshold = 300
    config_path = home / ".hyperflow" / "config.json"
    try:
        with open(config_path, encoding="utf-8") as f:
            cfg = json.load(f)
        threshold = int(cfg.get("memory", {}).get("compactionThreshold", 300))
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        pass
    if threshold < 50:
        threshold = 300
    try:
        with open(checksums_path, encoding="utf-8") as f:
            checksums = json.load(f)
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        return ""
    if not isinstance(checksums, dict) or len(checksums) > 10000:
        return ""
    over = [
        (path, meta["lineCount"])
        for path, meta in checksums.items()
        if isinstance(meta, dict)
        and isinstance(meta.get("lineCount"), int)
        and meta["lineCount"] >= threshold
    ]
    if not over:
        return ""
    names = ", ".join(f"{os.path.basename(p)} ({lc} lines)" for p, lc in over)
    return f"- {names} — at or above {threshold}, run `/hyperflow:cache compact` when convenient"


def sticky_status_line(hf_dir: Path) -> str:
    path = hf_dir / ".sticky"
    state, since, trigger = "auto", "", "default"
    if path.is_file():
        try:
            for line in path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith("state:"):
                    state = line.split(":", 1)[1].strip()
                elif line.startswith("since:"):
                    since = line.split(":", 1)[1].strip()
                elif line.startswith("trigger:"):
                    trigger = line.split(":", 1)[1].strip()
        except OSError:
            return ""
    labels = {
        "on": (
            "Auto-routing: ON (full sticky) — every task-shaped message routes through hyperflow."
        ),
        "auto": (
            "Auto-routing: AUTO (default) — messages containing chain-starter verbs "
            "(audit, debug, fix, brainstorm, workflow, scope, deploy, review, …) auto-route."
        ),
        "off": (
            "Auto-routing: OFF — only explicit /hyperflow:* slash commands route. "
            "Re-enable with /hyperflow:sticky auto."
        ),
    }
    line_out = labels.get(state)
    if not line_out:
        return ""
    suffix: list[str] = []
    if since:
        suffix.append(f"since {since[:16].replace('T', ' ')}")
    if trigger and trigger != "default":
        suffix.append(f"trigger: {trigger}")
    if suffix:
        line_out += " · " + " · ".join(suffix)
    return line_out


def list_active_tasks(hf_dir: Path) -> str:
    lines: list[str] = []
    tasks = hf_dir / "tasks"
    if tasks.is_dir():
        for tf in sorted(tasks.glob("*.md")):
            if tf.is_file():
                lines.append(f"- {tf.name}")
    features = hf_dir / "features"
    if features.is_dir():
        for fd in sorted(features.iterdir()):
            if not fd.is_dir():
                continue
            if not (fd / "feature.md").is_file():
                continue
            phases = list(fd.glob("phase-*/"))
            lines.append(f"- {fd.name}/ (feature · {len(phases)} phases)")
    return "\n".join(lines)


def list_handoffs(project_root: Path) -> str:
    handoff_dir = project_root / ".hyperflow-handoff"
    if not handoff_dir.is_dir():
        return ""
    lines: list[str] = []
    try:
        packages = sorted(p for p in handoff_dir.iterdir() if p.is_dir())
    except OSError:
        return ""
    for hp in packages:
        status_path = hp / "STATUS"
        if not status_path.is_file():
            continue
        try:
            st = status_path.read_text(encoding="utf-8").splitlines()
            st_val = (st[0] if st else "").strip()
        except OSError:
            continue
        slug = hp.name
        if st_val == "planned":
            lines.append(
                f"- `{slug}` awaiting build — run `/hyperflow:dispatch {slug}` "
                f"(or `/hyperflow:handoff pickup {slug}`)"
            )
        elif st_val == "built":
            rng = ""
            completion = hp / "COMPLETION.md"
            if completion.is_file():
                try:
                    text = completion.read_text(encoding="utf-8", errors="replace")
                    m = re.search(r"[0-9a-f]{7,40}\.\.[0-9a-f]{7,40}", text)
                    if m:
                        rng = m.group(0)
                except OSError:
                    pass
            lines.append(
                f"- `{slug}` built — run `/hyperflow:audit {rng}` "
                f"(or `/hyperflow:handoff review {slug}`)"
            )
        elif st_val == "reviewed":
            lines.append(
                f"- `{slug}` reviewed — `/hyperflow:handoff complete {slug}` to archive"
            )
    return "\n".join(lines)


def check_update_notice(
    version: str,
    home: Path,
    plugin_root: Path,
    install_mode: str,
    provider: str,
    *,
    now: float | None = None,
    allow_network: bool | None = None,
) -> str:
    """Return update section body or empty. Offline → no false claim."""
    if version == "unknown":
        return ""
    if allow_network is None:
        allow_network = os.environ.get("HYPERFLOW_HOOK_OFFLINE", "") not in {
            "1",
            "true",
            "yes",
        }
    cache_dir = home / ".hyperflow"
    cache_file = cache_dir / ".update-check"
    latest = ""
    cache_fresh = cache_file.is_file() and _file_mtime_within(
        cache_file, UPDATE_CACHE_MINUTES, now=now
    )
    if cache_fresh:
        try:
            latest = cache_file.read_text(encoding="utf-8").strip()
        except OSError:
            latest = ""
    elif allow_network:
        try:
            result = subprocess.run(
                [
                    "git",
                    "ls-remote",
                    "--tags",
                    "--refs",
                    "--sort=-v:refname",
                    "https://github.com/Mohammed-Abdelhady/hyperflow.git",
                    "v*",
                ],
                capture_output=True,
                text=True,
                timeout=4,
                check=False,
            )
            if result.returncode == 0 and result.stdout:
                first = result.stdout.splitlines()[0]
                # format: <sha>\trefs/tags/vX.Y.Z
                if "\t" in first:
                    ref = first.split("\t", 1)[1]
                    m = re.search(r"v([^/]+)$", ref)
                    if m:
                        latest = m.group(1)
            if latest:
                try:
                    cache_dir.mkdir(parents=True, exist_ok=True)
                    cache_file.write_text(latest, encoding="utf-8")
                except OSError:
                    pass
        except (OSError, subprocess.SubprocessError):
            # Offline / timeout: leave latest empty — no false update claim.
            latest = ""
    else:
        # Explicit offline: do not use stale cache as a fresh claim when the
        # caller forbids network and the cache is not within the TTL window.
        latest = ""

    if not latest or latest == version:
        return ""
    if not is_newer_version(version, latest):
        return ""
    update_cmd = select_update_command(install_mode, plugin_root, provider=provider)
    if not update_cmd:
        # Unknown install path — surface the version delta without inventing a command.
        update_cmd = (
            "follow the install docs for your host "
            "(marketplace upgrade or confirmed source `git pull --ff-only`)"
        )
    return (
        f"<!-- hyperflow-update current={version} latest={latest} -->\n"
        f"A newer Hyperflow is available — **v{version} → v{latest}**. Before acting on "
        f"the user's request this session, tell them an update is available and use "
        f"**AskUserQuestion** to ask whether to update now (options: `Update now` / `Skip`). "
        f"On `Update now`, run `{update_cmd}`, confirm it succeeded, then continue with their "
        f"request on the new version. On `Skip`, proceed on the current version. Ask at most "
        f"once per session."
    )


def enrich_session_content(ctx: SessionContext, content: str) -> str:
    """Apply project-scoped session-start enrichment. Writes only under .hyperflow."""
    hf_dir = ctx.hf_dir
    if hf_dir is None:
        # Still run update check without project state.
        notice = check_update_notice(
            ctx.version,
            ctx.home,
            ctx.plugin_root,
            ctx.install_mode,
            ctx.provider,
        )
        if notice:
            content = _append_section(content, "Hyperflow update available", notice)
        return content

    log_path = hf_dir / ".session-start.log"

    # Post-compaction recovery
    precompact = hf_dir / ".precompact.md"
    if precompact.is_file() and _file_mtime_within(precompact, PRECOMPACT_RECOVERY_MINUTES):
        try:
            recovery = precompact.read_text(encoding="utf-8", errors="replace")
            if recovery.strip():
                content = f"{content}\n\n{recovery.rstrip()}"
        except OSError:
            pass
    # Always consume once (even if stale) — matches shell rm -f behaviour.
    consume_marker(precompact)

    # Cache migration
    mig = _run_helper(
        ctx.plugin_root,
        "migrate-cache.py",
        [str(hf_dir), ctx.version, "--plugin-root", str(ctx.plugin_root)],
        log_path,
    )
    if mig:
        content = _append_section(content, "Hyperflow cache migrated", mig)

    # Archive
    _run_helper(
        ctx.plugin_root,
        "archive-artefacts.py",
        [str(hf_dir)],
        log_path,
    )

    # Session context bundle
    write_session_context(hf_dir, log_path)

    # Full-mode project snapshot
    if ctx.mode != "lean":
        snap_parts: list[str] = []
        for name in ("profile.md", "architecture.md", "conventions.md"):
            path = hf_dir / name
            if path.is_file():
                snap_parts.append(f"### {name}\n{_head_text(path, 20)}")
        if snap_parts:
            content = _append_section(content, "Project Snapshot", "\n".join(snap_parts))

    # Memory index (always rebuild when possible)
    hot_mem = ""
    if (hf_dir / "memory").is_dir():
        hot_mem = _run_helper(
            ctx.plugin_root,
            "memory-index.py",
            [str(hf_dir)],
            log_path,
        )
    if ctx.mode != "lean":
        index_path = hf_dir / "memory" / "index.md"
        if index_path.is_file():
            content = _append_section(
                content, "Project Memory Index", _head_text(index_path, 200)
            )
        if hot_mem:
            content = f"{content}\n\n{hot_mem}"

    advisory = memory_compaction_advisory(hf_dir, ctx.home, log_path)
    if advisory:
        content = _append_section(content, "Memory Compaction Advisory", advisory)

    # Auto-bridge
    bridge_line = _run_helper(
        ctx.plugin_root,
        "auto-bridge.py",
        [str(ctx.plugin_root), str(ctx.project_root)],
        log_path,
    )
    if bridge_line:
        content = _append_section(content, "CLAUDE.md auto-bridge", bridge_line)

    sticky = sticky_status_line(hf_dir)
    if sticky and ctx.mode != "lean":
        content = _append_section(content, "Auto-routing status", sticky)

    if ctx.mode != "lean":
        tlist = list_active_tasks(hf_dir)
        if tlist:
            content = _append_section(
                content, "Active Tasks (incomplete from prior sessions)", tlist
            )

    hlist = list_handoffs(ctx.project_root)
    if hlist:
        content = _append_section(content, "Handoff pending", hlist)

    if ctx.mode == "lean":
        lean_line = _run_helper(
            ctx.plugin_root,
            "lean-summary.py",
            [str(ctx.plugin_root), str(ctx.project_root)],
            log_path,
        )
        if lean_line:
            content = _append_section(content, "Hyperflow status (lean mode)", lean_line)

    notice = check_update_notice(
        ctx.version,
        ctx.home,
        ctx.plugin_root,
        ctx.install_mode,
        ctx.provider,
    )
    if notice:
        content = _append_section(content, "Hyperflow update available", notice)

    return content


# ─── Pre-compact snapshot ─────────────────────────────────────────────────────


def write_precompact_snapshot(
    hf_dir: Path,
    project_root: Path,
    trigger: str,
) -> Path | None:
    """Write recovery snapshot under .hyperflow/.precompact.md only."""
    snap = safe_project_state_path(hf_dir, ".precompact.md")
    if snap is None:
        return None
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    parts: list[str] = [
        f"<!-- hyperflow precompact snapshot · {now} · trigger={trigger or 'auto'} -->",
        "## Recovered context (post-compaction)",
        "The conversation was just compacted mid-run. Re-orient from the durable "
        "state below before continuing — do not assume earlier turns are still in context.",
        "",
    ]

    tasks = hf_dir / "tasks"
    if tasks.is_dir():
        task_files = sorted(p for p in tasks.glob("*.md") if p.is_file())
        if task_files:
            parts.append("### Active task files (resume here)")
            for f in task_files:
                parts.append(f"- `{f.name}`")
            parts.append("")

    for df in ("project-decisions.md", "decisions.md"):
        path = hf_dir / "memory" / df
        if path.is_file():
            parts.append(f"### Decisions ({df})")
            parts.append(_head_text(path, 40))
            parts.append("")
            break

    specs = hf_dir / "specs"
    if specs.is_dir():
        spec_files = sorted(p for p in specs.glob("*.md") if p.is_file())
        if spec_files:
            parts.append("### Open specs")
            for f in spec_files:
                parts.append(f"- `{f.name}`")
            parts.append("")

    anti = hf_dir / "memory" / "anti-patterns.md"
    if anti.is_file():
        parts.append("### Anti-patterns (hot — keep enforcing)")
        parts.append(_head_text(anti, 30))
        parts.append("")

    # Uncommitted diff — best-effort, never fails.
    try:
        staged = subprocess.run(
            ["git", "-C", str(project_root), "--no-pager", "diff", "--stat", "--cached"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        unstaged = subprocess.run(
            ["git", "-C", str(project_root), "--no-pager", "diff", "--stat"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        staged_out = (staged.stdout or "").strip()
        unstaged_out = (unstaged.stdout or "").strip()
        if staged_out or unstaged_out:
            parts.append("### Uncommitted changes so far")
            parts.append("```")
            if staged_out:
                parts.append("# staged")
                parts.append("\n".join(staged_out.splitlines()[:40]))
            if unstaged_out:
                parts.append("# unstaged")
                parts.append("\n".join(unstaged_out.splitlines()[:40]))
            parts.append("```")
    except (OSError, subprocess.SubprocessError):
        pass

    try:
        snap.write_text("\n".join(parts) + "\n", encoding="utf-8")
        return snap
    except OSError:
        return None


# ─── Top-level handlers ───────────────────────────────────────────────────────


def build_session_context(
    *,
    plugin_root: Path,
    cwd: Path,
    environ: Mapping[str, str] | None = None,
    event: str = "session.start",
) -> SessionContext:
    env = environ if environ is not None else os.environ
    provider, install_mode = detect_runtime_provider(env, plugin_root)
    hf_dir = find_hyperflow_dir(cwd)
    project_root = project_root_from_hf(hf_dir, cwd)
    version = read_version(plugin_root)
    mode = resolve_mode(project_root, plugin_root)
    home = Path(env.get("HOME") or "/tmp").expanduser()
    return SessionContext(
        plugin_root=plugin_root,
        project_root=project_root,
        hf_dir=hf_dir,
        provider=provider,
        install_mode=install_mode,
        version=version,
        mode=mode,
        home=home,
        event=event,
    )


def handle_session_start(
    payload: HookPayload,
    *,
    plugin_root: Path,
    cwd: Path | None = None,
    environ: Mapping[str, str] | None = None,
    host_event: str = "SessionStart",
) -> dict[str, Any]:
    """Run session start / after-clear / after-compact core; return encoded output."""
    env = environ if environ is not None else os.environ
    work_cwd = Path(payload.cwd) if payload.cwd else (cwd or Path.cwd())
    try:
        work_cwd = work_cwd.resolve()
    except OSError:
        pass

    event = normalize_event(host_event, payload, default_for_session="session.start")
    if event not in NORMALIZED_EVENTS:
        # Unsupported — exit empty success (no fabricated support).
        provider, _ = detect_runtime_provider(env, plugin_root)
        return encode_session_start(provider, "")

    ctx = build_session_context(
        plugin_root=plugin_root,
        cwd=work_cwd,
        environ=env,
        event=event,
    )
    content = build_base_content(ctx.provider, ctx.version, ctx.mode, ctx.hf_dir)
    content = enrich_session_content(ctx, content)
    return encode_session_start(ctx.provider, content)


def handle_pre_compact(
    payload: HookPayload,
    *,
    plugin_root: Path,
    cwd: Path | None = None,
    environ: Mapping[str, str] | None = None,
    host_event: str = "PreCompact",
    now: float | None = None,
) -> dict[str, Any] | None:
    """Run before-compact core. Returns block encoding or None (allow / no output)."""
    env = environ if environ is not None else os.environ
    work_cwd = Path(payload.cwd) if payload.cwd else (cwd or Path.cwd())
    try:
        work_cwd = work_cwd.resolve()
    except OSError:
        pass

    event = normalize_event(host_event, payload, default_for_session="session.before_compact")
    if event != "session.before_compact":
        return None

    provider, _ = detect_runtime_provider(env, plugin_root)
    hf_dir = find_hyperflow_dir(work_cwd)
    if hf_dir is None:
        return None

    project_root = hf_dir.parent
    ready = safe_project_state_path(hf_dir, ".dispatch-auto-compact-ready")
    home = Path(env.get("HOME") or "/tmp").expanduser()

    decision = evaluate_auto_compact(
        payload.trigger,
        payload.transcript_path or None,
        ready,
        home,
        now=now,
        environ=env,
    )

    # Always snapshot when we have a project (manual or auto that proceeds).
    # For blocked auto compact, still snapshot so a later manual compact can recover?
    # Original shell: snapshot always runs; block decision printed after.
    write_precompact_snapshot(hf_dir, project_root, payload.trigger or "auto")

    if decision is None:
        return None

    if decision.consume_marker:
        consume_marker(ready)

    if decision.action == "block":
        return encode_precompact_block(provider, decision.reason)

    # allow with optional consume already handled
    return None


# ─── CLI ──────────────────────────────────────────────────────────────────────


def _read_stdin() -> str:
    try:
        if sys.stdin.isatty():
            return ""
        return sys.stdin.read()
    except OSError:
        return ""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Hyperflow normalized hook runtime")
    parser.add_argument(
        "command",
        choices=("session-start", "pre-compact", "normalize-event"),
        help="Hook command to run",
    )
    parser.add_argument("--plugin-root", default=None, help="Plugin installation root")
    parser.add_argument("--cwd", default=None, help="Working directory override")
    parser.add_argument(
        "--host-event",
        default=None,
        help="Host event name (SessionStart, PreCompact, …)",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Disable network update checks (tests)",
    )
    args = parser.parse_args(argv)

    plugin_root = resolve_plugin_root(explicit=args.plugin_root)
    cwd = Path(args.cwd).resolve() if args.cwd else Path.cwd()
    raw = _read_stdin()
    payload = parse_payload(raw)

    # Malformed payload: non-fatal, no state writes beyond empty output.
    if payload.malformed and args.command != "normalize-event":
        # Still emit a minimal safe session inject so hosts that require JSON
        # do not hang; never write project state from bad input.
        if args.command == "session-start":
            provider, _ = detect_runtime_provider(os.environ, plugin_root)
            version = read_version(plugin_root)
            content = build_base_content(provider, version, "lean", None)
            print(json.dumps(encode_session_start(provider, content), ensure_ascii=False))
        return 0

    if args.command == "normalize-event":
        host = args.host_event or payload.hook_event_name or "SessionStart"
        print(normalize_event(host, payload))
        return 0

    if args.command == "session-start":
        host = args.host_event or payload.hook_event_name or "SessionStart"
        # Offline path: temporarily wrap update check via env flag.
        if args.offline:
            os.environ["HYPERFLOW_HOOK_OFFLINE"] = "1"
        out = handle_session_start(
            payload,
            plugin_root=plugin_root,
            cwd=cwd,
            host_event=host,
        )
        print(json.dumps(out, ensure_ascii=False))
        return 0

    if args.command == "pre-compact":
        host = args.host_event or payload.hook_event_name or "PreCompact"
        out = handle_pre_compact(
            payload,
            plugin_root=plugin_root,
            cwd=cwd,
            host_event=host,
        )
        if out is not None:
            print(json.dumps(out, ensure_ascii=False))
        return 0

    return 0


# Wire offline flag into check_update_notice without changing signature callers.
if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 — hooks must never fail the session
        print(f"hyperflow hook-runtime non-fatal error: {exc}", file=sys.stderr)
        sys.exit(0)
