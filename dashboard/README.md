# hyperflow-dashboard

Local web cockpit for a project's `.hyperflow/` tree — live mission control, chain replay, health and token analytics, artefact browsers, and allowlisted management writes. **Zero network egress. Zero runtime LLM.** Everything stays on `127.0.0.1`.

## Quick start

Requires **Node.js 20+**.

```bash
npx hyperflow-dashboard
```

From any directory under a project that contains `.hyperflow/` (or pass `--root /path/to/project`):

1. Discovers the project root by walking up from the current working directory.
2. Picks a free loopback port (default `7432`, auto-increments if busy).
3. Mints a one-shot session token.
4. Prints a tokenized URL to stdout and best-effort opens the default browser:

```text
http://127.0.0.1:<port>/#token=<session-token>
```

The fragment is consumed into tab-scoped `sessionStorage` and stripped from the URL bar. A bare visit to `http://127.0.0.1:<port>/` without a token shows the locked shell — that is intentional.

Useful flags:

| Flag | Effect |
|------|--------|
| `--root <path>` | Jail the dashboard to this project root |
| `--port <n>` | Preferred port (still auto-increments on conflict) |
| `--token <t>` | Reuse a known token (second-instance probe) |
| `--no-open` | Skip browser open; URL still prints on stdout |

SSH / headless: use `--no-open` and paste the printed URL into a browser that can reach the tunnel.

## Feature tour

Eleven surfaces:

| Surface | Route | What it shows | Writes |
|---------|-------|---------------|--------|
| **Mission** | `/mission` | Live dispatch roster, stage chainline, event stream, graph/table toggle | none |
| **Replay** | `/replay` | Scrub recorded `events.ndjson` history; snap board to any event | none |
| **Health** | `/health` | Parse-health dial and factor list for the tree | none |
| **Leaderboard** | `/leaderboard` | Agent/batch ranking from recorded tokens | none |
| **Plans** | `/plans` | Task decompositions, conclusions, dual status-block formats | none |
| **Features** | `/features` | Feature phase tree and nested tasks | none |
| **Audits** | `/audits` | Timestamped audits + severity heatmap (popover is the a11y path) | none |
| **Memory** | `/memory` | Tagged and legacy memory entries; knowledge graph | create / edit / delete category files under `memory/` |
| **Specs** | `/specs` | Spec browser, Mermaid, revision diff | none |
| **Tokens** | `/tokens` | Token and cost charts from the event log | none |
| **Config** | `/config` | Global config form, markers (`.mode` / `.sticky`), handoff STATUS, restore-from-backup | config, markers, handoff transitions, restore |

**Writable (allowlist only):** memory categories, `~/.hyperflow/config.json`, project markers, handoff `STATUS` (forward-only state machine), restore-from-backup.

**Never writable from the dashboard:** task files, feature/phase rosters, derived `memory/index.md` and `memory/.checksums`, blocklisted secrets (`.env`, keys, credentials).

## Live telemetry

When hyperflow-core is emitting, `.hyperflow/events.ndjson` feeds the mission stream, replay scrubber, leaderboard, and token charts in real time (watcher → settle → delta → SSE).

**Markdown-only / reduced fidelity:** if `events.ndjson` is absent (older plugin versions, cold tree), browse surfaces still work from markdown artefacts; timeline fidelity is reduced and replay has nothing to scrub. A banner states the mode.

**Observe mode:** if the filesystem is read-only, the dashboard still serves snapshots and live updates; write controls disable and an observe-mode banner appears.

## Security posture

Local-only product, layered defenses (not an internet-hardened service):

1. **Loopback bind** — listens on `127.0.0.1` only.
2. **Session token** — CLI-minted; required on every `/api/v1` request (`X-Hyperflow-Token`); SSE may carry it as a query param on the stream route only. Missing and wrong tokens return **byte-identical** generic `401 TOKEN_INVALID` bodies.
3. **Host / Origin allowlist** — rejects DNS-rebinding and cross-origin CSRF (`403 ORIGIN_DENIED`). Exact `127.0.0.1:<port>` / `localhost:<port>` hosts only.
4. **Path jail** — all reads/writes resolve under the project `.hyperflow/` (plus sanctioned handoff sibling and global config path); escapes map to `NOT_FOUND` without path echo.
5. **Secret blocklist** — `.env`, keys, credentials patterns never pass the write door; derived memory files are hard-denied (`PATH_BLOCKED`).
6. **Allowlisted writes** — single write door: denylist → blocklist → conflict check → backup → temp+fsync → atomic rename.
7. **Zero network egress** — the process does not call out; offline re-runs work after install.

## Screenshots

_Placeholder — capture after ship:_

- Mission control live (roster + stream + chainline)
- Replay scrub mid-history
- Memory knowledge graph (table toggle)
- Audits heatmap with popover value

## Requirements & troubleshooting

| Topic | Behavior |
|-------|----------|
| Node | `>=20`. Older Node exits before the server loads, with detected vs required versions. |
| Port busy | Auto-increment; URL always reflects the bound port. |
| No browser / SSH | URL always printed first; open manually. |
| Second instance | With `--token` of a running instance on the preferred port, prints the existing URL and exits. |
| Offline | After the package is cached, `npx` boots with no network. |
| Empty project | No `.hyperflow/` → guided empty state; directory is created as needed for jail construction. |
| Auth locked shell | Relaunch via CLI to get a fresh tokenized URL. |

## License

MIT — see the repository root.
