#!/usr/bin/env python3
"""Generate docs/assets/hero.svg from config/features.json."""
from __future__ import annotations

import argparse
import json
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def esc(text: str) -> str:
    """Escape XML special characters."""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def wrap(text: str, width: int) -> list[str]:
    """Wrap text to a list of lines no wider than `width` chars."""
    return textwrap.wrap(text, width) or [""]


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_features() -> dict:
    return json.loads((ROOT / "config" / "features.json").read_text())


# ---------------------------------------------------------------------------
# SVG builder
# ---------------------------------------------------------------------------

# Layout constants
VB_W = 1400
VB_H = 1520  # tall enough for all regions

PAD = 48          # left/right outer padding
COL_GAP = 16      # gap between columns
SECTION_GAP = 28  # vertical gap between major sections

# Y anchors (computed top-down)
HEADER_Y   = 0
HEADER_H   = 110
PROVIDER_Y = HEADER_H + SECTION_GAP           # ~138
PROVIDER_H = 90
LAYERS_Y   = PROVIDER_Y + PROVIDER_H + SECTION_GAP   # ~256
LAYERS_H   = 10 * 56  # 10 layers × 56px each = 560
SKILLS_Y   = LAYERS_Y + LAYERS_H + SECTION_GAP       # ~844
SKILLS_H   = 2 * 100 + COL_GAP  # 2 rows × 100px = 216
CAPS_Y     = SKILLS_Y + SKILLS_H + SECTION_GAP       # ~1088
CAPS_H     = 160
SHIM_Y     = CAPS_Y + CAPS_H + SECTION_GAP           # ~1276
SHIM_H     = 68
MEM_Y      = SHIM_Y + SHIM_H + SECTION_GAP           # ~1372
MEM_H      = 56
FOOTER_Y   = MEM_Y + MEM_H + SECTION_GAP             # ~1456


FONT_STACK = "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif"

# Lighter tints for gradient stops
LIGHT_TINTS = {
    "thinking": "#A78BFA",
    "worker":   "#5EEAD4",
    "user":     "#F8FAFC",
    "memory":   "#FBBF24",
    "security": "#F87171",
    "git":      "#60A5FA",
}


def render(features: dict, version_override: str | None) -> str:
    version = version_override or features.get("version", "0.0.0")
    tagline  = esc(features.get("tagline", ""))
    subtitle = esc(features.get("subtitle", ""))
    colors   = features["branding"]["colors"]

    layers       = features["layers"]
    skills       = features["skills"]
    providers    = features["providers"]
    capabilities = features["capabilities"]
    shims        = features["detection"]["shims"]
    mem_tiers    = features["memory"]["tiers"]

    # Recompute VB_H based on actual footer position
    actual_h = FOOTER_Y + 44
    vb_h = max(actual_h, VB_H)

    parts: list[str] = []

    def out(s: str) -> None:
        parts.append(s)

    # ---- opening tag -------------------------------------------------------
    out(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VB_W} {vb_h}"')
    out(f'     role="img" aria-labelledby="hf-title hf-desc"')
    out(f'     font-family="{FONT_STACK}">')
    out(f'  <title id="hf-title">Hyperflow v{esc(version)} — {tagline}</title>')
    out(f'  <desc id="hf-desc">{subtitle}</desc>')
    out("")

    # ---- defs: gradients + marker ------------------------------------------
    out("  <defs>")
    out(f'    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">')
    out(f'      <stop offset="0%" stop-color="{colors["bg_start"]}"/>')
    out(f'      <stop offset="100%" stop-color="{colors["bg_end"]}"/>')
    out(f'    </linearGradient>')

    for key, base_hex in colors.items():
        if key in LIGHT_TINTS:
            light = LIGHT_TINTS[key]
            out(f'    <linearGradient id="grad-{key}" x1="0" y1="0" x2="1" y2="1">')
            out(f'      <stop offset="0%" stop-color="{light}"/>')
            out(f'      <stop offset="100%" stop-color="{base_hex}"/>')
            out(f'    </linearGradient>')

    # pill clip for provider chips
    out('    <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">')
    out('      <path d="M0,0 L10,5 L0,10 Z" fill="#475569"/>')
    out('    </marker>')
    out("  </defs>")
    out("")

    # ---- background --------------------------------------------------------
    out(f'  <rect width="{VB_W}" height="{vb_h}" fill="url(#bg)"/>')
    out("")

    # subtle grid overlay
    out('  <g opacity="0.04" stroke="#94A3B8" stroke-width="1">')
    grid_lines_h = " ".join(f"M0 {y} H{VB_W}" for y in range(80, vb_h, 80))
    grid_lines_v = " ".join(f"M{x} 0 V{vb_h}" for x in range(120, VB_W, 120))
    out(f'    <path d="{grid_lines_h}"/>')
    out(f'    <path d="{grid_lines_v}"/>')
    out("  </g>")
    out("")

    # ========================================================================
    # Region 1: Header
    # ========================================================================
    out("  <!-- ======================== HEADER ======================== -->")
    out(f'  <g transform="translate({PAD},{HEADER_Y + 20})">')

    # Title
    out(f'    <text y="46" fill="{colors["text_primary"]}" font-size="42" font-weight="800" letter-spacing="-1">Hyperflow</text>')
    # Tagline
    out(f'    <text y="74" fill="{colors["text_secondary"]}" font-size="15" font-weight="500">{tagline}</text>')
    # Subtitle — wrapped at ~100 chars
    sub_lines = wrap(features.get("subtitle", ""), 120)
    for i, line in enumerate(sub_lines[:2]):
        out(f'    <text y="{94 + i * 16}" fill="{colors["text_secondary"]}" font-size="12" opacity="0.75">{esc(line)}</text>')

    out("  </g>")

    # Version badge (top-right)
    badge_w = 80
    badge_x = VB_W - PAD - badge_w
    badge_y = HEADER_Y + 20
    out(f'  <rect x="{badge_x}" y="{badge_y}" width="{badge_w}" height="30" rx="15"')
    out(f'        fill="{colors["bg_start"]}" stroke="{colors["border"]}" stroke-width="1.5"/>')
    out(f'  <text x="{badge_x + badge_w // 2}" y="{badge_y + 20}" text-anchor="middle"')
    out(f'        fill="{colors["text_secondary"]}" font-size="13" font-weight="700">v{esc(version)}</text>')
    out("")

    # ========================================================================
    # Region 2: Provider strip
    # ========================================================================
    out("  <!-- ======================== PROVIDERS ======================== -->")
    section_label(out, PROVIDER_Y, "Supported Providers", colors)

    prov_y = PROVIDER_Y + 22
    usable_w = VB_W - 2 * PAD
    chip_w = (usable_w - (len(providers) - 1) * COL_GAP) // len(providers)
    chip_h = 64

    for i, prov in enumerate(providers):
        cx = PAD + i * (chip_w + COL_GAP)
        cy = prov_y
        out(f'  <g transform="translate({cx},{cy})">')
        out(f'    <rect width="{chip_w}" height="{chip_h}" rx="12"')
        out(f'          fill="rgba(148,163,184,0.06)" stroke="{colors["border"]}" stroke-width="1"/>')
        out(f'    <text x="{chip_w//2}" y="22" text-anchor="middle"')
        out(f'          fill="{colors["text_primary"]}" font-size="13" font-weight="700">{esc(prov["name"])}</text>')
        out(f'    <text x="{chip_w//2}" y="38" text-anchor="middle"')
        out(f'          fill="#A78BFA" font-size="10" font-weight="600">think: {esc(prov["thinking"])}</text>')
        out(f'    <text x="{chip_w//2}" y="54" text-anchor="middle"')
        out(f'          fill="#5EEAD4" font-size="10" font-weight="600">work: {esc(prov["worker"])}</text>')
        out("  </g>")
    out("")

    # ========================================================================
    # Region 3: 10-layer stack
    # ========================================================================
    out("  <!-- ======================== LAYERS ======================== -->")
    section_label(out, LAYERS_Y, "Orchestration Layers (L0–L9)", colors)

    layer_y_start = LAYERS_Y + 22
    LAYER_H = 52
    layer_w = VB_W - 2 * PAD

    for layer in layers:
        n     = layer["n"]
        name  = layer["name"]
        summ  = layer["summary"]
        ckey  = layer["color"]
        base  = colors.get(ckey, "#64748B")
        light = LIGHT_TINTS.get(ckey, base)
        ly    = layer_y_start + n * LAYER_H

        circle_r = 18
        cx_center = PAD + circle_r

        # Row bg
        out(f'  <rect x="{PAD}" y="{ly}" width="{layer_w}" height="{LAYER_H - 4}" rx="10"')
        out(f'        fill="rgba(255,255,255,0.02)" stroke="{colors["border"]}" stroke-width="1" opacity="0.8"/>')

        # Color bar on left
        out(f'  <rect x="{PAD}" y="{ly}" width="4" height="{LAYER_H - 4}" rx="2"')
        out(f'        fill="url(#grad-{ckey})" opacity="0.9"/>')

        # Circle
        out(f'  <circle cx="{cx_center + 14}" cy="{ly + (LAYER_H - 4)//2}" r="{circle_r}"')
        out(f'          fill="url(#grad-{ckey})" opacity="0.9"/>')
        out(f'  <text x="{cx_center + 14}" y="{ly + (LAYER_H - 4)//2 + 5}" text-anchor="middle"')
        out(f'        fill="#0B0F1A" font-size="12" font-weight="800">{n}</text>')

        # Name + summary
        name_x = PAD + circle_r * 2 + 28
        text_cy = ly + (LAYER_H - 4) // 2
        out(f'  <text x="{name_x}" y="{text_cy - 6}"')
        out(f'        fill="{colors["text_primary"]}" font-size="13" font-weight="700">{esc(name)}</text>')

        # Truncate summary to avoid overflow
        max_chars = 90
        summ_trunc = summ if len(summ) <= max_chars else summ[:max_chars - 1] + "…"
        out(f'  <text x="{name_x}" y="{text_cy + 12}"')
        out(f'        fill="{colors["text_secondary"]}" font-size="11">{esc(summ_trunc)}</text>')

    out("")

    # ========================================================================
    # Region 4: Specialized skills grid (2 cols × 4 rows)
    # ========================================================================
    out("  <!-- ======================== SKILLS ======================== -->")
    section_label(out, SKILLS_Y, "Skills", colors)

    skill_y_start = SKILLS_Y + 22
    ncols = 2
    nrows = 4
    skill_col_w = (VB_W - 2 * PAD - (ncols - 1) * COL_GAP) // ncols
    skill_card_h = 88

    for i, skill in enumerate(skills[:8]):
        col = i % ncols
        row = i // ncols
        sx = PAD + col * (skill_col_w + COL_GAP)
        sy = skill_y_start + row * (skill_card_h + COL_GAP)

        cmd   = skill["command"]
        stag  = skill["tagline"]
        purp  = skill.get("purpose", "")

        out(f'  <g transform="translate({sx},{sy})">')
        out(f'    <rect width="{skill_col_w}" height="{skill_card_h}" rx="12"')
        out(f'          fill="rgba(167,139,250,0.05)" stroke="{colors["border"]}" stroke-width="1"/>')
        # Command badge
        badge_lbl = esc(cmd)
        out(f'    <rect x="12" y="12" width="{min(len(cmd)*7 + 12, skill_col_w - 24)}" height="22" rx="11"')
        out(f'          fill="rgba(124,58,237,0.25)" stroke="#7C3AED" stroke-width="1"/>')
        out(f'    <text x="18" y="27" fill="#DDD6FE" font-size="11" font-weight="700">{badge_lbl}</text>')
        # Tagline
        out(f'    <text x="12" y="52" fill="{colors["text_primary"]}" font-size="13" font-weight="700">{esc(stag)}</text>')
        # Purpose — single truncated line
        purp_trunc = purp if len(purp) <= 72 else purp[:71] + "…"
        out(f'    <text x="12" y="70" fill="{colors["text_secondary"]}" font-size="11">{esc(purp_trunc)}</text>')
        out("  </g>")

    out("")

    # ========================================================================
    # Region 5: Capabilities list (2 columns)
    # ========================================================================
    out("  <!-- ======================== CAPABILITIES ======================== -->")
    section_label(out, CAPS_Y, "Capabilities", colors)

    cap_y_start = CAPS_Y + 22
    bullet_col_w = (VB_W - 2 * PAD - COL_GAP) // 2
    cap_line_h = 20

    half = (len(capabilities) + 1) // 2
    for col_idx, col_caps in enumerate([capabilities[:half], capabilities[half:]]):
        cx = PAD + col_idx * (bullet_col_w + COL_GAP)
        for row_idx, cap in enumerate(col_caps):
            cy = cap_y_start + row_idx * cap_line_h
            # bullet
            out(f'  <circle cx="{cx + 6}" cy="{cy - 4}" r="3" fill="{colors["text_secondary"]}" opacity="0.5"/>')
            cap_trunc = cap if len(cap) <= 80 else cap[:79] + "…"
            out(f'  <text x="{cx + 16}" y="{cy}"')
            out(f'        fill="{colors["text_secondary"]}" font-size="11">{esc(cap_trunc)}</text>')

    out("")

    # ========================================================================
    # Region 6: Multi-tool detection shim table
    # ========================================================================
    out("  <!-- ======================== DETECTION SHIMS ======================== -->")
    section_label(out, SHIM_Y, "Multi-Tool Auto-Detection", colors)

    shim_y_start = SHIM_Y + 22
    shim_col_w = (VB_W - 2 * PAD - COL_GAP) // 2
    shim_row_h = 16

    # Header row
    out(f'  <text x="{PAD}" y="{shim_y_start}"')
    out(f'        fill="{colors["text_secondary"]}" font-size="10" font-weight="700" letter-spacing="0.8">TOOL</text>')
    out(f'  <text x="{PAD + shim_col_w + COL_GAP}" y="{shim_y_start}"')
    out(f'        fill="{colors["text_secondary"]}" font-size="10" font-weight="700" letter-spacing="0.8">SHIM FILE WRITTEN</text>')

    for i, shim in enumerate(shims):
        ry = shim_y_start + (i + 1) * shim_row_h + 2
        tool_trunc = shim["tool"][:55] if len(shim["tool"]) > 55 else shim["tool"]
        file_trunc = shim["file"][:60] if len(shim["file"]) > 60 else shim["file"]
        out(f'  <text x="{PAD}" y="{ry}" fill="{colors["text_primary"]}" font-size="11">{esc(tool_trunc)}</text>')
        out(f'  <text x="{PAD + shim_col_w + COL_GAP}" y="{ry}"')
        out(f'        fill="#5EEAD4" font-size="11" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">{esc(file_trunc)}</text>')

    out("")

    # ========================================================================
    # Region 7: Memory tiers horizontal bar
    # ========================================================================
    out("  <!-- ======================== MEMORY TIERS ======================== -->")
    section_label(out, MEM_Y, "Memory Tiers", colors)

    tier_y = MEM_Y + 22
    usable_w_tiers = VB_W - 2 * PAD
    tier_w = (usable_w_tiers - (len(mem_tiers) - 1) * COL_GAP) // len(mem_tiers)
    tier_h = 42

    tier_colors = [colors["memory"], colors["text_secondary"], colors["security"]]
    tier_fills  = ["rgba(245,158,11,0.12)", "rgba(148,163,184,0.08)", "rgba(239,68,68,0.08)"]
    tier_strokes = [colors["memory"], colors["border"], colors["security"]]

    for i, tier in enumerate(mem_tiers):
        tx = PAD + i * (tier_w + COL_GAP)
        ty = tier_y
        out(f'  <rect x="{tx}" y="{ty}" width="{tier_w}" height="{tier_h}" rx="10"')
        out(f'        fill="{tier_fills[i % 3]}" stroke="{tier_strokes[i % 3]}" stroke-width="1"/>')
        out(f'  <text x="{tx + tier_w // 2}" y="{ty + 17}" text-anchor="middle"')
        out(f'        fill="{tier_colors[i % 3]}" font-size="13" font-weight="700">{esc(tier["name"].upper())}</text>')
        meta = f'{esc(tier["age"])} · {esc(tier["load"])}'
        out(f'  <text x="{tx + tier_w // 2}" y="{ty + 33}" text-anchor="middle"')
        out(f'        fill="{colors["text_secondary"]}" font-size="11">{meta}</text>')

    out("")

    # ========================================================================
    # Footer
    # ========================================================================
    out("  <!-- ======================== FOOTER ======================== -->")
    out(f'  <text x="{PAD}" y="{FOOTER_Y + 20}"')
    out(f'        fill="#475569" font-size="11" font-weight="500">')
    out(f'    github.com/Mohammed-Abdelhady/hyperflow · v{esc(version)}</text>')
    out("")

    out("</svg>")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Helper: section label
# ---------------------------------------------------------------------------

def section_label(out_fn, y: int, label: str, colors: dict) -> None:
    """Render a small all-caps section heading with a rule."""
    out_fn(f'  <text x="{PAD}" y="{y + 14}" fill="{colors["text_secondary"]}"')
    out_fn(f'        font-size="10" font-weight="700" letter-spacing="1.6">{esc(label.upper())}</text>')
    out_fn(f'  <line x1="{PAD}" y1="{y + 18}" x2="{VB_W - PAD}" y2="{y + 18}"')
    out_fn(f'        stroke="{colors["border"]}" stroke-width="1" opacity="0.5"/>')


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Generate docs/assets/hero.svg from config/features.json")
    parser.add_argument("--version", help="override version from features.json")
    parser.add_argument("--output", default=str(ROOT / "docs" / "assets" / "hero.svg"),
                        help="output path (default: docs/assets/hero.svg)")
    args = parser.parse_args()

    features = load_features()
    svg = render(features, args.version)
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(svg, encoding="utf-8")
    print(f"wrote {out_path} ({len(svg):,} bytes)", file=__import__("sys").stderr)


if __name__ == "__main__":
    main()
