# Decisions

### [2026-07-12] Client state topology: Zustand snapshot + Query pull `[ui, decision]`
**What:** Zustand per-feature slices hold the live normalized snapshot via SSE-delta reducers that run identically in leader and follower tabs (BroadcastChannel rebroadcast); TanStack Query is limited to initial pull, on-demand fetches, and mutations.
**Why it matters:** SSE-delta reduction needs one deterministic reducer path — cache patching would be a second, non-deterministic one.
**Evidence:** .hyperflow/specs/hyperflow-dashboard.md §3B decision 10.

### [2026-07-12] Single write door for all dashboard filesystem writes `[security, pattern]`
**What:** Every dashboard write flows through one pipeline: realpath jail → denylist/secret-blocklist on the RESOLVED path → pre-write backup → temp+fsync → atomic rename → mtime/content-hash conflict check; direct fs writes elsewhere are lint-banned.
**Why it matters:** Collapses the write attack surface to one auditable module; blocklist checks before resolution are bypassable via symlinks/encoding.
**Evidence:** .hyperflow/specs/hyperflow-dashboard.md §2 write path + §3B decision 8.

### [2026-07-12] events.ndjson public contract: v-gated, additive-only `[api, decision]`
**What:** One JSON object per line {v,ts,chain,skill,type,batch?,task?,status?,agent?,tokens?,detail?}; readers tolerate unknown fields and unknown v (skip, don't crash); emitters may only add fields, never rename/remove; emission is fire-and-forget (exit 0 always) and its absence must degrade the dashboard to markdown-only watching.
**Why it matters:** This file is parsed by external versions of the dashboard forever — the contract survives both directions of version skew.
**Evidence:** .hyperflow/specs/hyperflow-dashboard.md §3B decision 6; skills/hyperflow/events.md (to be created in T35).

### [2026-07-12] SSE over WebSockets for local live updates `[api, decision]`
**What:** Named SSE events with epoch-seq ids, server ring-buffer replay via Last-Event-ID, resync-required on epoch mismatch; BroadcastChannel-shared single EventSource per browser defeats the HTTP/1.1 per-origin connection cap.
**Why it matters:** SSE gives auto-reconnect + ordering for free with zero extra deps; the dashboard's traffic is strictly server→client push + REST mutations.
**Evidence:** .hyperflow/specs/hyperflow-dashboard.md §3B decisions 2 and 13.
