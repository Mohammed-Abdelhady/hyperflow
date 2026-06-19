# Hyperflow Demo Script

A ~28-second walk-through that shows the **full spec → scope → dispatch chain**, with the Worker → Reviewer review pattern legible throughout. Used by `scripts/generate-demo-cast.py` to produce `docs/assets/demo.gif`.

## What it shows

| Beat | What happens | Concept visible |
|---|---|---|
| 0–4s | `claude` starts — Hyperflow banner, memory loaded | Activation |
| 4–8s | User types `/hyperflow:spec`, picks Auto mode, Triage fires | Chain-starter, triage, autonomy |
| 8–14s | Analyst explores codebase, asks 1 design question, writes spec | Orchestration |
| 14–19s | Auto-chains to scope — Planner produces 2-batch task file | Decomposition |
| 19–25s | Dispatch: 3 parallel Worker agents (batch 1), Reviewer, gates pass | Parallel execution, review |
| 25–27s | Batch 2, final integration reviewer, usage summary, memory persisted | End-to-end completion |

## Worker → Reviewer legibility

Agent labels use explicit role markers throughout the rendered cast:

- `Agent(Classifier, triage)` — decision agent
- `Agent(Analyst, 6-dim exploration)` — decision agent
- `3 parallel Worker agents` — execution
- `Agent(Batch 1 reviewer, L1–L2)` — Reviewer over worker output

This makes the orchestration model readable to any viewer without prior knowledge.

## Prep (manual recording only)

For the synthesized GIF pipeline, no prep is needed — run `scripts/generate-demo.sh` directly.

For live recording with `record-demo.sh`:

```bash
mkdir -p ~/hyperflow-demo && cd ~/hyperflow-demo
git init -q && git commit --allow-empty -qm "init"
cat > package.json <<'JSON'
{ "name": "demo", "version": "0.0.0", "scripts": { "lint": "echo lint ok", "test": "echo tests ok" } }
JSON
mkdir -p src && echo "export const App = () => null;" > src/App.ts
clear
```

## Tuning

| Var | Default | When to change |
|-----|---------|---------------|
| `HYPERFLOW_DEMO_COLS` | 120 | smaller terminal → smaller GIF |
| `HYPERFLOW_DEMO_ROWS` | 34 | shorter terminal → smaller GIF |
| `HYPERFLOW_DEMO_SPEED` | 1.6 | bump to 2.0+ if file > 3 MB |
| `HYPERFLOW_DEMO_THEME` | dracula | `monokai`, `nord`, `kanagawa`, `gruvbox-dark` |
| `HYPERFLOW_DEMO_FONT_SIZE` | 11 | drop to 9 for crisper compression |

## Theme rationale

`dracula` is used because its terminal color palette maps naturally to the brand:
- Color 5 (magenta/purple) → decision/review roles — aligns with brand `#7C3AED`
- Color 6 (cyan) → execution/worker roles — aligns with brand `#14B8A6`
- Color 3 (yellow) → memory/amber concepts
- Color 1 (red) → security/blocked concepts
- Near-black background with high-contrast foreground — legible at small sizes

`monokai`, `nord`, and `kanagawa` are viable fallbacks; all are icon-free and readable.

## Embedding

```html
<p align="center">
  <img src="docs/assets/demo.gif" alt="Hyperflow — spec to dispatch in 28 seconds" width="100%" />
</p>
```
