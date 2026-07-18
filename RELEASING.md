# Releasing Hyperflow

Maintainer checklist for cutting a release and keeping downstream consumers in sync.
Sections 1–2 are the mechanics; **section 3 is the part that goes stale — re-verify it
on every release** (section 4's script automates the check). **Section 5 is the Codex
certification hard-stop** — required before any version mutation or stable tag push.

## 1. Pre-release

- [ ] Every distinct task since the last tag has its own conventional commit (see CLAUDE.md commit cadence)
- [ ] README tables/links reflect any new skills, providers, or config keys
- [ ] `templates/claude-md-doctrine.md` is current — it is **generated** from `skills/hyperflow/DOCTRINE.md`; after any doctrine edit run `python3 scripts/generate-portable-doctrine.py` and commit the result (`validate-plugin.py` fails when it drifts)
- [ ] `./scripts/validate-plugin.py` passes locally
- [ ] `plugin-validation` workflow is green on `main`
- [ ] `./scripts/certify-codex.sh --status` reviewed; required rows green for a full-support claim (or accept that prepare will hard-stop)
- [ ] Working tree is clean before running `release.sh` — it stages `CHANGELOG.md`, the manifests, `README.md`, `templates/claude-md-doctrine.md`, `CLAUDE.md`, and `config/features.json` **whole**, so uncommitted edits in any of those files would ride the `chore(release):` commit

## 2. Cut and publish (two-phase candidate protocol)

Certification runs **before** any version mutation. Stable tags are pushed only after a
remote candidate branch passes.

```text
precheck → prepare (local commit + tag) → candidate branch CI → finalize → push stable tag
                ↑ dry-run / fail leaves tree unchanged here
```

### 2a. Precheck / dry-run (no mutation)

```bash
./scripts/release.sh --precheck          # certificate gate only
./scripts/release.sh --dry-run           # precheck + version plan; tree unchanged
./scripts/certify-codex.sh --status      # non-blocking report
```

On certification failure the working tree, `HEAD`, and tags are unchanged. Prove it:

```bash
before=$(git status --porcelain; git rev-parse HEAD; git tag -l)
./scripts/release.sh --precheck || true
after=$(git status --porcelain; git rev-parse HEAD; git tag -l)
test "$before" = "$after" && echo "unchanged"
```

Uncertified preview only (never for a public stable release):

```bash
HYPERFLOW_CERTIFY_ALLOW_PREVIEW=1 ./scripts/release.sh --dry-run
```

### 2b. Prepare locally

- [ ] `./scripts/release.sh` — precheck → CHANGELOG → `bump-version.sh` (prepare-only) → local `chore(release): vX.Y.Z` commit → **local** annotated tag
- [ ] Tag exists only on the maintainer machine at this point — **not** on `origin`

### 2c. Remote candidate certification

- [ ] `./scripts/release.sh --phase candidate --version X.Y.Z` — points `release-candidate/vX.Y.Z` at the prepared commit
- [ ] `git push -u origin release-candidate/vX.Y.Z`
- [ ] `.github/workflows/release-certification.yml` **candidate** job green
- [ ] On failure: fix-forward **on the candidate branch**; do **not** push the stable tag

### 2d. Finalize and publish stable ref

- [ ] `./scripts/release.sh --phase finalize --version X.Y.Z` — re-runs certificate precheck
- [ ] `git push origin HEAD && git push origin vX.Y.Z`
- [ ] `release-certification.yml` **stable-tag** job green (exact-tag read-only smoke)
- [ ] `plugin-validation` green on the release commit
- [ ] Announce only after stable-tag smoke PASS

### 2e. `bump-version.sh` semantics

`scripts/bump-version.sh` mutates manifests only. It **never** tags, pushes, or publishes.
`release.sh` invokes it with `HYPERFLOW_RELEASE_PHASE=prepare` after precheck. Direct use:

```bash
HYPERFLOW_BUMP_ALLOW_DIRECT=1 ./scripts/bump-version.sh X.Y.Z
```

## 3. Downstream sync — the dependents registry

Last verified: **2026-07-10** (against v5.5.0). Re-run section 4 before trusting this table.

| Dependent | Relationship | State last seen | Per-release action |
|---|---|---|---|
| [jeremylongshore/claude-code-plugins-plus-skills](https://github.com/jeremylongshore/claude-code-plugins-plus-skills) (backs tonsofskills.com + the `ccpi` CLI) | Vendors a full copy at `plugins/ai-agency/hyperflow/`, driven by their `sources.yaml` | **Frozen at v4.26.2** (synced 2026-06-17) via `curated: true` — their sync deliberately skips it because they carried local frontmatter edits (the #6 conversation). Their documented model: once the improvement is merged upstream, drop `curated:` and resync | **Open a PR** editing their `sources.yaml` to remove `curated: true` from the hyperflow entry (upstream shipped the frontmatter pass in v5.5.0), or a courtesy issue asking them to resync. Once unfrozen, their pipeline pulls new releases itself |
| [Mohammed-Abdelhady/forgepath](https://github.com/Mohammed-Abdelhady/forgepath) | Own repo; embedded doctrine block in `CLAUDE.md` | Stale — block at v4.21.0 | Run `/hyperflow:bridge refresh` in that repo and commit |
| This repo's own `CLAUDE.md` | Embedded doctrine block (dogfood) | Fresh — block at v5.6.0 | None — `release.sh` regenerates `templates/claude-md-doctrine.md` from `DOCTRINE.md`, then auto-bridge re-stamps the block before the release commit; if stale, run `python3 scripts/generate-portable-doctrine.py && python3 scripts/auto-bridge.py . .` and commit |
| [gabrielmoreira/agent-skills-mirror](https://github.com/gabrielmoreira/agent-skills-mirror) | Periodic auto-mirror of Jeremy's repo | Refreshes daily | None — inherits automatically once Jeremy resyncs |
| kota-kawa/Marmo-Core · TuYv/ccpm | Hand-vendored copies of skills taken from Jeremy's copy | Snapshot, third-hand | None — no sync contract to honor |
| crossaitools.com (ex-claudemarketplaces.com) | Auto-updated community directory; indexes via the marketplaces it crawls | Listed via Jeremy's marketplace | None — follows the marketplace |
| Third-party `CLAUDE.md` doctrine embeds (e.g. traininpink/tip-web-app, v5.4.0) | Users who ran `/hyperflow:bridge` | Self-healing | None — auto-bridge refreshes the block on their next session after they update the plugin |
| caissonhq/forgebench | Ran hyperflow in benchmark dogfood runs (2026-06) | Historical reference | None |

Not currently listed in [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) — a submission there is a growth item, not a sync obligation.

### Ready-to-run: submit to the official Anthropic registry

The highest-trust discovery channel. Prepared submission (maintainer runs it — a
PR to a third-party repo is never opened automatically):

```bash
gh repo fork anthropics/claude-plugins-official --clone
# add hyperflow to the registry manifest (name, description, source/repo, version),
# mirroring the .claude-plugin/marketplace.json entry — keep the one canonical
# hero line ("Point it at a GitHub issue. Get back a reviewed pull request.").
gh pr create --title "Add hyperflow — multi-agent orchestration (issue → reviewed PR)" \
  --body "Adds hyperflow (v$(cat .claude-plugin/plugin.json | python3 -c 'import json,sys;print(json.load(sys.stdin)["version"])')): plan → dispatch → review chain, 22 specialists, local-first memory, multi-provider. MIT."
```

Pre-submit check: `./scripts/validate-plugin.py` green, README hero matches every surface, latest tag pushed.

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
- Forgepath doctrine embed stale → `/hyperflow:bridge refresh` in that repo and commit
- This repo's own `CLAUDE.md` stale → auto-refreshed by `release.sh`, so a stale row means
  the regenerate-or-refresh step failed — run `python3 scripts/generate-portable-doctrine.py`
  then `python3 scripts/auto-bridge.py . .` and commit

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

## 5. Codex certification

Machine policy: [`config/codex-compatibility.json`](config/codex-compatibility.json).  
Privacy inventory: [`config/privacy-contract.json`](config/privacy-contract.json).  
Aggregator: [`scripts/certify-codex.sh`](scripts/certify-codex.sh).  
CI: [`.github/workflows/release-certification.yml`](.github/workflows/release-certification.yml).

### Support matrix (required vs optional)

| Surface / check | Release hard-stop? | Notes |
|---|---|---|
| CLI `minimum` certified + `certificateIds` | **Yes** | Floor; never inferred from plugin-list alone |
| CLI `currentStable` certified + `certificateIds` | **Yes** | Shipping claim lane |
| CLI `latestStable` | No (freeze-only) | Scheduled canary; failure freezes latest claim and opens an issue — does **not** redefine min/current |
| app-server `minimum` + `currentStable` | **Yes** | Independent of CLI |
| app-server `latestStable` | No (freeze-only) | Same freeze policy as CLI latest |
| Desktop App attestation | **Only if package claims App** | Detected from `.codex-plugin/plugin.json` keywords/description; CI provenance required; hand-written schema-valid JSON does not unlock |
| Privacy contract inventory | **Yes** | `tests.test_privacy_contract` + `config/privacy-contract.json` |
| Redaction evidence | **Yes** | Offline workflow canaries + attestation schema `redaction` requirement |
| Windows / WSL | Unsupported until certified | Never inferred green |

Independence rules (enforced by policy flags and certifier):

- Never infer App support from CLI or app-server PASS.
- Plugin list success is not workflow certification.
- Latest-only failure freezes latest; min/current stay as last certified.

### Evidence locations

| Artefact | Path / lane |
|---|---|
| Compatibility policy + lane rows | `config/codex-compatibility.json` |
| Certificate ID files (runtime/CI) | `.hyperflow/artefacts/codex-certificates/*.json` |
| Privacy contract | `config/privacy-contract.json` + `PRIVACY.md` |
| App attestation schema | `tests/fixtures/codex/app-attestation.schema.json` |
| App verifier | `scripts/test-codex-app.sh --attestation <file>` |
| CLI lifecycle evidence | `scripts/test-codex-plugin.sh`, `scripts/test-codex-hooks.sh` |
| CLI workflow canaries | `tests/codex/workflow_canaries.py` |
| App-server smoke | `tests/codex/app_server_smoke.py` |
| Candidate / stable-tag CI | `.github/workflows/release-certification.yml` artifacts |

Certificate files under `.hyperflow/` are local/CI evidence (project `.hyperflow/` is gitignored). The checked-in source of truth for lane status is `config/codex-compatibility.json` (`status`, `version`, `certificateIds`).

### Candidate flow (command sequence)

```bash
# 0) Optional status
./scripts/certify-codex.sh --status

# 1) Prepare (blocked if required certs missing)
./scripts/release.sh                 # or: --dry-run first

# 2) Candidate branch for remote certification
./scripts/release.sh --phase candidate --version X.Y.Z
git push -u origin release-candidate/vX.Y.Z
# → release-certification.yml candidate job

# 3) Finalize only after candidate green
./scripts/release.sh --phase finalize --version X.Y.Z
git push origin HEAD
git push origin vX.Y.Z
# → release-certification.yml stable-tag job (read-only smoke)

# 4) Announce only after stable-tag smoke PASS
```

### Fix-forward recovery

| Failure point | Action |
|---|---|
| Precheck / dry-run fail | Tree unchanged. Land conformance fixes + certificates. Do not force tags. |
| Prepare succeeded, candidate CI fail | Fix-forward on `release-candidate/vX.Y.Z`. **Do not** push stable tag. |
| Stable tag pushed, smoke fail | **Halt announcement** and distribution guidance. Preserve CI evidence. **Never** delete/retag/force-push the stable tag. Cut a **fix-forward patch release** from a new candidate, or withdraw draft distribution surfaces that cited the bad tag. |
| Latest-only scheduled fail | Freeze latest claim; open compatibility issue; leave min/current as last certified. Normal min/current releases may continue per matrix. |
| Privacy / redaction drift | Security halt until disclosed/reviewed or removed. |
| App claim without CI attestation | Block until `scripts/test-codex-app.sh` accepts a CI-issued attestation. |

### Certifier modes

```bash
./scripts/certify-codex.sh              # precheck (default hard-stop)
./scripts/certify-codex.sh --status     # report only
./scripts/certify-codex.sh --candidate  # remote candidate mode
./scripts/certify-codex.sh --stable-tag # post-push exact-tag smoke
./scripts/certify-codex.sh --self-test  # missing-cert blocks + freeze semantics
```
