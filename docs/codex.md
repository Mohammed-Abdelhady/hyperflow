# Codex support matrix

Hyperflow ships Codex plugin packaging, hooks, marketplace lifecycle, and portable workflow adapters. **Certificate-backed support is not green yet.** Treat current Codex use as **preview / not certified** until lanes in [`config/codex-compatibility.json`](../config/codex-compatibility.json) carry real `certificateIds` and `status: certified`.

| Field | Value |
|---|---|
| Policy file | [`config/codex-compatibility.json`](../config/codex-compatibility.json) |
| Policy `updated` | **2026-07-18** |
| Schema / kind | `schemaVersion` 1 · `codex-compatibility-policy` |
| Certificate directory | `.hyperflow/artefacts/codex-certificates` (local/CI evidence; gitignored) |
| Certificate IDs (checked-in policy) | **none** (`certificates.ids: []`) |
| Research context only | Codex CLI **0.141.0** observed locally on 2026-07-18 — **not** a certified floor |
| Maintainer release gate | [`RELEASING.md`](../RELEASING.md) §5 · [`scripts/certify-codex.sh`](../scripts/certify-codex.sh) |

**Independence rules (never collapse surfaces):**

- CLI, **app-server**, and **desktop App** are certified separately.
- A green CLI or app-server lane never unlocks desktop App claims.
- Plugin-list success is not workflow certification.
- A hand-written schema-valid App attestation without CI provenance does not unlock App support.

---

## Surface matrix (current certificate state)

| Surface | Lanes | Version claim | Certificate state | Notes |
|---|---|---|---|---|
| **Codex CLI** | `minimum`, `currentStable`, `latestStable` | all `null` | **uncertified / preview** | Required for a full shipping claim once green: marketplace lifecycle, skills discoverable, session-start hooks, workflow canaries. `latestStable` is nightly-canary; failure freezes latest only. |
| **Codex app-server** | `minimum`, `currentStable`, `latestStable` | all `null` | **uncertified / preview** | Independent of CLI. Transport expected when certified: `stdio://`. Required smoke includes initialize, marketplace add/list/upgrade/remove, plugin visibility, thread start/resume, hooks/questions/clear-compact **when exposed**. |
| **Desktop App** | build attestations | no builds listed | **uncertified / pending** | Requires CI-issued attestation bound to exact App build, platform/arch, Hyperflow commit/tag, plugin version, digest, redaction, and immutable CI ref. App-server PASS alone never certifies App. |

### CLI lane detail

| Lane | Version | Status | OS/arch certified | Certificate IDs |
|---|---|---|---|---|
| `minimum` | — | uncertified | (empty until certified) | none |
| `currentStable` | — | uncertified | (empty until certified) | none |
| `latestStable` | — | uncertified · schedule `nightly-canary` | (empty until certified) | none |

Evidence-derived research note (not a certificate): CLI **0.141.0** was observed during full-Codex-support research. Establish the minimum floor by running the suite **backward** from a certified `currentStable`; do not guess.

### App-server lane detail

| Lane | Version | Status | OS/arch certified | Certificate IDs |
|---|---|---|---|---|
| `minimum` | — | uncertified | (empty until certified) | none |
| `currentStable` | — | uncertified | (empty until certified) | none |
| `latestStable` | — | uncertified · schedule `nightly-canary` | (empty until certified) | none |

### Desktop App detail

| Field | Value |
|---|---|
| Status | uncertified |
| Builds | `[]` |
| Attestation schema | [`tests/fixtures/codex/app-attestation.schema.json`](../tests/fixtures/codex/app-attestation.schema.json) |
| Verifier | `scripts/test-codex-app.sh --attestation <file>` |

---

## Operating systems and architectures

| Class | Platforms | Status |
|---|---|---|
| **Eligible when a lane is certified** | Linux `x86_64`, Linux `aarch64`, macOS `x86_64`, macOS `aarch64` | Not claimed supported until that lane’s `osArch` is filled and certificates pass |
| **Unsupported until separately certified** | Windows `x86_64` / `aarch64`, WSL `x86_64` / `aarch64` | **Unsupported** — never inferred green from Linux/macOS or from WSL host proximity |

Do not publish “supported on Linux/macOS” as a full-support claim while all lanes remain uncertified. Eligible ≠ certified.

---

## Install, update, remove (CLI / marketplace)

When the host exposes marketplace commands (preview until certified):

```bash
codex plugin marketplace add Mohammed-Abdelhady/hyperflow
codex plugin add hyperflow@hyperflow-marketplace
```

| Action | Command / path |
|---|---|
| Update (marketplace install) | `codex plugin marketplace upgrade hyperflow-marketplace` |
| Remove | `codex plugin remove hyperflow@hyperflow-marketplace` |
| Update (confirmed **source** checkout only) | `git pull --ff-only` in the source tree — never treat a marketplace cache’s accidental `.git` as source |
| Optional installer | [`install.sh`](../install.sh) one-shot clone to `~/.hyperflow/repo` (user-invoked; not a resident daemon) |

**Verify after install (fresh session):** start a new Codex session, confirm skills appear in the host skill list when the host exposes one, and that session-start context loads when hooks are trusted. Plugin listed ≠ hooks/workflows certified.

Desktop App install/upgrade paths are **not** claimed here until a CI App attestation exists for a specific build.

---

## Invoking skills (aliases, not native slash commands)

Hyperflow skill entrypoints such as `/hyperflow:plan` or `hyperflow plan` are **textual aliases** and session-start routing hints. They are **not** native Codex slash commands and must not be described as host-registered slash UX.

| Form | Status |
|---|---|
| `hyperflow <verb> …` | Portable textual invocation |
| `/hyperflow:<skill> …` | Hyperflow **textual alias** — same skill semantics when the session-start alias table / skill discovery is loaded |
| Native Codex `/…` slash commands | Host-owned; Hyperflow does not claim parity with that registry |

---

## Capability matrix and degradations

Canonical ops: [`skills/hyperflow/runtime-contract.md`](../skills/hyperflow/runtime-contract.md). Codex mapping notes: [`skills/hyperflow/provider-codex.md`](../skills/hyperflow/provider-codex.md). Live tool inventory always wins over defaults.

| Capability | Preferred on Codex | When missing / unavailable |
|---|---|---|
| Subagents (`spawn` / wait / message / follow-up / interrupt / list) | Prefer `collaboration.*` candidates, then bare names, then legacy `multi_agent_v1.*` **only if callable** | **Labelled inline worker** phase, then **separate labelled inline reviewer** phase. Batch order and gates preserved. Never merge worker and reviewer. Never invent host agent types. |
| Structured questions | `request_user_input` when callable in the current mode | Exact **Hyperflow Question** chat block, optional safe checkpoint under `.hyperflow/`, **end the turn**. Never skip; never silent-default. |
| Skill continuation / handoff | (registry: no native skill handoff tool listed for Codex) | Load target `skills/<name>/SKILL.md` **completely**, continue inline with preserved args. Never stop with “Skill tool unavailable”. |
| Session-start / after clear / after compact | Codex `SessionStart` hook (normalized) | Required for certified lanes when the host fires the event; otherwise explicit unsupported-event status only |
| Pre-compact recovery | Codex `PreCompact` | Snapshot when event exists; no crash on absent/malformed payload; never invent recovery content |
| Background agents | — | **Foreground-only**; no fake notifications or completion hooks |
| Usage metrics | — | Report `unavailable` or doctrine estimators with `estimated=true` — **never** fabricate tokens, durations, or parallelism as observed data |
| Web research | Host `web_search` / `web_fetch` (and inventory equivalents) when gated | Skip research; record unavailable; never invent citations |
| Big-task workflow | Portable workflow adapter (`/hyperflow:workflow` textual alias) | Same phase shape with subagents when exposed, else inline worker/reviewer; not Claude Code dynamic workflows |

**Role separation (hard on every profile):** workers never review; reviewers never coordinate. Every agent uses the **current session model**.

---

## Privacy

Do not claim stronger privacy than the published contract.

| Artefact | Role |
|---|---|
| [`PRIVACY.md`](../PRIVACY.md) | Human policy |
| [`config/privacy-contract.json`](../config/privacy-contract.json) | Machine-readable inventory (release-tested) |
| [`tests/test_privacy_contract.py`](../tests/test_privacy_contract.py) | Drift tests |

**Facts that apply on Codex as on other hosts:**

- No plugin-owned analytics SDK or phone-home for usage/crash telemetry.
- Host↔LLM provider traffic is **host-owned**; Hyperflow shapes prompt content and does not proxy it.
- **One automatic network path:** daily-cached SessionStart update check (`git ls-remote` tag names only against the public Hyperflow GitHub remote). Opt out: `HYPERFLOW_HOOK_OFFLINE=1`. Failures are non-blocking.
- Specialist web research and marketplace/install actions are optional or user-invoked, as disclosed in the contract.
- Local artefact viewer binds **`127.0.0.1` only**.

Full tables of automatic writes, network categories, and blocklists live in `PRIVACY.md` / the JSON contract — this page only links them.

---

## Troubleshooting

| Symptom | What to check |
|---|---|
| Skills missing after install | Fresh session; marketplace list; `codex plugin add` completed; skill discovery path for your install mode |
| `/hyperflow:…` “not a command” style confusion | Aliases are **not** native Codex slash commands — use textual `hyperflow <verb>` / alias recognition after session-start, or invoke via skill discovery |
| Gates skipped or auto-answered | Bug — structured UI missing must still print **Hyperflow Question** and end turn |
| “Parallel agents” but serial work | Subagents may be absent; expect sequential labelled inline phases and honest metrics (`0` concurrent children when inline) |
| Hooks not firing | Host trust/approval for hooks; `hooks/hooks.json` registration; certifier hook lane not yet green does not invent runtime |
| Update notice never appears | Offline opt-out, network failure (silent), or cache still within 24h TTL — see privacy update-check disclosure |
| Claimed App support in marketing | Reject unless desktop App row has CI attestation + certificate ID — CLI/app-server green is insufficient |
| Windows / WSL | Unsupported until certified — no supported claim |
| Release blocked by certifier | Expected while lanes are uncertified: `./scripts/certify-codex.sh --status`; see `RELEASING.md` |

Maintainer evidence paths: `scripts/test-codex-plugin.sh`, `scripts/test-codex-hooks.sh`, `tests/codex/workflow_canaries.py`, `tests/codex/app_server_smoke.py`, `.github/workflows/release-certification.yml`.

---

## Related

- [Installation](installation.md) — multi-provider install; Codex lifecycle must match this matrix  
- [Orchestration](orchestration.md) — chain behavior and Codex degradations  
- [Runtime contract](../skills/hyperflow/runtime-contract.md) · [Provider Codex](../skills/hyperflow/provider-codex.md)  
- [RELEASING.md](../RELEASING.md) §5 — certificate hard-stop  
- [Privacy](../PRIVACY.md)

_Last aligned with `config/codex-compatibility.json` `updated`: 2026-07-18_
