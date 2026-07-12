# Project decisions

## Dashboard (2026-07-12, hyperflow-dashboard)

### [2026-07-12] v1 management surface is full-write `[ui, decision]`
**What:** Dashboard v1 ships full management: memory CRUD, schema-validated config editing, mode/sticky marker toggles, handoff STATUS transitions. Derived files (memory/index.md, .checksums) stay hard read-only; task files are never written by the dashboard.
**Why it matters:** Defines the entire write-security scope (atomic write-rename + pre-write backup + path jail apply to every write route) and the v1 test burden.
**Evidence:** Plan clarification, hyperflow-dashboard spec.

### [2026-07-12] Eight novel features in v1 `[ui, decision]`
**What:** Five fully built — Live Mission Control, Derived Plan Conclusions, Chain Replay scrubber, Flow Health score, Agent Leaderboard — plus Audit-trend heatmap, Memory knowledge-graph, and Spec-diff viewer as real-data preview panels. Token-spend analytics is a separate mandatory feature.
**Why it matters:** Locks v1 feature scope; preview panels render real parsed data, never lorem.
**Evidence:** Plan clarification, hyperflow-dashboard spec.

### [2026-07-12] Design pole: dark-first mission control `[ui, decision]`
**What:** Design system anchors on near-black layered surfaces, one restrained accent, dense-but-calm data typography, hairline separators. No glow, no neon, no templated admin layout. Light theme derived in v1.x.
**Why it matters:** Drives the whole design system and the Mobbin research direction before any component is built.
**Evidence:** Plan clarification, .hyperflow/design/system.md.

### [2026-07-12] Core event emission ships with v1 `[api, decision]`
**What:** hyperflow core emits an additive-only append-only event log at .hyperflow/events.ndjson (hooks: dispatch status updates, background registry writes, queue-commit.sh) starting v1, shipped alongside the dashboard. Emitted format is public contract from day one — requires an ADR. Dashboard degrades gracefully to markdown-only watching on older plugin versions.
**Why it matters:** Irreversible once published; every future skill change must keep emission additive and non-breaking for the 18-skill surface.
**Evidence:** Plan clarification, hyperflow-dashboard spec §2.

### [2026-07-12] Stack: Hono + Vite/React SPA + SSE, dashboard/ subpackage `[build, decision]`
**What:** dashboard/ subpackage in the hyperflow repo publishing `hyperflow-dashboard` (npm name confirmed free; root name `hyperflow` is taken by an unrelated package). Hono on node:http, prebuilt SPA shipped in the tarball, SSE + fs.watch (Node >=20 engines floor, chokidar fallback), React Flow (@xyflow/react) + elkjs for graphs, bundled client-side Mermaid.
**Why it matters:** Packaging, release.sh/bump-version.sh sync, and dependency posture all hang off this choice.
**Evidence:** Plan analysis (alternatives survey), hyperflow-dashboard spec §1.
