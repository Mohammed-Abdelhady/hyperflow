# T33 — Memory surface: entry browser + CRUD + knowledge-graph view

## Task

Build the `/memory` feature surface at `dashboard/src/client/features/memory/`: a browser-split entry browser over `.hyperflow/memory/<category>.md`, full entry CRUD through TanStack Query mutations (optimistic update, `write-echo` reconciliation, inline destructive confirm in the inspector), and a knowledge-graph view reusing T25's `GraphCanvas` lazy chunk — with a grid fallback layout when entries have no cross-references.

## Why

Memory is the first of the five allowlisted write surfaces to get a full CRUD UI, so this task establishes the write-path pattern (optimistic patch → POST → watcher echo → reconcile → conflict rollback) that T34a/T34b follow. The knowledge graph is one of the product's insight features: memory entries referencing shared files or each other become a navigable schematic (spec §3A mind-map row) — but only by reusing the existing graph stack; a second graph engine is an explicit non-goal.

## Scope

**IN**
- `features/memory/` folder (components/ hooks/ utils/) implementing the `/memory` route surface: browser-split (280px category/entry rail + entry pane) plus a graph↔list view toggle.
- Entry browser: categories and entries from the memory slice (tagged AND legacy-untagged entries — legacy renders read-only raw where unmappable), virtualized entry list (memory is a named virtualized surface in §3B decision 10), `?slug=` deep links.
- CRUD: create entry (category + content), edit entry, delete entry — each a TanStack Query mutation to the memory routes with optimistic slice patch, in-flight dedup, rollback on error; destructive actions (delete, prune) confirm inline in the inspector with a `state-blocked` label — no modal.
- Write-echo reconciliation: the optimistic entry is confirmed only by the `writeId`-correlated `write-echo` SSE delta; POST success alone renders a pending-confirmation state; 409 `WRITE_CONFLICT` refreshes to the on-disk version and asks the user to reapply (spec §4.4 — never last-write-wins).
- Hard read-only surfaces: `memory/index.md` and `memory/.checksums` render as derived/read-only — no edit affordance exists for them anywhere in the UI (server denylist is the backstop, not the only wall).
- Knowledge-graph view: lazy-loads T25's `GraphCanvas` + `NodeCard` treatment (typed `surface-2` node cards, `type-micro` type tags, 1px `hairline-strong` edges, edge-weight steps for relationship strength — never color rainbow); grid fallback when no cross-references exist, with the §4.7 copy explaining when links appear; the list view toggle is the keyboard/screen-reader path.
- Observe-mode awareness: all write affordances render disabled with the explanatory tooltip when the connection slice reports observe mode.

**OUT**
- Server memory service/routes (phase-4 territory — this task consumes `/api/v1` memory endpoints).
- Any change to `graph/` chunk files (`GraphCanvas.tsx`, `elk-layout.ts`, `node-registry.ts`) beyond registering a memory node type through the registry's existing extension point — no second graph stack, no fork.
- Config/markers/handoff surfaces (T34a/T34b); the cache/prune skill semantics beyond what the memory endpoints expose.
- `index.md`/`.checksums` regeneration (server-side concern; the dashboard never writes derived files).

## Files in scope

- `dashboard/src/client/features/memory/components/MemorySurface.tsx` — route composition: browser-split + graph/list toggle + inspector.
- `dashboard/src/client/features/memory/components/MemoryRail.tsx` — category sections + virtualized entry list.
- `dashboard/src/client/features/memory/components/EntryView.tsx` — entry pane: rendered entry, derived/read-only badge branch, legacy-raw branch.
- `dashboard/src/client/features/memory/components/EntryEditor.tsx` — create/edit form (content + category), pending-confirmation state.
- `dashboard/src/client/features/memory/components/InlineConfirm.tsx` — inline destructive confirmation block (`state-blocked` label, confirm/cancel) rendered in the inspector.
- `dashboard/src/client/features/memory/components/KnowledgeGraph.tsx` — lazy mount of T25 `GraphCanvas` with memory nodes/edges; grid-fallback branch for unlinked entries.
- `dashboard/src/client/features/memory/hooks/useMemorySlice.ts` — memoized selectors: categories, entries, cross-reference edges, derived-file flags.
- `dashboard/src/client/features/memory/hooks/useMemoryMutations.ts` — create/edit/delete mutations: optimistic patch, writeId tracking, echo reconciliation, conflict/denial rollback handling (pure logic, no JSX).
- `dashboard/src/client/features/memory/utils/graph-model.ts` — pure mapping: entries + cross-references → typed nodes/edges for the graph registry; unlinked detection for the grid fallback.
- Route registration touch: `/memory` route entry in `dashboard/src/client/app/router.tsx` points at the lazy `MemorySurface`; memory node type registered via `graph/node-registry.ts`'s existing mapping (single-line registration, not a structural change).

## Acceptance criteria

- [ ] `/memory` renders the fixture tree: categories, virtualized entries, entry detail, `?slug=` deep links; legacy-untagged fixture entries render (mapped or raw), never dropped.
- [ ] Derived files (`memory/index.md`, `.checksums`) are never editable: no edit/delete affordance renders for them, and they display a derived/read-only badge — verified against the fixture tree.
- [ ] Destructive actions require the inline confirm (`state-blocked` label) before the mutation fires; no modal is used; cancel restores the inspector without a mutation.
- [ ] Optimistic updates reconcile with the write-echo: created/edited entries show pending state until the `writeId`-matched `write-echo` delta confirms them; a 409 conflict rolls back the optimistic patch, refreshes to the on-disk version, and prompts reapply; a 403 denial rolls back with the typed error surfaced inline.
- [ ] Knowledge graph renders through T25's `GraphCanvas` lazy chunk (no graph library import outside `graph/`); node cards carry the memory type tag; edges use weight steps, not color; the fixture with zero cross-references renders the grid fallback with the §4.7 copy.
- [ ] The list view toggle exists and is the functional keyboard/screen-reader path to every entry the graph shows.
- [ ] In observe mode all write affordances are disabled with the explanatory tooltip; read/browse stays fully functional.
- [ ] Every interactive element carries `data-testid`; design-system tokens only; RTL-safe logical properties; no file over 300 lines; no `any`; no inline business logic in JSX.

## Test cases

- Unit: `useMemoryMutations` — optimistic create appears immediately, is confirmed on a matching `write-echo` fixture delta, rolls back on 409 with the on-disk version applied, and dedups a double-submit.
- Unit: `graph-model.ts` — fixture entries with cross-references produce the expected typed edges; zero-reference fixture flags the grid fallback; derived files never become nodes with write affordances.
- Component: `EntryView` renders the derived-file fixture with the read-only badge and no edit control; legacy-untagged fixture renders the raw branch.
- Component: `InlineConfirm` blocks the delete mutation until confirmed; cancel fires nothing.
- E2E (Playwright, fixture project): **create** a memory entry → assert pending state → assert confirmation after the watcher echo (real server, real write) → **edit** it → assert reconciled content → **delete** it via the inline confirm → assert removal; then externally modify an entry file (scripted write) mid-edit → save → assert the 409 conflict path: rollback, on-disk refresh, reapply prompt.
- E2E: toggle to graph view → assert lazy graph chunk loads and fixture cross-referenced entries render as linked nodes → toggle to list view → reach the same entry by keyboard only.

## Related context

- Spec §2b write path (optimistic → POST → write door → watcher echo → `writeId` reconcile; POST acknowledges, echo confirms) — the contract this surface's mutations implement.
- Spec §3A "Memory/config/markers" row (browser-split, inline destructive confirm) and "Mind-maps" row (schematic node cards, graph↔table toggle as the a11y path).
- Spec §3B decisions 8 (write allowlist, derived files read-only), 10 (virtualized memory list, lazy graph chunk), 11 (React Flow + elkjs stack); §4.2 legacy memory headings; §4.4 conflict + observe mode; §4.7 unlinked-graph zero state.
- Spec §5 tree — `features/memory/`, `graph/` chunk files, `services/memory.ts` server counterpart, `shared/schemas/api.ts` error envelope (`WRITE_CONFLICT`, `PATH_BLOCKED` codes the UI branches on).
- `.hyperflow/design/system.md` — Component inventory (Node card, Inspector panel, Roster row), Layout grammar (browser split; cockpit trio applies to the graph view), Motion (graph enter/exit rules, never two animators on one element), Accessibility floor (table/list toggle, focus ring).
- Consumes: T25 `GraphCanvas`/`node-registry`, T21 api client + mutation plumbing, T20 memory slice + connection slice (observe mode), T22/T24 primitives.

## Gotchas

- The knowledge graph reuses T25's `GraphCanvas` — importing `@xyflow/react` or elkjs anywhere under `features/memory/` is a review-blocking violation; the only legal contact is typed nodes/edges into the chunk's public props and one registry entry.
- Confirmed state comes from the echo, not the POST: wiring the mutation's `onSuccess` to mark entries confirmed breaks the §2b contract and desyncs follower tabs. `onSuccess` may only mark "accepted, awaiting echo".
- The client must branch on error `code` (`WRITE_CONFLICT`, `PATH_BLOCKED`, …), never on `message` text (§3B decision 15).
- Derived-file protection is defense-in-depth: the UI hides affordances AND the server denies — but tests must cover the UI layer independently, because a UI regression would otherwise surface as a confusing 403.
- Graph and list views render from the same selector output — computing cross-references twice (once per view) will drift; `graph-model.ts` is the single mapping.
- Grid fallback is a layout of the same node cards, not a different component tree — unlinked entries gaining their first reference should transition into the graph without remounting the surface.
- 300-line cap: `MemorySurface` composition and `useMemoryMutations` are the bloat risks — split reconcile logic from mutation definitions if needed. No inline business logic in JSX.
