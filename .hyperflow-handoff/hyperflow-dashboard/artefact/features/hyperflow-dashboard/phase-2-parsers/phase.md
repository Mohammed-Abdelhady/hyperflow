# phase-2-parsers

## Status

| Field       | Value                                          |
|-------------|------------------------------------------------|
| Status      | pending                                        |
| Progress    | `░░░░░░░░░░` 0 / 4 tasks (0%)                  |
| Depends on  | `phase-1-foundations`                          |
| Specialists | `backend-reviewer`                             |

## Goal

Build the entire defensive parser layer of the dashboard server (`dashboard/src/server/parser/`): shared parse primitives plus one dual-format parser per artefact surface — tasks, features, memory, audits, specs, handoff, background, config, events — each returning `Parsed<T> | RawFallback` typed by the phase-1 shared Zod schemas, each pinned by golden fixtures covering every real format variant the doctrine produces (spec §3B.4, §4.2, §5 parser tree).

## Exit criteria

- [ ] All 9 artefact surfaces (tasks, features, memory, audits, specs, handoff, background, config, events) parse their golden fixtures in BOTH supported format styles (table status block AND key-line status block; frontmatter task shape AND terse-roster shape; tagged AND legacy memory headings).
- [ ] Malformed, truncated, hand-edited, or unknown-version input degrades to a raw-markdown fallback node with a `parseError` flag — zero throws from any parser module on any input, verified by test.
- [ ] Every parser output type is `z.infer` of a phase-1 shared schema — no parser-private shapes cross the layer boundary.
- [ ] BOM and CRLF inputs parse identically to clean LF inputs across all surfaces.
- [ ] Every parser source file stays under the 300-line cap (surfaces split over shared primitives).

## Tasks

- [ ] T5 — Implementer · Parse primitives (status-block, frontmatter, checkboxes, fallback) + golden fixtures · Specialist: backend-reviewer   → `tasks/T5-parse-primitives.md`
- [ ] T6 — Implementer · Tasks + features parsers + golden fixtures · Specialist: backend-reviewer   → `tasks/T6-tasks-features-parsers.md`
- [ ] T7 — Implementer · Memory + audits + specs parsers + golden fixtures · Specialist: backend-reviewer   → `tasks/T7-memory-audits-specs-parsers.md`
- [ ] T8 — Implementer · Handoff + background + config + events parsers + golden fixtures · Specialist: backend-reviewer   → `tasks/T8-handoff-background-config-events-parsers.md`

## Batch order

```
Batch 1 — Parse primitives           (1 sequential)
  T5
       ↓
Batch 2 — Surface parsers            (3 parallel · depend on T5)
  T6 · T7 · T8
```

Golden fixtures ride WITH each sub-task — every parser lands in the same commit as the fixtures that pin it.
