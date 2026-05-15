#!/usr/bin/env python3
"""
generate-demo-cast.py
Writes a synthesized asciinema v2 cast file simulating a Hyperflow demo session.
Content is driven by config/features.json so every release reflects the latest
capabilities automatically.

Usage:
    python3 scripts/generate-demo-cast.py [--output PATH]
"""

import argparse
import json
import os
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Features loader
# ---------------------------------------------------------------------------

def load_features() -> dict:
    ROOT = Path(__file__).resolve().parent.parent
    return json.loads((ROOT / "config" / "features.json").read_text())


# ---------------------------------------------------------------------------
# Cast DSL
# ---------------------------------------------------------------------------

class Cast:
    """Minimal DSL for building an asciinema v2 event list."""

    def __init__(self):
        self.t: float = 0.0
        self.events: list = []

    def wait(self, seconds: float) -> "Cast":
        self.t += seconds
        return self

    def out(self, text: str, char_delay: float = 0.0) -> "Cast":
        """Emit text as a single event (or char-by-char if char_delay > 0)."""
        if char_delay > 0:
            for ch in text:
                self.events.append([round(self.t, 4), "o", ch])
                self.t += char_delay
        else:
            self.events.append([round(self.t, 4), "o", text])
        return self

    def type(self, text: str, char_delay: float = 0.06) -> "Cast":
        """Simulate user typing keystrokes with per-character delay."""
        return self.out(text, char_delay=char_delay)

    def line(self, text: str) -> "Cast":
        """Emit text followed by CRLF as a single event."""
        self.events.append([round(self.t, 4), "o", text + "\r\n"])
        return self

    def prompt(self, label: str = "$ ") -> "Cast":
        """Emit a shell prompt."""
        self.events.append([round(self.t, 4), "o", label])
        return self


# ---------------------------------------------------------------------------
# ANSI helpers
# ---------------------------------------------------------------------------

RESET   = "\x1b[0m"
BOLD    = "\x1b[1m"
MAGENTA = "\x1b[35m"   # Orchestrator / banner
CYAN    = "\x1b[36m"   # Workers / Sonnet
GREEN   = "\x1b[32m"   # Success ✓
RED     = "\x1b[31m"   # Failure ✗ / BLOCKED / SECURITY_VIOLATION
YELLOW  = "\x1b[33m"   # Memory
GRAY    = "\x1b[90m"   # Dim/secondary

def mg(s: str) -> str:   return MAGENTA + s + RESET
def cy(s: str) -> str:   return CYAN    + s + RESET
def gn(s: str) -> str:   return GREEN   + s + RESET
def rd(s: str) -> str:   return RED     + s + RESET
def yl(s: str) -> str:   return YELLOW  + s + RESET
def gr(s: str) -> str:   return GRAY    + s + RESET
def bo(s: str) -> str:   return BOLD    + s + RESET
def rb(s: str) -> str:   return RED + BOLD + s + RESET   # red bold


# ---------------------------------------------------------------------------
# Demo script — 8 scenes, ~32s total, driven by features.json
# Elegant style: no ⚡, ✓, ✗ icons. Em-dash separators. Bold for thinking-tier.
# ---------------------------------------------------------------------------

def script(features: dict) -> Cast:
    c = Cast()

    version    = features["version"]
    providers  = features["providers"]
    layers     = features["layers"]
    skills     = features["skills"]
    detection  = features["detection"]
    memory_cfg = features["memory"]
    caps       = features["capabilities"]

    first_provider = providers[0]

    # ── Scene 1 · Activation (0–5s) ──────────────────────────────────────────
    c.prompt("~/hyperflow-demo $ ")
    c.wait(0.6)
    c.type("claude")
    c.wait(0.3)
    c.out("\r\n")
    c.wait(0.5)

    c.line(mg(f"Hyperflow v{version}"))
    c.wait(0.35)
    c.line(
        gr("Thinking: ") + mg(first_provider["thinking"]) +
        gr("  ·  Worker: ") + cy(first_provider["worker"])
    )
    c.wait(0.5)
    c.line(gr("Analyzing project — 4 searchers in parallel"))
    c.wait(0.8)
    c.line(gn("Cached") + gr(" — .hyperflow/ ready · no incomplete tasks"))
    c.wait(0.8)
    # Scene 1 ends ≈ 5s

    # ── Scene 2 · 10-layer overview ──────────────────────────────────────────
    c.line(gr(""))
    c.line(gr("[layers]"))
    c.wait(0.2)
    for layer in layers:
        c.line(
            gr(f"  Layer {layer['n']} — ") +
            bo(layer["name"]) +
            gr(" — ") +
            layer["summary"]
        )
        c.wait(0.16)
    c.wait(0.5)
    # Scene 2 ends ≈ 12s

    # ── Scene 3 · Chain-of-skills ────────────────────────────────────────────
    c.line(gr(""))
    c.line(gr("[skills]  ") + gr("chain: ") + cy("scaffold → spec → scope → dispatch → audit → deploy"))
    c.wait(0.2)
    for skill in skills:
        chain_marker = {"starter": gr(" → "), "endpoint": gr(" ◇ "), "standalone": gr(" · ")}.get(
            skill.get("chain", "standalone"), gr(" · ")
        )
        c.line(cy(f"  {skill['command']:24s}") + chain_marker + skill["tagline"])
        c.wait(0.16)
    c.wait(0.5)
    # Scene 3 ends ≈ 17s

    # ── Scene 4 · Multi-tool detection ────────────────────────────────────────
    c.line(gr(""))
    c.line(gr("[detection]  multi-tool shim installation"))
    c.wait(0.2)
    for shim in detection["shims"]:
        c.line(
            gr("  ") + gn("ok") + gr("  ") +
            cy(shim["file"]) +
            gr(f"  ({shim['tool']})")
        )
        c.wait(0.18)
    c.wait(0.5)
    # Scene 4 ends ≈ 20s

    # ── Scene 5 · Cache (memory) in action ───────────────────────────────────
    c.line(gr(""))
    c.prompt()
    c.wait(0.5)
    c.type("/hyperflow:cache show")
    c.wait(0.3)
    c.out("\r\n")
    c.wait(0.4)

    c.line(yl("[cache]") + gr(f"  location: {memory_cfg['location']}"))
    c.wait(0.25)
    c.line(yl("  1") + gr("  hot   ") + "auth uses JWT RS256, not HS256   " + gr("(tags: auth, security)"))
    c.wait(0.2)
    c.line(yl("  2") + gr("  hot   ") + "zod is project-wide validation   " + gr("(tags: validation, zod)"))
    c.wait(0.2)
    c.line(yl("  3") + gr("  warm  ") + "Postgres uses UTC timestamps     " + gr("(tags: db, conventions)"))
    c.wait(0.3)
    c.line(gr("  tiers:"))
    for tier in memory_cfg["tiers"]:
        c.line(gr(f"    {tier['name']:6s}  age {tier['age']:18s}  load: {tier['load']}"))
        c.wait(0.16)
    c.wait(0.5)
    # Scene 5 ends ≈ 24s

    # ── Scene 6 · Chain in action ────────────────────────────────────────────
    c.line(gr(""))
    c.prompt()
    c.wait(0.5)
    c.type("/hyperflow:spec \"Add authentication middleware\"")
    c.wait(0.3)
    c.out("\r\n")
    c.wait(0.5)

    c.line(mg("Triage") + gr(" — types: [api, security] · complexity: moderate · profile: standard"))
    c.wait(0.35)
    c.line(mg("Spec") + gr(" — design approved (standard depth)"))
    c.wait(0.3)
    c.line(mg("Scope") + gr(" — task file written: .hyperflow/tasks/auth.md"))
    c.wait(0.4)
    c.line(mg("Dispatch") + gr(" — parallel workers (single message, three Agent calls):"))
    c.wait(0.3)
    c.line(cy("  Searcher      ") + gr("— ") + "analyse existing auth patterns")
    c.wait(0.25)
    c.line(cy("  Implementer   ") + gr("— ") + "write middleware + tests")
    c.wait(0.25)
    c.line(bo("  Reviewer      ") + gr("— ") + "two-pass security + quality review")
    c.wait(0.5)
    c.out(gr("  running"))
    for _ in range(5):
        c.wait(0.35)
        c.out(gr("·"))
    c.out(gr("  done") + "\r\n")
    c.wait(0.4)

    c.line(gr("gates — ") + "lint: " + gn("pass") + " · typecheck: " + gn("pass") + " · tests: " + gn("pass") + " · build: " + gn("pass"))
    c.wait(0.4)
    c.line(gr("── Hyperflow Usage ─────────────────────────────────────────"))
    c.wait(0.18)
    c.line(gr("Triage                          1 agent     1.8k tokens"))
    c.wait(0.16)
    c.line(gr("Spec depth: standard            1 agent     3.2k tokens"))
    c.wait(0.16)
    c.line(gr("Profile: standard               —           —"))
    c.wait(0.16)
    c.line(mg("Thinking") + gr(f"  ({first_provider['thinking']:10s})  ") + "3 agents   " + yl("48.1k") + gr(" tokens"))
    c.wait(0.16)
    c.line(cy("Worker  ") + gr(f"  ({first_provider['worker']:10s})  ") + "3 agents  " + yl("109.4k") + gr(" tokens"))
    c.wait(0.16)
    c.line(gr("Escalations                     0"))
    c.wait(0.16)
    c.line(bo("Total") + gr("                           7 agents  ") + yl("162.5k") + gr(" tokens"))
    c.wait(0.18)
    c.line(gr("────────────────────────────────────────────────────────────"))
    c.wait(0.6)
    # Scene 6 ends ≈ 33s

    # ── Scene 7 · Capabilities recap ─────────────────────────────────────────
    c.line(gr(""))
    c.line(gr("[capabilities]"))
    c.wait(0.2)
    for cap in caps[:6]:
        c.line(gr("  — ") + cap)
        c.wait(0.16)
    c.wait(0.4)
    # Scene 7 ends ≈ 37s

    # ── Scene 8 · Closing ─────────────────────────────────────────────────────
    c.line(gr(""))
    c.line(gn("ready") + gr("  — github.com/Mohammed-Abdelhady/hyperflow"))
    c.wait(4.0)
    # Scene 8 ends ≈ 42s

    return c


# ---------------------------------------------------------------------------
# Writer
# ---------------------------------------------------------------------------

HEADER = {
    "version": 2,
    "width": 120,
    "height": 34,
    "timestamp": 1715760000,
    "title": "Hyperflow — autonomous multi-agent orchestration",
    "env": {"SHELL": "/bin/zsh", "TERM": "xterm-256color"},
}


def write_cast(cast: Cast, output_path: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(HEADER, separators=(",", ":")) + "\n")
        for event in cast.events:
            fh.write(json.dumps(event, separators=(",", ":"), ensure_ascii=False) + "\n")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate a synthesized asciinema v2 cast for the Hyperflow demo."
    )
    parser.add_argument(
        "--output",
        default=os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "docs", "assets", "demo.cast",
        ),
        help="Output path for the .cast file (default: docs/assets/demo.cast)",
    )
    args = parser.parse_args()

    features = load_features()
    cast = script(features)
    write_cast(cast, args.output)

    duration = cast.t
    line_count = 1 + len(cast.events)  # header + events

    print(f"Cast written to : {os.path.abspath(args.output)}")
    print(f"Total duration  : {duration:.2f}s")
    print(f"Total lines     : {line_count}")


if __name__ == "__main__":
    main()
