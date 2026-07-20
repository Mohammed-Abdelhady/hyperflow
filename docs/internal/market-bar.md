# Market bar (maintainer-only)

**Not public product marketing.** Lives under `docs/internal/` so only maintainers use it to steer fix/feature release trains.


Hyperflow does not chase stars. Best means **best operating system for serious AI coding on real repos**.

Score each dimension 0-2. Ship releases until **total >= 16/20** and no dimension is 0.

| # | Dimension | 0 | 1 | 2 (target) |
|---|---|---|---|---|
| 1 | Time to first win | Confused >15m | Docs exist | Stranger hits golden path in <=5m |
| 2 | Default surface | 19 skills dumped | Default list exists | Default 5 skills + progressive disclosure everywhere |
| 3 | Project memory | Chat-only | Files exist | Hygiene + decisions locked + used next session |
| 4 | Review quality | Workers self-review | Reviewers exist | Priority stacks + specialists by tag |
| 5 | Proof | Badges | Some links | Proof pack with real PR outcomes |
| 6 | Evals | None | Static evals | Evals in CI + expanding golden tasks |
| 7 | Host honesty | Overclaim | Preview wording | Host-parity JSON + CI + certs when claimed |
| 8 | Monorepo / pro DX | Greenfield only | Snippets | Templates + gates + worktree rules |
| 9 | Failure UX | Restart from zero | Docs | DISPATCH_RESUME + status one-screen |
| 10 | Differentiation | Clone of Superpowers | Memory story | Memory + reviewed chain + decision locks + handoff |

## Current self-score (maintainer)

Update via `python3 scripts/score-market-bar.py` (writes `docs/internal/market-bar-score.json`).

## Non-goals

- Star count
- Hosted multi-tenant agent cloud
- Replacing every other plugin feature-for-feature
