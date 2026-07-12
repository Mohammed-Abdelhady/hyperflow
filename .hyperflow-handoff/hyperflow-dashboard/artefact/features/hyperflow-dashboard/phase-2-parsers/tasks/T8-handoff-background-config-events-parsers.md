# T8 — Handoff + background + config + events parsers + golden fixtures

## Status

| Field       | Value              |
|-------------|--------------------|
| Status      | pending            |
| Complexity  | m                  |
| Depends on  | T5 · T2 (phase-1-foundations — shared Zod schemas incl. event-line + config mirror) |
| Specialist  | backend-reviewer   |

## Task

Implement the four operational surface parsers — `handoff.ts` for `.hyperflow-handoff/<slug>/` packages (HANDOFF.md manifest + STATUS word + COMPLETION.md), `background.ts` for `.hyperflow/background/registry.json`, `config.ts` for `~/.hyperflow/config.json` shape checks, and `events.ts` for `events.ndjson` line parsing with the `v` version gate — plus unit tests and golden fixtures including torn-last-line and unknown-`v` cases.

## Why

These surfaces feed the management panel (handoff state machine, background agent list, config editor) and the entire events pipeline — Mission Control's live feed, Chain Replay, and token analytics all start at `events.ts`. Two of them are cross-repo public contracts (the events line schema is ADR-versioned; STATUS is the grep-cheap handoff token), so parsing them tolerantly and exactly-as-documented is what keeps old and new plugin versions interoperable.

## Scope

**IN:**
- `dashboard/src/server/parser/handoff.ts` — parse one handoff package: HANDOFF.md manifest table + TL;DR, the one-word STATUS file, COMPLETION.md table when present, and the artefact/ + context/ member inventory.
- `dashboard/src/server/parser/background.ts` — parse `registry.json` into typed agent entries with status grouping; per-agent output buffers (`bg-*.md`) are inventoried as raw references, not parsed.
- `dashboard/src/server/parser/config.ts` — parse and shape-check `~/.hyperflow/config.json` against the shared Zod mirror with drift tolerance: known keys validated, unknown keys preserved verbatim and reported as unrecognized (spec §3B decision 9).
- `dashboard/src/server/parser/events.ts` — parse ONE NDJSON line at a time: JSON parse → shared event-line schema validate → `v` gate; unknown `v` or off-schema lines become opaque raw events, never errors.
- Unit tests under `dashboard/tests/unit/parser/` and fixtures under `dashboard/tests/fixtures/golden/{handoff,background,config,events}/`.

**OUT:**
- Byte-offset tailing, partial-line holding, shrink-detection/resync — `watch/tailer.ts` (phase-3); `events.ts` receives complete candidate lines and never does file IO. The torn-last-line fixture exercises the line parser's response to a truncated string, not tail resumption.
- Handoff STATUS transitions and the planned→built→reviewed state machine enforcement — `services/handoff.ts` (phase-3/4); this parser only reads and classifies the current word.
- Config WRITES and the schema-driven form — routes/services/client; this parser is read-side only.
- Events aggregation (timeline index, token rollups) — `services/events.ts` + `shared/derived/` (phase-3/4).
- The hyperflow-core `emit-event.sh` emitters — separate phase; this task consumes the documented line shape only.

## Files in scope

**Read**
- `dashboard/src/server/parser/primitives/*` (T5) — status-block (for the HANDOFF/COMPLETION manifest tables), fallback.
- `dashboard/src/shared/schemas/event-line.ts` (phase-1 T2) — the `{v, ts, chain, skill, type, batch?, task?, status?, agent?, tokens?, detail?}` line schema + version gate this parser validates against.
- `dashboard/src/shared/schemas/config.ts` (phase-1 T2) — the Zod mirror of `config/schema.json` (root keys today: `security`, `memory`, `context`, `handoff`, `specialists`).
- `skills/hyperflow/session-handoff.md` — package layout, HANDOFF.md/COMPLETION.md templates, STATUS state machine.
- `skills/hyperflow/background-agents.md` — the registry.json shape (`agents` array: id, purpose, fired_at, timeout_at, status, output_buffer, blocks_step).
- `config/schema.json` + `config/defaults.json` — the real schema the mirror tracks.

**Create**
- `dashboard/src/server/parser/handoff.ts` — package parser over a provided file map for one `<packageDir>/<slug>/`. Parses `HANDOFF.md`: the `## Manifest` two-column table via the T5 table primitive (Slug, Artefact type flat|feature, Artefact path, Chain args, on_complete review|deploy, Originating provider, Originating commit, Specialists, Created), the `## TL;DR` text, and captures the remaining sections raw. Parses `STATUS`: trimmed single word, validated against the vocabulary `planned | built | reviewed`; any other content yields status `unknown` carrying the raw word (grep-cheap contract — the file is one token, no markdown). Parses `COMPLETION.md` when present: the completion table (Built by, Built at, Base commit, Head commit, Diff range, Commits, Branch, Result built|partial with done/total extraction from `partial (<done>/<total>)`) + `## Notes`; absent COMPLETION.md is a normal state (`planned` packages have none), recorded as absent — not an error. Inventories `artefact/` and `context/` member paths so the client can browse the committed copies; member artefact files are NOT re-parsed here (the service layer routes them through `tasks.ts`/`features.ts` if needed). Inconsistent combinations (e.g. STATUS `built` with no COMPLETION.md — the documented crash edge) parse fine and surface as a state diagnostic. Package-level failure → T5 fallback node.
- `dashboard/src/server/parser/background.ts` — JSON parser for `registry.json` content: `{agents: [...]}` with per-entry fields id, purpose, fired_at, timeout_at, status, output_buffer, blocks_step (null allowed). Per-entry tolerance: an entry missing optional fields or carrying unknown extra fields still parses (unknown fields preserved); an entry that fails minimal shape (no id or no status) degrades to a raw-entry node while siblings parse. Status vocabulary observed in the doctrine (`running`, `complete`, `error`, `stalled`, `cancelled` — plus the display groupings in-flight/completed-uncollected/stalled/errored) maps through a status-classification helper; unknown status words pass through as-is with an `unknown` classification. Output-buffer paths are returned as references (path + exists flag supplied by the caller's file map). Whole-file JSON parse failure or a non-object root → fallback node; absent file is the empty registry (documented default).
- `dashboard/src/server/parser/config.ts` — read-side config parser: JSON parse of the provided content; on success, validate against the shared Zod mirror in DRIFT-TOLERANT mode — known top-level keys (`security`, `memory`, `context`, `handoff`, `specialists`) validated strictly for shape, unknown keys at any level preserved verbatim in the result and enumerated in an `unrecognizedKeys` list (spec §3B decision 9: keys like the in-the-wild `cleanup` block are surfaced as "unrecognized", never stripped, never rejected on read). Per-key validation failures degrade that key to a raw-value node with its Zod issue attached; the rest of the config parses. Invalid JSON → fallback node carrying the raw text (the config editor shows it in the advanced view). Absent file is a valid empty-config state.
- `dashboard/src/server/parser/events.ts` — single-line NDJSON parser, pure function string → parsed event | opaque raw event: (1) empty/whitespace line → skip result; (2) `JSON.parse` failure (including torn/truncated lines) → opaque raw event flagged `unparseable`, counted for the diagnostics tally (spec §4.3: "an unparseable line is skipped and counted in a diagnostics tally — never a crash"); (3) parsed object → `v` gate: `v === 1` validates against the shared event-line schema with unknown-fields-tolerated (additive-only contract: extra fields preserved, never rejected); unknown or missing `v` → opaque raw event carrying the parsed object verbatim with best-effort extraction of known fields (`ts`, `type`) for display ordering (spec §4.3 unknown-`v` best-effort mapping); (4) schema-invalid known-`v` line → opaque raw event with the validation issue attached. Also exports a batch helper that maps an array of candidate lines through the line parser and returns events + diagnostics counts, for the tailer and range-fetch service to share. No file IO, no offsets, no state.
- `dashboard/tests/unit/parser/handoff.test.ts`, `background.test.ts`, `config.test.ts`, `events.test.ts` — golden-fixture contract tests.
- `dashboard/tests/fixtures/golden/handoff/`, `dashboard/tests/fixtures/golden/background/`, `dashboard/tests/fixtures/golden/config/`, `dashboard/tests/fixtures/golden/events/` — fixture sets enumerated under Test cases (handoff fixtures are directory trees matching the package layout).

## Acceptance criteria

- [ ] `handoff.ts` parses the full HANDOFF.md manifest vocabulary, the one-word STATUS (validated against planned|built|reviewed, unknown preserved), and COMPLETION.md including the `partial (<done>/<total>)` result shape; absent COMPLETION.md on a `planned` package is a normal parse, not a degradation.
- [ ] `background.ts` parses the documented registry shape with per-entry degradation (one bad entry never drops the registry), preserves unknown fields, and treats an absent file as the empty registry.
- [ ] `config.ts` validates known keys against the shared Zod mirror while preserving and enumerating unrecognized keys verbatim — a config containing an off-schema `cleanup` block round-trips through parse with that block intact and listed as unrecognized.
- [ ] `events.ts` enforces the `v` gate: `v:1` lines validate against the shared schema with unknown fields tolerated and preserved; unknown/missing `v` and schema-invalid lines become opaque raw events with diagnostics counts — never a throw, never a dropped-silently line.
- [ ] Torn/truncated NDJSON input to `events.ts` yields the `unparseable` opaque result (the tailer's partial-line hold is explicitly out of scope and not simulated here).
- [ ] Parse-or-degrade holds across all four parsers on any input — empty, binary, wrong-root-type JSON — verified by explicit tests; zero throws.
- [ ] Golden fixtures pin both handoff lifecycle states (planned-only and built-with-COMPLETION), the unknown-`v` case, and the torn-last-line case.
- [ ] All outputs are `z.infer` of phase-1 shared schemas; no `any`; no file IO inside any of the four parsers (contents arrive as strings/maps per the services→parser boundary); each source file under 300 lines; `npm run lint`, typecheck, and Vitest pass in `dashboard/`.

## Test cases

Fixture trees in `dashboard/tests/fixtures/golden/handoff/`:

- `planned-flat/` — `HANDOFF.md` (manifest per the session-handoff template: Artefact type `flat`, on_complete `review`, chain args string) + `STATUS` containing `planned` + `artefact/tasks/demo.md` + `context/conventions.md`, no COMPLETION.md → manifest map complete, status `planned`, completion absent-normal, member inventory lists both files.
- `built-feature/` — STATUS `built` + COMPLETION.md with Result `partial (3/5)` + `artefact/features/demo/…` tree → status `built`, completion parsed with done=3 total=5, artefact type `feature`.
- `status-garbage/` — STATUS containing `shipped!` → status `unknown`, raw word preserved, package still parses.
- `built-no-completion/` — STATUS `built`, no COMPLETION.md → parses with the state diagnostic (documented crash edge), no throw.

Fixtures in `dashboard/tests/fixtures/golden/background/`:

- `registry-full.json` — the background-agents.md example entry (`bg-1718049600-quality-gates-b2`, status `running`, blocks_step null) plus one `complete` and one `stalled` entry → 3 entries, classifications in-flight/completed/stalled, output-buffer refs returned.
- `registry-mixed-bad-entry.json` — two valid entries + one entry missing `id` → 2 parsed + 1 raw-entry node, no throw.
- `registry-unknown-status.json` — entry with status `paused` → parses, classification `unknown`, word preserved.
- `registry-not-json.json` — truncated JSON → fallback node.

Fixtures in `dashboard/tests/fixtures/golden/config/`:

- `config-valid.json` — keys drawn from the real `config/schema.json` vocabulary (`memory.compactionThreshold`, `handoff.autoPush`/`remote`/`packageDir`, …) → validated map, empty unrecognized list.
- `config-drift.json` — valid keys plus an off-schema `cleanup` block and one unknown nested key → known keys validated, `cleanup` preserved verbatim, unrecognized list names it.
- `config-bad-key-shape.json` — `handoff.autoPush` as a string instead of boolean → that key degrades with its Zod issue, siblings validate.
- `config-invalid.json` — malformed JSON → fallback node carrying raw text.

Fixtures in `dashboard/tests/fixtures/golden/events/`:

- `lines-v1.ndjson` — five well-formed v:1 lines across the emit touchpoints (dispatch status update with `batch`/`task`/`status`, background registry transition with `agent`, queue-commit with `detail`, one carrying `tokens`) → 5 validated events, fields typed per schema.
- `line-unknown-v.ndjson` — a `{"v":2, "ts":…, "type":"future-thing", "novel":…}` line → opaque raw event, `ts`/`type` best-effort extracted, `novel` preserved.
- `line-extra-fields.ndjson` — v:1 line with an extra optional field the schema does not know → validates, extra field preserved (additive-only contract).
- `torn-last-line.ndjson` — two complete lines + a final line cut mid-object → 2 events + 1 `unparseable` opaque event via the batch helper, diagnostics count 1.
- `line-not-object.ndjson` — a bare JSON array line → opaque raw event.

Integration scenario (Vitest, real repo files): parse the real `config/defaults.json` from this repository through `config.ts`'s shape-check path → parses without throw, secret-blocklist-bearing `security` block surfaces under known keys, unrecognized list is stable; and run `handoff.ts` against a fixture package assembled verbatim from the `session-handoff.md` HANDOFF.md/COMPLETION.md templates (placeholder values filled) → every manifest field the template documents lands in the parsed map, proving the parser tracks the published contract, not a paraphrase.

E2E: N/A — no browser surface at this layer; composed-loop coverage lands in T40/T41.

## Related context

The STATUS contract (session-handoff.md): "`STATUS` is a single grep-cheap token the session-start hook reads without parsing markdown" — one word: `planned | built | reviewed`.

The HANDOFF.md manifest table the parser must accept (session-handoff.md template):

```markdown
| Field                | Value                                                       |
|----------------------|-------------------------------------------------------------|
| Slug                 | `<slug>`                                                    |
| Artefact type        | flat | feature                                              |
| Artefact path        | `artefact/tasks/<slug>.md` | `artefact/features/<slug>/`   |
| Chain args           | `commit=… branch=… push=… triage=<base64> mode=…`           |
| on_complete          | review | deploy                                             |
| Originating provider | claude-code | codex | opencode | antigravity | grok         |
| Originating commit   | `<sha>`                                                     |
| Specialists          | `<roster>`                                                  |
| Created              | `<YYYY-MM-DD HH:mm>`                                        |
```

COMPLETION.md carries `Result | built \| partial (<done>/<total>)` plus Base/Head commit and `Diff range`.

The registry shape (background-agents.md):

```json
{ "agents": [ { "id": "bg-1718049600-quality-gates-b2", "purpose": "…", "fired_at": "…", "timeout_at": "…", "status": "running", "output_buffer": ".hyperflow/background/bg-….md", "blocks_step": null } ] }
```

The event line contract (spec §3B decision 6): `{v:1, ts, chain, skill, type, batch?, task?, status?, agent?, tokens?, detail?}` — "the `v` field marks the schema generation, changes are additive-only (new optional fields), readers must tolerate unknown fields"; §4.3: unknown `v` → best-effort mapping of known fields; unparseable line → skipped + counted, never a crash.

Config drift rule (spec §3B decision 9): drift "is tolerated on read (preserved verbatim, surfaced as 'unrecognized keys' rather than stripped or rejected)". Real schema root keys: `security`, `memory`, `context`, `handoff`, `specialists`; `additionalProperties: false` applies to WRITE validation, not read tolerance.

Sibling briefs: T5 (table primitive + fallback consumed here), T6/T7 (parallel Batch 2 siblings — no shared files). Phase-3 consumers: `watch/tailer.ts` (feeds `events.ts` complete lines), `services/handoff.ts` (state machine on top of the parsed status), `services/config.ts` (write-side strict validation).

## Gotchas

- **The events line schema is a cross-repo public contract** (ADR-governed, hardest-to-reverse decision in the spec). The parser must be bidirectionally tolerant: old dashboard reading new lines (unknown fields/types → displayable-raw) and new dashboard reading old lines. Never reject on unknown; never mutate.
- **`v` gating is per line, not per file** — a single events.ndjson legitimately mixes generations after a plugin upgrade mid-project.
- **Torn last line is the NORMAL crash-safety story** (spec §3B decision 6: "a torn final line is skipped, never corrupts history") — `unparseable` on a truncated line is expected steady-state behavior during writes, not an anomaly; keep it a cheap, allocation-light path because the tailer hits it constantly.
- **No file IO in these parsers** — the services→parser boundary hands content in. Especially tempting to violate in `handoff.ts` (directory of files) and `background.ts` (buffer existence checks); take file maps/flags as input instead.
- **STATUS is not markdown** — resist running it through any markdown primitive; trim, one word, done. Unknown words are user hand-edits, not parse failures.
- **`built` with no COMPLETION.md and `planned` with no COMPLETION.md look identical on disk minus one word** — the first is the documented crash edge, the second is healthy. The distinction lives in the diagnostic, so get it right or the handoff panel misleads.
- **Config read-tolerance vs write-strictness is an asymmetry by design** — `additionalProperties: false` belongs to the write path (phase-3 services). Enforcing it on read destroys files written by newer plugin versions, the exact failure decision 9 exists to prevent.
- **Derived/read-only reminder:** everything this task parses except config is dashboard-read-only; STATUS transitions go through the phase-3 state machine and registry writes belong to hyperflow-core. No normalize-and-persist anywhere.
- **BOM/CRLF:** HANDOFF.md/COMPLETION.md go through T5's shared normalization like any markdown; JSON surfaces (registry, config) need BOM-strip before `JSON.parse` (a BOM makes `JSON.parse` throw — route through the same normalization helper).
- **300-line cap:** four surfaces are four files by design; `handoff.ts` (three member-file kinds) is the bloat risk — if it nears ~250 lines, split COMPLETION.md parsing into a sibling helper per artefact type rather than compressing.
