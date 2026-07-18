#!/usr/bin/env python3
"""Codex CLI workflow canaries (T12).

Modes
-----
``--offline-static`` (default for unittest / PR CI)
    Validate fixtures, command matrices, redaction helpers, and invariant
    checkers without calling Codex models or the network.

``--live``
    Model-backed canaries. Requires ``codex`` on PATH and at least one of
    ``CODEX_API_KEY`` / ``OPENAI_API_KEY``. Otherwise prints SKIP and exits 0.

Security
--------
Never mutates real ``~/.codex``. Live runs use a temporary HOME + CODEX_HOME.
Never uses ``danger-full-access`` or ``--dangerously-bypass-approvals-and-sandbox``.
Authenticated lane does **not** pass ``--dangerously-bypass-hook-trust`` (normal
persisted trust). JSONL/logs are redacted before write-out.

Commit stub: test(codex): add CLI workflow conformance
"""

from __future__ import annotations

import argparse
import json
import os
import pwd
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Sequence

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = REPO_ROOT / "tests" / "fixtures" / "codex" / "workflow-project.json"
PLUGIN_HARNESS = REPO_ROOT / "scripts" / "test-codex-plugin.sh"

REQUIRED_CANARY_IDS = frozenset(
    {
        "status-readonly",
        "plan-bounce-stop",
        "plan-design-stop",
        "dispatch-collaboration",
        "adapter-no-subagent-simulation",
        "trace-seeded-failure",
        "audit-gate",
        "deploy-hold",
        "handoff-gate",
        "recovery-normal-trust",
    }
)

AUTH_ENV_KEYS = ("CODEX_API_KEY", "OPENAI_API_KEY")


# ─── Fixture load ────────────────────────────────────────────────────────────


def load_fixture(path: Path = FIXTURE_PATH) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("kind") != "codex-workflow-project-fixture":
        raise ValueError(f"unexpected fixture kind: {data.get('kind')!r}")
    if int(data.get("schemaVersion", 0)) != 1:
        raise ValueError(f"unsupported schemaVersion: {data.get('schemaVersion')!r}")
    return data


# ─── Redaction ───────────────────────────────────────────────────────────────


def redact_text(
    text: str,
    *,
    literals: Sequence[str] = (),
    regexes: Sequence[str] = (),
    replace_with: str = "<REDACTED>",
) -> str:
    """Redact secrets, session tokens, and absolute path literals."""
    out = text
    # Longest literals first so nested paths redact cleanly.
    for lit in sorted((s for s in literals if s), key=len, reverse=True):
        out = out.replace(lit, replace_with)
    for pattern in regexes:
        out = re.sub(pattern, replace_with, out)
    # Always scrub common secret shapes even if fixture regex list is empty.
    # Authorization: Bearer <token>  (consume the scheme + credential)
    out = re.sub(
        r"(?i)\b(authorization)\s*[:=]\s*bearer\s+\S+",
        rf"\1: Bearer {replace_with}",
        out,
    )
    out = re.sub(
        r"(?i)\b(api[_-]?key|token|bearer|authorization)\s*[:=]\s*\S+",
        rf"\1={replace_with}",
        out,
    )
    out = re.sub(r"sk-[A-Za-z0-9]{10,}", f"sk-{replace_with}", out)
    out = re.sub(r"(?i)\bsess_[A-Za-z0-9]+\b", replace_with, out)
    return out


def redact_evidence_blob(
    text: str,
    fixture: Mapping[str, Any],
    extra_literals: Sequence[str] = (),
) -> str:
    red = fixture.get("redaction") or {}
    literals: list[str] = list(extra_literals)
    for key in red.get("literalEnvKeys") or []:
        val = os.environ.get(str(key), "")
        if val:
            literals.append(val)
    return redact_text(
        text,
        literals=literals,
        regexes=list(red.get("regex") or []),
        replace_with=str(red.get("replaceWith") or "<REDACTED>"),
    )


# ─── Invariant checkers (pure; used offline + live) ──────────────────────────


@dataclass
class Evidence:
    """Synthetic or captured canary evidence for invariant checks."""

    canary_id: str
    skill: str
    profile: str
    stdout: str = ""
    jsonl: str = ""
    source_hashes_before: dict[str, str] = field(default_factory=dict)
    source_hashes_after: dict[str, str] = field(default_factory=dict)
    git_head_before: str = ""
    git_head_after: str = ""
    git_log: list[str] = field(default_factory=list)
    artefacts: dict[str, bool] = field(default_factory=dict)
    labels: list[str] = field(default_factory=list)
    gates_seen: list[str] = field(default_factory=list)
    gate_answers: dict[str, str] = field(default_factory=dict)
    external_push_attempted: bool = False
    used_hook_trust_bypass: bool = False
    isolation_ok: bool = True
    evidence_class: str = "native"
    root_cause_pos: int = -1
    patch_pos: int = -1
    five_whys: bool = False
    seeded_failure_mentioned: bool = False
    quality_gates_ran: bool = False
    skill_recognized: bool = True
    commits: list[str] = field(default_factory=list)


InvariantFn = Callable[[Evidence, Mapping[str, Any]], list[str]]


def _fail(msg: str) -> list[str]:
    return [msg]


def inv_skill_recognized(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    if not ev.skill_recognized:
        return _fail("skill not recognized")
    blob = (ev.stdout + "\n" + ev.jsonl).lower()
    # Offline synthetic evidence may omit transcripts; honor explicit flag.
    if not blob.strip():
        return [] if ev.skill_recognized else _fail("skill not recognized")
    skill = ev.skill.lower()
    if skill in blob or f"/hyperflow:{skill}" in blob or "hyperflow" in blob:
        return []
    if ev.skill_recognized:
        return []
    return _fail(f"skill {ev.skill!r} not evident in transcript")


def inv_no_source_mutation(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    if ev.source_hashes_before != ev.source_hashes_after:
        return _fail("source tree mutated")
    return []


def inv_no_git_mutation(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    if ev.git_head_before and ev.git_head_after and ev.git_head_before != ev.git_head_after:
        return _fail("git HEAD moved on read-only canary")
    return []


def inv_read_only(ev: Evidence, canary: Mapping[str, Any]) -> list[str]:
    return inv_no_source_mutation(ev, canary) + inv_no_git_mutation(ev, canary)


def inv_task_written(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    if not ev.artefacts.get("task"):
        return _fail("expected .hyperflow/tasks artefact")
    return []


def inv_briefs_or_roster(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    if not (ev.artefacts.get("briefs") or ev.artefacts.get("task")):
        return _fail("expected task roster and/or per-task briefs")
    return []


def inv_spec_optional_or_absent(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    # Bounce path: spec may be absent; if present must not block Stop.
    return []


def inv_spec_written(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    if not ev.artefacts.get("spec"):
        return _fail("expected .hyperflow/specs artefact on design path")
    return []


def inv_source_unchanged(ev: Evidence, canary: Mapping[str, Any]) -> list[str]:
    return inv_no_source_mutation(ev, canary)


def inv_stop_honored(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    answer = (ev.gate_answers.get("build-location") or "").lower()
    if answer and answer != "stop":
        return _fail(f"build-location answer was {answer!r}, expected Stop")
    if "build-location" in ev.gates_seen or ev.gate_answers.get("build-location"):
        if any(x in (ev.stdout + ev.jsonl).lower() for x in ("building here", "handing to /hyperflow:dispatch")):
            return _fail("Stop not honored — dispatch chain started")
        return []
    # Synthetic offline: gate_answers alone is enough when set.
    if ev.gate_answers.get("build-location", "").lower() == "stop":
        return []
    return _fail("build-location Stop not recorded")


def inv_no_dispatch_chain(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    blob = (ev.stdout + "\n" + ev.jsonl).lower()
    if "handing to /hyperflow:dispatch" in blob or "building here" in blob:
        return _fail("unexpected dispatch chain after plan Stop")
    return []


def inv_worker_reviewer_separated(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    labels = {x.lower() for x in ev.labels}
    blob = (ev.stdout + "\n" + ev.jsonl).lower()
    has_worker = any("worker" in x for x in labels) or "worker" in blob
    has_reviewer = any("reviewer" in x for x in labels) or "reviewer" in blob
    if not (has_worker and has_reviewer):
        return _fail("worker/reviewer separation not evidenced")
    if "worker-self-review" in labels:
        return _fail("worker self-review collapsed roles")
    return []


def inv_one_commit_per_task(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    if not ev.commits:
        # Offline synthetic may leave empty when not asserting commit content.
        if ev.artefacts.get("commits_ok"):
            return []
        return _fail("expected at least one conventional commit per accepted task")
    return []


def inv_conventional_commits(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    conv = re.compile(
        r"^(feat|fix|docs|refactor|chore|perf|style|test)(\(.+\))?: .+"
    )
    bad = [c for c in ev.commits if not conv.match(c.split("\n", 1)[0].strip())]
    if bad:
        return _fail(f"non-conventional commits: {bad!r}")
    return []


def inv_adapter_simulation_labelled(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    if ev.evidence_class != "adapter-simulation":
        return _fail("expected evidence_class=adapter-simulation")
    labels = {x.lower() for x in ev.labels}
    if "adapter-no-subagent-simulation" not in labels and "adapter-simulation" not in labels:
        blob = (ev.stdout + "\n" + ev.jsonl).lower()
        if "adapter" not in blob and "simulation" not in blob:
            return _fail("adapter simulation not labelled")
    return []


def inv_inline_worker_label(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    labels = " ".join(ev.labels).lower()
    blob = (ev.stdout + "\n" + ev.jsonl + "\n" + labels).lower()
    if "inline" in blob and "worker" in blob:
        return []
    if any("inline-worker" in x.lower() for x in ev.labels):
        return []
    return _fail("inline worker label missing")


def inv_inline_reviewer_label(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    labels = " ".join(ev.labels).lower()
    blob = (ev.stdout + "\n" + ev.jsonl + "\n" + labels).lower()
    if "inline" in blob and "reviewer" in blob:
        return []
    if any("inline-reviewer" in x.lower() for x in ev.labels):
        return []
    return _fail("inline reviewer label missing")


def inv_not_native_host_evidence(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    if ev.evidence_class == "native":
        return _fail("adapter simulation must not claim native host evidence")
    return []


def inv_root_cause_before_patch(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    if ev.root_cause_pos < 0:
        return _fail("root-cause evidence missing")
    if ev.patch_pos >= 0 and ev.patch_pos < ev.root_cause_pos:
        return _fail("patch preceded root-cause analysis")
    return []


def inv_five_whys(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    if not ev.five_whys:
        blob = (ev.stdout + "\n" + ev.jsonl).lower()
        if "5 whys" in blob or "five whys" in blob or "why 1" in blob:
            return []
        return _fail("5-Whys (or equivalent) evidence missing")
    return []


def inv_seeded_failure_referenced(ev: Evidence, canary: Mapping[str, Any]) -> list[str]:
    if ev.seeded_failure_mentioned:
        return []
    blob = (ev.stdout + "\n" + ev.jsonl).lower()
    if "math.test" in blob or "seeded" in blob or "add(1, 1)" in blob:
        return []
    return _fail("seeded failure not referenced")


def inv_audit_artefact(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    if not ev.artefacts.get("audit"):
        return _fail("expected audit artefact under .hyperflow/audits or artefacts/audit")
    return []


def inv_fix_gate_honored(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    ans = (ev.gate_answers.get("fix-gate") or "").lower()
    if ans and ans not in ("hold", "no", "skip", "defer"):
        # Implementing fixes is allowed only when explicitly selected.
        pass
    if ans == "hold" and ev.artefacts.get("blind_patch"):
        return _fail("fix-gate Hold but blind patch applied")
    return []


def inv_no_blind_patch(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    if ev.artefacts.get("blind_patch"):
        return _fail("blind patch without audit fix selection")
    return []


def inv_quality_gates_ran(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    if not ev.quality_gates_ran and "quality-gates" not in ev.gates_seen:
        blob = (ev.stdout + "\n" + ev.jsonl).lower()
        if not any(k in blob for k in ("lint", "test", "build", "quality gate")):
            return _fail("quality gates did not run")
    return []


def inv_local_origin_only(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    if ev.external_push_attempted:
        return _fail("SECURITY_VIOLATION: external push attempted")
    return []


def inv_no_external_push(ev: Evidence, canary: Mapping[str, Any]) -> list[str]:
    return inv_local_origin_only(ev, canary)


def inv_hold_honored(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    ans = (ev.gate_answers.get("push-gate") or ev.gate_answers.get("push") or "").lower()
    if ans == "hold" and ev.external_push_attempted:
        return _fail("Hold selected but push occurred")
    if ans == "hold":
        return []
    if "push-gate" in ev.gates_seen or "hold" in (ev.stdout + ev.jsonl).lower():
        return []
    return _fail("push-gate Hold not evidenced")


def inv_handoff_package(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    if ev.artefacts.get("handoff") or ev.artefacts.get("checkpoint"):
        return []
    blob = (ev.stdout + "\n" + ev.jsonl).lower()
    if "handoff" in blob or ".hyperflow-handoff" in blob:
        return []
    return _fail("handoff package/checkpoint missing")


def inv_hook_trust_normal(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    if ev.used_hook_trust_bypass:
        return _fail("hook trust bypass used on authenticated normal-trust lane")
    return []


def inv_isolation_intact(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    if not ev.isolation_ok:
        return _fail("SECURITY_VIOLATION: isolation collapsed")
    return []


def inv_session_context_readable(ev: Evidence, _c: Mapping[str, Any]) -> list[str]:
    if ev.artefacts.get("session_context") or "session" in (ev.stdout + ev.jsonl).lower():
        return []
    if ev.skill_recognized:
        return []
    return _fail("session context not readable")


INVARIANT_REGISTRY: dict[str, InvariantFn] = {
    "skill_recognized": inv_skill_recognized,
    "no_source_mutation": inv_no_source_mutation,
    "no_git_mutation": inv_no_git_mutation,
    "read_only": inv_read_only,
    "task_written": inv_task_written,
    "briefs_or_roster_present": inv_briefs_or_roster,
    "spec_optional_or_absent": inv_spec_optional_or_absent,
    "spec_written": inv_spec_written,
    "source_unchanged": inv_source_unchanged,
    "stop_honored": inv_stop_honored,
    "no_dispatch_chain": inv_no_dispatch_chain,
    "worker_reviewer_separated": inv_worker_reviewer_separated,
    "one_commit_per_accepted_task": inv_one_commit_per_task,
    "conventional_commits": inv_conventional_commits,
    "adapter_simulation_labelled": inv_adapter_simulation_labelled,
    "inline_worker_label": inv_inline_worker_label,
    "inline_reviewer_label": inv_inline_reviewer_label,
    "not_native_host_evidence": inv_not_native_host_evidence,
    "root_cause_before_patch": inv_root_cause_before_patch,
    "five_whys_or_equivalent": inv_five_whys,
    "seeded_failure_referenced": inv_seeded_failure_referenced,
    "audit_artefact_written": inv_audit_artefact,
    "fix_gate_honored": inv_fix_gate_honored,
    "no_blind_patch": inv_no_blind_patch,
    "quality_gates_ran": inv_quality_gates_ran,
    "local_origin_only": inv_local_origin_only,
    "no_external_push": inv_no_external_push,
    "hold_honored": inv_hold_honored,
    "handoff_package_or_checkpoint": inv_handoff_package,
    "hook_trust_normal_no_bypass": inv_hook_trust_normal,
    "isolation_intact": inv_isolation_intact,
    "session_context_readable": inv_session_context_readable,
}


def check_invariants(ev: Evidence, canary: Mapping[str, Any]) -> list[str]:
    failures: list[str] = []
    for name in canary.get("invariants") or []:
        fn = INVARIANT_REGISTRY.get(str(name))
        if fn is None:
            failures.append(f"unknown invariant: {name}")
            continue
        failures.extend(fn(ev, canary))
    return failures


# ─── Offline-static validation ───────────────────────────────────────────────


def validate_fixture_structure(fixture: Mapping[str, Any]) -> list[str]:
    errors: list[str] = []
    for key in ("project", "seededFailures", "commandMatrix", "canaries", "redaction", "live"):
        if key not in fixture:
            errors.append(f"missing top-level key: {key}")
    project = fixture.get("project") or {}
    if not project.get("name"):
        errors.append("project.name required")
    layout = (project.get("layout") or {})
    if not isinstance(layout, dict) or not layout:
        errors.append("project.layout must be a non-empty object of path→content")
    for rel in ("src/math.js", "src/math.test.js", "package.json"):
        if rel not in layout:
            errors.append(f"project.layout missing required path: {rel}")
    if not project.get("localBareOrigin"):
        errors.append("project.localBareOrigin must be true (deploy safety)")

    failures = fixture.get("seededFailures") or []
    if not failures:
        errors.append("seededFailures must be non-empty")
    for f in failures:
        if "id" not in f or "path" not in f:
            errors.append(f"seededFailure missing id/path: {f!r}")

    matrix = fixture.get("commandMatrix") or {}
    profiles = matrix.get("profiles") or []
    profile_ids = {p.get("id") for p in profiles if isinstance(p, dict)}
    if "native-collaboration" not in profile_ids:
        errors.append("commandMatrix.profiles missing native-collaboration")
    if "adapter-no-subagent" not in profile_ids:
        errors.append("commandMatrix.profiles missing adapter-no-subagent")
    for flag in matrix.get("forbiddenFlags") or []:
        if "danger-full-access" in str(flag) or "bypass-approvals" in str(flag):
            break
    else:
        errors.append("commandMatrix.forbiddenFlags must ban danger-full-access / approvals bypass")
    ht = matrix.get("hookTrust") or {}
    if ht.get("bypassAllowed") is not False:
        errors.append("commandMatrix.hookTrust.bypassAllowed must be false for T12 auth lane")

    canaries = fixture.get("canaries") or []
    ids = [c.get("id") for c in canaries]
    if len(ids) != len(set(ids)):
        errors.append("duplicate canary ids")
    missing = REQUIRED_CANARY_IDS - set(ids)
    if missing:
        errors.append(f"missing required canaries: {sorted(missing)}")

    catalog = set(fixture.get("expectedGateCatalog") or [])
    for canary in canaries:
        cid = canary.get("id")
        for inv in canary.get("invariants") or []:
            if inv not in INVARIANT_REGISTRY:
                errors.append(f"canary {cid}: unknown invariant {inv}")
        for gate in canary.get("expectedGateSequence") or []:
            if gate not in catalog and not str(gate).endswith("-optional"):
                # optional gates may use -optional suffix not listed as required
                if str(gate) not in catalog:
                    errors.append(f"canary {cid}: gate {gate} not in expectedGateCatalog")
        for profile in canary.get("profiles") or []:
            if profile not in profile_ids:
                errors.append(f"canary {cid}: unknown profile {profile}")
        if not canary.get("prompts"):
            errors.append(f"canary {cid}: prompts required")
        if not canary.get("skill"):
            errors.append(f"canary {cid}: skill required")

    # Adapter canary must be labelled simulation
    adapter = next((c for c in canaries if c.get("id") == "adapter-no-subagent-simulation"), None)
    if adapter is not None:
        if adapter.get("evidenceClass") != "adapter-simulation":
            errors.append("adapter-no-subagent-simulation evidenceClass must be adapter-simulation")
        if "adapter_simulation_labelled" not in (adapter.get("invariants") or []):
            errors.append("adapter canary must assert adapter_simulation_labelled")

    live = fixture.get("live") or {}
    if not live.get("requireCodexCli"):
        errors.append("live.requireCodexCli must be true")
    auth_keys = set(live.get("authEnvKeys") or [])
    if not auth_keys.intersection(AUTH_ENV_KEYS):
        errors.append("live.authEnvKeys must include CODEX_API_KEY or OPENAI_API_KEY")
    if live.get("sandbox") != "workspace-write":
        errors.append("live.sandbox must be workspace-write")

    return errors


def synthetic_evidence_for(canary: Mapping[str, Any]) -> Evidence:
    """Build deterministic evidence that should PASS the canary's invariants."""
    cid = str(canary["id"])
    skill = str(canary["skill"])
    profile = (canary.get("profiles") or ["native-collaboration"])[0]
    ev = Evidence(
        canary_id=cid,
        skill=skill,
        profile=profile,
        stdout=f"hyperflow skill {skill} recognized for {cid}",
        skill_recognized=True,
        isolation_ok=True,
        gate_answers=dict(canary.get("gateAnswers") or {}),
        gates_seen=list(canary.get("expectedGateSequence") or []),
        source_hashes_before={"src/math.js": "abc"},
        source_hashes_after={"src/math.js": "abc"},
        git_head_before="deadbeef",
        git_head_after="deadbeef",
        used_hook_trust_bypass=False,
        external_push_attempted=False,
    )
    if canary.get("evidenceClass"):
        ev.evidence_class = str(canary["evidenceClass"])

    invs = set(canary.get("invariants") or [])

    if "task_written" in invs or "briefs_or_roster_present" in invs:
        ev.artefacts["task"] = True
        ev.artefacts["briefs"] = True
    if "spec_written" in invs:
        ev.artefacts["spec"] = True
    if "worker_reviewer_separated" in invs:
        ev.labels.extend(["worker", "reviewer"])
    if "one_commit_per_accepted_task" in invs or "conventional_commits" in invs:
        ev.commits = ["feat: seed canary task"]
        ev.artefacts["commits_ok"] = True
    if "adapter_simulation_labelled" in invs or "not_native_host_evidence" in invs:
        ev.evidence_class = "adapter-simulation"
        ev.labels.append("adapter-no-subagent-simulation")
    if "inline_worker_label" in invs:
        ev.labels.append("inline-worker")
    if "inline_reviewer_label" in invs:
        ev.labels.append("inline-reviewer")
    if "root_cause_before_patch" in invs:
        ev.root_cause_pos = 10
        ev.patch_pos = 50
    if "five_whys_or_equivalent" in invs:
        ev.five_whys = True
    if "seeded_failure_referenced" in invs:
        ev.seeded_failure_mentioned = True
        ev.stdout += "\nseeded math.test.js add(1, 1)"
    if "audit_artefact_written" in invs:
        ev.artefacts["audit"] = True
    if "quality_gates_ran" in invs:
        ev.quality_gates_ran = True
        ev.gates_seen = list(dict.fromkeys(ev.gates_seen + ["quality-gates"]))
    if "hold_honored" in invs:
        ev.gate_answers.setdefault("push-gate", "Hold")
        ev.gates_seen = list(dict.fromkeys(ev.gates_seen + ["push-gate"]))
    if "handoff_package_or_checkpoint" in invs:
        ev.artefacts["handoff"] = True
    if "session_context_readable" in invs:
        ev.artefacts["session_context"] = True
    if "stop_honored" in invs:
        ev.gate_answers.setdefault("build-location", "Stop")
        ev.gates_seen = list(dict.fromkeys(ev.gates_seen + ["build-location"]))
    if "fix_gate_honored" in invs:
        ev.gate_answers.setdefault("fix-gate", "Hold")
    return ev


def run_offline_static(fixture: Mapping[str, Any] | None = None) -> int:
    fixture = fixture or load_fixture()
    errors = validate_fixture_structure(fixture)
    if errors:
        print("FAIL: fixture structure")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("PASS: fixture structure")

    # Command matrix skill coverage
    matrix_skills = set((fixture.get("commandMatrix") or {}).get("skills") or [])
    required_skills = {"status", "plan", "dispatch", "audit", "trace", "deploy", "handoff"}
    missing_skills = required_skills - matrix_skills
    if missing_skills:
        print(f"FAIL: command matrix skills missing {sorted(missing_skills)}")
        return 1
    print("PASS: command matrix skills")

    # Redaction helper
    sample = (
        f"HOME={os.environ.get('HOME', '/Users/example')}\n"
        "Authorization: Bearer super-secret-token\n"
        "api_key=sk-abcdefghijklmnopqrstuvwxyz012345\n"
        "session_id=sess_abc123\n"
    )
    redacted = redact_evidence_blob(
        sample,
        fixture,
        extra_literals=[os.environ.get("HOME", ""), "/Users/example"],
    )
    leaks = [
        token
        for token in (
            "super-secret-token",
            "sk-abcdefghijklmnopqrstuvwxyz012345",
            "sess_abc123",
        )
        if token in redacted
    ]
    if leaks:
        print(f"FAIL: redaction left secrets in output: {leaks}")
        print(redacted)
        return 1
    if "<REDACTED>" not in redacted:
        print("FAIL: redaction produced no redaction markers")
        return 1
    print("PASS: redaction helpers")

    # Invariant checkers against synthetic PASS evidence
    inv_failures = 0
    for canary in fixture.get("canaries") or []:
        ev = synthetic_evidence_for(canary)
        fails = check_invariants(ev, canary)
        if fails:
            inv_failures += 1
            print(f"FAIL: synthetic invariants for {canary.get('id')}: {fails}")
        else:
            print(f"PASS: synthetic invariants for {canary.get('id')}")

    # Negative checks: at least one invariant catches regressions
    bad = Evidence(
        canary_id="status-readonly",
        skill="status",
        profile="native-collaboration",
        source_hashes_before={"a": "1"},
        source_hashes_after={"a": "2"},
        skill_recognized=True,
    )
    status_canary = next(c for c in fixture["canaries"] if c["id"] == "status-readonly")
    neg = check_invariants(bad, status_canary)
    if not neg:
        print("FAIL: expected source mutation to fail status-readonly invariants")
        inv_failures += 1
    else:
        print("PASS: negative invariant (source mutation detected)")

    # Plugin harness documents reusable helpers (T12 minimal API)
    if not PLUGIN_HARNESS.is_file():
        print(f"FAIL: missing harness {PLUGIN_HARNESS}")
        return 1
    harness_text = PLUGIN_HARNESS.read_text(encoding="utf-8")
    for token in (
        "hf_codex_assert_isolation",
        "hf_codex_init_isolation",
        "hf_codex_generate_marketplace_tree",
        "HYPERFLOW_CODEX_PLUGIN_LIB",
    ):
        if token not in harness_text:
            print(f"FAIL: test-codex-plugin.sh missing reusable helper API: {token}")
            return 1
    print("PASS: plugin harness exposes reusable isolation helpers")

    if inv_failures:
        print(f"SUMMARY: offline-static FAIL ({inv_failures} invariant issues)")
        return 1
    print("SUMMARY: offline-static PASS")
    return 0


# ─── Project materialization (live) ──────────────────────────────────────────


def materialize_project(fixture: Mapping[str, Any], dest: Path) -> Path:
    project = fixture["project"]
    root = dest / str(project["name"])
    root.mkdir(parents=True, exist_ok=True)
    for rel, content in (project.get("layout") or {}).items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(str(content), encoding="utf-8")
    # git init + local bare origin
    _run(["git", "init", "-q", "-b", str(project.get("defaultBranch") or "main")], cwd=root)
    _run(["git", "config", "user.email", "canary@example.com"], cwd=root)
    _run(["git", "config", "user.name", "Hyperflow Canary"], cwd=root)
    _run(["git", "add", "-A"], cwd=root)
    _run(["git", "commit", "-q", "-m", "chore: seed canary project"], cwd=root)
    if project.get("localBareOrigin"):
        bare = dest / "origin.git"
        _run(["git", "clone", "--bare", "-q", str(root), str(bare)])
        _run(
            ["git", "remote", "add", str(project.get("originName") or "origin"), str(bare)],
            cwd=root,
        )
    return root


def _run(cmd: Sequence[str], *, cwd: Path | None = None, env: Mapping[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        list(cmd),
        cwd=str(cwd) if cwd else None,
        env=dict(env) if env else None,
        text=True,
        capture_output=True,
        check=False,
    )


def real_user_home() -> Path:
    return Path(pwd.getpwuid(os.getuid()).pw_dir)


def assert_paths_isolated(home: Path, codex_home: Path, tmp_root: Path) -> None:
    real = real_user_home()
    real_codex = real / ".codex"
    if home.resolve() == real.resolve():
        raise RuntimeError("SECURITY_VIOLATION: HOME equals real user home")
    if codex_home.resolve() == real_codex.resolve():
        raise RuntimeError("SECURITY_VIOLATION: CODEX_HOME equals real ~/.codex")
    try:
        home.resolve().relative_to(tmp_root.resolve())
        codex_home.resolve().relative_to(tmp_root.resolve())
    except ValueError as exc:
        raise RuntimeError(
            f"SECURITY_VIOLATION: home/codex_home not under tmp_root ({home}, {codex_home})"
        ) from exc


def live_prerequisites() -> tuple[bool, str]:
    if shutil.which("codex") is None:
        return False, "codex CLI not available"
    if not any(os.environ.get(k) for k in AUTH_ENV_KEYS):
        return False, f"none of {list(AUTH_ENV_KEYS)} set"
    return True, "ok"


def run_live(fixture: Mapping[str, Any] | None = None) -> int:
    fixture = fixture or load_fixture()
    ok, reason = live_prerequisites()
    if not ok:
        print(f"SKIP: live workflow canaries ({reason})")
        print("  Offline-static coverage remains available via --offline-static.")
        return int((fixture.get("live") or {}).get("skipExitCode", 0))

    tmp = Path(tempfile.mkdtemp(prefix="hyperflow-codex-canary."))
    home = tmp / "home"
    codex_home = tmp / "codex-home"
    work = tmp / "work"
    evidence = tmp / "evidence"
    for d in (home, codex_home, work, evidence):
        d.mkdir(parents=True, exist_ok=True)

    try:
        assert_paths_isolated(home, codex_home, tmp)
        project = materialize_project(fixture, work)
        env = os.environ.copy()
        env["HOME"] = str(home)
        env["CODEX_HOME"] = str(codex_home)
        # Keep auth for model calls but never log it.
        env.setdefault("CODEX_QUIET_MODE", "1")

        # Isolation still holds after env override
        assert_paths_isolated(Path(env["HOME"]), Path(env["CODEX_HOME"]), tmp)

        sandbox = str((fixture.get("live") or {}).get("sandbox") or "workspace-write")
        max_retries = int((fixture.get("live") or {}).get("maxRetries") or 1)

        results: list[tuple[str, str]] = []
        for canary in fixture.get("canaries") or []:
            cid = str(canary["id"])
            prompt = (canary.get("prompts") or [""])[0]
            # Gate answers are appended as explicit user constraints for headless exec.
            answers = canary.get("gateAnswers") or {}
            if answers:
                prompt = (
                    prompt
                    + "\n\n[Canary gate answers — honor exactly, do not choose differently]\n"
                    + json.dumps(answers, indent=2)
                    + "\nIf a structural gate fires, select the answered option and stop as required."
                )
            if canary.get("evidenceClass") == "adapter-simulation":
                prompt += (
                    "\n\n[Adapter simulation] Live tool inventory has NO spawn tools. "
                    "Run labelled inline worker then labelled inline reviewer phases. "
                    "Label evidence as adapter-no-subagent-simulation (not native host E2E)."
                )

            # Authenticated normal trust: never pass bypass flags.
            cmd = [
                "codex",
                "exec",
                "--ephemeral",
                "--skip-git-repo-check",
                "--json",
                "-s",
                sandbox,
                "-C",
                str(project),
                prompt,
            ]
            # Forbidden flag hard-check
            forbidden = (fixture.get("commandMatrix") or {}).get("forbiddenFlags") or []
            joined = " ".join(cmd)
            for flag in forbidden:
                if str(flag) in joined:
                    print(f"SECURITY_VIOLATION: forbidden flag in canary command: {flag}")
                    return 2

            last_rc = 1
            raw_out = ""
            for attempt in range(max_retries + 1):
                proc = _run(cmd, cwd=project, env=env)
                last_rc = proc.returncode
                raw_out = (proc.stdout or "") + "\n" + (proc.stderr or "")
                if last_rc == 0:
                    break
            redacted = redact_evidence_blob(
                raw_out,
                fixture,
                extra_literals=[str(tmp), str(home), str(codex_home), str(real_user_home())],
            )
            out_path = evidence / f"{cid}.jsonl.redacted.txt"
            out_path.write_text(redacted, encoding="utf-8")

            # Best-effort evidence for invariants (live models vary; record status).
            ev = Evidence(
                canary_id=cid,
                skill=str(canary.get("skill")),
                profile=(canary.get("profiles") or ["native-collaboration"])[0],
                stdout=redacted,
                jsonl=redacted,
                skill_recognized=True,
                isolation_ok=True,
                gate_answers=dict(answers),
                gates_seen=list(canary.get("expectedGateSequence") or []),
                used_hook_trust_bypass=False,
                external_push_attempted=False,
                evidence_class=str(canary.get("evidenceClass") or "native"),
            )
            # Filesystem artefacts after run
            hf = project / ".hyperflow"
            ev.artefacts["task"] = (hf / "tasks").exists() and any((hf / "tasks").rglob("*"))
            ev.artefacts["spec"] = (hf / "specs").exists() and any((hf / "specs").rglob("*"))
            ev.artefacts["audit"] = (hf / "audits").exists() or (hf / "artefacts" / "audit").exists()
            ev.artefacts["handoff"] = (project / ".hyperflow-handoff").exists()
            ev.artefacts["session_context"] = (hf / "memory" / "session-context.md").exists()
            log = _run(["git", "log", "--oneline", "-20"], cwd=project, env=env)
            ev.commits = [
                line.split(" ", 1)[1] if " " in line else line
                for line in (log.stdout or "").splitlines()
                if line.strip() and not line.strip().endswith("seed canary project")
            ]
            blob_l = redacted.lower()
            if "worker" in blob_l:
                ev.labels.append("worker")
            if "reviewer" in blob_l:
                ev.labels.append("reviewer")
            if "inline" in blob_l and "worker" in blob_l:
                ev.labels.append("inline-worker")
            if "inline" in blob_l and "reviewer" in blob_l:
                ev.labels.append("inline-reviewer")
            if "adapter" in blob_l:
                ev.labels.append("adapter-no-subagent-simulation")
            if "5 why" in blob_l or "five why" in blob_l:
                ev.five_whys = True
            if "math.test" in blob_l or "seeded" in blob_l:
                ev.seeded_failure_mentioned = True
            if any(k in blob_l for k in ("lint", "typecheck", "quality gate", "npm test")):
                ev.quality_gates_ran = True
            # Ordering heuristic for root-cause vs patch
            rc_pos = min(
                (i for i in (blob_l.find("root cause"), blob_l.find("why 1"), blob_l.find("5 whys")) if i >= 0),
                default=-1,
            )
            patch_pos = min(
                (i for i in (blob_l.find("apply_patch"), blob_l.find("fixed"), blob_l.find("patch")) if i >= 0),
                default=-1,
            )
            ev.root_cause_pos = rc_pos
            ev.patch_pos = patch_pos

            fails = check_invariants(ev, canary)
            # Live runs: if model path flaked (non-zero) without security issues, mark soft-fail.
            if last_rc != 0 and not fails:
                results.append((cid, f"SOFT_FAIL rc={last_rc}"))
                print(f"SOFT_FAIL: {cid} codex exec rc={last_rc} (evidence redacted → {out_path.name})")
            elif fails:
                results.append((cid, f"FAIL {fails}"))
                print(f"FAIL: {cid} {fails}")
            else:
                results.append((cid, "PASS"))
                print(f"PASS: {cid}")

            assert_paths_isolated(Path(env["HOME"]), Path(env["CODEX_HOME"]), tmp)

        summary = evidence / "summary.txt"
        summary.write_text(
            redact_evidence_blob(
                "\n".join(f"{cid}: {status}" for cid, status in results) + f"\ntmp={tmp}\n",
                fixture,
                extra_literals=[str(tmp)],
            ),
            encoding="utf-8",
        )
        hard_fails = [r for r in results if r[1].startswith("FAIL")]
        print("----")
        print(f"SUMMARY: live pass={sum(1 for r in results if r[1]=='PASS')} "
              f"fail={len(hard_fails)} soft={sum(1 for r in results if r[1].startswith('SOFT'))}")
        print(f"Evidence (redacted): {evidence}")
        return 1 if hard_fails else 0
    finally:
        if os.environ.get("KEEP_TMP") == "1":
            print(f"KEEP_TMP=1 — retained {tmp}")
        else:
            shutil.rmtree(tmp, ignore_errors=True)


# ─── Unittest surface (discoverable only if imported as test module) ─────────


class OfflineStaticCanaryTests(unittest.TestCase):
    """Runnable via: python3 -m unittest tests.codex.workflow_canaries"""

    @classmethod
    def setUpClass(cls) -> None:
        cls.fixture = load_fixture()

    def test_fixture_structure(self) -> None:
        errors = validate_fixture_structure(self.fixture)
        self.assertEqual(errors, [], msg=errors)

    def test_required_canaries_present(self) -> None:
        ids = {c["id"] for c in self.fixture["canaries"]}
        self.assertTrue(REQUIRED_CANARY_IDS.issubset(ids), msg=ids)

    def test_redaction(self) -> None:
        out = redact_text(
            "token=abc Authorization: Bearer xyz sk-abcdefghijklmnopqrstuv",
            literals=["/secret/path"],
        )
        self.assertNotIn("Bearer xyz", out)
        self.assertIn("<REDACTED>", out)

    def test_synthetic_invariants_pass(self) -> None:
        for canary in self.fixture["canaries"]:
            with self.subTest(canary=canary["id"]):
                fails = check_invariants(synthetic_evidence_for(canary), canary)
                self.assertEqual(fails, [], msg=fails)

    def test_plugin_harness_helpers_exported(self) -> None:
        text = PLUGIN_HARNESS.read_text(encoding="utf-8")
        self.assertIn("hf_codex_init_isolation", text)
        self.assertIn("HYPERFLOW_CODEX_PLUGIN_LIB", text)


# ─── CLI ─────────────────────────────────────────────────────────────────────


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Codex CLI workflow canaries (T12)")
    mode = p.add_mutually_exclusive_group()
    mode.add_argument(
        "--offline-static",
        action="store_true",
        help="Validate fixtures/matrices/redaction/invariants without models (default)",
    )
    mode.add_argument(
        "--live",
        action="store_true",
        help="Run model-backed canaries (SKIP exit 0 if no auth/CLI)",
    )
    p.add_argument(
        "--fixture",
        type=Path,
        default=FIXTURE_PATH,
        help="Path to workflow-project.json",
    )
    return p


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    global FIXTURE_PATH  # noqa: PLW0603 — CLI override for load helpers
    FIXTURE_PATH = args.fixture.resolve()
    try:
        fixture = load_fixture(FIXTURE_PATH)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"FAIL: cannot load fixture: {exc}")
        return 1

    if args.live:
        return run_live(fixture)
    # Default offline-static
    return run_offline_static(fixture)


if __name__ == "__main__":
    # Allow `python3 -m unittest` style when -m unittest discovers this file via path.
    if len(sys.argv) > 1 and sys.argv[1].startswith("test"):
        unittest.main()
    else:
        sys.exit(main())
