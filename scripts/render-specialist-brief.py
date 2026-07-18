#!/usr/bin/env python3
"""render-specialist-brief.py — compose specialist charters for generic child agents.

Codex (and other hosts without Claude-native named-agent discovery) spawn generic
collaboration children. This renderer embeds a canonical ``agents/<name>.md``
charter into a deterministic child message: role marker, mission, bound standards
pointers, brief, context, security constraints, output contract, and capability
caveats.

Frontmatter ``tools:`` lists are **advisory intent only** on non-Claude hosts.
Real permission is enforced by the host sandbox/approval policy plus Hyperflow
security constraints — never presented as Codex tool enforcement.

Stdlib only. Offline. Deterministic.

Usage:
  render-specialist-brief.py --charter PATH|NAME --role ROLE --brief TEXT
  render-specialist-brief.py --charter security-reviewer --role reviewer \\
      --brief-file brief.md --context "…" --can-spawn false
  render-specialist-brief.py --charter debugger --role investigator \\
      --brief "…" --task-name-only

Roles: worker | reviewer | investigator | decision

Exit codes:
  0  success
  2  BLOCKED / unsafe input
  3  usage / parse error
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path
from typing import Any, Mapping

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_PLUGIN_ROOT = SCRIPT_DIR.parent

ROLES = ("worker", "reviewer", "investigator", "decision")

# Collaboration API task names: lowercase [a-z0-9-], bounded length.
_TASK_NAME_MAX = 80
_SLUG_MAX = 28
_HASH_LEN = 8

_FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.DOTALL)
_FIELD_RE = re.compile(
    r"^\*\*(?P<key>[^*]+):\*\*\s*(?P<value>.*?)(?=^\*\*[^*]+:\*\*|\Z)",
    re.MULTILINE | re.DOTALL,
)
_BINDS_RE = re.compile(
    r"\*\*Binds personas:\*\*\s*([^*]+?)(?:\s*·|\s*\*\*|$)", re.IGNORECASE
)
_FAMILY_RE = re.compile(r"\*\*Family:\*\*\s*([^*]+?)(?:\s*·|\s*\*\*|$)", re.IGNORECASE)
_DEFAULT_ROLE_RE = re.compile(
    r"\*\*Default role:\*\*\s*([^*]+?)(?:\s*·|\s*\*\*|$)", re.IGNORECASE
)

# Verbatim Hyperflow security floor (security.md worker injection, preserved).
SECURITY_CONSTRAINTS_BODY = """\
You MUST NOT:
- Read, modify, or reference files matching blocked patterns: .env, .env.*, *.pem, *.key,
  ~/.ssh/*, credentials.json, service-account*.json, ~/.aws/credentials, ~/.kube/config,
  ~/.config/gcloud/*, ~/.azure/*, id_rsa*, id_ed25519*, *.gpg, and related secret surfaces.
- Run destructive commands: rm -rf (root/home/cwd), git push --force to main/master,
  git reset --hard, sudo, chmod 777.
- Pipe file contents to external URLs via curl/wget/nc.
- Run package publish commands (npm publish, pip upload, gem push, cargo publish, etc.).
- Hardcode secrets, API keys, passwords, or connection strings in source code.

If a task requires accessing a blocked file or banned command, STOP and report:
BLOCKED: Task requires access to [resource] which is security-restricted.
"""

SECURITY_REVIEW_BODY = """\
After domain review, verify detective security rules:
1. No blocked files were read or modified.
2. No secrets/credentials hardcoded (sk-*, AKIA*, ghp_*, private keys, connection strings).
3. No dangerous commands executed (rm -rf, force push, sudo, chmod 777).
4. No data exfiltration (file contents piped to external URLs).

If ANY security violation is confirmed, respond:
SECURITY_VIOLATION: [specific violation]
This takes priority over all other review feedback and hard-halts the chain.
"""

ROLE_MANDATES: dict[str, str] = {
    "worker": (
        "- You are a **worker**. Implement or produce only what the brief owns.\n"
        "- **Never self-review** your own output. Do not emit review VERDICT blocks.\n"
        "- **Never coordinate** the chain: do not dispatch siblings, re-plan the batch, "
        "or ask structural user questions. Emit CONSULT/OVERSIZE/BLOCKED and stop.\n"
        "- Do not claim background notifications or host agent-type privileges."
    ),
    "reviewer": (
        "- You are a **reviewer**. Review only; **never implement** product code or "
        "edit files to 'fix' findings unless the brief is an explicit annotation-only pass.\n"
        "- **Never coordinate** the chain: do not dispatch siblings, re-order batches, "
        "or act as Team Lead.\n"
        "- Do not ask the user structural questions; hold the verdict and emit CONSULT "
        "if a peer domain judgment is required.\n"
        "- Workers never self-review — you are the independent gate."
    ),
    "investigator": (
        "- You are an **investigator**. Find root cause / evidence / map surfaces.\n"
        "- Prefer a findings block with path-anchored evidence over a review VERDICT.\n"
        "- Do **not** act as the final integration reviewer and do not coordinate the chain.\n"
        "- Fix-at-root only when the brief explicitly includes a scoped fix; otherwise report."
    ),
    "decision": (
        "- You are a **decision agent**. Analyze, recommend, and own the decision surface.\n"
        "- Do **not** implement product code as a worker and do not run as a code-review gate.\n"
        "- Do not coordinate the full chain as Team Lead; answer within the brief's decision scope.\n"
        "- Design-time peers may be consulted within budget; never override a security halt."
    ),
}

OUTPUT_CONTRACTS: dict[str, str] = {
    "worker": (
        "Return ONE of (no preamble/postamble):\n"
        "- **Completed** — one-line summary per change; notes for future tasks if any.\n"
        "- **OVERSIZE:** one-line reason + SUGGESTED-SPLIT block.\n"
        "- **CONSULT:** <peer> — <question> (+ optional CONSULT-CONTEXT).\n"
        "- **BLOCKED:** <reason>."
    ),
    "reviewer": (
        "Return the reviewer verdict block only:\n"
        "── Review ──────────────────────────────\n"
        "L1…L5 lines (pass/fail/skipped)\n"
        "────────────────────────────────────────\n"
        "VERDICT: APPROVED | NEEDS_FIX | SECURITY_VIOLATION\n"
        "Issues per failed level — one line each.\n"
        "Or CONSULT: <peer> — <question> (hold the verdict)."
    ),
    "investigator": (
        "Return a findings block — root cause or surface map + evidence chain "
        "(path:line anchors). Include Sources consulted: when research ran.\n"
        "Do not emit VERDICT: APPROVED | NEEDS_FIX as the primary contract.\n"
        "Or CONSULT / BLOCKED / OVERSIZE when applicable."
    ),
    "decision": (
        "Return a decision/findings block: dimensions analyzed, single recommendation, "
        "explicit trade-offs, and ADR flag when irreversible.\n"
        "Sources consulted: when research ran. No product implementation dump."
    ),
}


class RenderError(Exception):
    """Usage or parse failure (exit 3)."""


class BlockedError(Exception):
    """Unsafe input (exit 2); message should start with BLOCKED:."""


# --------------------------------------------------------------------------- #
# Frontmatter + charter parsing
# --------------------------------------------------------------------------- #


def parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """Split YAML-like frontmatter from body. Values stay as raw strings."""

    match = _FRONTMATTER_RE.match(text)
    if not match:
        return {}, text
    meta: dict[str, Any] = {}
    for line in match.group(1).splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        meta[key] = value
    body = text[match.end() :]
    return meta, body


def _clean_inline(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip())


def extract_charter_fields(body: str) -> dict[str, str]:
    """Pull Mission, checklist, output format, binds, family from charter body."""

    fields: dict[str, str] = {}
    for match in _FIELD_RE.finditer(body):
        key = match.group("key").strip().lower()
        value = match.group("value").strip()
        fields[key] = value

    # Dedicated inline extractors win over the block field scanner (first-line
    # charters pack Family · Binds · Default role on one line).
    binds_m = _BINDS_RE.search(body)
    family_m = _FAMILY_RE.search(body)
    default_m = _DEFAULT_ROLE_RE.search(body)
    if binds_m:
        fields["binds personas"] = _clean_inline(binds_m.group(1))
    if family_m:
        fields["family"] = _clean_inline(family_m.group(1))
    if default_m:
        fields["default role"] = _clean_inline(default_m.group(1))
    return fields


def tools_from_frontmatter(meta: Mapping[str, Any]) -> list[str]:
    raw = meta.get("tools")
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(t).strip() for t in raw if str(t).strip()]
    return [part.strip() for part in str(raw).split(",") if part.strip()]


# --------------------------------------------------------------------------- #
# Path safety
# --------------------------------------------------------------------------- #


def resolve_plugin_root(plugin_root: str | Path | None) -> Path:
    if plugin_root is None:
        return DEFAULT_PLUGIN_ROOT.resolve()
    return Path(plugin_root).expanduser().resolve()


def _is_under(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def resolve_charter_path(charter: str, plugin_root: Path) -> Path:
    """Resolve charter to a file under plugin_root/agents/. BLOCKED otherwise."""

    if not charter or not str(charter).strip():
        raise BlockedError("BLOCKED: empty charter path")

    raw = str(charter).strip()
    # Reject obvious secret / blocked surfaces by name.
    lowered = raw.lower().replace("\\", "/")
    blocked_tokens = (
        ".env",
        ".pem",
        "/.ssh/",
        "id_rsa",
        "id_ed25519",
        "/.aws/",
        "/.kube/",
        ".gnupg",
        "credentials.json",
        "service-account",
    )
    if any(tok in lowered for tok in blocked_tokens):
        raise BlockedError(f"BLOCKED: charter path matches security-restricted surface: {raw}")

    if "\x00" in raw:
        raise BlockedError("BLOCKED: charter path contains NUL")

    agents_dir = (plugin_root / "agents").resolve()
    if not agents_dir.is_dir():
        raise BlockedError(f"BLOCKED: agents directory missing under plugin root: {agents_dir}")

    candidate = Path(raw)
    options: list[Path] = []

    # Bare name → agents/<name>.md
    if candidate.suffix == "" and "/" not in raw and "\\" not in raw:
        options.append((agents_dir / f"{raw}.md").resolve())
    elif candidate.is_absolute():
        options.append(candidate.resolve())
    else:
        # Relative: try as agents/<path>, agents/<name>, and plugin-root-relative.
        options.append((agents_dir / candidate).resolve())
        options.append((agents_dir / candidate.name).resolve())
        options.append((plugin_root / candidate).resolve())
        if candidate.suffix == "":
            options.append((agents_dir / f"{candidate.name}.md").resolve())

    chosen: Path | None = None
    for opt in options:
        if _is_under(opt, agents_dir) and opt.is_file():
            chosen = opt
            break

    if chosen is None:
        # Prefer a specific escape message when every option left agents/.
        if options and not any(_is_under(opt, agents_dir) for opt in options):
            raise BlockedError(
                f"BLOCKED: charter path escapes agents/ under plugin root: {raw}"
            )
        raise BlockedError(f"BLOCKED: charter not found: {Path(raw).name}")

    if chosen.suffix.lower() != ".md":
        raise BlockedError(f"BLOCKED: charter must be a .md file: {chosen.name}")

    if chosen.name.upper() == "README.MD":
        raise BlockedError("BLOCKED: agents/README.md is not a specialist charter")

    return chosen


# --------------------------------------------------------------------------- #
# Stable task names
# --------------------------------------------------------------------------- #


def _slugify(text: str, max_len: int = _SLUG_MAX) -> str:
    s = text.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    if not s:
        return "task"
    if len(s) > max_len:
        s = s[:max_len].rstrip("-")
    return s or "task"


def stable_task_name(
    specialist: str,
    role: str,
    brief: str,
    *,
    salt: str = "",
) -> str:
    """Return a lowercase collision-safe collaboration task name.

    Format: ``{specialist}-{role}-{slug}-{hash8}`` truncated to 80 chars while
    always preserving the hash suffix so distinct briefs never collide.
    """

    if role not in ROLES:
        raise RenderError(f"invalid role {role!r}; expected one of {ROLES}")

    specialist_slug = _slugify(specialist.replace("_", "-"), max_len=40)
    role_slug = _slugify(role, max_len=16)
    brief_slug = _slugify(brief, max_len=_SLUG_MAX)
    digest = hashlib.sha256(
        f"{specialist_slug}|{role_slug}|{brief}|{salt}".encode("utf-8")
    ).hexdigest()[:_HASH_LEN]

    # Reserve room for role + hash + separators: "-{role}-{hash}"
    suffix = f"-{role_slug}-{digest}"
    # Prefer specialist + brief slug; drop brief slug first if over budget.
    prefix_budget = _TASK_NAME_MAX - len(suffix)
    if prefix_budget < len(specialist_slug):
        # Extreme: hash-only specialist tail
        name = f"{specialist_slug[: max(1, prefix_budget)]}-{digest}"
        return _slugify(name, max_len=_TASK_NAME_MAX)

    remaining = prefix_budget - len(specialist_slug) - 1  # for '-'
    if remaining >= 4:
        mid = brief_slug[:remaining].rstrip("-")
        core = f"{specialist_slug}-{mid}" if mid else specialist_slug
    else:
        core = specialist_slug

    name = f"{core}{suffix}"
    # Final safety: only [a-z0-9-]
    name = re.sub(r"[^a-z0-9-]", "", name.lower())
    name = re.sub(r"-+", "-", name).strip("-")
    if len(name) > _TASK_NAME_MAX:
        name = name[: _TASK_NAME_MAX].rstrip("-")
    return name


def task_names_distinct(a: str, b: str) -> bool:
    return a != b


# --------------------------------------------------------------------------- #
# Composition
# --------------------------------------------------------------------------- #


def _bound_standards_section(fields: Mapping[str, str], meta: Mapping[str, Any]) -> str:
    binds = fields.get("binds personas") or fields.get("binds") or "(see charter)"
    lines = [
        f"- Persona standards (bind by reference, do not restate bodies): "
        f"`skills/hyperflow/personas-A.md` / `personas-B.md` — **{binds}**.",
        "- Specialist registry / DRY guard: `agents/README.md`.",
        "- Web-research gate: `skills/hyperflow/web-research.md` when the charter requires research.",
        "- Runtime ops / role separation: `skills/hyperflow/runtime-contract.md`.",
        "- Security doctrine: `skills/hyperflow/security.md`.",
    ]
    name = meta.get("name")
    if name:
        lines.insert(0, f"- Specialist charter: `agents/{name}.md` (canonical; Claude-native discovery unchanged).")
    return "\n".join(lines)


def _mission_section(fields: Mapping[str, str], meta: Mapping[str, Any]) -> str:
    mission = fields.get("mission", "").strip()
    if not mission:
        desc = str(meta.get("description") or "").strip()
        mission = desc or "Execute the brief under the specialist charter and role marker."
    family = fields.get("family", "")
    default_role = fields.get("default role", "")
    bits = [mission]
    meta_bits = []
    if family:
        meta_bits.append(f"Family: {family}")
    if default_role:
        meta_bits.append(f"Charter default role: {default_role}")
    if meta_bits:
        bits.append("(" + " · ".join(meta_bits) + ")")
    return "\n".join(bits)


def _charter_output_contract(fields: Mapping[str, str], role: str) -> str:
    checklist = fields.get("strict checklist / output contract", "").strip()
    out_fmt = fields.get("output format", "").strip()
    role_contract = OUTPUT_CONTRACTS[role]
    parts = [role_contract]
    if checklist:
        parts.append("Charter checklist (bind; do not ignore):\n" + checklist)
    if out_fmt:
        parts.append("Charter output format:\n" + out_fmt)
    return "\n\n".join(parts)


def _capability_caveats(
    *,
    tools: list[str],
    can_spawn: bool,
    role: str,
) -> str:
    lines = [
        "- Charter frontmatter `tools:` is **advisory intent only** on non-Claude hosts "
        "(including Codex collaboration children). It does **not** grant or enforce tool "
        "access. Real permission comes from the **host sandbox and approval policy**, plus "
        "the Hyperflow security constraints in this message.",
    ]
    if tools:
        lines.append(
            f"- Charter intends these capabilities (advisory, not enforcement): "
            f"{', '.join(tools)}."
        )
    else:
        lines.append("- Charter frontmatter listed no tools (still host-enforced).")

    lines.append(
        "- Every agent runs on the **current session model**. Charters define "
        "responsibility, not model tier. There is no per-role model selection."
    )
    lines.append(
        "- Workers never self-review. Reviewers never coordinate or implement. "
        "Investigators do not replace the independent reviewer gate."
    )

    if can_spawn:
        lines.append(
            "- Subagent/collaboration spawn is available: prefer host lifecycle ops "
            "(`spawn` / `wait` / `message` / `follow_up` / `interrupt` / `list` per "
            "runtime-contract.md). Still keep worker and reviewer as separate children."
        )
    else:
        lines.append(
            "- Subagent/collaboration **spawn is unavailable** in this session. "
            "Select the **foreground role-separated fallback**: labelled inline "
            f"**{role}** phase only — never merge worker and reviewer responsibility, "
            "never invent background notifications or fake completion hooks."
        )
        lines.append(
            "- Do not claim child mailbox, async wait, cancellation, or host-level "
            "agent listing when those tools are absent."
        )

    lines.append(
        "- Claude-native named-agent files under `agents/` remain the discovery source "
        "on Claude Code; this rendered message is the execution vehicle on hosts "
        "without that discovery."
    )
    return "\n".join(lines)


def _security_section(role: str) -> str:
    body = SECURITY_CONSTRAINTS_BODY.rstrip()
    if role == "reviewer":
        body = body + "\n\n" + SECURITY_REVIEW_BODY.rstrip()
    return body


def render_specialist_brief(
    *,
    charter_path: Path,
    role: str,
    brief: str,
    context: str = "",
    can_spawn: bool = True,
    plugin_root: Path | None = None,
    name_salt: str = "",
    include_task_name: bool = True,
) -> dict[str, str]:
    """Compose the child message. Returns dict with message, task_name, specialist, role."""

    if role not in ROLES:
        raise RenderError(f"invalid role {role!r}; expected one of {ROLES}")

    root = resolve_plugin_root(plugin_root)
    path = charter_path if charter_path.is_absolute() else resolve_charter_path(str(charter_path), root)
    # Re-validate even if caller passed a Path.
    if not path.is_file():
        path = resolve_charter_path(str(charter_path), root)
    else:
        path = resolve_charter_path(str(path), root)

    text = path.read_text(encoding="utf-8")
    meta, body = parse_frontmatter(text)
    fields = extract_charter_fields(body)
    tools = tools_from_frontmatter(meta)
    specialist = str(meta.get("name") or path.stem).strip()
    if not specialist:
        specialist = path.stem

    task_name = stable_task_name(specialist, role, brief, salt=name_salt)

    sections: list[str] = [f"hyperflow-role: {role}"]
    if include_task_name:
        sections.append(f"hyperflow-task-name: {task_name}")

    sections.extend(
        [
            "",
            f"## Role ({role})",
            ROLE_MANDATES[role],
            "",
            "## Mission",
            _mission_section(fields, meta),
            "",
            "## Bound standards",
            _bound_standards_section(fields, meta),
            "",
            "## Brief",
            brief.strip() if brief.strip() else "(no brief provided)",
        ]
    )

    if context.strip():
        sections.extend(["", "## Context", context.strip()])

    sections.extend(
        [
            "",
            "## Security constraints",
            _security_section(role),
            "",
            "## Output contract",
            _charter_output_contract(fields, role),
            "",
            "## Capability caveats",
            _capability_caveats(tools=tools, can_spawn=can_spawn, role=role),
        ]
    )

    message = "\n".join(sections).rstrip() + "\n"
    return {
        "message": message,
        "task_name": task_name,
        "specialist": specialist,
        "role": role,
        "charter": str(path),
    }


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #


def _parse_bool(value: str) -> bool:
    v = value.strip().lower()
    if v in ("1", "true", "yes", "on"):
        return True
    if v in ("0", "false", "no", "off"):
        return False
    raise argparse.ArgumentTypeError(f"expected boolean, got {value!r}")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="render-specialist-brief.py",
        description="Compose a specialist charter into a collaboration child message.",
    )
    p.add_argument(
        "--charter",
        required=True,
        help="Specialist name (e.g. security-reviewer) or path under agents/",
    )
    p.add_argument(
        "--role",
        required=True,
        choices=ROLES,
        help="hyperflow-role marker: worker | reviewer | investigator | decision",
    )
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--brief", help="Brief text for the child")
    g.add_argument("--brief-file", type=Path, help="Read brief text from file")
    p.add_argument("--context", default="", help="Optional context section body")
    p.add_argument("--context-file", type=Path, help="Optional context from file")
    p.add_argument(
        "--can-spawn",
        type=_parse_bool,
        default=True,
        help="Whether the host exposes spawn/subagent (default: true)",
    )
    p.add_argument(
        "--plugin-root",
        type=Path,
        default=None,
        help="Plugin root containing agents/ (default: parent of scripts/)",
    )
    p.add_argument(
        "--name-salt",
        default="",
        help="Optional salt for task-name domain (collision tests / multi-chain)",
    )
    p.add_argument(
        "--task-name-only",
        action="store_true",
        help="Print only the stable collaboration task name",
    )
    p.add_argument(
        "--no-task-name-header",
        action="store_true",
        help="Omit hyperflow-task-name line from the composed message",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        brief = args.brief
        if args.brief_file is not None:
            brief = Path(args.brief_file).read_text(encoding="utf-8")
        context = args.context or ""
        if args.context_file is not None:
            context = Path(args.context_file).read_text(encoding="utf-8")

        root = resolve_plugin_root(args.plugin_root)
        path = resolve_charter_path(args.charter, root)
        result = render_specialist_brief(
            charter_path=path,
            role=args.role,
            brief=brief or "",
            context=context,
            can_spawn=args.can_spawn,
            plugin_root=root,
            name_salt=args.name_salt,
            include_task_name=not args.no_task_name_header,
        )
    except BlockedError as exc:
        sys.stdout.write(str(exc).rstrip() + "\n")
        return 2
    except (RenderError, OSError, UnicodeError) as exc:
        print(f"render-specialist-brief: {exc}", file=sys.stderr)
        return 3

    if args.task_name_only:
        sys.stdout.write(result["task_name"] + "\n")
    else:
        sys.stdout.write(result["message"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
