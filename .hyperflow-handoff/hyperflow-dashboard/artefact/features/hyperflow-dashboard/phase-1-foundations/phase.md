# phase-1-foundations

## Status

| Field       | Value                                                              |
|-------------|--------------------------------------------------------------------|
| Status      | pending                                                            |
| Progress    | ░░░░░░░░░░ 0 / 4 tasks (0%)                                        |
| Depends on  | —                                                                  |
| Specialists | devops-reviewer, api-reviewer, architect, backend-reviewer, designer |

## Goal

Stand up the `dashboard/` subpackage skeleton with its mechanical quality gates (no-any, 300-line cap, write-door ban, cross-layer import ban) baked into tooling before any feature code exists, then lay the two foundations everything else consumes: the shared Zod schemas that are the single wire+parse truth (spec §3B.5/6/13/15) and the design-token sheet generated from the living design system. Derived-metric pure functions close the phase so later server and client phases build on tested, deterministic intelligence.

## Exit criteria

- `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` all green on the scaffold from a clean checkout
- All five schema modules in `dashboard/src/shared/schemas/` compile strict with zero `any`, and a placeholder import from one server file AND one client file compiles under `tsc -b` (both project-reference graphs consume shared)
- `dashboard/src/client/styles/tokens.css` matches every token table in `.hyperflow/design/system.md` exactly — no extra tokens, no banned values (violet, gradient, glow)
- All four derived-metric functions (`health`, `leaderboard`, `conclusions`, `tokens`) pass their table-driven Vitest suites, including determinism and zero-data cases
- No source file in `dashboard/` exceeds 300 lines

## Tasks

- [ ] T1 — Implementer · package scaffold + tooling configs · Specialist: devops-reviewer → tasks/T1-package-scaffold-tooling.md
- [ ] T2 — Implementer · shared Zod schemas (single wire+parse truth) · Specialist: api-reviewer → tasks/T2-shared-zod-schemas.md
- [ ] T3 — Implementer · derived-metric pure functions + table-driven tests · Specialist: backend-reviewer → tasks/T3-derived-metric-functions.md
- [ ] T4 — Writer · generate design tokens · Specialist: designer → tasks/T4-design-tokens.md

## Batch order

B1: T1 → B2: T2 · T4 → B3: T3
