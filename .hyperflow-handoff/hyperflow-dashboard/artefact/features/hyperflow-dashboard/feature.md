# hyperflow-dashboard

## Status

| Field       | Value                                                                                                                                          |
|-------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| Status      | planning                                                                                                                                         |
| Phases      | `░░░░░░░░░` 0 / 9 complete                                                                                                                       |
| Branch      | `feat/hyperflow-dashboard`                                                                                                                       |
| Spec        | `.hyperflow/specs/hyperflow-dashboard.md`                                                                                                        |
| Sub-tasks   | 0 / 46                                                                                                                                           |
| Specialists | architect, designer, motion · frontend-reviewer, accessibility-reviewer, api-reviewer, backend-reviewer, devops-reviewer, security-reviewer, vulnerability-reviewer |

## Goal

Ship an npx-launched local web cockpit (npm `hyperflow-dashboard`, `dashboard/` subpackage) that visualizes and manages a project's entire `.hyperflow/` surface: live mission control, mind-map graphs, per-plan conclusions, token analytics, 8 novel features, and full management writes (memory / config / markers / handoff). The UI is dark-first anti-slop, grounded in the project design system. One additive hyperflow-core change accompanies it — `events.ndjson` emission — so the dashboard can stream chain activity live. Everything is built against the approved spec at `.hyperflow/specs/hyperflow-dashboard.md`.

## TL;DR of the plan

9 phases covering 46 sub-tasks. After phase-1 foundations, phases 2 / 3 / 5 / 8 fan out in parallel (parsers, server security+live layer, client foundation, core emission), converging through server API+CLI (4), live surfaces (6), and browse+manage surfaces (7). Everything lands on phase-9 ship-verify with real-browser and e2e gates.

## Phases

1. **phase-1-foundations** — package skeleton, shared Zod contract, derived metrics, design tokens — `pending`
2. **phase-2-parsers** — 9 artefact parsers, dual-format + golden fixtures — `pending` (depends on phase-1)
3. **phase-3-server-security-live** — security gates, single write door, watcher, SSE hub — `pending` (depends on phase-1)
4. **phase-4-server-api-cli** — snapshot/delta/events services, /api/v1 routes, CLI launcher — `pending` (depends on phase-2, phase-3)
5. **phase-5-client-foundation** — SPA shell + handshake, stores/reducers, clients, design-system primitives — `pending` (depends on phase-1)
6. **phase-6-live-surfaces** — graph engine, mission control, replay, health/leaderboard/tokens — `pending` (depends on phase-4, phase-5)
7. **phase-7-browse-manage-surfaces** — plans, specs+diff, features, audits, memory, management — `pending` (depends on phase-6)
8. **phase-8-core-emission** — additive events.ndjson emission + release integration — `pending` (depends on phase-1)
9. **phase-9-ship-verify** — packaging, e2e suite, a11y/RTL pass, docs — `pending` (depends on phase-7, phase-8)

## Phase dependency graph

```
phase-1 → (phase-2 · phase-3 · phase-5 · phase-8)
(phase-2 + phase-3) → phase-4
(phase-4 + phase-5) → phase-6 → phase-7
(phase-7 + phase-8) → phase-9
```

## Verification plan

- Per-batch reviewer gates run during dispatch — every batch's diff passes its assigned specialist reviewer before commit.
- security-reviewer runs a full pass on T9a / T9b / T10 / T15 / T17 / T18 / T19 / T21 (write door, path gates, watcher, SSE, management writes).
- Golden-fixture parser contract tests pin all 9 artefact parsers against dual-format fixtures — any drift fails CI.
- Playwright e2e suite exercises the dashboard over a committed fixture project (live surfaces, browse, manage flows).
- Real-browser a11y / RTL / reduced-motion pass (T42) gates phase-9 before ship.
