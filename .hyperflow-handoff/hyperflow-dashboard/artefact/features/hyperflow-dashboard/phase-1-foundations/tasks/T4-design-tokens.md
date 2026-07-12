# T4 — Generate design tokens (tokens.css)

## Task

Author `dashboard/src/client/styles/tokens.css` — the single CSS custom-property source for every design token in `.hyperflow/design/system.md`: surfaces, text, accent, semantic state colors with their `-dim` fills, the type scale, spacing, radius, and motion durations/easings. Spec §3A binds the design system: every downstream value names a token; no inline values are legal after this file lands.

## Why

The dark-first mission-control language (§3A pole execution) is only enforceable if the tokens exist as the one stylesheet authority before any client component ships in later phases.

## Scope

**IN:** one `tokens.css` defining custom properties on `:root`, grouped and commented per system.md section; state `-dim` alpha variants; motion durations structured as standalone properties the future reduced-motion hook can zero at runtime (system.md §Reduced motion).

**OUT:** component CSS; `@font-face` self-hosting of IBM Plex (client-shell task — no CDN links ever, the app is npx-local); JS spring configs (`spring-settle` / `spring-instrument` are Motion-for-React parameters, not CSS); any light theme (dark-first v1, system.md defines none).

## Files in scope

**Read:**
- `.hyperflow/design/system.md` — whole file; token authority: surfaces (lines 26-36), text (38-44), accent (46-53), state colors + `-dim` rule (55-65), type scale (68-81), spacing/radius/density (83-89), motion tokens (118-129), reduced motion (151-153), anti-patterns (210-218)
- `.hyperflow/specs/hyperflow-dashboard.md` §3A (lines 247-278) — binding rule + pole execution

**Create:**
- `dashboard/src/client/styles/tokens.css` — every token from system.md, values verbatim:
  - Surfaces: `surface-0` #0A0C10 · `surface-1` #0F1217 · `surface-2` #14181E · `surface-3` #1A1F26 · `hairline` #232932 · `hairline-strong` #2F3742 · `shadow-pop` 0 8px 24px rgb(0 0 0 / 0.5)
  - Text: `text-hi` #E9EDF2 · `text-mid` #94A3B8 · `text-dim` #7A8694 · `text-faint` #4C5560
  - Accent: `accent` #14B8A6 · `accent-dim` rgb(20 184 166 / 0.14)
  - State: `state-pass` #3FB950 · `state-fix` #F59E0B · `state-blocked` #EF4444 · `state-live` aliasing accent · `state-queued` aliasing text-dim · plus a 14%-alpha `-dim` fill variant per state
  - Type: `type-micro` through `type-hero` — face, size/line, weight, and tracking exactly per the system.md table (micro: Mono 11/16 500 +0.08em uppercase … hero: Mono 44/48 300 −0.02em), expressed as per-token property sets usable by components
  - Spacing/radius: `sp-1`…`sp-7` = 4/8/12/16/24/32/48px · `r-1` 4px · `r-2` 6px · `r-3` 10px · `r-full`
  - Motion: `motion-flip` 120ms · `motion-enter` 200ms · `motion-panel` 280ms · `motion-sweep` 450ms · `ease-out` cubic-bezier(0.25, 1, 0.5, 1) · `ease-exit-in` cubic-bezier(0.55, 0, 1, 0.45)

## Acceptance criteria

- [ ] Every token in system.md's Color / Type / Spacing-radius / Motion tables exists as a custom property with the exact value; zero invented tokens
- [ ] `state-live` and `state-queued` alias `var(--accent)` / `var(--text-dim)` — no duplicated hex for aliased tokens
- [ ] Motion durations are standalone custom properties (zeroable by the reduced-motion hook without touching easings)
- [ ] No gradient, no glow/neon values, no violet (#7C3AED) anywhere in the file — anti-slop floor holds
- [ ] File ≤300 lines; Vite build succeeds with tokens.css imported from the placeholder client entry

## Test cases

- Vitest (node, `dashboard/tests/unit/client/tokens.test.ts`): read `tokens.css` as text and assert exact values for a representative token per group — `--surface-0: #0A0C10`, `--accent: #14B8A6`, `--state-fix: #F59E0B`, `--sp-5: 24px`, `--r-2: 6px`, `--motion-panel: 280ms`, the `ease-out` cubic-bezier — and assert absence of `#7C3AED` and the substring `gradient`
- Vitest: assert `--state-live` resolves via `var(--accent)` (alias, not hex)
- Vite build: `npm run build` with tokens.css imported by the placeholder client entry → exits 0, sheet present in `dist/client` output
- E2E: N/A — no client shell exists in phase 1 to render tokens in a browser; real-browser verification (computed styles in Chrome) is bound to the first client-shell task of the next phase.

## Related context

- Token authority — `.hyperflow/design/system.md:26-89` (color/type/spacing), `118-129` (motion), `151-153` (runtime duration zeroing), `210-218` (anti-patterns)
- Binding rule "no inline values are legal downstream" — `.hyperflow/specs/hyperflow-dashboard.md:249-253`
- Motion language condensed — `.hyperflow/specs/hyperflow-dashboard.md:276-278`
- Consumer location — `.hyperflow/specs/hyperflow-dashboard.md:573-574` (§5 `src/client/styles/tokens.css`)

## Gotchas

- `spring-settle` / `spring-instrument` are stiffness/damping/mass parameters for Motion for React — not CSS-expressible. Leave them out and say so in a file comment naming their future home (a client motion-constants module), so the omission isn't "fixed" later.
- The `-dim` fills are 14% alpha of the full-strength color — use the modern `rgb(R G B / 0.14)` syntax mirroring system.md's own notation.
- Aliased state tokens must stay `var()` references; duplicating hex silently breaks the one-accent rule the first time a value evolves.
- No box-drawing characters in comments; comments cite system.md as the living authority — tokens.css follows it, never the reverse.
- Type tokens reference the IBM Plex family names but do not add font loading here — no CDN, no `@font-face`; the app makes zero external calls.
