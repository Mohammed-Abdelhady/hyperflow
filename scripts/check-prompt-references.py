#!/usr/bin/env python3
"""Validate that duplicated prompt references resolve to canonical contracts."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POINTERS = {
    "skills/dispatch/references/worker-prompt.md": "skills/hyperflow/worker-prompt.md",
}
MAX_POINTER_CHARS = 2000


def check(root: Path) -> list[str]:
    errors: list[str] = []
    for pointer_name, canonical_name in POINTERS.items():
        pointer = root / pointer_name
        canonical = root / canonical_name
        if not pointer.is_file():
            errors.append(f"missing:{pointer_name}")
            continue
        if not canonical.is_file():
            errors.append(f"missing-canonical:{canonical_name}")
            continue
        text = pointer.read_text(encoding="utf-8", errors="replace")
        if len(text) > MAX_POINTER_CHARS:
            errors.append(f"pointer-too-large:{pointer_name}:{len(text)}>{MAX_POINTER_CHARS}")
        if canonical_name not in text:
            errors.append(f"canonical-path-not-mentioned:{pointer_name}->{canonical_name}")
        if "# Worker Prompt Template" not in text:
            errors.append(f"missing-reference-heading:{pointer_name}")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    errors = check(args.root.resolve())
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"OK: {len(POINTERS)} canonical prompt reference(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
