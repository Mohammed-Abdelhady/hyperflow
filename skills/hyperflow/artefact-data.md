# Artefact data contract (viewer mode)

The single source of truth for how artefacts are emitted when the **visual
artefact viewer** is enabled. When `viewer.enabled` is `false`, skills ignore
everything here and write full markdown exactly as [`artefact-format.md`](artefact-format.md)
describes (classic mode). Both modes are first-class; the viewer is a
token-saving convenience, never a requirement.

> **Why this exists.** In classic mode every artefact-producing agent writes its
> own presentation — status tables, ASCII dependency diagrams, progress-bar
> strings, per-task briefs, framing prose. That formatting is pure output tokens
> and is identical run to run. In viewer mode the agent emits a **compact
> validated JSON payload** and a pre-built local renderer ([`viewer/`](../../viewer/))
> reconstructs the rich, interactive view. The saving is on the presentation
> layer; the substance (decisions, acceptance criteria, briefs) still gets
> written because it is information, not formatting.

## The mode switch

Resolve once per chain, before writing any artefact:

```
enabled = config .viewer.enabled   (default true; ~/.hyperflow/config.json overrides config/defaults.json)
```

- **enabled** → emit the compact JSON via `scripts/artefact.py` (below), write the
  slim stub, and print ONE chat line: `Artefact → hyperflow view <slug>`. Do not
  echo artefact content into chat (same rule as classic mode).
- **disabled** → write full markdown per [`artefact-format.md`](artefact-format.md);
  never call `artefact.py`; never write a stub. `artefact.py` is not on the
  classic-mode path.

## The envelope

Every artefact is the same wrapper; only `payload` differs by `type`. Schema:
[`config/artefact.schema.json`](../../config/artefact.schema.json) (envelope +
per-type payload `$defs`).

```jsonc
{
  "hf": 1,                       // envelope version
  "type": "spec",               // spec|task|feature|dispatch|audit|memory|review
  "slug": "visual-artefacts",   // kebab-case, ^[a-z0-9][a-z0-9-]*$  (path segment — validated)
  "title": "…",
  "status": "approved",
  "created": "2026-07-17",      // stamped by artefact.py — NEVER written by the agent
  "updated": "2026-07-17",      // stamped by artefact.py
  "specialists": ["architect"],
  "payload": { … }              // type-specific; see config/artefact.schema.json $defs
}
```

Per-type payload fields are defined in the schema `$defs` — read them there, not
here, so there is one source of truth. The types: `spec`, `task`, `feature`,
`dispatch`, `audit`, `memory`, `review`, `usage`.

**Widened fields (optional, back-compatible).** `task` payloads may carry `cost`
`{agents,tokens,perCommit}`, `progress` `{done,total}`, `branch`, and per-sub-task
`briefBody` (the full brief markdown) + `acceptance[]` — so `render-artefact.py`
reproduces the classic layout losslessly. `dispatch.totals.terminal` tells the
viewer when to stop live-polling. The `usage` type carries the aggregated ledger
(`totals`, `phases`, `ratios`, `chains`) for the telemetry view. All additions are
optional: existing artefacts without them still validate and render.

## How an agent writes an artefact (the ONLY supported call)

The agent emits the **payload only** (compact JSON) and pipes it to the writer.
It never hand-formats the envelope, never stamps dates, never writes the stub by
hand:

```bash
echo '<payload-json>' | python3 "$PLUGIN_ROOT/scripts/artefact.py" write <type> <slug> \
    --title "<title>" --status "<status>" --specialists "a,b" --project-root "$PROJECT_ROOT"
```

`artefact.py` wraps the payload in the envelope, stamps `created`/`updated`,
validates against the schema (stdlib only — no `jsonschema` dependency), writes
`.hyperflow/artefacts/<type>/<slug>.json`, and rewrites the ≤6-line stub at the
canonical path so JSON and stub can never drift. Non-zero exit = validation or
I/O failure; on failure the skill falls back to writing full markdown for that
one artefact and logs a notice (the chain never blocks on a viewer failure).

## The slim stub

At the canonical path (`.hyperflow/specs/<slug>.md`, `tasks/<slug>.md`,
`audits/<slug>.md`, `features/<slug>/feature.md`) the agent leaves a ≤6-line
greppable, git-diffable stub — never the full content:

```markdown
# <title>

Status: <status> · <type> · updated <date>
Visual artefact: run `hyperflow view <slug>` (or `render-artefact.py <slug>` for markdown)
Data: `.hyperflow/artefacts/<type>/<slug>.json`
```

`dispatch`, `memory`, and `review` artefacts are JSON-only (no stub) so they
never overwrite hand-maintained files.

## Regenerating full markdown

Nothing is lost. `python3 scripts/render-artefact.py <slug>` prints the full
[`artefact-format.md`](artefact-format.md) layout from the JSON on demand;
`render-artefact.py --all` rehydrates every stub (used when a project turns the
viewer off — `config.viewer.markdown = never|on-demand|always` governs whether
full markdown is also written eagerly on each artefact write).

## Viewing

`hyperflow view [slug]` (`scripts/view.py`) serves the viewer bundle on
`127.0.0.1` (never `0.0.0.0`) and opens the artefact, or the gallery when no slug
is given. Nothing leaves the machine. `--artefacts-dir` points `/artefacts/` at
an explicit root — e.g. a two-session handoff package — so a reviewer can
visualize a handed-off plan without rehydrating.

## Leaner memory (viewer mode)

The `memory` payload stores only `{ title, task, decision, tags }` per entry —
the verbose prose of classic memory entries is dropped. `tags` is retained (not
optional): the tag-matched lazy-injection tier ([`memory-system.md`](memory-system.md))
breaks without it. See [`memory-system.md`](memory-system.md) for the full rule.

## Handoff mode

The compact JSON is the artefact's substance in viewer mode, so the committed
two-session handoff package must carry it. See
[`session-handoff.md`](session-handoff.md): `plan` copies `.hyperflow/artefacts/**`
into the package, `dispatch` rehydrates it, and either session can
`hyperflow view --artefacts-dir <package>/artefact/artefacts` to visualize the
plan. No new privacy exposure — the package already travels via the user's own
git remote.
