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
def worker(s: str) -> str:   return CYAN    + s + RESET
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
    c.wait(0.36)
    c.type("claude")
    c.wait(0.20)
    c.out("\r\n")
    c.wait(0.30)

    c.line(mg(f"Hyperflow v{version}"))
    c.wait(0.12)
    c.line(
        gr("Thinking: ") + mg(first_provider["thinking"]) +
        gr("  ·  Worker: ") + worker(first_provider["worker"])
    )
    c.wait(0.30)
    c.line(gr("Analyzing project — 4 searchers in parallel"))
    c.wait(0.8)
    c.line(gn("Cached") + gr(" — .hyperflow/ ready · no incomplete tasks"))
    c.wait(0.8)
    # Scene 1 ends ≈ 5s

    # ── Scene 2 · 10-layer overview ──────────────────────────────────────────
    c.line(gr(""))
    c.line(gr("[layers]"))
    c.wait(0.14)
    for layer in layers:
        c.line(
            gr(f"  Layer {layer['n']} — ") +
            bo(layer["name"]) +
            gr(" — ") +
            layer["summary"]
        )
        c.wait(0.12)
    c.wait(0.30)
    # Scene 2 ends ≈ 12s

    # ── Scene 3 · Chain-of-skills ────────────────────────────────────────────
    c.line(gr(""))
    c.line(gr("[skills]  ") + gr("chain: ") + worker("scaffold → spec → scope → dispatch → audit → deploy"))
    c.wait(0.14)
    for skill in skills:
        chain_marker = {"starter": gr(" → "), "endpoint": gr(" ◇ "), "standalone": gr(" · ")}.get(
            skill.get("chain", "standalone"), gr(" · ")
        )
        c.line(worker(f"  {skill['command']:24s}") + chain_marker + skill["tagline"])
        c.wait(0.12)
    c.wait(0.30)
    # Scene 3 ends ≈ 17s

    # ── Scene 4 · Multi-tool detection ────────────────────────────────────────
    c.line(gr(""))
    c.line(gr("[detection]  multi-tool shim installation"))
    c.wait(0.14)
    for shim in detection["shims"]:
        c.line(
            gr("  ") + gn("ok") + gr("  ") +
            worker(shim["file"]) +
            gr(f"  ({shim['tool']})")
        )
        c.wait(0.13)
    c.wait(0.30)
    # Scene 4 ends ≈ 20s

    # ── Scene 5 · Cache (memory) in action ───────────────────────────────────
    c.line(gr(""))
    c.prompt()
    c.wait(0.30)
    c.type("/hyperflow:cache show")
    c.wait(0.20)
    c.out("\r\n")
    c.wait(0.24)

    c.line(yl("[cache]") + gr(f"  location: {memory_cfg['location']}"))
    c.wait(0.13)
    c.line(yl("  1") + gr("  hot   ") + "auth uses JWT RS256, not HS256   " + gr("(tags: auth, security)"))
    c.wait(0.14)
    c.line(yl("  2") + gr("  hot   ") + "zod is project-wide validation   " + gr("(tags: validation, zod)"))
    c.wait(0.14)
    c.line(yl("  3") + gr("  warm  ") + "Postgres uses UTC timestamps     " + gr("(tags: db, conventions)"))
    c.wait(0.20)
    c.line(gr("  tiers:"))
    for tier in memory_cfg["tiers"]:
        c.line(gr(f"    {tier['name']:6s}  age {tier['age']:18s}  load: {tier['load']}"))
        c.wait(0.12)
    c.wait(0.30)
    # Scene 5 ends ≈ 24s

    # ── Scene 6 · Chain in action (matches real Claude Code transcript) ─────
    # Real-Claude-Code markers used:
    #   ⏺  — filled-circle status bullet (Claude's "I'm doing X" line)
    #   ⎿  — tree connector below a status bullet for the result
    #   Skill(name) / Agent(label) / Bash(...) / Write(path) / Explore(label)
    #     — Claude Code tool-use headers
    #   Done (N tool uses · Xk tokens · Ym Zs) — real result-line format
    c.line(gr(""))
    c.prompt()
    c.wait(0.20)
    c.type("/hyperflow:spec \"Add authentication with login + middleware\"", char_delay=0.04)
    c.wait(0.13)
    c.out("\r\n")
    c.wait(0.20)

    # ── Skill load · spec ────────────────────────────────────────────────────
    c.line(mg("⏺") + gr(" ") + bo("Skill") + gr("(hyperflow:spec)"))
    c.line(gr("  ⎿  Successfully loaded skill"))
    c.wait(0.24)

    # ── Step 0 gate · chain mode (with Recommended marker) ──────────────────
    c.line(gr(""))
    c.line(yl("?  How should I advance through the chain after each phase?"))
    c.wait(0.13)
    c.line(gr("   ") + bo("Auto (Recommended)") + gr("  — chain forward with no gates. faster, fewer interruptions."))
    c.wait(0.13)
    c.line(gr("   Manual               — pause between phases and ask before advancing."))
    c.wait(0.15)
    c.line(gr("   your choice: ") + worker("Auto"))
    c.wait(0.24)

    # ── Triage (Layer 0.5) — shown as a real Agent dispatch ──────────────────
    c.line(gr(""))
    c.line(mg("⏺") + gr(" ") + bo("Agent") + gr("(Classifier — triage)"))
    c.line(gr("  ⎿  Done (4 tool uses · 1.8k tokens · 6s)"))
    c.wait(0.12)
    c.line(gr("  Triage — types:[api, security, frontend] · flow: ") + bo("standard") + gr(" · ambiguity: 0.4 (light)"))
    c.wait(0.24)

    # ── Spec context · real Explore() dispatch ──────────────────────────────
    c.line(gr(""))
    c.line(mg("⏺") + gr(" ") + bo("Explore") + gr("(Map existing auth context)"))
    c.line(gr("  ⎿  Done (18 tool uses · 22.4k tokens · 32s)"))
    c.wait(0.13)
    c.line(mg("⏺") + gr(" ") + bo("Agent") + gr("(**Reviewer** — context coverage)"))
    c.line(gr("  ⎿  Done (3 tool uses · 6.1k tokens · 9s) · ") + gn("PASS"))
    c.wait(0.20)

    # ── Spec questions (floor 2 · Recommended marker) ────────────────────────
    c.line(gr(""))
    c.line(mg("⏺") + gr(" Context map is dense. Asking the 2 questions that steer the design."))
    c.wait(0.18)
    c.line(gr(""))
    c.line(yl("?  Token storage approach?"))
    c.wait(0.13)
    c.line(gr("   ") + bo("Server sessions (Recommended)") + gr("  — revocable, refreshable, fits this project's DB conventions"))
    c.wait(0.12)
    c.line(gr("   JWT stateless                 — simpler, no DB, harder to revoke"))
    c.wait(0.14)
    c.line(gr("   your choice: ") + worker("Server sessions"))
    c.wait(0.24)
    c.line(gr(""))
    c.line(yl("?  Password reset flow?"))
    c.wait(0.13)
    c.line(gr("   ") + bo("Email link, 1-hour expiry (Recommended)"))
    c.wait(0.12)
    c.line(gr("   SMS code"))
    c.wait(0.14)
    c.line(gr("   your choice: ") + worker("Email link"))
    c.wait(0.24)

    # ── Spec phase Analyst → 5 sections → spec file ──────────────────────────
    c.line(gr(""))
    c.line(mg("⏺") + gr(" ") + bo("Agent") + gr("(**Analyst** — 6-dim exploration)"))
    c.line(gr("  ⎿  Done (6 tool uses · 14.8k tokens · 28s)"))
    c.wait(0.18)
    c.line(mg("⏺") + gr(" Writing 5 design sections — each ") + worker("Writer") + gr(" → ") + bo("**Reviewer**") + gr(" → you ") + gn("approve"))
    c.wait(0.13)
    c.line(gr("  ⎿  Architecture · Data flow · Key decisions · Edge cases · File structure  ") + gn("all approved"))
    c.wait(0.24)
    c.line(mg("⏺") + gr(" ") + bo("Write") + gr("(.hyperflow/specs/auth.md)"))
    c.line(gr("  ⎿  Wrote 142 lines"))
    c.wait(0.18)
    c.line(mg("⏺") + gr(" Spec complete — design approved (autonomous mode). Auto-chaining to ") + worker("/hyperflow:scope") + gr("."))
    c.wait(0.30)

    # ── Skill load · scope ───────────────────────────────────────────────────
    c.line(gr(""))
    c.line(mg("⏺") + gr(" ") + bo("Skill") + gr("(hyperflow:scope)"))
    c.line(gr("  ⎿  Successfully loaded skill"))
    c.wait(0.18)
    c.line(mg("⏺") + gr(" ") + bo("Explore") + gr("(Affected files + tests)"))
    c.line(gr("  ⎿  Done (12 tool uses · 18.6k tokens · 22s)"))
    c.wait(0.14)
    c.line(mg("⏺") + gr(" ") + bo("Agent") + gr("(**Planner** — batch graph)"))
    c.line(gr("  ⎿  Done (4 tool uses · 9.2k tokens · 17s)"))
    c.wait(0.14)
    c.line(mg("⏺") + gr(" ") + bo("Write") + gr("(.hyperflow/tasks/auth.md)"))
    c.line(gr("  ⎿  Wrote 78 lines"))
    c.wait(0.20)

    # ── Real-style batch table (matches /hyperflow:scope output) ─────────────
    c.line(gr(""))
    c.line(mg("⏺") + gr(" Plan ready — .hyperflow/tasks/auth.md (") + bo("2 batches, 5 sub-tasks") + gr(")."))
    c.wait(0.18)
    c.line(gr(""))
    c.line(gr("  ┌───────┬──────────────┬────────────────────────────────────────┐"))
    c.line(gr("  │ ") + bo("Batch") + gr(" │ ") + bo("Workers") + gr("      │ ") + bo("Theme") + gr("                                  │"))
    c.line(gr("  ├───────┼──────────────┼────────────────────────────────────────┤"))
    c.line(gr("  │ 1     │ 3 parallel   │ User model · auth middleware · search  │"))
    c.line(gr("  │ 2     │ 1 sequential │ Login + reset pages (uses batch 1)     │"))
    c.line(gr("  └───────┴──────────────┴────────────────────────────────────────┘"))
    c.wait(0.30)
    c.line(gr(""))
    c.line(gr("  Auto-chaining to ") + worker("/hyperflow:dispatch") + gr("."))
    c.wait(0.30)

    # ── Skill load · dispatch + Batch 1 (real multi-worker tree) ────────────
    c.line(gr(""))
    c.line(mg("⏺") + gr(" ") + bo("Skill") + gr("(hyperflow:dispatch)"))
    c.line(gr("  ⎿  Successfully loaded skill"))
    c.wait(0.20)
    c.line(mg("⏺") + gr(" Auto mode, task loaded. Batch 1 — 3 parallel workers (persona-stitched)."))
    c.wait(0.20)
    c.line(mg("⏺") + gr(" 3 agents finished ") + gr("(ctrl+o to expand)"))
    c.line(gr("   ├ T1: ") + worker("Searcher") + gr(" ") + yl("[security + api]") + gr(" · 8 tool uses · 14.2k tokens"))
    c.line(gr("   │ ⎿  Done"))
    c.line(gr("   ├ T2: ") + worker("Implementer") + gr(" ") + yl("[db + security]") + gr(" · 24 tool uses · 52.1k tokens"))
    c.line(gr("   │ ⎿  Done"))
    c.line(gr("   └ T3: ") + worker("Implementer") + gr(" ") + yl("[security + api]") + gr(" · 22 tool uses · 48.7k tokens"))
    c.line(gr("     ⎿  Done"))
    c.wait(0.20)
    c.line(mg("⏺") + gr(" ") + bo("Agent") + gr("(Batch 1 reviewer (L1–L2))"))
    c.line(gr("  ⎿  Done (14 tool uses · 31.5k tokens · 51s) · ") + gn("PASS"))
    c.wait(0.13)
    c.line(gr("  learnings injected: JWT RS256 · zod validation · server sessions"))
    c.wait(0.13)
    c.line(mg("⏺") + gr(" ") + bo("Bash") + gr("(pnpm vitest run · pnpm tsc --noEmit)"))
    c.line(gr("  ⎿  Test Files 63 passed (63) · Tests 399 passed (399) · typecheck clean"))
    c.wait(0.26)

    # ── Batch 2 ──────────────────────────────────────────────────────────────
    c.line(gr(""))
    c.line(mg("⏺") + gr(" Batch 2 — depends on Batch 1 (1 implementer · sequential)"))
    c.wait(0.18)
    c.line(mg("⏺") + gr(" 1 agent finished"))
    c.line(gr("   └ T4: ") + worker("Implementer") + gr(" ") + yl("[frontend + ui]") + gr(" · 18 tool uses · 38.4k tokens (with batch 1 learnings)"))
    c.line(gr("     ⎿  Done"))
    c.wait(0.18)
    c.line(mg("⏺") + gr(" ") + bo("Agent") + gr("(Final integration reviewer (L1–L2))"))
    c.line(gr("  ⎿  Done (11 tool uses · 24.3k tokens · 42s) · ") + gn("PASS"))
    c.wait(0.13)
    c.line(mg("⏺") + gr(" ") + bo("Bash") + gr("(pnpm vitest · tsc · build · lint)"))
    c.line(gr("  ⎿  All gates ") + gn("pass") + gr(" — 412 tests, 0 type errors, build OK"))
    c.wait(0.26)

    # ── Wrap-up (rule 12) ────────────────────────────────────────────────────
    c.line(gr(""))
    c.line(mg("⏺") + gr(" ") + bo("Agent") + gr("(Wrap-up: delete task · memory append · auto-commit)"))
    c.line(gr("  ⎿  Done (7 tool uses · 9.8k tokens · 11s)"))
    c.wait(0.13)
    c.line(mg("⏺") + gr(" ") + bo("Agent") + gr("(**Reviewer** — wrap-up sanity (rule 12))"))
    c.line(gr("  ⎿  Done (4 tool uses · 7.2k tokens · 14s) · ") + gn("PASS"))
    c.wait(0.30)

    # ── Usage summary ────────────────────────────────────────────────────────
    c.line(gr(""))
    c.line(gr("── Hyperflow Usage ─────────────────────────────────────────"))
    c.wait(0.12)
    c.line(gr("Triage                          1 agent     1.8k tokens"))
    c.wait(0.11)
    c.line(gr("Spec depth: light               1 agent     2.6k tokens"))
    c.wait(0.11)
    c.line(gr("Profile: standard               —           —"))
    c.wait(0.11)
    c.line(mg("Thinking") + gr(f"  ({first_provider['thinking']:10s})  ") + "14 agents   " + yl("89.2k") + gr(" tokens"))
    c.wait(0.11)
    c.line(worker("Worker  ") + gr(f"  ({first_provider['worker']:10s})  ") + "13 agents  " + yl("198.4k") + gr(" tokens"))
    c.wait(0.11)
    c.line(gr("Escalations                     0"))
    c.wait(0.11)
    c.line(bo("Total") + gr("                          29 agents  ") + yl("292.0k") + gr(" tokens"))
    c.wait(0.12)
    c.line(gr("────────────────────────────────────────────────────────────"))
    c.wait(0.28)
    c.line(gr(""))
    c.line(gr("Done · Next: ") + worker("/hyperflow:deploy") + gr(" (gates + commit + push) — user-explicit, not auto."))
    c.wait(0.36)
    # Scene 6 ends ≈ 50s (longer but shows all the interactive gates + reviews)

    # ── Scene 7 · Capabilities recap ─────────────────────────────────────────
    c.line(gr(""))
    c.line(gr("[capabilities]"))
    c.wait(0.14)
    for cap in caps[:6]:
        c.line(gr("  — ") + cap)
        c.wait(0.12)
    c.wait(0.24)
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
