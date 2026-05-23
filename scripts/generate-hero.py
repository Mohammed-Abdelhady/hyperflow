#!/usr/bin/env python3
"""Generate docs/assets/hero.svg from config/features.json.

Editorial-minimalism dark card. Centerpiece: the six-skill chain rendered as
an elegant horizontal flow with the thinking/worker color split.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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
# Layout constants
# ---------------------------------------------------------------------------

W   = 1200   # viewBox width
H   = 420    # viewBox height
PAD = 56     # horizontal outer padding

FONT = "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif"
MONO = "ui-monospace, SFMono-Regular, Menlo, monospace"

# Chain: skills that appear in the horizontal flow (first 6, in order)
CHAIN_SKILLS = ["scaffold", "spec", "scope", "dispatch", "audit", "deploy"]

# Color role for each chain node — matches the thinking/worker split story
# thinking = Opus/orchestration tier; worker = Sonnet/execution tier
CHAIN_ROLE = {
    "scaffold": "worker",
    "spec":     "thinking",
    "scope":    "thinking",
    "dispatch": "worker",
    "audit":    "thinking",
    "deploy":   "worker",
}


# ---------------------------------------------------------------------------
# SVG renderer
# ---------------------------------------------------------------------------

def render(features: dict, version_override: str | None) -> str:
    version = version_override or features.get("version", "0.0.0")
    tagline  = features.get("tagline", "")
    colors   = features["branding"]["colors"]
    skills   = {s["name"]: s for s in features["skills"]}

    thinking_color = colors["thinking"]   # #7C3AED
    worker_color   = colors["worker"]     # #14B8A6
    bg_start       = colors["bg_start"]   # #0B0F1A
    bg_end         = colors["bg_end"]     # #0E1422
    border         = colors["border"]     # #334155
    text_primary   = colors["text_primary"]    # #F8FAFC
    text_secondary = colors["text_secondary"]  # #94A3B8

    # Slightly lighter tints for node fills (semi-transparent over dark bg)
    thinking_fill = "rgba(124,58,237,0.18)"
    worker_fill   = "rgba(20,184,166,0.14)"
    thinking_stroke = thinking_color
    worker_stroke   = worker_color

    parts: list[str] = []

    def o(s: str) -> None:
        parts.append(s)

    # ---- SVG open ----------------------------------------------------------
    o(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}"')
    o(f'     width="{W}" height="{H}"')
    o(f'     role="img" aria-labelledby="hf-title hf-desc"')
    o(f'     font-family="{FONT}">')
    o(f'  <title id="hf-title">Hyperflow v{esc(version)}</title>')
    o(f'  <desc id="hf-desc">{esc(tagline)}</desc>')
    o("")

    # ---- defs --------------------------------------------------------------
    o("  <defs>")
    # Background gradient (top to bottom, subtle)
    o(f'    <linearGradient id="bg-grad" x1="0" y1="0" x2="0" y2="1">')
    o(f'      <stop offset="0%"   stop-color="{bg_start}"/>')
    o(f'      <stop offset="100%" stop-color="{bg_end}"/>')
    o(f'    </linearGradient>')
    # Connector arrow marker
    o(f'    <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4"')
    o(f'            markerWidth="4" markerHeight="4" orient="auto">')
    o(f'      <path d="M0,0 L8,4 L0,8 Z" fill="{border}"/>')
    o(f'    </marker>')
    # Clip rect for the card (rounded corners)
    o(f'    <clipPath id="card-clip">')
    o(f'      <rect width="{W}" height="{H}" rx="16"/>')
    o(f'    </clipPath>')
    o("  </defs>")
    o("")

    # ---- card background ---------------------------------------------------
    # Outer card with border
    o(f'  <rect width="{W}" height="{H}" rx="16"')
    o(f'        fill="url(#bg-grad)" stroke="{border}" stroke-width="1.5"/>')
    o("")

    # Very subtle noise texture: one tiled dot pattern (cheap; ~13KB lighter
    # than enumerating every dot as its own path)
    o(f'  <pattern id="dot-grid" width="24" height="24" patternUnits="userSpaceOnUse">')
    o(f'    <circle cx="1" cy="1" r="0.75" fill="{text_secondary}"/>')
    o("  </pattern>")
    o(f'  <rect clip-path="url(#card-clip)" x="0" y="0" width="{W}" height="{H}" fill="url(#dot-grid)" opacity="0.025"/>')
    o("")

    # ---- wordmark region (left column) -------------------------------------
    wordmark_x = PAD
    wordmark_baseline_y = 80

    # "Hyperflow" — large, confident, near-white
    o(f'  <text x="{wordmark_x}" y="{wordmark_baseline_y}"')
    o(f'        fill="{text_primary}" font-size="52" font-weight="800"')
    o(f'        letter-spacing="-1.5">Hyperflow</text>')

    # Tagline — slate secondary, smaller
    # Truncate to a single clean line (~55 chars fits the left column well)
    tagline_short = tagline if len(tagline) <= 55 else tagline[:52] + "..."
    o(f'  <text x="{wordmark_x}" y="{wordmark_baseline_y + 32}"')
    o(f'        fill="{text_secondary}" font-size="14" font-weight="400">{esc(tagline_short)}</text>')

    # Thinking / Worker legend — two small labeled dots
    legend_y = wordmark_baseline_y + 68
    dot_r = 5

    o(f'  <circle cx="{wordmark_x + dot_r}" cy="{legend_y}" r="{dot_r}" fill="{thinking_color}"/>')
    o(f'  <text x="{wordmark_x + dot_r * 2 + 6}" y="{legend_y + 4}"')
    o(f'        fill="{text_secondary}" font-size="11" font-weight="500">thinking tier (Opus)</text>')

    worker_legend_x = wordmark_x + 165
    o(f'  <circle cx="{worker_legend_x + dot_r}" cy="{legend_y}" r="{dot_r}" fill="{worker_color}"/>')
    o(f'  <text x="{worker_legend_x + dot_r * 2 + 6}" y="{legend_y + 4}"')
    o(f'        fill="{text_secondary}" font-size="11" font-weight="500">worker tier (Sonnet)</text>')

    # Version badge — bottom-left under legend
    version_y = legend_y + 28
    badge_label = f"v{version}"
    badge_w = len(badge_label) * 8 + 16
    o(f'  <rect x="{wordmark_x}" y="{version_y}" width="{badge_w}" height="22" rx="11"')
    o(f'        fill="rgba(255,255,255,0.05)" stroke="{border}" stroke-width="1"/>')
    o(f'  <text x="{wordmark_x + badge_w // 2}" y="{version_y + 14}" text-anchor="middle"')
    o(f'        fill="{text_secondary}" font-size="11" font-weight="600">{esc(badge_label)}</text>')

    # ---- chain region (right/center, starting after the left column) ------
    #
    # Chain layout: nodes spaced evenly, connectors between them.
    # The chain spans from chain_x_start to W - PAD.
    # Each node is a rounded rect with the skill command in monospace + tagline.

    chain_x_start = PAD + 310   # leave room for the wordmark column
    chain_x_end   = W - PAD
    chain_usable  = chain_x_end - chain_x_start
    n_skills      = len(CHAIN_SKILLS)
    n_connectors  = n_skills - 1

    node_w = 118
    node_h = 68
    # Space between nodes (occupied by connector arrows)
    connector_w = (chain_usable - n_skills * node_w) // n_connectors

    chain_center_y = H // 2 - 10   # vertical center of the chain row

    # Section label above the chain
    label_y = chain_center_y - node_h // 2 - 28
    o(f'  <text x="{chain_x_start}" y="{label_y}"')
    o(f'        fill="{text_secondary}" font-size="10" font-weight="700"')
    o(f'        letter-spacing="1.8">THE CHAIN</text>')
    o("")

    for idx, skill_name in enumerate(CHAIN_SKILLS):
        skill = skills.get(skill_name, {})
        command = skill.get("command", f"/hyperflow:{skill_name}")
        tagline_s = skill.get("tagline", skill_name)
        role = CHAIN_ROLE.get(skill_name, "worker")

        fill   = thinking_fill   if role == "thinking" else worker_fill
        stroke = thinking_stroke if role == "thinking" else worker_stroke
        accent = thinking_color  if role == "thinking" else worker_color

        nx = chain_x_start + idx * (node_w + connector_w)
        ny = chain_center_y - node_h // 2

        # Node card
        o(f'  <rect x="{nx}" y="{ny}" width="{node_w}" height="{node_h}" rx="10"')
        o(f'        fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>')

        # Command — monospace, small, accent color
        cmd_display = command.replace("/hyperflow:", "/")
        o(f'  <text x="{nx + node_w // 2}" y="{ny + 22}" text-anchor="middle"')
        o(f'        fill="{accent}" font-size="11" font-weight="700"')
        o(f'        font-family="{MONO}">{esc(cmd_display)}</text>')

        # Thin rule under command
        o(f'  <line x1="{nx + 10}" y1="{ny + 28}" x2="{nx + node_w - 10}" y2="{ny + 28}"')
        o(f'        stroke="{stroke}" stroke-width="0.75" opacity="0.4"/>')

        # Tagline — near-white, readable
        o(f'  <text x="{nx + node_w // 2}" y="{ny + 44}" text-anchor="middle"')
        o(f'        fill="{text_primary}" font-size="11.5" font-weight="600">{esc(tagline_s)}</text>')

        # Role label — tiny, bottom of node
        role_label = "think" if role == "thinking" else "work"
        o(f'  <text x="{nx + node_w // 2}" y="{ny + node_h - 8}" text-anchor="middle"')
        o(f'        fill="{accent}" font-size="9" font-weight="500" opacity="0.7">{role_label}</text>')

        # Connector to next node (hairline with arrow)
        if idx < n_skills - 1:
            conn_x1 = nx + node_w + 4
            conn_x2 = nx + node_w + connector_w - 4
            conn_y  = chain_center_y
            o(f'  <line x1="{conn_x1}" y1="{conn_y}" x2="{conn_x2}" y2="{conn_y}"')
            o(f'        stroke="{border}" stroke-width="1.5" marker-end="url(#arr)"/>')

    o("")

    # ---- chain annotation below nodes -------------------------------------
    # Auto-chain annotation: spec auto-chains to scope, scope to dispatch
    ann_y = chain_center_y + node_h // 2 + 18

    # Auto-chain arc label: sits below spec→scope→dispatch
    spec_idx   = CHAIN_SKILLS.index("spec")
    dispatch_idx = CHAIN_SKILLS.index("dispatch")

    spec_x     = chain_x_start + spec_idx   * (node_w + connector_w) + node_w // 2
    dispatch_x = chain_x_start + dispatch_idx * (node_w + connector_w) + node_w // 2
    arc_cx     = (spec_x + dispatch_x) // 2

    o(f'  <text x="{arc_cx}" y="{ann_y}"')
    o(f'        fill="{text_secondary}" font-size="10" text-anchor="middle"')
    o(f'        font-style="italic" opacity="0.7">auto-chains: spec → scope → dispatch</text>')

    # ---- footer rule -------------------------------------------------------
    footer_y = H - 36
    o(f'  <line x1="{PAD}" y1="{footer_y}" x2="{W - PAD}" y2="{footer_y}"')
    o(f'        stroke="{border}" stroke-width="0.75" opacity="0.5"/>')

    # Footer left: repo URL
    o(f'  <text x="{PAD}" y="{footer_y + 18}"')
    o(f'        fill="#475569" font-size="11">github.com/Mohammed-Abdelhady/hyperflow</text>')

    # Footer right: "multi-agent orchestration for Claude Code"
    o(f'  <text x="{W - PAD}" y="{footer_y + 18}" text-anchor="end"')
    o(f'        fill="#475569" font-size="11">multi-agent orchestration for Claude Code</text>')

    o("")
    o("</svg>")

    return "\n".join(parts)


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

    import sys
    print(f"wrote {out_path} ({len(svg):,} bytes)", file=sys.stderr)


if __name__ == "__main__":
    main()
