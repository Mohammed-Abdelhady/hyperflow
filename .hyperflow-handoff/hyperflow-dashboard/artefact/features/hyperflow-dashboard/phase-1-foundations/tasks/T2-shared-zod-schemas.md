# T2 — Shared Zod schemas (single wire + parse truth)

## Task

Implement `dashboard/src/shared/schemas/` — the five Zod modules that form the product's only wire and parse contract: snapshot, delta, event-line, API envelopes (including the error envelope + code registry), and the config mirror. Server parsers, API routes, and the client store all infer their types from these; `shared/` imports from neither side — dependency arrows point inward only.

## Why

Spec §3B.5 makes shared Zod schemas the single source of truth killing server/client drift; §3B.6/13/15 fix the three ADR-governed public contracts (events.ndjson line, SSE vocabulary, error envelope) these schemas encode.

## Scope

**IN:** the five schema modules, `z.infer` type exports, and constant sets (error-code registry, SSE event-name vocabulary, `X-Hyperflow-Token` header name)

**OUT:** derived-metric functions (T3); the parsers producing these shapes (server phase); routes/middleware consuming them; config-editor UI; any I/O or fs access.

## Files in scope

**Read:**
- `.hyperflow/specs/hyperflow-dashboard.md` §2 (lines 160-243), §3B.5 (310-313), §3B.6 (315-318), §3B.13 (350-353), §3B.14 header name (356-358), §3B.15 (360-363), §5 shared tree (514-520), ADR flags (235-243)
- `config/schema.json` (repo root) — source shape for the config mirror

**Create:**
- `dashboard/src/shared/schemas/snapshot.ts` — normalized snapshot covering every artefact surface (tasks, features, specs, audits, memory, background, handoff, markers, commits-queue, events presence) with the per-file parse-health flag (`parseError` / degraded / derived states per §4.2) plus the epoch and last-event-id fields the startup hydration path needs (spec line 182).
- `dashboard/src/shared/schemas/delta.ts` — typed snapshot-delta patch shapes carried over SSE, including raw-fallback node variants; plus the SSE named-event vocabulary constants (`snapshot-delta`, `hf-event`, `write-echo`, `resync-required`) and the `<epoch>-<seq>` id format per §3B.13.
- `dashboard/src/shared/schemas/event-line.ts` — events.ndjson line schema `{v, ts, chain, skill, type, batch?, task?, status?, agent?, tokens?, detail?}` with the `v` integer gate: `v: 1` parses strict-with-passthrough (unknown extra fields tolerated), unknown `v` yields a typed opaque raw-event variant — never a throw (§3B.6, §4.3).
- `dashboard/src/shared/schemas/api.ts` — `/api/v1` request/response envelopes for each §5 route resource (snapshot, memory, config, markers, handoff, events, stream bootstrap); the error envelope `{code, message, details?}`; the code registry (`VALIDATION_FAILED`, `TOKEN_INVALID`, `ORIGIN_DENIED`, `PATH_BLOCKED`, `NOT_FOUND`, `WRITE_CONFLICT`, `INTERNAL`) with its deterministic HTTP-status mapping per §3B.15; the `X-Hyperflow-Token` header-name constant.
- `dashboard/src/shared/schemas/config.ts` — Zod mirror of `config/schema.json`: strict (unknown-root-key-rejecting) shape for the write path, and a read-tolerant variant that preserves unknown keys verbatim and surfaces them as unrecognized keys per §3B.9.

## Acceptance criteria

- [ ] All five modules compile strict with zero `any`; every exported type is `z.infer` — no shape hand-written twice
- [ ] `shared/` imports nothing from `src/server` or `src/client` (T1 lint gate passes)
- [ ] A placeholder import from one server file AND one client file compiles under `tsc -b` — both project-reference graphs consume shared
- [ ] Error codes and SSE event names are exported constant sets, not scattered string literals
- [ ] event-line accepts unknown extra fields and unknown `v` without throwing (typed opaque variant)
- [ ] Config mirror rejects unknown root keys on write-mode parse, preserves them on read-mode parse
- [ ] Each module ≤300 lines

## Test cases

(Vitest, `dashboard/tests/unit/shared/schemas/`)
- event-line: `{"v":1,"ts":"2026-07-12T10:00:00Z","chain":"c1","skill":"dispatch","type":"status","task":"T3","tokens":1200}` → parses to the v1 variant, optionals typed
- event-line: same object with `"v":9,"future":"x"` → opaque raw-event variant, no throw
- api: `{code:"WRITE_CONFLICT",message:"…",details:{mtime:1}}` → valid; `{error:"boom"}` → rejected
- config: object conforming to `config/schema.json` → write-parse OK; add root key `cleanup:{}` → write-parse fails, read-parse succeeds listing `cleanup` under unrecognized keys
- delta: raw-fallback node patch with `parseError: true` → valid snapshot-delta member
- schema-drift guard: unit test comparing the mirror's root key set against `config/schema.json`'s (fixture-loaded in test only) → equal
- Integration: `tsc -b` across all four project references with both placeholder imports in place → exits 0
- E2E: N/A — pure contract layer with no runtime surface; the cross-graph `tsc -b` compile is the integration scenario.

## Related context

- Spec §3B decisions — `.hyperflow/specs/hyperflow-dashboard.md:310-313, 315-318, 350-353, 356-358, 360-363`
- ADR-governed contracts list — `.hyperflow/specs/hyperflow-dashboard.md:235-243`
- §5 shared/schemas tree — `.hyperflow/specs/hyperflow-dashboard.md:514-520`
- Parse-degrade + tolerant-reader edge cases — `.hyperflow/specs/hyperflow-dashboard.md:388-401`
- Startup hydration fields — `.hyperflow/specs/hyperflow-dashboard.md:182`
- Mirrored shape — `config/schema.json`

## Gotchas

- These are ADR-governed public contracts (spec 235-243): evolution is additive-only — choose field names as if they are permanent, model optionality explicitly.
- No `z.any()` — the no-any rule extends to Zod; use `z.unknown()` for opaque payloads (e.g. raw event `detail`).
- Snapshot is the largest schema and will press the 300-line cap — split per-surface sub-schemas into sibling modules re-exported from `snapshot.ts` rather than compressing.
- Do not read `config/schema.json` at runtime — the mirror is authored source; drift is caught by the key-set unit test (loading the JSON in tests only is fine; `src/` → `tests/` imports are banned, not the reverse).
- Auth transport stays out of schemas beyond the header-name constant — the SSE token-in-query exception (§3B.14) is a stream-route concern for a later phase.
