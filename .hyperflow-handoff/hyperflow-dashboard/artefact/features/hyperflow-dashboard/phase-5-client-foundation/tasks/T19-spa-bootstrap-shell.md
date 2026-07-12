# T19 — SPA bootstrap + shell

## Status

| Field      | Value                                    |
|------------|------------------------------------------|
| Task       | T19                                      |
| Role       | Implementer                              |
| Complexity | m                                        |
| Batch      | B1                                       |
| Depends on | T2 (shared schemas), T4 (design tokens)  |
| Reviewers  | frontend-reviewer, security-reviewer     |

## Task

Build the SPA entry point, history-mode router, and app chrome: the token-fragment auth handshake in `main.tsx`, the 11-route map in `app/router.tsx`, the app frame (sidebar + banners) in `app/shell.tsx`, and the client-only `constants/` and `types/` foundations everything downstream imports.

## Why

Spec §3B decision 14 makes the fragment handshake the one channel where the CLI-minted token cannot leak in transit — it must be consumed and stripped before anything else runs, or the token lands in browser history and referrers. The router and shell are the frame every one of the 11 feature surfaces (spec §1 SPA modules) mounts into; the connection/resync/fidelity/observe banners are the user's only window into stream health (spec §2 SSE reconnect, §4.3, §4.4).

## Scope

**IN:**
- `main.tsx` bootstrap: fragment-token handshake, provider tree (QueryClientProvider, MotionConfig with `reducedMotion="user"`), router mount.
- History-mode router covering exactly the 11 routes from spec §3B decision 14: `/mission /replay /health /leaderboard /plans /features /audits /memory /specs /tokens /config`, plus a redirect from `/` to `/mission` and a not-found fallback. Artefact deep links via `?slug=` query params resolve on cold load.
- App chrome in `shell.tsx`: 220px sectioned sidebar (OBSERVE / ARTEFACTS / GRAPHS / MANAGE, text-only), content outlet at page gutter `sp-5`, and four banner slots driven by store state: connection lost/reconnecting, `resync-required` in progress, reduced-fidelity (markdown-only mode, spec §4.3), and observe mode (read-only filesystem, spec §4.4).
- `constants/`: route map, TanStack Query keys, and the feature registry (surface id → route → label → sidebar section), all `UPPER_SNAKE_CASE`.
- `types/`: client-only view types (selection, banner variants, sidebar section) — wire/parse types are imported from `shared/`, never redefined here.

**OUT:**
- Any feature surface content (phases 6+) — routes render placeholder outlets.
- The store itself (T20), the api/SSE/leader clients (T21) — shell consumes their interfaces; where T21 has not landed the banners read the connection slice shape T20 defines.
- Server-side index fallback (server phase task).
- Design-system primitives (T22–T24).

## Files in scope

- `dashboard/src/client/main.tsx` — create. Runs the handshake before React mounts: read `#token=<value>` from `location.hash`, persist to `sessionStorage`, immediately strip the fragment with `history.replaceState` so the token never survives in the URL, history entries, or copy-paste; when no fragment exists, fall back to an existing `sessionStorage` token or render the unauthenticated explainer state (spec §3B decision 8: bare `localhost:PORT` visits are unauthenticated by design — explain the relaunch path, never bypass). Then mounts providers and router.
- `dashboard/src/client/app/router.tsx` — create. History-mode route table for the 11 surfaces with lazy route-level boundaries reserved for the heavy chunks (graph, mermaid, replay per spec §3B decision 10); exposes typed route-building helpers so no feature hardcodes a path string.
- `dashboard/src/client/app/shell.tsx` — create. App frame per system.md §Layout grammar "App frame": sidebar sections labeled in `type-micro` `text-dim`, items in `type-ui`, active item `accent-dim` fill; banner region stacking the four banner variants with terse instrument copy (system.md §Voice — fact then action, no apology); banners are driven by the T20 connection/ui slices, not local component state.
- `dashboard/src/client/constants/` — create route map, query keys, feature registry as separate modules; enums/mapping objects over repeated literals.
- `dashboard/src/client/types/` — create client-only view types module(s), organized by domain.

## Acceptance criteria

- [ ] Fragment token is stored in `sessionStorage` and the fragment is stripped from the URL via `history.replaceState` before first paint; the token string never appears in the address bar, browser history, or any log after storage.
- [ ] Visiting any of the 11 routes directly (deep link, including `?slug=` params) resolves to the correct outlet on cold load; `/` redirects to `/mission`; unknown paths render the not-found state, not a blank page.
- [ ] Unauthenticated visits (no fragment, no stored token) render an explainer with the relaunch instruction — no API call is attempted without a token.
- [ ] All chrome layout uses RTL-safe logical properties (`inline-start`/`inline-end`, `margin-inline`, `padding-inline`) — zero physical `left`/`right`/`ml-`/`mr-` styling; shell mirrors correctly under `dir="rtl"`.
- [ ] Sidebar and banners bind only to named tokens: `surface-0` canvas, `surface-1` rail, `hairline` separators, `type-micro`/`type-ui` faces, `accent-dim` active fill, `sp-5` page gutter — no hardcoded colors, sizes, or durations; no glow, no gradient, no icons in the sidebar (text-only per system.md).
- [ ] Banner state colors pair label + color (never color alone): reduced-fidelity and observe-mode banners use `state-fix`/`state-queued` treatments with explicit text.
- [ ] Every interactive element (sidebar items, banner actions, retry affordances) carries a `data-testid`.
- [ ] Banner enter/exit uses `motion-enter`/`ease-out` and degrades to instant swap under reduced motion.
- [ ] No source file exceeds 300 lines.

## Test cases

- Unit: handshake given `#token=abc123` → `sessionStorage` contains the token, `location.hash` is empty, `history.replaceState` was invoked once; given no fragment but a stored token → boot proceeds; given neither → unauthenticated state, zero fetches issued.
- Unit: route helper round-trip — every entry in the route-map constant builds a path the router resolves; `?slug=` param survives navigation.
- Unit: shell renders all four banner variants from injected connection/ui slice states; each banner shows label text (not color-only).
- Integration (jsdom, router + shell + mock store): navigating between two routes updates the active sidebar item (`accent-dim` fill via token class) without remounting the shell; deep-loading `/audits?slug=2026-07-12-scope` mounts the audits outlet with the slug available.
- E2E (Playwright, real server, fixture project): launch with tokenized URL → app lands on `/mission`, URL contains no fragment, `document.title` set, sidebar shows all 11 surfaces by `data-testid`; reload on `/memory` deep link resolves via server index fallback; RTL check — set `dir="rtl"` and assert sidebar renders at inline-start with mirrored active inset.

## Related context

- Spec §3B decision 14 (URL scheme + auth handshake — the normative source for fragment/sessionStorage/replaceState/header transport and the follower-tab BroadcastChannel token path T21 implements).
- Spec §3B decision 8 layer (a) — token lifecycle; §4.1 launch edge cases; §4.3 reduced-fidelity banner copy; §4.4 observe mode.
- system.md tokens: `surface-0/1`, `hairline`, `text-dim`, `type-micro`, `type-ui`, `accent-dim`, `sp-5`, `motion-enter`, `ease-out`. Layout grammar "App frame" (Vapi sectioned sidebar taxonomy — Mobbin reference in system.md §References). Voice: terse, fact-then-action, no exclamation.
- Anti-slop floor: no icon noise, no glow, no templated admin frame.

## Gotchas

- 300-line cap: shell chrome (sidebar + banner stack) will not fit one file — split banner components out proactively.
- No inline business logic in JSX — banner-visibility derivation lives in a helper/hook, not in the shell's render body.
- UI-state changes (sidebar active item, banner show/hide) must not re-render data lists in feature outlets — chrome subscribes to its own slices only.
- The stream route is the ONLY place a token may ride a query param (EventSource cannot set headers — T21's concern); nothing in T19 may ever place the token in a URL it constructs.
- Do not redefine wire types locally — anything crossing HTTP/SSE comes from `shared/` (spec §5 Boundaries).
