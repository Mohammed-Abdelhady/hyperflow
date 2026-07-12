# T34b — Management panels: markers, handoff STATUS, observe mode, restore

## Task

Build the management-surface shell and its non-config panels at `dashboard/src/client/features/management/`: the `/config` route surface composition (section navigation mounting T34a's `ConfigEditor` by import contract), `.mode`/`.sticky` marker toggles, the handoff STATUS panel (forward-only planned → built → reviewed transitions with 409 surfaced inline), global observe-mode handling (every write affordance disabled with an explanatory tooltip), and the restore-from-backup affordance that reinstates a pre-write backup through the same conflict-checked write path.

## Why

Markers, handoff STATUS, and restore complete the five allowlisted write surfaces (spec §3B decision 8) — the management panel is where an operator flips chain behavior between runs. The handoff panel is the dashboard's operator interface over the two-session lifecycle, and its 409-on-illegal-transition contract (spec §2b, §4.4) must be visible, not swallowed. Observe mode (read-only filesystem, spec §4.4) needs one consistent treatment across every write control, and this task owns that pattern for the surface.

## Scope

**IN**
- `features/management/` shell set: `ManagementSurface` route composition on the browser-split grammar (rail of management sections: Config · Markers · Handoff · Restore; pane hosts the active panel), route registration for `/config`, inspector wiring.
- Mount of T34a's config editor via the agreed import path `features/management/config/ConfigEditor` — import only; never create or modify files under `features/management/config/`.
- `features/management/markers/` — `.mode`/`.sticky` marker panel: current marker values from the snapshot slice, toggle mutations (optimistic, `write-echo` reconciled per the §2b pattern), per-marker explanation copy of what each value changes.
- `features/management/handoff/` — handoff STATUS panel: lists `.hyperflow-handoff/<slug>/` packages with their HANDOFF.md summary + current STATUS; a transition control offering only the legal forward step (planned → built → reviewed); an illegal transition returned by the server (409, no write, no backup) surfaces the typed error inline on the panel — never a toast-and-forget, never retried silently.
- `features/management/restore/` — restore-from-backup affordance: lists session backups the server exposes for the write surfaces, restore action with inline destructive-style confirm (restoring overwrites current state), executed through the same conflict-checked write path (a changed target since backup → 409 surfaced inline).
- Observe-mode treatment: one shared disabled-write pattern (disabled control + explanatory tooltip sourced from the connection slice) applied to markers, handoff, restore — and passed to the config editor via its documented prop/context rather than reimplemented.
- Zero states: no handoff packages; no backups this session; markers absent (defaults shown, creation on first toggle).

**OUT** (T34a's disjoint set — do not create or edit these)
- Anything under `features/management/config/` — the schema-driven form, drift panel, raw-JSON editor, and config hooks are T34a's files; this task only imports the entry component.
- Server markers/handoff services, the STATUS state machine itself (server-owned; the client renders its verdicts), backup creation (automatic on every write, server-side).
- Memory CRUD (T33), any task-file or derived-file write affordance (never writable), Chain Replay/history surfaces.

## Files in scope

All new files live under `dashboard/src/client/features/management/` excluding `config/`:

- `components/ManagementSurface.tsx` — route composition: section rail + active panel pane; mounts `ConfigEditor` from the T34a import contract.
- `components/SectionRail.tsx` — management section list (Config · Markers · Handoff · Restore) with selection + `?slug=`-style section deep link.
- `markers/MarkerPanel.tsx` — `.mode`/`.sticky` toggles with current values, pending/echo-confirmed states, explanation copy.
- `markers/useMarkerMutations.ts` — toggle mutations: optimistic patch, writeId echo reconciliation, rollback on error (pure logic).
- `handoff/HandoffPanel.tsx` — package list + per-package STATUS display and the single legal-transition control.
- `handoff/HandoffTransition.tsx` — transition control + inline typed-error display (409 illegal transition, 409 conflict, 403 denial rendered distinctly by `code`).
- `handoff/useHandoffMutations.ts` — transition mutation: forward-only client guard (offer only the next state), server verdict handling, no optimistic status flip (STATUS is server-authoritative; show in-flight, apply on echo).
- `restore/RestorePanel.tsx` — backup list (target, timestamp) + restore action with inline confirm.
- `restore/useRestoreMutation.ts` — restore mutation through the conflict-checked write path, 409 surfaced inline.
- `hooks/useObserveMode.ts` — shared observe-mode/disabled-write selector + tooltip copy (consumed by every panel here and exposed to the config editor).
- Route registration touch: `/config` route entry in `dashboard/src/client/app/router.tsx` points at the lazy `ManagementSurface` (this task owns the route line; T34a does not touch the router).

## Acceptance criteria

- [ ] `/config` renders the management surface with all four sections; the config section mounts T34a's editor via the import contract (verified: no file under `config/` was created or modified by this task).
- [ ] Marker toggles round-trip: toggling `.mode`/`.sticky` shows optimistic state, reconciles on the `writeId`-matched `write-echo`, and rolls back with an inline typed error on denial; marker files absent renders defaults with creation on first toggle.
- [ ] The handoff panel offers only the legal forward transition per package (planned → built → reviewed — nothing backward, nothing skipping); a server 409 for an illegal transition surfaces inline on the panel with the typed error, no write and no retry; STATUS display updates only from server state (echo/snapshot), never from an optimistic flip.
- [ ] Restore reinstates a backup through the conflict-checked write path behind an inline confirm; a 409 (target changed since backup) surfaces inline with refresh-and-reapply semantics.
- [ ] In observe mode every write affordance on the surface (markers, handoff transition, restore, and the config editor via the shared mechanism) is disabled with the explanatory tooltip; browsing stays fully functional; the tooltip content is reachable by keyboard focus, not hover-only.
- [ ] Destructive/overwriting actions (restore) use the inline confirm pattern with `state-blocked` label — no modal.
- [ ] Zero states render per scope (no packages / no backups / no markers) with fact + action copy.
- [ ] Every interactive element carries `data-testid`; design-system tokens only; RTL-safe logical properties; no file over 300 lines; no `any`; no inline business logic in JSX.

## Test cases

- Unit: `useHandoffMutations` — for each STATUS fixture (planned/built/reviewed) exposes exactly the one legal next transition (and none for reviewed); a 409 response maps to the inline-error state without altering displayed STATUS.
- Unit: `useMarkerMutations` — optimistic toggle, echo confirmation, rollback on 403 with typed error.
- Unit: `useObserveMode` — connection-slice observe flag disables writes and yields the tooltip copy; flag clearing re-enables without remount.
- Component: `HandoffTransition` renders distinct inline messages for `WRITE_CONFLICT` vs illegal-transition 409 vs `PATH_BLOCKED` 403 (branching on `code`).
- Component: `RestorePanel` blocks the mutation until the inline confirm is accepted.
- E2E (Playwright, fixture project): navigate `/config` → Markers → toggle `.sticky` → assert echo-confirmed state and the marker file on disk → Handoff → advance a fixture package planned → built → assert STATUS update; then **drive an illegal transition** (request built → planned via a package fixture the UI can be coaxed into staleness on, or a scripted stale request through the same mutation path) → assert the 409 is surfaced inline on the panel and STATUS is unchanged on disk.
- E2E: restore flow — edit a marker, then restore its pre-write backup via the panel's inline confirm → assert on-disk content reverted and the panel reconciled via echo.
- E2E (observe mode): boot the e2e server against a read-only fixture (or its observe-mode flag) → assert all write controls disabled with keyboard-reachable tooltip while browsing works.

## Related context

- Spec §3B decision 8 (write allowlist: markers + handoff STATUS among the five; pre-write backup on every write) and §2b (echo-as-truth, 409 no-write no-backup on illegal transitions).
- Spec §4.4 — handoff state machine forward-only, undo-via-session-backup restore through the conflict-checked path, observe mode on read-only filesystems; §4.6 (generic 401/403 bodies — the UI must not expect server internals).
- Spec §3B decision 15 — error envelope `{code, message, details?}`; the panels branch on `code` (`WRITE_CONFLICT`, `PATH_BLOCKED`, `VALIDATION_FAILED`).
- Spec §5 tree — `features/management/`, `routes/markers.ts`, `routes/handoff.ts`, `services/handoff.ts` (state machine), `parser/handoff.ts` (HANDOFF.md/STATUS/COMPLETION.md shapes), `shared/schemas/api.ts`.
- `.hyperflow/design/system.md` — Component inventory (Roster row, Inspector panel, Status badge), §3A "Memory/config/markers" row (browser-split + inline destructive confirm), Voice/tone (verbs for actions: "Prune markers"), Accessibility floor (focus-reachable tooltips, label + color).
- Consumes: T34a's `ConfigEditor` (import contract only), T21 api client + mutations, T20 snapshot/connection slices, T22 static primitives.

## Gotchas

- Disjoint-set discipline: T34a runs in parallel and owns everything under `features/management/config/`. This task's only contact is the import line in `ManagementSurface` — if the editor isn't merged yet when integrating, the import contract path is fixed, so the shell compiles once both land; never stub a placeholder file at that path.
- Handoff STATUS is server-authoritative: an optimistic status flip that the state machine then rejects shows the user a state that never existed — render in-flight, apply on echo/snapshot only. This differs deliberately from the marker/memory optimistic pattern.
- Offer only the legal next transition in the UI AND still handle the 409 — the server can reject what the UI thought was legal (concurrent transition from another session); the inline error is the contract, not an assertion that it can't happen.
- Restore is a write, not a special path: it goes through the same mutation plumbing, gets the same backup-before-write on the server, and can itself 409.
- Observe-mode logic lives once in `useObserveMode` — per-panel copies will drift; the config editor consumes the same mechanism through its documented prop/context.
- Marker toggles are tiny writes that races love: dedup in-flight toggles (TanStack mutation dedup) so a double-click can't queue contradictory writes.
- 300-line cap: `HandoffPanel` (list + transition + errors) is the bloat risk — `HandoffTransition` exists to keep it flat. No inline business logic in JSX — legality, error mapping, and observe gating live in the hooks.
