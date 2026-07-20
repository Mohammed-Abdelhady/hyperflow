#!/usr/bin/env python3
"""Validate config/host-parity.json shape and README claim consistency."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    path = ROOT / "config" / "host-parity.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    hosts = data.get("hosts") or []
    if len(hosts) < 5:
        print("FAIL: expected at least 5 hosts")
        return 1
    ids = set()
    for h in hosts:
        for key in ("id", "claim", "smoke", "status"):
            if key not in h:
                print(f"FAIL: host missing {key}: {h}")
                return 1
        if h["id"] in ids:
            print(f"FAIL: duplicate host id {h['id']}")
            return 1
        ids.add(h["id"])
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    codex = next(h for h in hosts if h["id"] == "codex-cli")
    if codex["status"] == "preview_uncertified" and "preview" not in readme.lower():
        print("FAIL: codex preview status but README lacks preview wording")
        return 1
    print(f"PASS host-parity ({len(hosts)} hosts)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
