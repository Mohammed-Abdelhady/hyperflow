# phase-3-server-security-live

| Field | Value |
|-------------|--------------------------------------------------------------|
| Status | pending |
| Progress | `░░░░░░░░░░` 0 / 5 tasks (0%) |
| Depends on | `phase-1-foundations` |
| Specialists | `security-reviewer, vulnerability-reviewer, backend-reviewer, api-reviewer` |

## Goal

Build the server's defensive core: the five stacked security layers from spec §3B.8 (session token, Host/Origin allowlist, path jail, secret blocklist, guarded writes), the single atomic write door every mutation must pass through, the debounced/settled file watcher, and the SSE hub with epoch-seq replay. After this phase the server can safely read, watch, and write a real `.hyperflow/` tree under adversarial input — before any route or feature surface is layered on top.

## Exit criteria

- [ ] All adversarial tests green: DNS rebinding via Host, CSRF via Origin, missing/wrong token (401 generic), encoded + double-encoded traversal, symlink escape, blocklisted `.env`/`.pem` reads, denylist hits on derived files and every task-file class.
- [ ] The write door (`services/write.ts`) is the ONLY fs-write path in `src/server/` — enforced by the ESLint rule banning direct `fs` writes outside the pipeline (spec §5 `eslint.config.js`), not by convention.
- [ ] SSE replay and resync proven in tests: same-epoch in-buffer `Last-Event-ID` replays missed deltas in order; epoch mismatch or buffer overrun emits `resync-required`.
- [ ] Watcher settle discipline proven: event bursts coalesce to one changeset, mid-write and no-op events are suppressed.
- [ ] Read-only filesystem flips the server to observe mode without creating any file during the probe.

## Tasks

| ID | Task | Brief | Deps | Complexity | Specialist review |
|---|---|---|---|---|---|
| T9a | Transport security gates — Host/Origin allowlist + session-token gate | [tasks/T9a-transport-security-gates.md](tasks/T9a-transport-security-gates.md) | T2 | l | security-reviewer, vulnerability-reviewer |
| T9b | Path security gates — path jail, write denylist, secret blocklist | [tasks/T9b-path-security-gates.md](tasks/T9b-path-security-gates.md) | T2 | m | security-reviewer, vulnerability-reviewer |
| T10 | Write pipeline — the single write door | [tasks/T10-write-pipeline.md](tasks/T10-write-pipeline.md) | T9a, T9b | m | security-reviewer |
| T11 | Watch layer — recursive watcher, settle, integrity heuristic | [tasks/T11-watch-layer.md](tasks/T11-watch-layer.md) | T1 | m | backend-reviewer |
| T12 | SSE layer — hub, ring buffer, client registry | [tasks/T12-sse-layer.md](tasks/T12-sse-layer.md) | T2 | m | api-reviewer |

## Batch order

| Batch | Tasks | Rationale |
|---|---|---|
| B1 | T9a · T9b · T11 · T12 | Independent mechanisms — transport gates, path gates, watcher, SSE hub share no files and only depend on phase-1 scaffolding (T1/T2) |
| B2 | T10 | The write door composes T9b's jail/denylist/blocklist and is exercised behind T9a's transport gates — both must exist first |
