# Proof pack

Public evidence that Hyperflow produces real engineering outcomes, not only docs.

> Maintainers: update this file when a new run is worth citing. Prefer links you control (your GitHub).

## What "proof" means here

| Claim | Evidence type |
|---|---|
| Multi-agent review happened | PR description or review thread naming workers/reviewers / Hyperflow artefacts |
| Memory survived a session | `.hyperflow/memory` decisions referenced in a later PR |
| Gates blocked bad ship | CI or deploy gate note in PR |
| Handoff worked | Committed `.hyperflow-handoff/` used across environments |

## Runs worth citing

### Hyperflow itself

| Item | Link / note |
|---|---|
| Releases | https://github.com/Mohammed-Abdelhady/hyperflow/releases |
| Plugin validation CI | `.github/workflows/plugin-validation.yml` on `main` |
| Codex certificate honesty | `docs/codex.md` + `scripts/certify-codex.sh` (preview until certified) |
| Reap / artefact lifecycle | v5.16-5.17 series (cleanup, auto-open, render-md) |

### Consumer monorepos (examples)

Add rows when you have stable public or private citations:

| Project | Outcome | Link |
|---|---|---|
| Uptend | Soft MVP mobile path + density PRs under reviewed agent flow | https://github.com/Mohammed-Abdelhady/uptend |
| Uptend API v0 | Contract-locked Hono scaffold decisions (pseudonymous analytics, PGlite) | Hyperflow decision cards → implementation PR (add URL when merged) |
| Train In Pink main website | Homepage polish / transparent mockups under staging | https://github.com/traininpink/tip-main-website/pull/342 |

## How to record a new proof

1. Keep the PR URL and one sentence outcome.  
2. Note which chain ran (`plan`→`dispatch`, `issue`, inline-fast).  
3. Optional: path to `.hyperflow/artefacts/...` if shareable.  
4. Append a row above; do not invent metrics.

## Not proof

- Star counts  
- Badge-only claims  
- "Works with Codex" without certificate state (`preview` until certified)  
