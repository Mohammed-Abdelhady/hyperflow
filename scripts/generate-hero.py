#!/usr/bin/env python3
"""Generate docs/assets/hero.svg from config/features.json.

Brutalist / technical hero matching the landing page: warm-paper card, hard 2px
ink borders, solid offset shadows (no blur), mono skill names, square tier
markers, and an orange signal accent on the wordmark. Centerpiece is the
six-skill chain rendered as bordered cards with tier-color top bars.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def esc(text: str) -> str:
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def load_features() -> dict:
    return json.loads((ROOT / "config" / "features.json").read_text())


# ---------------------------------------------------------------------------
# Layout + brutalist palette
# ---------------------------------------------------------------------------

W, H = 1200, 420
PAD = 48

FONT = "'Space Grotesk', ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

PAPER = "#F4F1E8"
PAPER2 = "#ECE7D7"
CARD = "#FBFAF4"
INK = "#14110C"
MUTED = "#6B6456"
ACCENT = "#E8470F"

CHAIN = ["scaffold", "spec", "scope", "dispatch", "audit", "deploy"]
CHAIN_ROLE = {
    "scaffold": "standalone", "spec": "thinking", "scope": "thinking",
    "dispatch": "worker", "audit": "gate", "deploy": "gate",
}
CHAIN_SUB = {
    "scaffold": "STANDALONE", "spec": "CHAIN STARTER", "scope": "CHAIN STARTER",
    "dispatch": "ENDPOINT", "audit": "GATE", "deploy": "GATE",
}
CHAIN_CAPTION = {
    "scaffold": "project setup", "spec": "specify design", "scope": "decompose work",
    "dispatch": "execute batches", "audit": "code review", "deploy": "pre-push gates",
}


def render(features: dict, version_override: str | None) -> str:
    version = version_override or features.get("version", "0.0.0")
    tagline = features.get("tagline", "")
    c = features["branding"]["colors"]
    THINK = c["thinking"]
    WORK = c["worker"]
    role_color = {"thinking": THINK, "worker": WORK, "gate": INK, "standalone": MUTED}

    P: list[str] = []
    def o(s: str) -> None: P.append(s)

    o(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"')
    o(f'     role="img" aria-labelledby="t d" font-family="{FONT}">')
    o(f'  <title id="t">Hyperflow v{esc(version)}</title>')
    o(f'  <desc id="d">{esc(tagline)} — the chain: scaffold, spec, scope, dispatch, audit, deploy.</desc>')

    o('  <defs>')
    o(f'    <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">')
    o(f'      <path d="M28 0 L0 0 0 28" fill="none" stroke="{PAPER2}" stroke-width="1"/></pattern>')
    o(f'    <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">')
    o(f'      <path d="M0,0 L10,5 L0,10 Z" fill="{INK}"/></marker>')
    o('  </defs>')

    # ── helpers ─────────────────────────────────────────────────────────────
    def text(x, y, s, size=12, fill=INK, weight=400, anchor="start", mono=False,
             ls=None, italic=False, opacity=None):
        a = [f'x="{x}"', f'y="{y}"', f'fill="{fill}"', f'font-size="{size}"',
             f'font-weight="{weight}"', f'text-anchor="{anchor}"']
        if mono: a.append(f'font-family="{MONO}"')
        if ls is not None: a.append(f'letter-spacing="{ls}"')
        if italic: a.append('font-style="italic"')
        if opacity is not None: a.append(f'opacity="{opacity}"')
        o(f'  <text {" ".join(a)}>{esc(s)}</text>')

    def rect(x, y, w, h, fill="none", stroke=None, sw=2, dash=None):
        a = [f'x="{x}"', f'y="{y}"', f'width="{w}"', f'height="{h}"', f'fill="{fill}"']
        if stroke: a += [f'stroke="{stroke}"', f'stroke-width="{sw}"']
        if dash: a.append(f'stroke-dasharray="{dash}"')
        o(f'  <rect {" ".join(a)}/>')

    def shadow_card(x, y, w, h, fill=CARD, stroke=INK, sw=2, off=4):
        # solid offset ink shadow (no blur) behind a hard-bordered card
        rect(x + off, y + off, w, h, fill=INK)
        rect(x, y, w, h, fill=fill, stroke=stroke, sw=sw)

    # ── card frame + blueprint grid ─────────────────────────────────────────
    rect(0, 0, W, H, fill=PAPER)
    rect(0, 0, W, H, fill="url(#grid)")
    rect(1, 1, W - 2, H - 2, stroke=INK, sw=2)

    # ── wordmark: Hyper + [flow] ────────────────────────────────────────────
    wm_y = 116
    wm_size = 76
    text(PAD, wm_y, "Hyper", size=wm_size, fill=INK, weight=700, ls="-3")
    # orange "flow" block (positioned after "Hyper"; tuned for Space Grotesk 700)
    bx = PAD + 222
    bw, bh, by = 196, 78, wm_y - 60
    rect(bx + 5, by + 5, bw, bh, fill=INK)              # offset shadow
    rect(bx, by, bw, bh, fill=ACCENT)
    text(bx + bw / 2, wm_y, "flow", size=wm_size, fill=PAPER, weight=700, anchor="middle", ls="-3")

    # ── tagline + tier legend + version badge ───────────────────────────────
    tg = tagline if len(tagline) <= 54 else tagline[:51] + "…"
    text(PAD, 158, tg, size=13, fill=MUTED, mono=True)

    rect(PAD, 178, 11, 11, fill=THINK)
    text(PAD + 20, 188, "thinking · Opus / Gemini Pro", size=11, fill=INK, mono=True)
    rect(PAD + 280, 178, 11, 11, fill=WORK)
    text(PAD + 300, 188, "worker · Sonnet / Gemini Flash", size=11, fill=INK, mono=True)

    vlabel = f"v{version}"
    vbw = len(vlabel) * 9 + 22
    rect(W - PAD - vbw, 168, vbw, 26, fill=CARD, stroke=INK, sw=2)
    text(W - PAD - vbw / 2, 186, vlabel, size=12, fill=INK, weight=700, anchor="middle", mono=True)

    # ── THE CHAIN ───────────────────────────────────────────────────────────
    text(PAD, 244, "THE CHAIN", size=11, fill=MUTED, weight=700, ls="2", mono=True)

    n = len(CHAIN)
    cw, ch, cy = 150, 92, 262
    gap = (W - 2 * PAD - n * cw) / (n - 1)
    centers = []
    for i, name in enumerate(CHAIN):
        role = CHAIN_ROLE[name]
        col = role_color[role]
        nx = PAD + i * (cw + gap)
        centers.append(nx + cw / 2)
        shadow_card(nx, cy, cw, ch, fill=CARD, stroke=INK, sw=2)
        if role == "gate":
            rect(nx, cy, cw, ch, stroke=INK, sw=2, dash="5 4")
            rect(nx, cy, cw, 6, fill=PAPER2)
        else:
            rect(nx, cy, cw, 6, fill=col)
        text(nx + cw / 2, cy + 34, "/" + name, size=15, fill=INK, weight=700, anchor="middle", mono=True)
        text(nx + cw / 2, cy + 54, CHAIN_CAPTION[name], size=10.5, fill=MUTED, anchor="middle")
        text(nx + cw / 2, cy + 76, CHAIN_SUB[name], size=8.5, fill=MUTED, anchor="middle", ls="1", mono=True)
        if i < n - 1:
            ax1 = nx + cw + 4
            ax2 = nx + cw + gap - 4
            o(f'  <line x1="{ax1}" y1="{cy + ch / 2}" x2="{ax2}" y2="{cy + ch / 2}" stroke="{INK}" stroke-width="2" marker-end="url(#arr)"/>')

    # auto-chains caption under spec → scope → dispatch
    text((centers[1] + centers[3]) / 2, cy + ch + 28,
         "auto-chains: spec → scope → dispatch", size=11, fill=INK, anchor="middle", mono=True)

    # ── footer ──────────────────────────────────────────────────────────────
    fy = H - 28
    o(f'  <line x1="{PAD}" y1="{fy - 16}" x2="{W - PAD}" y2="{fy - 16}" stroke="{INK}" stroke-width="2"/>')
    text(PAD, fy, "github.com/Mohammed-Abdelhady/hyperflow", size=11, fill=MUTED, mono=True)
    text(W - PAD, fy, "multi-agent orchestration for Claude Code · OpenCode · Antigravity",
         size=11, fill=MUTED, anchor="end", mono=True)

    o('</svg>')
    return "\n".join(P)


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate docs/assets/hero.svg from config/features.json")
    ap.add_argument("--version")
    ap.add_argument("--output", default=str(ROOT / "docs" / "assets" / "hero.svg"))
    args = ap.parse_args()
    svg = render(load_features(), args.version)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(svg, encoding="utf-8")
    import sys
    print(f"wrote {out} ({len(svg):,} bytes)", file=sys.stderr)


if __name__ == "__main__":
    main()
