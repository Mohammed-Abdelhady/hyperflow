#!/usr/bin/env python3
"""Generate docs/assets/hero.svg from config/features.json.

Brutalist / technical hero matching the landing page: warm-paper card, hard 2px
ink borders, solid offset shadows (no blur), mono skill names, tier-color top
bars, and an orange accent on the wordmark. The hero tells the whole system at a
glance: the chain, the thinking/worker review loop, phase → sub-phase fan-out,
and memory that persists across sessions.
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

W, H = 1200, 560
PAD = 48

FONT = "'Space Grotesk', ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

PAPER = "#F4F1E8"
PAPER2 = "#ECE7D7"
CARD = "#FBFAF4"
INK = "#14110C"
MUTED = "#6B6456"
ACCENT = "#E8470F"

CHAIN = ["amplify", "spec", "scope", "dispatch", "audit", "deploy"]
CHAIN_ROLE = {
    "amplify": "thinking", "spec": "thinking", "scope": "thinking",
    "dispatch": "worker", "audit": "gate", "deploy": "gate",
}
CHAIN_SUB = {
    "amplify": "FRONT DOOR", "spec": "CHAIN STARTER", "scope": "CHAIN STARTER",
    "dispatch": "ENDPOINT", "audit": "GATE", "deploy": "GATE",
}
CHAIN_CAPTION = {
    "amplify": "sharpen the ask", "spec": "specify design", "scope": "decompose work",
    "dispatch": "execute batches", "audit": "code review", "deploy": "pre-push gates",
}


def render(features: dict, version_override: str | None) -> str:
    version = version_override or features.get("version", "0.0.0")
    tagline = features.get("tagline", "")
    c = features["branding"]["colors"]
    THINK = c["thinking"]
    WORK = c["worker"]
    MEM = c.get("memory", "#F59E0B")
    role_color = {"thinking": THINK, "worker": WORK, "gate": INK, "standalone": MUTED}

    P: list[str] = []
    def o(s: str) -> None: P.append(s)

    o(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"')
    o(f'     role="img" aria-labelledby="t d" font-family="{FONT}">')
    o(f'  <title id="t">Hyperflow v{esc(version)}</title>')
    o(f'  <desc id="d">{esc(tagline)} — the chain (amplify, spec, scope, dispatch, audit, deploy), '
      f'a thinking/worker review loop, phase to sub-phase fan-out, and memory that persists across sessions.</desc>')

    o('  <defs>')
    o(f'    <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">')
    o(f'      <path d="M28 0 L0 0 0 28" fill="none" stroke="{PAPER2}" stroke-width="1"/></pattern>')
    o(f'    <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">')
    o(f'      <path d="M0,0 L10,5 L0,10 Z" fill="{INK}"/></marker>')
    o('  </defs>')

    # ── helpers ─────────────────────────────────────────────────────────────
    def text(x, y, s, size=12, fill=INK, weight=400, anchor="start", mono=False, ls=None, opacity=None):
        a = [f'x="{x}"', f'y="{y}"', f'fill="{fill}"', f'font-size="{size}"',
             f'font-weight="{weight}"', f'text-anchor="{anchor}"']
        if mono: a.append(f'font-family="{MONO}"')
        if ls is not None: a.append(f'letter-spacing="{ls}"')
        if opacity is not None: a.append(f'opacity="{opacity}"')
        o(f'  <text {" ".join(a)}>{esc(s)}</text>')

    def rect(x, y, w, h, fill="none", stroke=None, sw=2, dash=None):
        a = [f'x="{x}"', f'y="{y}"', f'width="{w}"', f'height="{h}"', f'fill="{fill}"']
        if stroke: a += [f'stroke="{stroke}"', f'stroke-width="{sw}"']
        if dash: a.append(f'stroke-dasharray="{dash}"')
        o(f'  <rect {" ".join(a)}/>')

    def line(x1, y1, x2, y2, stroke=INK, sw=2, marker=None, dash=None):
        a = [f'x1="{x1}"', f'y1="{y1}"', f'x2="{x2}"', f'y2="{y2}"', f'stroke="{stroke}"', f'stroke-width="{sw}"']
        if marker: a.append(f'marker-end="url(#{marker})"')
        if dash: a.append(f'stroke-dasharray="{dash}"')
        o(f'  <line {" ".join(a)}/>')

    def shadow_card(x, y, w, h, fill=CARD, off=4):
        rect(x + off, y + off, w, h, fill=INK)
        rect(x, y, w, h, fill=fill, stroke=INK, sw=2)

    # ── frame ────────────────────────────────────────────────────────────────
    rect(0, 0, W, H, fill=PAPER)
    rect(0, 0, W, H, fill="url(#grid)")
    rect(1, 1, W - 2, H - 2, stroke=INK, sw=2)

    # ── wordmark ─────────────────────────────────────────────────────────────
    text(PAD, 110, "Hyper", size=70, fill=INK, weight=700, ls="-3")
    bx, bw, bh, by = PAD + 205, 182, 72, 54
    rect(bx + 5, by + 5, bw, bh, fill=INK)
    rect(bx, by, bw, bh, fill=ACCENT)
    text(bx + bw / 2, 110, "flow", size=70, fill=PAPER, weight=700, anchor="middle", ls="-3")

    vlabel = f"v{version}"
    vbw = len(vlabel) * 9 + 22
    rect(W - PAD - vbw, 50, vbw, 26, fill=CARD, stroke=INK, sw=2)
    text(W - PAD - vbw / 2, 68, vlabel, size=12, fill=INK, weight=700, anchor="middle", mono=True)

    tg = tagline if len(tagline) <= 58 else tagline[:55] + "…"
    text(PAD, 148, tg, size=13, fill=MUTED, mono=True)
    rect(PAD, 166, 11, 11, fill=THINK)
    text(PAD + 20, 176, "thinking · plans + reviews · Opus / Gemini Pro", size=11, fill=INK, mono=True)
    rect(PAD + 360, 166, 11, 11, fill=WORK)
    text(PAD + 380, 176, "worker · executes in parallel · Sonnet / Gemini Flash", size=11, fill=INK, mono=True)

    # ── THE CHAIN ────────────────────────────────────────────────────────────
    text(PAD, 218, "THE CHAIN", size=11, fill=MUTED, weight=700, ls="2", mono=True)
    n = len(CHAIN)
    cw, ch, cy = 150, 74, 232
    gap = (W - 2 * PAD - n * cw) / (n - 1)
    centers = []
    for i, name in enumerate(CHAIN):
        role = CHAIN_ROLE[name]
        nx = PAD + i * (cw + gap)
        centers.append(nx + cw / 2)
        shadow_card(nx, cy, cw, ch)
        if role == "gate":
            rect(nx, cy, cw, ch, stroke=INK, sw=2, dash="5 4")
            rect(nx, cy, cw, 5, fill=PAPER2)
        else:
            rect(nx, cy, cw, 5, fill=role_color[role])
        text(nx + cw / 2, cy + 30, "/" + name, size=15, fill=INK, weight=700, anchor="middle", mono=True)
        text(nx + cw / 2, cy + 49, CHAIN_CAPTION[name], size=10, fill=MUTED, anchor="middle")
        text(nx + cw / 2, cy + 65, CHAIN_SUB[name], size=8, fill=MUTED, anchor="middle", ls="0.6", mono=True)
        if i < n - 1:
            line(nx + cw + 4, cy + ch / 2, nx + cw + gap - 4, cy + ch / 2, marker="arr")
    text((centers[1] + centers[3]) / 2, cy + ch + 24,
         "amplify hands off · spec → scope → dispatch auto-chains · audit + deploy gate at the end",
         size=10, fill=INK, anchor="middle", mono=True)

    # ── Three pillars: review loop · sub-phases · memory ─────────────────────
    py, pcw, pch = 360, 336, 132
    pgap = (W - 2 * PAD - 3 * pcw) / 2
    px = [PAD + i * (pcw + pgap) for i in range(3)]

    def pillar(x, label):
        shadow_card(x, py, pcw, pch)
        text(x + 16, py + 26, label, size=10, fill=MUTED, weight=700, ls="1.4", mono=True)

    # Pillar 1 — every step reviewed (thinking + worker loop)
    pillar(px[0], "EVERY STEP REVIEWED")
    bxx = px[0] + 18
    rect(bxx, py + 52, 130, 40, fill=PAPER, stroke=WORK, sw=2)
    rect(bxx, py + 52, 130, 5, fill=WORK)
    text(bxx + 65, py + 77, "Worker", size=13, fill=INK, weight=700, anchor="middle", mono=True)
    line(bxx + 130 + 4, py + 72, bxx + 168, py + 72, marker="arr")
    text(bxx + 152, py + 64, "output", size=8, fill=MUTED, anchor="middle")
    rect(bxx + 172, py + 52, 130, 40, fill=PAPER, stroke=THINK, sw=2)
    rect(bxx + 172, py + 52, 130, 5, fill=THINK)
    text(bxx + 237, py + 77, "Reviewer", size=13, fill=INK, weight=700, anchor="middle", mono=True)
    text(x_:=px[0] + pcw / 2, py + 116, "thinking-tier reviews every worker output — no exceptions",
         size=8.5, fill=MUTED, anchor="middle")

    # Pillar 2 — phases fan into sub-phases
    pillar(px[1], "PHASES → SUB-PHASES")
    qx = px[1] + 18
    rect(qx, py + 56, 70, 34, fill=PAPER, stroke=INK, sw=2)
    text(qx + 35, py + 77, "phase", size=11, fill=INK, weight=700, anchor="middle", mono=True)
    subs = ["2a", "2b", "2c"]
    sxx = qx + 110
    for k, s in enumerate(subs):
        syy = py + 50 + k * 24
        line(qx + 70 + 3, py + 73, sxx - 3, syy + 11, marker="arr")
        rect(sxx, syy, 54, 20, fill=PAPER, stroke=WORK, sw=1.5)
        text(sxx + 27, syy + 14, s, size=9.5, fill=INK, anchor="middle", mono=True)
        rect(sxx + 64, syy, 80, 20, fill=PAPER, stroke=THINK, sw=1.5)
        text(sxx + 104, syy + 14, "review", size=8.5, fill=INK, anchor="middle")
        line(sxx + 54 + 2, syy + 10, sxx + 64 - 2, syy + 10, marker="arr")
    text(px[1] + pcw / 2, py + 116, "each phase fans into ≥2 parallel sub-phases · each reviewed",
         size=8.5, fill=MUTED, anchor="middle")

    # Pillar 3 — memory across sessions
    pillar(px[2], "MEMORY ACROSS SESSIONS")
    mx = px[2] + 18
    rect(mx, py + 58, 64, 30, fill=PAPER, stroke=INK, sw=2)
    text(mx + 32, py + 72, "session", size=9, fill=INK, anchor="middle", mono=True)
    text(mx + 32, py + 83, "N", size=8, fill=MUTED, anchor="middle", mono=True)
    line(mx + 64 + 3, py + 73, mx + 92, py + 73, marker="arr")
    rect(mx + 96, py + 56, 96, 34, fill=PAPER, stroke=MEM, sw=2)
    rect(mx + 96, py + 56, 96, 5, fill=MEM)
    text(mx + 144, py + 77, "memory", size=10.5, fill=INK, weight=700, anchor="middle", mono=True)
    line(mx + 192 + 3, py + 73, mx + 220, py + 73, marker="arr")
    rect(mx + 224, py + 58, 64, 30, fill=PAPER, stroke=INK, sw=2)
    text(mx + 256, py + 72, "session", size=9, fill=INK, anchor="middle", mono=True)
    text(mx + 256, py + 83, "N+1", size=8, fill=MUTED, anchor="middle", mono=True)
    text(px[2] + pcw / 2, py + 116, "local · per-project · never uploaded · learns as it works",
         size=8.5, fill=MUTED, anchor="middle")

    # ── footer ───────────────────────────────────────────────────────────────
    fy = H - 24
    line(PAD, fy - 14, W - PAD, fy - 14, sw=2)
    text(PAD, fy, "github.com/Mohammed-Abdelhady/hyperflow", size=11, fill=MUTED, mono=True)
    text(W - PAD, fy, "premium multi-agent orchestration · Claude Code · OpenCode · Antigravity",
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
