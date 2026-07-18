---
name: design
description: |
  Use when the user wants the visual/experiential design of a product done systematically — a design system, a screen, a landing page, or a visual identity — grounded in researched real-world prior art and free of AI slop. Establishes/extends the design system, invokes the matching local taste skill, dispatches the designer specialist, and reviews for taste + accessibility. Standalone — ends with a handoff gate into the chain.
  Trigger with /hyperflow:design, "design the UI", "make a design system", "design this screen", "give this a visual identity", "redesign this".
allowed-tools: Read, Glob, Grep, Agent, Skill, AskUserQuestion
argument-hint: "[target | brief]"
version: 1.0.0
license: MIT
compatibility: Portable — Claude Code, Codex, OpenCode, Antigravity, Cursor, Grok (semantic ops via runtime-contract)
tags: [design, design-system, ui, creative, anti-slop, multi-agent]
---

# Design

Systematic, anti-slop product design. All agents inherit the **current session model** — there is no model-tier routing and no model configuration. Reviewers bold-labeled; Workers plain.

Semantic host ops: `spawn`, `wait`, `structured_question`, `skill_continuation`, `web_research`, `edit` ([runtime-contract.md](../hyperflow/runtime-contract.md)). Cross-skill edges: [chain-router.md](../hyperflow/chain-router.md).

This skill exercises **Layer 4 (Brainstorming/Spec)** and the design layer of **Layer 0 (Project Analysis)**. It is
**thinking, not building** — no source code is written here. The only writes are to `.hyperflow/design/system.md` and
`.hyperflow/specs/`. It ends with a handoff gate into `/hyperflow:plan` → `/hyperflow:dispatch` for the build.

## Iron Rules

- **Design system first.** Every run establishes or extends `.hyperflow/design/system.md` before designing a screen,
  per [`../hyperflow/design-system.md`](../hyperflow/design-system.md). The system is created once and extended, never
  regenerated.
- **Researched, not invented.** Ground every direction in **≥2** real products from the project's field, combine
  them, then diverge with one deliberate signature (the method in [`design-system.md`](../hyperflow/design-system.md)).
  Prefer host `web_research` when present; when absent, record offline skip and do not invent citations.
- **Local taste skills are applied live.** The main session loads the matching taste skill via `skill_continuation`
  when a native skill tool is available; otherwise **Read** that skill's `SKILL.md` completely and apply it in the
  main thread. The dispatched `designer` agent Reads the taste `SKILL.md` and applies it (child agents do not invoke
  skills).
- **Per-step agents (DOCTRINE rule 12).** No inline design — the [`designer`](../../agents/designer.md) specialist
  does the work via `spawn` (or a labelled inline worker phase when `spawn` is unavailable); an
  `accessibility-reviewer` pass gates the result as a **separate** reviewer phase.
- **No code in the design phase.** Design produces a system file and a design spec; `dispatch` executes them.
- **Failure recovery (DOCTRINE rule 14)** per [`../hyperflow/failure-recovery.md`](../hyperflow/failure-recovery.md).
- **No AI attribution** in any file written.
- **Role separation (hard).** Worker children never review their own output. Reviewer children never coordinate.
  Missing `spawn` → labelled inline worker, then **separate** labelled inline reviewer — never merge.

## Per-Step Agent Map (DOCTRINE rule 12)

| Step | Sub-phase | Workers | Reviewers | Notes |
|---|---|---|---|---|
| 1 — Triage | — | — | — | Mechanical classification (exempt) per [`../hyperflow/task-triage.md`](../hyperflow/task-triage.md) |
| 2 — Design system | 2a — establish/extend `.hyperflow/design/system.md` | `designer` | **Reviewer** | Creates if missing; extends if present |
| 3 — Research + direction | 3a — prior-art research + combine + diverge | `designer` (fan-out ≤ 3 by dimension) | **Reviewer** | Web-research-first when tools exist; ≥2 references |
| 4 — Design spec | 4a — translate direction into tokens/spec | `designer` | **Reviewer** | Written to `.hyperflow/specs/<slug>.md` |
| 5 — Taste + a11y review | — | — | **`designer`** verdict + **`accessibility-reviewer`** | Anti-slop floor + WCAG floor |
| 6 — Handoff gate | — | — | — | `structured_question` only (exempt — structural gate) |

When `spawn` is present: prefer parallel sibling spawns for independent designer / reviewer children; collect with
`wait` when available. When `spawn` is absent: run each worker as a distinct labelled inline phase, then a separate
labelled inline reviewer phase.

## Approval Gates

| Gate | When | Format |
|---|---|---|
| Handoff gate | Step 6, after the spec is written | `structured_question` — build now / plan first / stop |

Structural gates always fire. Prefer native structured UI when present; otherwise exact **Hyperflow Question** chat
block + **end the turn**. Never silent-default a build. Headless with no interactive channel → error and stop.

## Flow

### Step 1 — Triage

Classify the request per [`../hyperflow/task-triage.md`](../hyperflow/task-triage.md). `types` will include `ui`
and/or `creative`; the [Brain](../../agents/brain.md) confirms `designer` on the roster.

### Step 2 — Design system

Read `.hyperflow/design/system.md`. If missing, `spawn` (or labelled inline) `designer — establish design system` to
create it (domain, tokens, type scale, spacing, motion, voice, components, references, anti-patterns) per
[`design-system.md`](../hyperflow/design-system.md). If present, `designer — extend design system` to add only what
this brief needs. Then `**Reviewer** — design-system coverage check` as a **separate** review pass.

### Step 3 — Research + direction

Apply the matching local taste skill(s) live via `skill_continuation` or full Read of that skill's `SKILL.md` (per
the index in `design-system.md`). Then `spawn` / inline `designer — research prior art + propose direction`
(fan-out ≤ 3 by visual language / motion+interaction / IA when the surface is broad): study ≥2 real systems in the
field, combine, diverge with one named signature. Then `**Reviewer** — direction grounding check` (≥2 references
combined, not copied; signature is deliberate).

### Step 4 — Design spec

`spawn` / inline `designer — author design spec` to translate the chosen direction into the bound design-system
tokens and write it to `.hyperflow/specs/<slug>.md` (format per
[`../hyperflow/artefact-format.md`](../hyperflow/artefact-format.md)). Then `**Reviewer** — spec sanity check`.

### Step 5 — Taste + accessibility review

Dispatch in parallel when `spawn` concurrency allows (else sequence labelled phases): `**designer** — taste verdict`
(anti-slop floor) ∥ `**accessibility-reviewer** — a11y floor` (WCAG AA, focus, reduced-motion, RTL). On a11y
conflict, the floor wins (Step 5 defers to the a11y verdict).

### Step 6 — Handoff gate (STRUCTURAL GATE · DOCTRINE rule 8 · chain-router)

```
?  Design spec ready at .hyperflow/specs/<slug>.md — build it?

   Build now (Recommended)  — chain to /hyperflow:plan → /hyperflow:dispatch
   Plan first               — open /hyperflow:plan to decompose without building yet
   Stop                     — leave the spec; build later
```

Gate via `structured_question` when present. If structured UI is unavailable, print the same options as a
`Hyperflow Question` chat block and **end the turn** — never auto-build silently.

On **Build now** → `skill_continuation` to `plan` with args
`session=one spec=.hyperflow/specs/<slug>.md`. On **Plan first** → `skill_continuation` to `plan` with
`spec=.hyperflow/specs/<slug>.md` (no auto-dispatch intent). On **Stop** → print one line and stop.

When native skill handoff is unavailable: load `skills/plan/SKILL.md` **completely**, then continue inline with the
same args and gate contract ([chain-router.md](../hyperflow/chain-router.md)). Plan still owns its own
build-location gate — design never implements.

## Output Format

Two outputs:

1. **The design system** at `.hyperflow/design/system.md` — living token document (created or extended this run).
2. **The design spec** at `.hyperflow/specs/<slug>.md` — the direction, tokens, signature, and `References:` block.

Chat shows one status box pointing at the files, never the token dump (file-first, rule 8):

```
── Design Result ─────────────────────
Brief:    <one line>
System:   .hyperflow/design/system.md (created | extended)
Spec:     .hyperflow/specs/<slug>.md
Verdict:  taste PASS · a11y PASS
─────────────────────────────────────
```

## Hand-off

- **Build now / Plan first** — `skill_continuation` → `/hyperflow:plan` per [chain-router.md](../hyperflow/chain-router.md); plan stops at its build-location gate and never auto-implements.
- **Stop** — spec persists for a later build.

## Doctrine

Full rules in [DOCTRINE.md](../hyperflow/DOCTRINE.md). Design method, taste-skill index, and anti-slop floor in
[design-system.md](../hyperflow/design-system.md). Persona standards (`ui`, `creative`) in
[personas-A.md](../hyperflow/personas-A.md) — bound by the `designer`, never restated.
Runtime ops: [runtime-contract.md](../hyperflow/runtime-contract.md). Transitions: [chain-router.md](../hyperflow/chain-router.md).

## Overview

`/hyperflow:design` runs systematic product design: it establishes or extends the project's design system, researches
real-world prior art in the project's field, applies the matching local taste skill, dispatches the `designer`
specialist to combine references and diverge with one deliberate signature, and gates the result on a taste +
accessibility review before handing off to the build chain.

## Prerequisites

- `.hyperflow/` cache recommended (Layer 0 analysis improves design context). Run `/hyperflow:scaffold` first if
  missing.
- Local taste skills discoverable on the host (paths vary by install; the skill degrades gracefully to the anti-slop
  floor in `design-system.md` when a specific taste skill is absent).

## Portability

| Capability | Behavior |
|---|---|
| `spawn` present | Designer + independent reviewer children; parallel when inventory allows |
| `spawn` absent | Labelled inline worker phases, then separate labelled inline reviewer phases |
| `structured_question` present | Handoff gate as native structured UI |
| `structured_question` absent | Hyperflow Question chat block + end turn |
| `skill_continuation` present | Native handoff to `plan` |
| `skill_continuation` absent | Full load of `skills/plan/SKILL.md`, then inline continue |
| `web_research` absent | Offline research skip; never invent prior-art citations |
| `usage_metrics` absent | Report `unavailable`; never fabricate tokens |

## Error Handling

| Failure | Behavior |
|---|---|
| `structured_question` unavailable | Hyperflow Question chat block + end turn; never silent-build |
| No interactive channel at handoff | Error and stop; leave spec on disk |
| Taste skill missing | Degrade to anti-slop floor in `design-system.md` |
| Reviewer NEEDS_REVISION | Re-dispatch only the failing design step (max per failure-recovery) |
