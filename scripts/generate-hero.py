#!/usr/bin/env python3
"""Generate docs/assets/hero.svg from config/features.json.

A system schematic, not a logo. Three modules tell the whole story at a glance:
  - the 10 orchestration layers (left rail)
  - the chain (top-right)
  - one phase exploded into sub-phases → parallel workers → reviewers (centre)
  - the memory band (persists across sessions)

Dark editorial card. Flat fills, hairline strokes, brand-color accents — no glow.
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
# Layout
# ---------------------------------------------------------------------------

W, H = 1200, 620
PAD = 48

FONT = "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
MONO = "ui-monospace, SFMono-Regular, Menlo, monospace"

CHAIN = ["scaffold", "spec", "scope", "dispatch", "audit", "deploy"]
CHAIN_ROLE = {
    "scaffold": "neutral", "spec": "thinking", "scope": "thinking",
    "dispatch": "worker", "audit": "gate", "deploy": "gate",
}


def render(features: dict, version_override: str | None) -> str:
    version = version_override or features.get("version", "0.0.0")
    tagline = features.get("tagline", "")
    c = features["branding"]["colors"]
    skills = {s["name"]: s for s in features["skills"]}
    layers = features.get("layers", [])

    THINK = c["thinking"]       # violet
    WORK = c["worker"]          # teal
    MEM = c["memory"]           # amber
    SEC = c["security"]         # red
    GIT = c["git"]              # blue
    BG0, BG1 = c["bg_start"], c["bg_end"]
    BORDER = c["border"]
    TXT = c["text_primary"]
    TXT2 = c["text_secondary"]
    FAINT = "#475569"
    HAIR = "#22304A"
    SURFACE = "#131C28"

    role_color = {"thinking": THINK, "worker": WORK, "gate": THINK, "neutral": "#3C4A5E"}
    layer_color = {"thinking": THINK, "worker": WORK, "memory": MEM,
                   "security": SEC, "git": GIT, "user": "#64748B"}

    P: list[str] = []
    def o(s: str) -> None: P.append(s)

    o(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"')
    o(f'     role="img" aria-labelledby="t d" font-family="{FONT}">')
    o(f'  <title id="t">Hyperflow v{esc(version)}</title>')
    o(f'  <desc id="d">{esc(tagline)} — orchestration layers, the chain, and one phase exploded into sub-phases and parallel agents.</desc>')

    # defs
    o('  <defs>')
    o(f'    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">')
    o(f'      <stop offset="0%" stop-color="{BG0}"/><stop offset="100%" stop-color="{BG1}"/>')
    o('    </linearGradient>')
    o(f'    <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">')
    o(f'      <circle cx="1" cy="1" r="0.7" fill="{TXT2}"/></pattern>')
    o('    <clipPath id="card"><rect width="%d" height="%d" rx="18"/></clipPath>' % (W, H))
    for mid, col in (("aN", FAINT), ("aT", THINK), ("aW", WORK)):
        o(f'    <marker id="{mid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">')
        o(f'      <path d="M0,0 L10,5 L0,10 Z" fill="{col}"/></marker>')
    o('  </defs>')

    o(f'  <rect width="{W}" height="{H}" rx="18" fill="url(#bg)" stroke="{BORDER}" stroke-width="1.5"/>')
    o(f'  <rect clip-path="url(#card)" width="{W}" height="{H}" fill="url(#dots)" opacity="0.022"/>')

    # ── tiny helpers ────────────────────────────────────────────────────────
    def text(x, y, s, size=12, fill=TXT, weight=400, anchor="start", mono=False,
             ls=None, italic=False, opacity=None):
        attrs = [f'x="{x}"', f'y="{y}"', f'fill="{fill}"', f'font-size="{size}"',
                 f'font-weight="{weight}"', f'text-anchor="{anchor}"']
        if mono: attrs.append(f'font-family="{MONO}"')
        if ls is not None: attrs.append(f'letter-spacing="{ls}"')
        if italic: attrs.append('font-style="italic"')
        if opacity is not None: attrs.append(f'opacity="{opacity}"')
        o(f'  <text {" ".join(attrs)}>{esc(s)}</text>')

    def rrect(x, y, w, h, rx=8, fill="none", stroke=None, sw=1.25, dash=None, op=None):
        a = [f'x="{x}"', f'y="{y}"', f'width="{w}"', f'height="{h}"', f'rx="{rx}"', f'fill="{fill}"']
        if stroke: a.append(f'stroke="{stroke}"'); a.append(f'stroke-width="{sw}"')
        if dash: a.append(f'stroke-dasharray="{dash}"')
        if op is not None: a.append(f'opacity="{op}"')
        o(f'  <rect {" ".join(a)}/>')

    def line(x1, y1, x2, y2, stroke=HAIR, sw=1.25, marker=None, dash=None, op=None):
        a = [f'x1="{x1}"', f'y1="{y1}"', f'x2="{x2}"', f'y2="{y2}"', f'stroke="{stroke}"', f'stroke-width="{sw}"']
        if marker: a.append(f'marker-end="url(#{marker})"')
        if dash: a.append(f'stroke-dasharray="{dash}"')
        if op is not None: a.append(f'opacity="{op}"')
        o(f'  <line {" ".join(a)}/>')

    # ── LEFT COLUMN — identity + layer rail ─────────────────────────────────
    lx = PAD
    text(lx, 78, "Hyperflow", size=46, fill=TXT, weight=800, ls="-1.5")
    tg = tagline if len(tagline) <= 34 else tagline[:31] + "…"
    text(lx, 104, tg, size=12.5, fill=TXT2)

    # tier legend
    o(f'  <circle cx="{lx+5}" cy="129" r="5" fill="{THINK}"/>')
    text(lx + 16, 133, "thinking · Opus / Gemini Pro", size=10.5, fill=TXT2)
    o(f'  <circle cx="{lx+5}" cy="148" r="5" fill="{WORK}"/>')
    text(lx + 16, 152, "worker · Sonnet / Gemini Flash", size=10.5, fill=TXT2)

    # version
    bw = len(f"v{version}") * 8 + 16
    rrect(lx, 166, bw, 21, rx=10, fill="rgba(255,255,255,0.05)", stroke=BORDER, sw=1)
    text(lx + bw / 2, 180, f"v{version}", size=11, fill=TXT2, weight=600, anchor="middle")

    # layer rail
    text(lx, 224, "ORCHESTRATION LAYERS", size=9.5, fill=TXT2, weight=700, ls="1.6")
    y = 244
    row_h = 30
    for L in layers:
        col = layer_color.get(L.get("color", "user"), "#64748B")
        o(f'  <rect x="{lx}" y="{y-9}" width="3" height="14" rx="1.5" fill="{col}"/>')
        text(lx + 12, y + 2, f"L{L['n']}", size=10.5, fill=col, weight=700, mono=True)
        text(lx + 46, y + 2, L["name"], size=11, fill=TXT, weight=500)
        y += row_h

    # vertical divider between columns
    line(330, 56, 330, H - 64, stroke=BORDER, sw=1, op=0.5)

    # ── RIGHT COLUMN ────────────────────────────────────────────────────────
    rx0 = 362
    rx1 = W - PAD  # 1152

    # ---- Module 1: THE CHAIN -----------------------------------------------
    text(rx0, 74, "THE CHAIN", size=9.5, fill=TXT2, weight=700, ls="1.6")
    n = len(CHAIN)
    cw = 116
    gap = (rx1 - rx0 - n * cw) / (n - 1)
    cy = 96
    ch = 50
    # thinking-tier bracket over the row
    line(rx0, cy - 12, rx1, cy - 12, stroke=THINK, sw=1.1, op=0.5)
    line(rx0, cy - 12, rx0, cy - 6, stroke=THINK, sw=1.1, op=0.5)
    line(rx1, cy - 12, rx1, cy - 6, stroke=THINK, sw=1.1, op=0.5)
    text((rx0 + rx1) / 2, cy - 16, "thinking tier orchestrates + reviews every phase",
         size=8.5, fill=THINK, anchor="middle", opacity=0.85)
    centers = []
    for i, name in enumerate(CHAIN):
        sk = skills.get(name, {})
        role = CHAIN_ROLE.get(name, "neutral")
        col = role_color[role]
        nx = rx0 + i * (cw + gap)
        centers.append(nx + cw / 2)
        dash = "4 3" if role == "gate" else None
        rrect(nx, cy, cw, ch, rx=7, fill=SURFACE, stroke=BORDER, sw=1)
        if role in ("thinking", "worker"):
            o(f'  <rect x="{nx}" y="{cy}" width="{cw}" height="3" rx="1.5" fill="{col}"/>')
        if dash:
            rrect(nx, cy, cw, ch, rx=7, stroke=col, sw=1, dash=dash, op=0.7)
        text(nx + cw / 2, cy + 22, "/" + name, size=11.5, fill=TXT, weight=700, anchor="middle", mono=True)
        sub = {"scaffold": "STANDALONE", "spec": "CHAIN STARTER", "scope": "CHAIN STARTER",
               "dispatch": "ENDPOINT", "audit": "GATE", "deploy": "GATE"}[name]
        text(nx + cw / 2, cy + 38, sub, size=7.5, fill=TXT2, anchor="middle", ls="0.8")
        if i < n - 1:
            line(nx + cw + 3, cy + ch / 2, nx + cw + gap - 3, cy + ch / 2, stroke=FAINT, sw=1.1, marker="aN")
    # worker bracket under
    line(rx0, cy + ch + 12, rx1, cy + ch + 12, stroke=WORK, sw=1.1, op=0.5)
    line(rx0, cy + ch + 12, rx0, cy + ch + 6, stroke=WORK, sw=1.1, op=0.5)
    line(rx1, cy + ch + 12, rx1, cy + ch + 6, stroke=WORK, sw=1.1, op=0.5)
    text((rx0 + rx1) / 2, cy + ch + 24, "worker tier executes — in parallel, persona-stitched",
         size=8.5, fill=WORK, anchor="middle", opacity=0.85)

    # ---- Module 2: ONE PHASE EXPLODED --------------------------------------
    ex_top = 230
    text(rx0, ex_top, "ONE PHASE  →  SUB-PHASES  →  PARALLEL AGENTS", size=9.5, fill=TXT2, weight=700, ls="1.4")
    # dashed connector from the dispatch node down into the zoom
    disp_cx = centers[CHAIN.index("dispatch")]
    line(disp_cx, cy + ch + 30, disp_cx, ex_top + 14, stroke=THINK, sw=1, dash="3 3", op=0.6)
    line(disp_cx, ex_top + 14, rx0 + 60, ex_top + 14, stroke=THINK, sw=1, dash="3 3", op=0.6)

    # parent "dispatch / Step 2"
    py = ex_top + 30
    prrx = rx0
    rrect(prrx, py, 96, 56, rx=7, fill=SURFACE, stroke=WORK, sw=1.25)
    text(prrx + 48, py + 23, "dispatch", size=11, fill=TXT, weight=700, anchor="middle", mono=True)
    text(prrx + 48, py + 39, "Step 2", size=9, fill=TXT2, anchor="middle")
    text(prrx + 48, py + 50, "fan out", size=7.5, fill=WORK, anchor="middle", opacity=0.8)

    # three sub-phase groups
    groups = [("2a", "surface map"), ("2b", "semantic index"), ("2c", "convention scan")]
    gx0 = prrx + 96 + 40
    gw = 168
    ggap = 18
    chip_w, chip_h = 66, 22
    for gi, (sid, sname) in enumerate(groups):
        gx = gx0 + gi * (gw + ggap)
        gy = py - 10
        # group frame
        rrect(gx, gy, gw, 96, rx=8, fill="none", stroke=HAIR, sw=1)
        text(gx + 12, gy + 18, sid, size=10.5, fill=THINK, weight=700, mono=True)
        text(gx + 32, gy + 18, sname, size=9, fill=TXT2)
        # two parallel worker chips
        wy = gy + 28
        for wi in range(2):
            wxx = gx + 12 + wi * (chip_w + 8)
            rrect(wxx, wy, chip_w, chip_h, rx=5, fill="rgba(20,184,166,0.12)", stroke=WORK, sw=1)
            text(wxx + chip_w / 2, wy + 15, f"worker {wi+1}", size=8.5, fill=WORK, anchor="middle")
        # reviewer chip (full width) below, with arrows up from workers
        ry = wy + chip_h + 14
        rrect(gx + 12, ry, gw - 24, chip_h, rx=5, fill="rgba(124,58,237,0.14)", stroke=THINK, sw=1)
        text(gx + (gw) / 2, ry + 15, "reviewer", size=8.5, fill=THINK, anchor="middle", weight=600)
        # connectors worker→reviewer
        for wi in range(2):
            wxx = gx + 12 + wi * (chip_w + 8) + chip_w / 2
            line(wxx, wy + chip_h, wxx, ry, stroke=FAINT, sw=1, marker="aT")
        # arrow from parent to first group / between groups
        if gi == 0:
            line(prrx + 96 + 4, py + 28, gx - 4, py + 28, stroke=FAINT, sw=1.1, marker="aN")

    # batch reviewer + synthesis at far right, fed by the groups
    bxr = gx0 + 3 * gw + 2 * ggap + 16
    if bxr + 96 > rx1:
        bxr = rx1 - 96
    by = py + 6
    rrect(bxr, by, 96, 44, rx=7, fill="rgba(124,58,237,0.14)", stroke=THINK, sw=1.25)
    text(bxr + 48, by + 19, "batch", size=10, fill=THINK, weight=700, anchor="middle")
    text(bxr + 48, by + 33, "reviewer", size=9, fill=THINK, anchor="middle")
    # arrow from last group to batch reviewer
    last_gx = gx0 + 2 * (gw + ggap) + gw
    line(last_gx + 4, by + 22, bxr - 4, by + 22, stroke=FAINT, sw=1.1, marker="aT")

    text(rx0, ex_top + 30 + 96 + 26,
         "every non-trivial phase decomposes into ≥2 named sub-phases · each fans out parallel workers · each output reviewed (DOCTRINE §12.2)",
         size=9, fill=TXT2, italic=True, opacity=0.85)

    # ---- Module 3: MEMORY band ---------------------------------------------
    my = H - 96
    line(rx0, my - 14, rx1, my - 14, stroke=BORDER, sw=0.75, op=0.5)
    text(rx0, my + 2, "PROJECT MEMORY", size=9.5, fill=MEM, weight=700, ls="1.4")
    tiers = [("hot", "always injected"), ("warm", "tag-matched"), ("cold", "on-demand")]
    tx = rx0 + 150
    for ti, (tn, td) in enumerate(tiers):
        op = 1.0 - ti * 0.28
        rrect(tx, my - 12, 150, 22, rx=5, fill="none", stroke=MEM, sw=1, op=op)
        text(tx + 10, my + 3, tn, size=9.5, fill=MEM, weight=700, opacity=op, mono=True)
        text(tx + 44, my + 3, td, size=8.5, fill=TXT2, opacity=op)
        if ti < 2:
            line(tx + 150, my - 1, tx + 150 + 16, my - 1, stroke=MEM, sw=1, marker=None, op=0.5)
        tx += 150 + 16
    text(rx1, my + 3, "persists across sessions", size=9, fill=TXT2, anchor="end", italic=True, opacity=0.8)

    # footer
    fy = H - 30
    line(PAD, fy - 14, W - PAD, fy - 14, stroke=BORDER, sw=0.75, op=0.4)
    text(PAD, fy + 4, "github.com/Mohammed-Abdelhady/hyperflow", size=10.5, fill=FAINT)
    text(W - PAD, fy + 4, "multi-agent orchestration for Claude Code · OpenCode · Antigravity",
         size=10.5, fill=FAINT, anchor="end")

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
