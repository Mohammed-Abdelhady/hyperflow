# Roadmap

Hyperflow's roadmap is a direction-setting document, not a commitment calendar. It keeps train selection grounded in user pain and the current lightweight core.

## Direction

Keep the default path obvious, measurable, and reliable without rebuilding a second runtime around the plugin. Prefer fixing broken or confusing behavior over adding surface area.

The current priorities, in order, are:

1. Preserve the Markdown persistence and inert-startup guarantees.
2. Deepen memory, review, handoff, and monorepo workflows where the benefit is durable.
3. Make installation and release behavior safe under failure, partial updates, and host capability differences.
4. Treat compatibility claims as evidence-backed and surface-specific.

## Shipped trains

### v6.0 — lightweight Markdown core

- Direct, Focused, and Deep lanes with bounded coordination budgets.
- Seven focused surfaces: `hyperflow`, `plan`, `dispatch`, `trace`, `audit`, `deploy`, and `handoff`.
- Plans, audits, memory, and handoffs kept in human-readable Markdown.
- Inert startup: no automatic Hyperflow subprocesses, network requests, or project writes.
- Legacy runtime, dashboard, viewer, hooks, and JSON persistence machinery removed from the current core; installation preserves existing project data.

### v6.1 — portable validation and host boundaries

- Dependency-free `validate-plugin`, `unittest`, and golden `evals` maintainer gates.
- Explicit host-parity contract: Claude Code is primary; Codex is preview and uncertified; OpenCode and Antigravity are compatibility shims.
- Source-managed installation links all seven skills transactionally where supported.

### v6.2 — install and CI reliability

- Antigravity skill linking and uninstall cleanup, Git worktree support, and safer relative install paths.
- Source-managed updates refuse dirty or diverged checkouts, preflight fetched trees, and leave the existing checkout intact on failed updates.
- Validation and release workflows use current Node 24-based action majors.

### v6.4 — durable handoff round trips

- Case-sensitive handoff metadata keeps the copied Markdown task and exact Git base/head refs inspectable across sessions.
- A golden eval exercises the reviewed package shape and rejects missing pointers or unresolved refs.
- Release version stamping keeps the Changelog comparison links aligned with the new version.

### v6.5 — bounded cross-session memory

- `audit --remember` carries only an accepted review outcome and exact audit pointer into a later session.
- A bounded Markdown ledger keeps review memory separate from implementation output and authoritative audit findings.
- Handoff review can forward the same explicit opt-in without changing the exact Git-range contract.
- `plan --remember` carries approved planning decisions as bounded source-linked cards into a later session.
- Decision memory stays separate from task/spec detail, rejects duplicate cards, and never copies investigation transcripts.

### v6.6 — monorepo workspace-boundary verification

- Cross-boundary plans record affected roots, shared contracts, package-local gates, root gates, and explicit out-of-scope paths.
- Dispatch checks changed paths against that record before committing and runs the recorded gates.
- A dependency-free boundary eval protects the contract.

## Next trains

### Install and release reliability

- Continue testing source-managed updates against local-remote failure modes and partial trees.
- Keep host installation honest when native commands, collaboration, or lifecycle capabilities are absent.
- Preserve the release contract: validate locally, keep release and push separate, and never fabricate compatibility evidence.

## Selection rule for a train

A candidate should address a demonstrated failure mode or repeated user confusion, fit one coherent bounded change, and have a regression check or golden evaluation. If it cannot meet those conditions, it stays a note rather than becoming a release train.

## Explicit non-goals

- Hosted agent cloud infrastructure.
- Star-count or feature-for-feature parity chasing.
- More specialist agents without measured value.
- Restoring the removed dashboard, viewer, hooks, or legacy JSON runtime.
- Claiming certified Codex support while the relevant certificate remains preview or unavailable.

## Related

- [Getting started](getting-started.md)
- [Installation and migration](installation.md)
- [Orchestration contract](orchestration.md)
- [Monorepo isolation](monorepo.md)
- [Codex preview boundary](codex.md)
- [Releasing](../RELEASING.md)
- [Changelog](../CHANGELOG.md)
