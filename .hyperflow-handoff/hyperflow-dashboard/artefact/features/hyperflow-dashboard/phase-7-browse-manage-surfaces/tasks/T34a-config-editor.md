# T34a — Config editor: schema-driven form, drift tolerance, raw-JSON toggle

## Task

Build the config-editor half of the `/config` management surface at `dashboard/src/client/features/management/config/`: a form generated from the shared Zod mirror of `config/schema.json` (`shared/schemas/config.ts`), schema validation on every save, drift tolerance — unrecognized keys surfaced in their own panel and preserved verbatim through save round-trips — and a free-text raw-JSON editor available only behind an explicit advanced toggle, never as the default.

## Why

`~/.hyperflow/config.json` is a shared behavioral surface for the whole plugin — a malformed write degrades every future chain run (spec §3B decision 9). A schema-driven form makes invalid states unrepresentable in the default path, while drift tolerance respects files written by newer or older plugin versions (the `cleanup` block and provider entries are known wild keys) instead of destroying them on save. This is the second allowlisted write surface and follows the write-path pattern T33 establishes.

## Scope

**IN**
- `features/management/config/` component set (components/ hooks/ inside) — the config editor mounted into the management surface shell that T34b owns, exported as a single entry component at a stable path (`features/management/config/ConfigEditor` — T34b imports exactly this).
- Schema-driven form: field groups generated from `shared/schemas/config.ts` (booleans → toggles, enums → selects, numbers/strings → validated inputs, nested objects → sections); every field maps 1:1 to a schema key; client-side Zod validation before submit, server revalidates.
- Save mutation via TanStack Query: optimistic-free (config saves are explicit, low-frequency — show a saving state, confirm on the `write-echo` for the global-config path, roll back nothing but re-enable the form on error); 409 mtime conflict refreshes to the on-disk config and prompts reapply.
- Drift tolerance: keys present in the file but absent from the schema render in an "Unrecognized keys" panel (read-only pretty-printed values + explanatory copy), are never stripped, and are re-included verbatim in every save payload so a round-trip preserves them byte-for-byte at the key level.
- Advanced raw-JSON toggle: an explicit, clearly-labeled switch reveals a raw JSON editor with parse validation before submit; the toggle always starts off, never persists as a default, and leaving raw mode re-hydrates the form from the current value.
- Observe-mode: form renders read-only with the explanatory tooltip (affordance state comes from the connection slice).
- Dirty-state handling: unsaved-changes indicator; navigating away with dirty state warns inline (no browser-native dialog dependency for the primary path).

**OUT** (T34b's disjoint set — do not create or edit these)
- The management surface shell (`ManagementSurface`, section navigation, route registration for `/config`).
- Marker toggles (`.mode`/`.sticky`), handoff STATUS panel, restore-from-backup UI, and any file under `features/management/markers/`, `features/management/handoff/`, or `features/management/restore/`.
- Server config service/routes and the schema mirror itself (`shared/schemas/config.ts` shipped in T2; extend nothing there).
- Editing any file other than the global config through this surface.

## Files in scope

All new files live under `dashboard/src/client/features/management/config/` — T34a touches nothing outside this folder (the route/shell belongs to T34b, running in parallel):

- `components/ConfigEditor.tsx` — entry component: form + unrecognized-keys panel + raw toggle composition, saving/conflict states (this exact module path is the import contract T34b consumes).
- `components/ConfigForm.tsx` — schema-driven field-group rendering (walks the schema shape, delegates to field components).
- `components/ConfigField.tsx` — one field renderer: schema type → input control mapping, per-field validation message.
- `components/UnrecognizedKeysPanel.tsx` — read-only drift panel with pretty-printed values and copy explaining preservation.
- `components/RawJsonEditor.tsx` — advanced raw editor behind the toggle: textarea + parse/schema validation gate on submit.
- `hooks/useConfigQuery.ts` — config fetch (TanStack Query) split into `{known, unrecognized, mtime}` via the shared schema (pure logic).
- `hooks/useConfigMutation.ts` — save mutation: merge known-form values + preserved unrecognized keys, mtime precondition, 409/403 handling, echo-confirmed saved state.
- `hooks/useConfigFormState.ts` — form value state, dirty tracking, raw-mode ↔ form-mode value hand-off.

## Acceptance criteria

- [ ] The form is generated from `shared/schemas/config.ts` — no hand-maintained field list exists; every schema key renders an appropriate control with validation, and an invalid value blocks submit with a per-field message.
- [ ] Unrecognized keys survive a save round-trip: a fixture config containing keys absent from the schema (e.g. a `cleanup` block) shows them in the Unrecognized-keys panel, and after editing a known field and saving, the file on disk still contains the unrecognized keys with unchanged values.
- [ ] Raw-JSON editing is never the default: the raw editor is unreachable without activating the explicit advanced toggle, the toggle resets per visit, and invalid JSON or schema-violating raw content cannot be submitted.
- [ ] Saves are schema-validated client-side and rejected server-side errors surface by error `code`; a 409 mtime conflict refreshes to the on-disk config and prompts reapply — never last-write-wins.
- [ ] Saved state is confirmed by the write-echo path, with an interim saving state after POST acceptance.
- [ ] Observe mode renders the entire editor read-only with the explanatory tooltip.
- [ ] No file outside `features/management/config/` is created or modified by this task.
- [ ] Every interactive element (fields, toggles, save, raw editor, panel expanders) carries `data-testid`; design-system tokens only; RTL-safe logical properties (form labels/inputs use logical alignment); no file over 300 lines; no `any`; no inline business logic in JSX.

## Test cases

- Unit: `useConfigQuery` splits a fixture config into known vs unrecognized keys correctly, including nested unknown blocks; mtime is captured.
- Unit: `useConfigMutation` merges edited known values with preserved unrecognized keys into one payload; a 409 response triggers the refresh-and-reapply path; a `VALIDATION_FAILED` response maps issues to fields.
- Component: `ConfigForm` renders a control per schema key for the fixture schema and blocks submit on an invalid enum/number; `RawJsonEditor` rejects malformed JSON and schema-violating content.
- Component: `UnrecognizedKeysPanel` renders the drift fixture read-only — no input controls inside the panel.
- E2E (Playwright, fixture project with a drifted global config): navigate `/config` → edit a known field via the form → save → assert saved confirmation → re-fetch/reload → assert the edited value AND the untouched unrecognized keys are still present on disk (full round-trip); then activate the advanced toggle → make a valid raw edit → save → assert round-trip; attempt an invalid raw edit → assert submit blocked.
- E2E: externally modify the config file (scripted write) → save from a stale form → assert the 409 conflict UI: on-disk refresh + reapply prompt.

## Related context

- Spec §3B decision 9 (schema-driven form, `additionalProperties: false` at the root, drift tolerated on read, raw JSON behind explicit toggle) — this brief implements it verbatim.
- Spec §2b write path + §4.4 (mtime conflict, observe mode); §3B decision 15 (error envelope: branch on `code`).
- Spec §5 tree — `features/management/` (config editor), `shared/schemas/config.ts` (the Zod mirror consumed), `routes/config.ts` + `services/config.ts` (server counterparts), `security/denylist.ts` (config is allowlisted; everything else is not).
- `.hyperflow/design/system.md` — Component inventory (Roster row, Empty state, Status badge for validation states), Voice/tone (terse labels, verbs for actions), Accessibility floor (focus ring on every control, labels never color-only).
- Consumes: T2 shared config schema, T21 api client + Query mutation plumbing, T20 connection slice (observe mode), T22 static primitives.

## Gotchas

- Disjoint-set discipline: T34b builds the shell that imports `ConfigEditor` in the same batch — creating the shell, the route entry, or anything under `markers/`/`handoff/`/`restore/` from this task collides with a parallel worker. The import contract is the module path `features/management/config/ConfigEditor`; keep it exact.
- Preservation means the payload, not the parse: stripping unknown keys client-side and relying on the server to "merge them back" is not the contract — the save payload itself carries them verbatim.
- The schema walk must derive from the Zod schema object (shape introspection), not from a duplicated field manifest — a manifest is the drift this decision exists to prevent.
- Raw-mode hand-off is lossy territory: leaving raw mode must re-parse and re-split known/unrecognized, or the form silently edits stale values.
- Config lives outside the project jail (`~/.hyperflow/config.json` is the one explicit extra path) — never hardcode paths client-side; the server owns location, the client only speaks `/api/v1/config`.
- 300-line cap: `ConfigForm`'s recursive field rendering is the bloat risk — `ConfigField` exists to keep it flat. No inline business logic in JSX — merge/validation/dirty logic lives in the hooks.
