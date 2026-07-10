# Releasing Hyperflow

Maintainer checklist for cutting a release and keeping downstream consumers in sync.
Sections 1–2 are the mechanics; **section 3 is the part that goes stale — re-verify it
on every release** (section 4's script automates the check).

## 1. Pre-release

- [ ] Every distinct task since the last tag has its own conventional commit (see CLAUDE.md commit cadence)
- [ ] README tables/links reflect any new skills, providers, or config keys
- [ ] `./scripts/validate-plugin.py` passes locally
- [ ] `plugin-validation` workflow is green on `main`

## 2. Cut and publish

- [ ] `./scripts/release.sh` — auto-detects the bump, writes CHANGELOG, bumps all manifests, commits `chore(release): vX.Y.Z`, tags
- [ ] `git push && git push origin vX.Y.Z`
- [ ] `plugin-validation` green on the release commit

## 3. Downstream sync — the dependents registry

Last verified: **2026-07-10** (against v5.5.0). Re-run section 4 before trusting this table.

| Dependent | Relationship | State last seen | Per-release action |
|---|---|---|---|
| [jeremylongshore/claude-code-plugins-plus-skills](https://github.com/jeremylongshore/claude-code-plugins-plus-skills) (backs tonsofskills.com + the `ccpi` CLI) | Vendors a full copy at `plugins/ai-agency/hyperflow/`, driven by their `sources.yaml` | **Frozen at v4.26.2** (synced 2026-06-17) via `curated: true` — their sync deliberately skips it because they carried local frontmatter edits (the #6 conversation). Their documented model: once the improvement is merged upstream, drop `curated:` and resync | **Open a PR** editing their `sources.yaml` to remove `curated: true` from the hyperflow entry (upstream shipped the frontmatter pass in v5.5.0), or a courtesy issue asking them to resync. Once unfrozen, their pipeline pulls new releases itself |
| [Mohammed-Abdelhady/forgepath](https://github.com/Mohammed-Abdelhady/forgepath) | Own repo; embedded doctrine block in `CLAUDE.md` | Stale — block at v4.21.0 | Run `/hyperflow:bridge refresh` in that repo and commit |
| This repo's own `CLAUDE.md` | Embedded doctrine block (dogfood) | Stale — block at v4.16.2 | Run `/hyperflow:bridge refresh` here after tagging |
| [gabrielmoreira/agent-skills-mirror](https://github.com/gabrielmoreira/agent-skills-mirror) | Periodic auto-mirror of Jeremy's repo | Refreshes daily | None — inherits automatically once Jeremy resyncs |
| kota-kawa/Marmo-Core · TuYv/ccpm | Hand-vendored copies of skills taken from Jeremy's copy | Snapshot, third-hand | None — no sync contract to honor |
| crossaitools.com (ex-claudemarketplaces.com) | Auto-updated community directory; indexes via the marketplaces it crawls | Listed via Jeremy's marketplace | None — follows the marketplace |
| Third-party `CLAUDE.md` doctrine embeds (e.g. traininpink/tip-web-app, v5.4.0) | Users who ran `/hyperflow:bridge` | Self-healing | None — auto-bridge refreshes the block on their next session after they update the plugin |
| caissonhq/forgebench | Ran hyperflow in benchmark dogfood runs (2026-06) | Historical reference | None |

Not currently listed in [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) — a submission there is a growth item, not a sync obligation.

### Ready-to-run: the unfreeze PR to Jeremy's marketplace

```bash
gh repo fork jeremylongshore/claude-code-plugins-plus-skills --clone
# edit sources.yaml: delete the `curated: true` line under `- name: hyperflow`
gh pr create --title "chore(hyperflow): drop curated freeze — frontmatter pass merged upstream in v5.5.0" \
  --body "Upstream shipped the least-privilege allowed-tools + metadata pass discussed in Mohammed-Abdelhady/hyperflow#6 (released as v5.5.0). Per the curated-flag model documented in sources.yaml, the mirror can unfreeze and resync."
```

## 4. Refresh the registry (run every release)

- [ ] `./scripts/verify-downstreams.sh` — checks every row of the section-3 table via
  read-only `gh api` queries (vendored-copy manifest version, doctrine-block `version=`
  markers, the `curated:` freeze flag) and prints a `DEPENDENT | EXPECTED | ACTUAL | STATUS`
  table. Exits 1 when any checkable row is stale; `--json` for machine output. Without `gh`
  or network it skips cleanly (exit 0) — the release never hard-depends on the API.
  `release.sh` also runs it automatically after tagging, as a non-blocking advisory.

Remediation stays human — the script only reports:

- Jeremy's marketplace still frozen (`curated: true`) → open the ready-to-run unfreeze PR
  from section 3, or a courtesy resync issue
- Doctrine embeds stale (forgepath, this repo's `CLAUDE.md`) → `/hyperflow:bridge refresh`
  in the affected repo and commit

The script verifies **known** rows only; discovering new dependents stays manual:

```bash
# Who references the repo anywhere on GitHub (drop own-repo hits):
gh api -X GET search/code -f q='"Mohammed-Abdelhady/hyperflow"' \
  --jq '.items[] | .repository.full_name + "  " + .path' | grep -v '^Mohammed-Abdelhady/hyperflow' | sort -u
```

New hits from the code search = new registry rows: classify as **direct** (vendored copy or
version-pinned reference → needs a PR or a ping), **transitive** (mirror of a mirror → no action),
or **self-healing** (doctrine embeds → auto-bridge handles it). Update the section-3 table, the
registry array in `scripts/verify-downstreams.sh`, and the "Last verified" date, and land the
edit in the same commit series as the release.
