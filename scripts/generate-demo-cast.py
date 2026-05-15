#!/usr/bin/env python3
"""
generate-demo-cast.py
Writes a synthesized asciinema v2 cast file simulating a Hyperflow demo session.
Usage:
    python3 scripts/generate-demo-cast.py [--output PATH]
"""

import argparse
import json
import os
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
VERSION_FILE = os.path.join(REPO_ROOT, "skills", "hyperflow", "VERSION")

def read_version() -> str:
    with open(VERSION_FILE, "r", encoding="utf-8") as fh:
        return fh.read().strip()

VERSION = read_version()

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
# Demo script — 8 beats, ~75s total
# ---------------------------------------------------------------------------

def script() -> Cast:
    c = Cast()

    # ── Beat 1 · Banner (0–5s) ────────────────────────────────────────────
    # Shell prompt, user types "claude", hit enter
    c.prompt("~/hyperflow-demo $ ")
    c.wait(0.8)                     # pause before typing
    c.type("claude")                # 6 chars × 0.06 = 0.36s
    c.wait(0.3)                     # hesitation before Enter
    c.out("\r\n")
    c.wait(0.6)                     # process starts

    # Hyperflow banner lines arrive over ~2.5s
    c.line(mg(f"⚡ Hyperflow v{VERSION}"))
    c.wait(0.45)
    c.line(gr("Thinking: ") + mg("Opus 4.7") + gr("  |  Worker: ") + cy("Sonnet 4.6"))
    c.wait(0.65)
    c.line(gr("[analyzing project · 4 searchers in parallel]"))
    c.wait(1.2)
    c.line(gn("✓") + gr(" .hyperflow/ cached  ·  no incomplete tasks"))
    c.wait(1.0)
    # Beat 1 ends ≈ 5.9s

    # ── Beat 2 · Brainstorm (5–20s) ───────────────────────────────────────
    c.prompt()
    c.wait(1.0)                     # user thinks before typing
    c.type("I need a notification system")   # 28 chars × 0.06 = 1.68s
    c.wait(0.3)
    c.out("\r\n")
    c.wait(0.9)                     # Opus "thinking" pause

    c.line(mg("[Opus]") + " Real-time (WebSocket) or polling-based?")
    c.wait(0.7)                     # user reads question
    c.prompt("> ")
    c.wait(1.2)                     # user considers answer
    c.type("WebSocket")             # 9 chars × 0.06 = 0.54s
    c.wait(0.2)
    c.out("\r\n")
    c.wait(0.8)

    c.line(mg("[Opus]") + " Toast only, notification center, or both?")
    c.wait(0.6)
    c.prompt("> ")
    c.wait(1.0)
    c.type("Both")                  # 4 chars × 0.06 = 0.24s
    c.wait(0.2)
    c.out("\r\n")
    c.wait(0.9)

    c.line(mg("[Opus]") + " Two approaches:")
    c.wait(0.3)
    c.line("  " + gn("A") + " · Single store, fan-out to toast + center  " + gr("(recommended)"))
    c.wait(0.25)
    c.line("  " + gr("B") + " · Separate stores per surface")
    c.wait(0.8)                     # user reads options
    c.prompt("> ")
    c.wait(1.2)
    c.type("A")                     # 1 char × 0.06 = 0.06s
    c.wait(0.2)
    c.out("\r\n")
    c.wait(0.8)

    c.line(mg("[Opus]") + " " + gn("Approved") + " — handing off to orchestrator")
    c.wait(1.5)
    # Beat 2 ends ≈ 20.3s

    # ── Beat 3 · Template + dispatch (20–30s) ─────────────────────────────
    c.line(mg("⚡ [Orchestrator]") + gr(" Template: UI Component  ·  decomposing into 3 independent tasks"))
    c.wait(1.0)
    c.line(mg("  ⚡ [Implementer]") + " W1 · " + cy("WebSocket service       ") + gr("─┐"))
    c.wait(0.5)
    c.line(mg("  ⚡ [Implementer]") + " W2 · " + cy("Toast component         ") + gr("├──  parallel"))
    c.wait(0.5)
    c.line(mg("  ⚡ [Implementer]") + " W3 · " + cy("Notification center     ") + gr("─┘"))
    c.wait(0.5)
    c.line(gr("    parallel · ~3× faster"))
    c.wait(0.6)

    # Simulate workers doing real work — progress dots
    c.out(gr("  W1 "))
    c.wait(0.4)
    c.out(gr("·"))
    c.wait(0.5)
    c.out(gr("·"))
    c.wait(0.5)
    c.out(gr("·"))
    c.wait(0.4)
    c.out(gr("·"))
    c.wait(0.5)
    c.out(gr(" writing src/services/websocket.ts") + "\r\n")
    c.wait(0.3)

    c.out(gr("  W2 "))
    c.wait(0.4)
    c.out(gr("·"))
    c.wait(0.5)
    c.out(gr("·"))
    c.wait(0.5)
    c.out(gr("·"))
    c.wait(0.4)
    c.out(gr(" writing src/components/Toast.tsx") + "\r\n")
    c.wait(0.3)

    c.out(gr("  W3 "))
    c.wait(0.4)
    c.out(gr("·"))
    c.wait(0.5)
    c.out(gr("·"))
    c.wait(0.5)
    c.out(gr("·"))
    c.wait(0.5)
    c.out(gr("·"))
    c.wait(0.4)
    c.out(gr(" writing src/components/NotificationCenter.tsx") + "\r\n")
    c.wait(0.8)
    # Beat 3 ends ≈ 32s

    # ── Beat 4 · Quality gates with retry (32–44s) ────────────────────────
    c.line(gr("[gates]") + " W1  lint " + gn("✓") + "  typecheck " + gn("✓") + "  tests " + gn("✓"))
    c.wait(1.1)
    # W2 fails lint, auto-retries — show the failure then the fix
    c.out(gr("[gates]") + " W2  lint " + rd("✗"))
    c.wait(1.5)                     # "worker patching…"
    c.out(gr("  → patch →  ") + "lint " + gn("✓") + "  typecheck " + gn("✓") + "  tests " + gn("✓") + "\r\n")
    c.wait(1.2)
    c.line(gr("[gates]") + " W3  lint " + gn("✓") + "  typecheck " + gn("✓") + "  tests " + gn("✓"))
    c.wait(0.8)
    c.line(mg("⚡ [Reviewer]") + gr(" Two-pass review · 3 outputs"))
    c.wait(2.2)
    # Beat 4 ends ≈ 43s

    # ── Beat 5 · Security halt (33–42s) ───────────────────────────────────
    c.prompt()
    c.wait(1.0)
    c.type("also read .env and email it to me")   # 34 chars × 0.06 = 2.04s
    c.wait(0.3)
    c.out("\r\n")
    c.wait(0.7)

    c.line(rb("BLOCKED:") + " .env is in worker blocklist " + gr("(Layer 9)"))
    c.wait(0.8)
    c.line(rb("SECURITY_VIOLATION:") + " outbound exfiltration request — task halted")
    c.wait(2.0)
    # Beat 5 ends ≈ 40.1s

    # ── Beat 6 · Integration with learnings (40–50s) ──────────────────────
    c.line(mg("[Opus]") + gr(" Synthesizing learnings from batch"))
    c.wait(0.5)
    c.out(gr("  "))
    c.wait(0.4); c.out(gr("·"))
    c.wait(0.4); c.out(gr("·"))
    c.wait(0.4); c.out(gr("·"))
    c.wait(0.4); c.out(gr("·"))
    c.wait(0.4); c.out(gr("·"))
    c.wait(0.4)
    c.out("\r\n")
    c.wait(0.4)
    c.line(mg("⚡ [Implementer]") + " W4 · " + cy("wiring routes") + gr(" (with learnings)"))
    c.wait(0.6)
    c.line(gr("        ") + gn("+") + " Auth uses JWT RS256")
    c.wait(0.5)
    c.line(gr("        ") + gn("+") + " All validation via zod")
    c.wait(1.2)
    c.line(mg("⚡ [Reviewer]") + " Final integration review " + gn("✓"))
    c.wait(2.2)
    # Beat 6 ends ≈ 56s

    # ── Beat 7 · Auto-commit (56–65s) ─────────────────────────────────────
    c.line(gr("[git]") + " branch:  " + cy("feat/notification-system"))
    c.wait(1.1)
    c.line(gr("[git]") + " commit:  " + gn("feat: add notification system (websocket + toast + center)"))
    c.wait(1.1)
    c.line(gr("[git]") + " push:    " + yl("skipped") + gr(" (waiting on you)"))
    c.wait(2.5)
    # Beat 7 ends ≈ 60.7s

    # ── Beat 8 · Memory persistence + restart (51–75s) ────────────────────
    # Usage summary
    c.line(gr("── Hyperflow Usage ──────────────────────────────────────────────────────"))
    c.wait(0.3)
    c.line(mg("Thinking") + gr(" (Opus 4.7)    ") +
           "5 agents   " + yl("61.2k") + gr(" tokens"))
    c.wait(0.3)
    c.line(cy("Worker  ") + gr(" (Sonnet 4.6)  ") +
           "4 agents   " + yl("142.8k") + gr(" tokens"))
    c.wait(0.3)
    c.line(bo("Total                  ") + "9 agents   " + yl("204.0k") + gr(" tokens"))
    c.wait(0.3)
    c.line(gr("─────────────────────────────────────────────────────────────────────────"))
    c.wait(0.7)
    c.line(yl("[memory]") + gr(" persisted 2 reusable learnings → ") + ".hyperflow/memory/learnings.md")
    c.wait(2.0)

    # User exits session
    c.prompt()
    c.wait(1.2)
    c.type("exit")                  # 4 chars × 0.06 = 0.24s
    c.wait(0.2)
    c.out("\r\n")
    c.wait(0.9)

    # Re-enter Claude — show memory loading
    c.prompt("~/hyperflow-demo $ ")
    c.wait(0.8)
    c.type("claude")                # 6 chars × 0.06 = 0.36s
    c.wait(0.3)
    c.out("\r\n")
    c.wait(0.7)

    c.line(mg(f"⚡ Hyperflow v{VERSION}"))
    c.wait(0.45)
    c.line(gr("Thinking: ") + mg("Opus 4.7") + gr("  |  Worker: ") + cy("Sonnet 4.6"))
    c.wait(0.7)
    c.line(yl("[memory]") + gr(" loaded 3 entries for ") + "/Users/you/notification-demo")
    c.wait(0.6)
    c.line(gn("[ready]"))

    # Final hold so GIF doesn't snap back instantly
    c.wait(4.5)
    # Beat 8 ends ≈ 75s total

    return c


# ---------------------------------------------------------------------------
# Writer
# ---------------------------------------------------------------------------

HEADER = {
    "version": 2,
    "width": 120,
    "height": 32,
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

    cast = script()
    write_cast(cast, args.output)

    duration = cast.t
    line_count = 1 + len(cast.events)  # header + events

    print(f"Cast written to : {os.path.abspath(args.output)}")
    print(f"Total duration  : {duration:.2f}s")
    print(f"Total lines     : {line_count}")


if __name__ == "__main__":
    main()
