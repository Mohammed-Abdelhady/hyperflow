# Design-system protocol

The shared design step the [`designer`](../../agents/designer.md) agent and the [`design`](../design/SKILL.md) skill
invoke before any screen is designed. Good design is **researched, systematic, and grounded in a living design
system** — not improvised per screen and not the templated default an ungrounded model reaches for by reflex.

This file is the **single source of truth** for the design method, the design-system artefact, the local taste-skill
index, and the anti-slop floor. The `designer` charter and the `design` skill reference it by one line and never
restate it. It binds — it does not duplicate — the `ui` and `creative` persona standards in
[`personas-A.md`](personas-A.md).

Executable ops use [runtime-contract.md](runtime-contract.md): `spawn` / labelled inline for designer and
reviewer roles, `web_research` for prior-art, `skill_continuation` for live taste-skill invoke when available,
`structured_question` for the **blocking** design handoff / approval gates. Every agent runs on the **current
session model**.

## The design-system artefact

The durable design system lives at **`.hyperflow/design/system.md`** — a living document that survives across
features (distinct from per-feature specs under `.hyperflow/specs/`). It is **created once and extended**, never
regenerated from scratch.

**When it is missing, create it first** — before designing any screen. Format per
[`artefact-format.md`](artefact-format.md): a markdown-table status block, then these sections:

| Section | Holds |
|---|---|
| Domain + audience | the product's field and who it serves — drives every reference choice |
| Color tokens | named values + roles (surface, text, one accent); never a raw hex inline elsewhere |
| Type scale + pairing | display + body (+ utility) faces, sizes, weights, tracking |
| Spacing scale | the only spacing values allowed downstream — no arbitrary pixels |
| Motion language | easing curves, durations, what motion is allowed to communicate — the [`motion`](../../agents/motion.md) agent reads and extends this; deep motion-engineering rules live in [`motion.md`](motion.md) |
| Voice / tone | how copy reads; what words the product does and doesn't use |
| Component inventory | named primitives + their visual treatment, cross-referenced by `frontend`/`ui` workers |
| References | the **real systems studied** to ground the system (with the combination rationale) |
| Anti-patterns | what this brand must avoid — the slop floor below, specialised to this product |

When present, **extend** it: add the new tokens/components, append to references, never rewrite the established
language. The `ui` persona's "read the design token file before introducing any new value" rule resolves against this
file.

## The method (research → combine → diverge)

1. **Research the field.** Study **≥2** real products/systems in the project's own domain via web-research-first
   ([`web-research.md`](web-research.md)) using the `web_research` op when inventory exposes it — how peers in this
   field actually look and behave, plus current design-system and interaction patterns and award-tier references for
   the surface. When web tools are absent: skip network research, record `unavailable` in the design evidence, and
   never invent citations.
2. **Combine.** Synthesise the studied references into a coherent direction — take the load-bearing idea from each,
   not a copy of one. Record the combination rationale in the `References` section.
3. **Diverge with one deliberate signature.** Add a single, named signature move that makes the design ownable. Spend
   boldness in one place; keep the rest quiet (the `creative` persona's thesis discipline).
4. **Never ship the templated default.** If the direction reads like what you'd produce for any brief in this
   category, it has not diverged — revise.

## Local taste-skill index

World-class anti-slop rules already live in installed taste skills. **Discover and apply them — never duplicate
them here.** Discovery (first match that exists on disk):

- Host skill directories and plugin skill trees the session already uses
- `~/.claude/skills/*/SKILL.md` and marketplace plugin skill paths when present (Claude-oriented installs)
- Project-local skill folders when documented by the host

When no matching taste skill is found, proceed with the **anti-slop floor** below only — do not invent a skill body.

### Tool split (semantic)

| Surface | Ops | Behavior |
|---|---|---|
| **`design` skill (main session)** | `skill_continuation` when callable; else full load of target `SKILL.md` + inline apply | Invokes the matching taste skill live, then dispatches the designer under it |
| **`designer` child** | file read / search / `web_research` / limited `spawn` for peer consult | **No** assumed `skill_continuation` / host `Skill` tool — **reads** the taste `SKILL.md` and applies its rules |
| **Reviewer** | separate `spawn` or labelled **inline reviewer** | Taste + a11y coverage; never the same phase that authored the system/spec |
| **Consultation** | orchestrator-brokered `CONSULT:` per [consultation.md](consultation.md) | e.g. designer → motion; depth-1, budget-capped |

Prefer concurrent independent spawns when the host supports them; otherwise sequence labelled inline worker then
labelled inline reviewer. Role separation is non-negotiable.

| Skill | Use when |
|---|---|
| `design-taste-frontend` | landing pages, portfolios, redesigns — the default anti-slop frontend skill (audit-first, pre-flight checks) |
| `frontend-design` | brief-grounded distinctive UI — two-pass brainstorm → uniqueness review |
| `high-end-visual-design` | "make it feel expensive" — agency/Awwwards-tier visual language |
| `redesign-existing-projects` | upgrading an existing site/app — audit current design, strip generic patterns |
| `senior-creative-frontend` | animation-rich, SVG/GSAP/Framer, scroll-driven, "make it pop" interfaces |
| `minimalist-ui` | clean editorial monochrome systems — typographic contrast, flat bento, no heavy shadows |
| `industrial-brutalist-ui` | raw mechanical/terminal aesthetics — data-heavy dashboards, declassified-blueprint feel |
| `brandkit` | brand identity, logo systems, identity decks (generates images, not code) |
| `imagegen-frontend-web` / `imagegen-frontend-mobile` | premium design-reference images per section/screen (images only) |
| `image-to-code` | generate the design image, analyse it, then implement the site to match |
| `gpt-taste` / `stitch-design-taste` | editorial GSAP motion / DESIGN.md generation when those workflows fit |

Pick the **fewest** skills that fit the brief — usually one primary taste skill, plus `brandkit`/`imagegen-*` only
when identity or reference imagery is genuinely needed.

## Blocking approval and handoff gates

Design runs that finish a system and/or design spec must not auto-build. Structural gates (owning skill:
[`design`](../design/SKILL.md) Step 6; transitions in [chain-router.md](chain-router.md)):

| Gate | When | Op | Skip? |
|---|---|---|---|
| Design handoff | Spec written and taste/a11y review complete | `structured_question` — Build now / Plan first / Stop | **Never** on a successful design run |
| Section / direction approval (when the skill requires it) | Before locking a multi-section design walk-through | `structured_question` | Only when the skill documents a non-interactive path |

Prefer host structured UI when present (Claude: `AskUserQuestion`; Codex: `request_user_input`; others: inventory).
When missing: exact **Hyperflow Question** chat block + **end the turn**. Never silent-default "Build now". Never
auto-continue into `plan`/`dispatch` without the user's answer. Named-workflow options may mark `(Recommended)` on
the preferred path; binary Yes/No gates do not.

## Anti-slop floor (the thin non-negotiables)

A short floor every design passes regardless of skill. Each line points at the taste skill that owns the deep rule —
this floor is deliberately thin and defers to those skills.

- **No default AI gradient.** No reflexive purple/violet or neon mesh-gradient backgrounds. One accent, saturation
  kept in check. (`design-taste-frontend`, `high-end-visual-design`)
- **No serif-by-default.** Serif only when the brand genuinely warrants it and you can say why. (`design-taste-frontend`)
- **No premium-beige reflex.** Warm beige/cream + brass + espresso is the default ungrounded "luxury" palette — rotate
  instead. (`design-taste-frontend`)
- **Eyebrow restraint.** Not an uppercase-tracking eyebrow above every section. (`design-taste-frontend`)
- **No duplicate-intent CTAs.** One label per intent; CTA text fits one line at desktop. (`design-taste-frontend`)
- **Hero fits the viewport.** Headline ≤ 2 lines, CTAs visible without scroll. (`design-taste-frontend`)
- **One locked corner-radius scale** across the whole surface. (`high-end-visual-design`)
- **Motion must communicate.** Every animation conveys state or guides attention — never decoration (the `ui`
  persona's motion rule). (`senior-creative-frontend`)
- **No arbitrary values.** Every color/spacing/type value traces to `.hyperflow/design/system.md`. (the `ui` persona)

## Accessibility floor

The `ui` persona's WCAG-AA minimum, visible focus rings, `prefers-reduced-motion` fallback, and RTL-safe directional
utilities are **non-negotiable** — they bind here unchanged. On any conflict between an aesthetic move and the a11y
floor, the floor wins; defer to [`accessibility-reviewer`](../../agents/accessibility-reviewer.md).

## Output discipline

The design system and design specs are **files** under `.hyperflow/` (rule 8, file-first). Chat shows a short status
box pointing at the file — never the full token dump. Research output is a short cited brief
([`web-research.md`](web-research.md) token discipline), ending in `Sources consulted:` when research ran. When
research was skipped offline, say so explicitly — do not fabricate sources.

## Related

- [runtime-contract.md](runtime-contract.md) · [chain-router.md](chain-router.md) · [consultation.md](consultation.md)
- [web-research.md](web-research.md) · [personas-A.md](personas-A.md) · [motion.md](motion.md)
