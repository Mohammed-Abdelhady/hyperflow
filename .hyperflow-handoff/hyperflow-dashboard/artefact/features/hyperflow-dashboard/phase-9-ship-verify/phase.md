# phase-9-ship-verify

| Field | Value |
|-------------|--------------------------------------------------------------|
| Status | pending |
| Progress | `░░░░░░░░░░` 0 / 5 tasks (0%) |
| Depends on | `phase-7-browse-manage-surfaces, phase-8-core-emission` |
| Specialists | `devops-reviewer, frontend-reviewer, accessibility-reviewer` |

## Goal

Turn the finished dashboard into a shippable, verified product: real npm packaging with the prebuilt client in the tarball and an `npx` smoke run proving cold start, a Playwright e2e harness that boots the real server bin jailed to a committed fixture project, e2e specs enforcing the spec §4 edge clusters (live update, replay, writes, handoff state machine, auth failures, multi-tab leader election), a real-browser accessibility / RTL / reduced-motion verification pass across all 11 surfaces, and user-facing docs. After this phase the package is publishable and every behavioral guarantee in the spec has an executable or checklist-verified witness.

## Exit criteria

- [ ] `npm pack` tarball smoke run green: `npx` against the packed tarball cold-starts the dashboard on the fixture project in under 5 seconds, with zero network egress during boot.
- [ ] Full Playwright e2e suite green against the committed fixture project — every spec selecting exclusively via the shared `selectors.ts` registry, no `waitForTimeout` anywhere.
- [ ] Accessibility / RTL / reduced-motion pass complete in a real browser: keyboard path across all 11 surfaces, graph table-toggle and heatmap-popover screen-reader paths verified, both LTR and RTL rendered, `prefers-reduced-motion` honored, console clean on every surface.
- [ ] Docs shipped: `dashboard/README.md` (npx quick start, feature tour, security posture) and the root `README.md` dashboard feature row land with the feature.

## Tasks

| ID | Task | Brief | Deps | Complexity | Specialist review |
|---|---|---|---|---|---|
| T39 | npm packaging — files, bin wiring, engines, tarball npx smoke run | [tasks/T39-npm-packaging.md](tasks/T39-npm-packaging.md) | T17, T18, T26a, T26b, T27-T34b | m | devops-reviewer |
| T40 | e2e harness — Playwright config, committed fixture project, selector registry | [tasks/T40-e2e-harness.md](tasks/T40-e2e-harness.md) | T39 | m | frontend-reviewer |
| T41 | e2e specs — live update, replay, CRUD, config, handoff, auth, leader election | [tasks/T41-e2e-specs.md](tasks/T41-e2e-specs.md) | T40 | m | frontend-reviewer |
| T42 | Accessibility + RTL + reduced-motion verification pass (real browser) | [tasks/T42-a11y-rtl-motion-pass.md](tasks/T42-a11y-rtl-motion-pass.md) | T40 | m | accessibility-reviewer |
| T43 | User-facing docs — dashboard README + root README feature row | [tasks/T43-user-docs.md](tasks/T43-user-docs.md) | T39 | l | devops-reviewer |

## Batch order

| Batch | Tasks | Rationale |
|---|---|---|
| B1 | T39 | Packaging first — the e2e harness boots the REAL bin from the packaging contract, and docs describe the `npx` launch it proves |
| B2 | T40 · T43 | Independent once packaging exists: the harness builds on the proven bin; docs build on the proven quick-start — no shared files |
| B3 | T41 · T42 | Both consume T40's harness and fixture project in parallel: specs drive the flows, the a11y/RTL pass drives the surfaces — disjoint files (specs vs client fixes) |
