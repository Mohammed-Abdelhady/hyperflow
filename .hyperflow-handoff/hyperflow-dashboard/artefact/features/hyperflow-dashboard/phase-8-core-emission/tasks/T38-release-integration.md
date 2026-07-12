# T38 — Release integration

## Status

| Field       | Value              |
|-------------|--------------------|
| Status      | pending            |
| Complexity  | l                  |
| Depends on  | —                  |
| Specialist  | devops-reviewer    |

## Task

Extend the release plumbing for the `dashboard/` subpackage: `scripts/bump-version.sh` conditionally syncs the dashboard's declared plugin-compatibility version in `dashboard/package.json`; `scripts/validate-plugin.py` gains an explicit `dashboard/` ignore; `.gitignore` covers the dashboard build outputs. The CHANGELOG.md release entry rides the existing release automation (`release.sh` generates entries from conventional commits) — no separate work.

## Why

Spec §3B.1: the dashboard is a subpackage with an independent npm publish cadence, so repo-wide version bumps must "keep the dashboard's declared compatibility floor honest" without coupling its releases, and the plugin validator must "never trip over a directory that contains no skills". Without the gitignore entries, the first `npm install`/`vite build` inside `dashboard/` dirties every contributor's tree.

## Scope

**IN:**
- `scripts/bump-version.sh` — one conditional sync target.
- `scripts/validate-plugin.py` — explicit, documented `dashboard/` exclusion.
- `.gitignore` — `dashboard/dist/`, `dashboard/node_modules/`.

**OUT:**
- `dashboard/package.json` itself — phase-1 T1 owns the scaffold; this task only teaches the bump script where to write.
- `scripts/release.sh` and `CHANGELOG.md` — existing automation generates the release entry (CLAUDE.md Git Push Flow); nothing to add.
- npm publish wiring for the dashboard — publish is explicitly-invoked-only per the security blocklist; never automated here.
- No reformatting of existing lines in any of the three files — insertions and one honest count-string update only; nothing the 18 existing skills or CI parse changes shape.
- No new required behavior for old plugin versions or dashboard-less trees — every addition is conditional on `dashboard/` existing; a tree without it bumps and validates exactly as today.
- Emission failure never blocks a chain — not an emitter task, but the same posture applies: none of these edits may turn a passing bump/validate/commit into a failure on any existing tree.

## Files in scope

**Modify**
- `scripts/bump-version.sh` —
  - Add a `DASHBOARD_PACKAGE_JSON="$ROOT/dashboard/package.json"` variable after the existing path block (after `SKILL_VERSION=…`, line 13).
  - Do NOT add it to the mandatory existence loop (lines 33-38) — the dashboard may legitimately be absent (this task has no phase-internal deps and the script must keep working on any checkout). Instead, insert a conditional block after the "Update skill VERSION file" section (lines 69-71) and before the docs-site block (line 73): when the file exists, sed the dashboard's plugin-compatibility field to `$NEW_VERSION` and echo an "Updated …" line like its siblings; when absent, skip silently.
  - **Which field:** NOT the npm `version` field. Spec §3B.1 is explicit that "actual dashboard releases are cut independently" — the sync target is the dashboard's *declared compatibility floor*. Sync a dedicated top-level key in `dashboard/package.json` (`hyperflowPluginVersion`; if phase-1 T1's scaffold named it differently, match that name) with a sed pattern anchored to that exact key. Never reuse the line-48 generic `"version"` pattern here — it would clobber the dashboard's own npm version.
  - Update the final summary echo (line 82, `Version bumped to $NEW_VERSION (11 files)`) so the count stays honest — either report conditionally (12 files when the dashboard synced) or compute the count.
  - Reuse the existing `SED_INPLACE` array (lines 41-45) for BSD/GNU portability.
- `scripts/validate-plugin.py` —
  - Add a module-level `IGNORED_DIRS` constant near `ROOT`/`ERRORS` (lines 13-15) containing `dashboard`, with a comment stating it is an npm subpackage, not plugin content (spec §3B.1).
  - Apply it as a filter wherever the validator enumerates directories that could ever reach `dashboard/`: `check_skills` (the `skills/*/SKILL.md` glob at line 169) and the features set-equality scan (`skill_dirs` at line 351) — today's globs are already scoped under `skills/`, so the filter is a documented invariant that survives future glob widening, not a behavior change.
  - Add an explicit comment on `check_package_json` (lines 134-145) stating that only the ROOT `package.json` participates in plugin-version parity — `dashboard/package.json` carries an independent npm version and is exempt by design.
  - `check_readme_links` (lines 224-235) needs no change — links into `dashboard/` resolve by plain existence; state this in the constant's comment rather than adding dead code.
  - Stay stdlib-only.
- `.gitignore` — append after the current last line (`.test/`, line 11) a short dashboard group: a one-line comment plus `dashboard/dist/` and `dashboard/node_modules/`. Leave every existing line untouched, including the load-bearing `.hyperflow-handoff/` comment at lines 8-9.

## Acceptance criteria

- [ ] Bump dry-run syncs the dashboard version: running `bump-version.sh 9.9.9` against a scratch copy of the tree containing a `dashboard/package.json` updates the compatibility field to `9.9.9`, prints an "Updated" line for it, updates all 11 existing targets, and leaves the dashboard's npm `version` field byte-identical.
- [ ] With no `dashboard/` directory present, `bump-version.sh` completes exactly as today — exit 0, same 11 targets updated, no error, `set -euo pipefail` (line 3) not tripped by the conditional.
- [ ] `python3 scripts/validate-plugin.py` still reports PASSED on the untouched plugin tree — zero new failures, zero new warnings.
- [ ] The validator also passes when `dashboard/package.json` exists with a version that differs from `plugin.json`'s — proving the explicit ignore does what spec §3B.1 requires.
- [ ] `git check-ignore` confirms paths under `dashboard/dist/` and `dashboard/node_modules/` are ignored, and `git diff .gitignore` shows appended lines only.

## Test cases

1. **Integration (bump with dashboard):** copy the repo tree to scratch; add a stub `dashboard/package.json` with npm `version` `0.1.0` and the compatibility field at `5.9.0`; run `bash scripts/bump-version.sh 9.9.9`; assert compatibility field is `9.9.9`, npm `version` is still `0.1.0`, `.claude-plugin/plugin.json` and the other 10 existing targets read `9.9.9`, and the summary line's file count is accurate; discard the scratch copy (this is the dry-run — the real tree is never touched).
2. **Integration (bump without dashboard):** second scratch copy with no `dashboard/` → run `bash scripts/bump-version.sh 9.9.9` → exit 0 and output matching today's behavior (11 "Updated" lines + summary).
3. **Integration (validator):** `python3 scripts/validate-plugin.py` on the real repo → PASSED; then, in a scratch copy, add the mismatched-version `dashboard/package.json` stub → still PASSED.
4. **Gitignore:** `git check-ignore -v dashboard/dist/bundle.js dashboard/node_modules/zod/index.js` → both matched by the new entries; `git status` shows a stub `dashboard/dist/` as invisible.

E2E: N/A — no browser surface at this layer; composed-loop coverage lands in T40/T41.

## Related context

- `scripts/bump-version.sh:3` — `set -euo pipefail`; `:8-13` — path variable block (new var lands after line 13); `:33-38` — mandatory existence loop (dashboard stays OUT of it); `:41-45` — `SED_INPLACE` BSD/GNU detection to reuse; `:48` — the generic `"version"` sed pattern that must NOT be pointed at `dashboard/package.json`; `:69-71` — skill VERSION block (insertion anchor); `:82` — the `(11 files)` summary echo to keep honest.
- `scripts/validate-plugin.py:13-15` — `ROOT`/`ERRORS` (constant lands here); `:134-145` — `check_package_json` root-only parity; `:152-160` and `:272-276` — the deliberate zero-pip-dependency comments (the convention to keep); `:163-188` — `check_skills` glob; `:350-366` — features set-equality; `:224-235` — README link resolution.
- `.gitignore:1` — `node_modules/` (unanchored, already matches nested — see Gotchas); `:7` — `.hyperflow/`; `:8-9` — the intentional `.hyperflow-handoff/` NOT-ignored comment; `:11` — `.test/` (append point).
- `.hyperflow/specs/hyperflow-dashboard.md:289-293` — §3B.1 subpackage decision + release integration paragraph; `:595-597` — §5 rows for these three files; `:599` — the CHANGELOG row ("Release entry" — satisfied by existing automation).
- `CLAUDE.md` "Git Push Flow" — `release.sh` auto-generates CHANGELOG entries and bumps manifests; why CHANGELOG needs no task here.

## Gotchas

- **BSD vs GNU sed:** macOS `sed -i` requires the empty-string suffix; the script already solves this with the `SED_INPLACE` array (lines 41-45). A fresh hardcoded `sed -i` in the new block breaks the primary dev platform.
- **The tempting one-liner is the bug:** reusing the line-48 `'s/"version": "[^"]*"/…/'` pattern on `dashboard/package.json` rewrites the dashboard's independent npm version — a direct spec §3B.1 violation that would silently republish-version the dashboard on every plugin bump. The compatibility key must be a distinct, exactly-anchored pattern.
- **`set -euo pipefail` (line 3):** a conditional written as `[[ -f … ]] && sed …` as the block's last statement returns non-zero when the file is absent and kills the script. Use a full `if`/`fi` block.
- **validate-plugin.py is stdlib-only by explicit design** (its own comments at lines 152-160 and 272-276) — the ignore logic must not import anything beyond the standard library, and must not turn today's PASSED into new WARN lines on a clean tree.
- **`node_modules/` (line 1) already matches `dashboard/node_modules/`** — the explicit entry is still added per the spec §5 table (self-documenting for anyone scanning ignore rules for the subpackage), but do not "clean up" the unanchored line 1 as redundant: other tools and nested trees rely on it.
- **Python scripts here are run by CI** — a validator change that crashes (rather than fails) on an unexpected tree shape blocks every release; guard new filesystem probes with existence checks, mirroring `check_package_json`'s early return (line 137).
- **Never fail the session posture:** bump-version.sh runs inside `release.sh` during `/hyperflow:deploy`; any new failure path in it turns a shippable release into a broken pipeline. Absence of `dashboard/` is normal, not an error.
