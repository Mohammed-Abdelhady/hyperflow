#!/usr/bin/env python3
"""Hard token-budget decisions enforced at natural phase boundaries."""

from __future__ import annotations

import argparse
import json
import sys
from copy import deepcopy
from pathlib import Path
from typing import Mapping


PHASES = ("triage", "planning", "execution", "review", "verification")
HARD_TOTALS = {
    "fast": 10_000,
    "standard": 50_000,
    "deep": 200_000,
    "research": 60_000,
    "creative": 100_000,
    "scientific": 200_000,
}
PHASE_CAPS = {
    "fast": dict(zip(PHASES, (1_000, 1_000, 6_000, 1_000, 1_000))),
    "standard": dict(zip(PHASES, (2_000, 10_000, 25_000, 8_000, 5_000))),
    "deep": dict(zip(PHASES, (3_000, 40_000, 110_000, 35_000, 12_000))),
    "research": dict(zip(PHASES, (2_000, 8_000, 35_000, 10_000, 5_000))),
    "creative": dict(zip(PHASES, (2_000, 25_000, 45_000, 20_000, 8_000))),
    "scientific": dict(zip(PHASES, (3_000, 30_000, 90_000, 55_000, 22_000))),
}
DEGRADE_TARGETS = {
    "standard": "fast",
    "deep": "standard",
    "creative": "standard",
}


def _positive_int(value: object, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        raise ValueError(f"{label} must be a positive integer")
    return value


def _nonnegative_int(value: object, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError(f"{label} must be a non-negative integer")
    return value


def _budget_section(config: Mapping[str, object] | None) -> Mapping[str, object]:
    if config is None:
        return {}
    if "budgets" in config:
        section = config["budgets"]
    elif "hardTotals" in config or "phaseCaps" in config:
        section = config
    else:
        return {}
    if not isinstance(section, Mapping):
        raise ValueError("budgets configuration must be an object")
    unknown = set(section) - {"hardTotals", "phaseCaps"}
    if unknown:
        raise ValueError(f"unknown budgets configuration key(s): {sorted(unknown)}")
    return section


def load_limits(
    config: Mapping[str, object] | None = None,
) -> tuple[dict[str, int], dict[str, dict[str, int]]]:
    """Load defaults plus validated partial ``budgets`` overrides."""

    totals = dict(HARD_TOTALS)
    phases = deepcopy(PHASE_CAPS)
    section = _budget_section(config)

    total_overrides = section.get("hardTotals", {})
    if not isinstance(total_overrides, Mapping):
        raise ValueError("budgets.hardTotals must be an object")
    for profile, raw_value in total_overrides.items():
        if profile not in totals:
            raise ValueError(f"unknown budget profile: {profile}")
        new_total = _positive_int(raw_value, f"hard total for {profile}")
        old_total = totals[profile]
        totals[profile] = new_total
        ratio = new_total / old_total
        phases[profile] = {
            phase: max(1, int(cap * ratio)) for phase, cap in phases[profile].items()
        }

    phase_overrides = section.get("phaseCaps", {})
    if not isinstance(phase_overrides, Mapping):
        raise ValueError("budgets.phaseCaps must be an object")
    for profile, raw_caps in phase_overrides.items():
        if profile not in phases:
            raise ValueError(f"unknown budget profile: {profile}")
        if not isinstance(raw_caps, Mapping):
            raise ValueError(f"phase caps for {profile} must be an object")
        for phase, raw_value in raw_caps.items():
            if phase not in PHASES:
                raise ValueError(f"unknown budget phase: {phase}")
            phases[profile][phase] = _positive_int(
                raw_value, f"phase cap for {profile}.{phase}"
            )

    for profile, caps in phases.items():
        for phase, cap in caps.items():
            if cap > totals[profile]:
                raise ValueError(
                    f"phase cap {profile}.{phase} exceeds hard total {totals[profile]}"
                )
        if sum(caps.values()) > totals[profile]:
            raise ValueError(f"phase caps for {profile} exceed its hard total")

    return totals, phases


def load_config(path: str | Path) -> Mapping[str, object]:
    try:
        value = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"cannot load budget config: {exc}") from exc
    if not isinstance(value, Mapping):
        raise ValueError("budget config root must be an object")
    return value


def _deep_merge(
    base: Mapping[str, object], override: Mapping[str, object]
) -> dict[str, object]:
    merged: dict[str, object] = deepcopy(dict(base))
    for key, value in override.items():
        existing = merged.get(key)
        if isinstance(existing, Mapping) and isinstance(value, Mapping):
            merged[key] = _deep_merge(existing, value)
        else:
            merged[key] = deepcopy(value)
    return merged


def load_runtime_config(
    explicit_path: str | Path | None = None,
    *,
    repo_root: str | Path | None = None,
    home: str | Path | None = None,
) -> Mapping[str, object]:
    """Load explicit config, or repo defaults with optional user overrides."""

    if explicit_path is not None:
        return load_config(explicit_path)

    root = (
        Path(repo_root)
        if repo_root is not None
        else Path(__file__).resolve().parent.parent
    )
    merged = dict(load_config(root / "config" / "defaults.json"))
    user_home = Path(home) if home is not None else Path.home()
    user_config = user_home / ".hyperflow" / "config.json"
    if user_config.is_file():
        override = load_config(user_config)
        override_budgets = _budget_section(override)
        override_totals = override_budgets.get("hardTotals", {})
        override_caps = override_budgets.get("phaseCaps", {})
        if isinstance(override_totals, Mapping) and isinstance(override_caps, Mapping):
            merged_budgets = merged.get("budgets")
            if isinstance(merged_budgets, dict):
                merged_caps = merged_budgets.get("phaseCaps")
                if isinstance(merged_caps, dict):
                    for profile in override_totals:
                        merged_caps.pop(profile, None)
        merged = _deep_merge(merged, override)
    return merged


def evaluate_budget(
    profile: str,
    phase: str,
    *,
    total_used: int,
    phase_used: int,
    at_boundary: bool,
    reserved_tokens: int = 0,
    allow_degrade: bool = False,
    config: Mapping[str, object] | None = None,
) -> dict[str, object]:
    """Return ``continue``, ``degrade``, or ``halt`` for a budget checkpoint."""

    totals, phase_caps = load_limits(config)
    if profile not in totals:
        raise ValueError(f"unknown budget profile: {profile}")
    if phase not in PHASES:
        raise ValueError(f"unknown budget phase: {phase}")
    total_used = _nonnegative_int(total_used, "total_used")
    phase_used = _nonnegative_int(phase_used, "phase_used")
    reserved_tokens = _nonnegative_int(reserved_tokens, "reserved_tokens")
    if phase_used > total_used:
        raise ValueError("phase_used cannot exceed total_used")

    hard_total = totals[profile]
    phase_cap = phase_caps[profile][phase]
    projected_total = total_used + reserved_tokens
    projected_phase = phase_used + reserved_tokens
    total_exhausted = total_used >= hard_total
    phase_exhausted = phase_used >= phase_cap
    total_launch_exceeds = reserved_tokens > 0 and projected_total > hard_total
    phase_launch_exceeds = reserved_tokens > 0 and projected_phase > phase_cap
    base: dict[str, object] = {
        "profile": profile,
        "phase": phase,
        "at_boundary": at_boundary,
        "total_used": total_used,
        "hard_total": hard_total,
        "total_remaining": max(0, hard_total - total_used),
        "reserved_tokens": reserved_tokens,
        "projected_total": projected_total,
        "total_remaining_after_reserved": max(0, hard_total - projected_total),
        "phase_used": phase_used,
        "phase_cap": phase_cap,
        "phase_remaining": max(0, phase_cap - phase_used),
        "projected_phase": projected_phase,
        "phase_remaining_after_reserved": max(0, phase_cap - projected_phase),
    }

    if not (
        total_exhausted
        or phase_exhausted
        or total_launch_exceeds
        or phase_launch_exceeds
    ):
        return {"decision": "continue", "reason": "within_budget", **base}

    if total_exhausted:
        exhausted = "hard_total_reached"
    elif total_launch_exceeds:
        exhausted = "hard_total_would_be_exceeded"
    elif phase_exhausted:
        exhausted = "phase_cap_reached"
    else:
        exhausted = "phase_cap_would_be_exceeded"
    if not at_boundary:
        return {
            "decision": "continue",
            "reason": f"{exhausted}_enforce_at_next_boundary",
            "pending_decision": (
                "halt"
                if total_exhausted or total_launch_exceeds
                else "degrade_or_halt"
            ),
            **base,
        }

    if (
        not total_exhausted
        and not total_launch_exceeds
        and allow_degrade
        and profile in DEGRADE_TARGETS
    ):
        target = DEGRADE_TARGETS[profile]
        if projected_total <= totals[target]:
            return {
                "decision": "degrade",
                "reason": exhausted,
                "target_profile": target,
                **base,
            }

    return {"decision": "halt", "reason": exhausted, **base}


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", required=True, choices=tuple(HARD_TOTALS))
    parser.add_argument("--phase", required=True, choices=PHASES)
    parser.add_argument("--total-used", required=True, type=int)
    parser.add_argument("--phase-used", required=True, type=int)
    parser.add_argument("--reserved-tokens", type=int, default=0)
    parser.add_argument("--boundary", action="store_true")
    parser.add_argument("--allow-degrade", action="store_true")
    parser.add_argument("--config")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        config = load_runtime_config(args.config)
        result = evaluate_budget(
            args.profile,
            args.phase,
            total_used=args.total_used,
            phase_used=args.phase_used,
            at_boundary=args.boundary,
            reserved_tokens=args.reserved_tokens,
            allow_degrade=args.allow_degrade,
            config=config,
        )
    except ValueError as exc:
        result = {"decision": "halt", "reason": "invalid_input", "error": str(exc)}
        print(json.dumps(result, sort_keys=True))
        return 2
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
