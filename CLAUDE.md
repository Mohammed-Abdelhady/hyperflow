# Hyperflow — Contributing

## What is this repo?

A Claude Code plugin providing autonomous multi-agent orchestration. Skills live in `skills/`, hooks in `hooks/`, docs in `docs/`.

## Structure

- `skills/<name>/SKILL.md` — Each skill has YAML frontmatter (`name`, `description`) and markdown body
- `skills/<name>/*.md` — Supporting reference files loaded on demand
- `hooks/hooks.json` — Event handler configuration
- `hooks/session-start` — Bash script injecting auto-pilot at session start
- `.claude-plugin/plugin.json` — Claude Code plugin manifest

## Conventions

- Skill names use kebab-case
- Descriptions start with "Use when..." and describe triggering conditions only (not workflow)
- SKILL.md body stays under 500 lines — split into reference files if needed
- Reference files are one level deep from SKILL.md (no nested references)

## Commit Cadence — One Task Per Commit (MANDATORY)

This repo's own development follows the same per-task commit rule that `skills/hyperflow/git-workflow.md` rule 2 prescribes for `/hyperflow:dispatch`. Eat the dogfood.

**Rule:** every distinct task or request the user gives produces its own commit. Never bundle two features, two fixes, or a feature-plus-its-doc-update into a single commit just because you happen to be touching both files in one session.

**Concretely:**

| User asked for | Commits to produce |
|---|---|
| "Fix decorative-char violations in escalation.md" | 1 commit — `fix(style): …` |
| "Add per-task commits to dispatch AND ask audit/deploy gates" | **2 commits** — one for the commit-cadence rule, one for the gate questions. Not one combined commit. |
| "Add /hyperflow:newskill that does X (+ update README + features.json)" | 1 commit — README and features.json belong to the feature's commit (they document/register the same change) |
| "Refresh repo description AND plugin description" | 2 commits — different surfaces, different audiences |

**Edge cases:**

- A single feature naturally touches several files (skill body + README table + features.json registration) → still 1 commit, because those files all describe the same change.
- A README badge bump that happens because `release.sh` ran → folded into the `chore(release):` commit; that's correct.
- A typo fix discovered while doing feature X → separate commit, `fix(typo): …`, even though you noticed it during feature X work.

**Why:** bisectable history, surgical reverts, clean PRs, readable changelogs. Mirrors what dispatch enforces for user-facing work.

## Git Push Flow

When pushing, always run `./scripts/release.sh` first:
1. Auto-detects bump type from conventional commits (feat→minor, fix→patch, BREAKING→major)
2. Generates CHANGELOG entries
3. Bumps version in all manifests (package.json, plugin.json, marketplace.json, README)
4. Commits `chore(release): vX.Y.Z` and creates annotated tag
5. Then push with `git push && git push --tags`

If release.sh says "Nothing to release", skip and push directly.

Full checklist — including the downstream-dependents registry (marketplace mirrors, doctrine embeds) that must be re-verified and synced on every release — lives in [RELEASING.md](RELEASING.md).

**Caveat:** the per-task commit rule above runs *before* release.sh. By the time release.sh runs, the working tree already has N small task-commits — release.sh just adds its own `chore(release):` on top. Don't try to fold multiple tasks into one commit just to keep the release tidy.

## README Maintenance

The `README.md` is the project's primary discovery surface — keep it in sync with shipped features on every push.

**Before pushing, verify:**
- New skills, layers, or providers are documented in the corresponding tables
- Version badge and version strings reflect the upcoming release
- Removed or renamed features are no longer referenced
- New configuration keys appear in the Configuration section
- All internal links (`docs/*`, `skills/*`, `hooks/*`, `config/*`) still resolve

`scripts/release.sh` runs a staleness check after the safety pre-flight: if `README.md` has not been touched since the last release tag and the new release introduces commits other than `chore:` or `docs(internal):`, the script prints a warning and prompts to continue. The check is informational — it never blocks a release — but a yellow `README STALE` line in the release output is a strong signal to revisit the README before tagging.

When a change is README-relevant, prefer landing the README update in the same commit (or immediately preceding commit) as the feature itself — never as a follow-up after the tag.

<!-- hyperflow:doctrine:start version=5.14.0 generated=2026-07-17T18:10:19Z body-sha=9fa520ea12c6 source=https://github.com/Mohammed-Abdelhady/hyperflow -->

# Hyperflow Doctrine (Portable Subset)

Behavioral rules for surfaces that don't load the CLI plugin (Desktop, claude.ai web, IDE extensions). The full doctrine lives in the terminal CLI plugin; this is the portable behavioral floor.

## Autonomy

1. **No confirmations** ("should I…?", "is this ok?", "ready to ship?"). Execute.
2. **Clarification IS required** for *what* / *which* / *where* ambiguities — ask via `AskUserQuestion`. Never ask "should I start?".
3. **Minimal output.** One-line status updates. No hedging ("I think", "maybe").
4. **Silent error recovery.** Fix and continue; only surface unrecoverable errors.
5. **Binary action gates carry NO `(Recommended)` marker.** `Yes/No`, `Push/Hold`, `Approve/Revise`, `Include/Exclude` — neutral. Multi-option lists (3+) and named-workflow choices (`Auto/Manual`) DO mark a recommended option.
6. **Clarification fires AFTER analysis, never before.** Read the code, analyze, then ask. Asking before research wastes the user's time on questions the codebase already answers.

## Auto-routing by intent

Scan every user message. If a verb matches, follow the matching workflow — even without a slash command. First match wins; case-insensitive.

| Verb / phrase | Workflow |
|---|---|
| `brainstorm`, `design`, `explore`, "what if", "should we", "unsure about" | Read code → ask only material questions → propose 2-3 approaches → design section-by-section with user approval per section |
| `scope`, `decompose`, "plan out", "break down" | Map affected surface → produce batched task graph → write to `.hyperflow/tasks/<slug>.md` |
| `big task`, `large migration`, `repo-wide audit`, `run a workflow`, `dynamic workflow` | In Claude Code v2.1.154+, create a dynamic workflow; in Codex/OpenCode use the portable workflow adapter; elsewhere use the build/scope route |
| `build`, `implement`, `add`, `refactor`, "wire up" | Inspect → inline-fast for proven reversible 1-2-file work; otherwise decompose → parallel workers → batch review → commits → integration review |
| `debug`, `fix it`, `solve`, "why is X", "Y fails", stack trace | Systematic root-cause: 5 Whys + parallel hypothesis testing. Never blind-patch symptoms |
| `audit`, `review`, "check for issues", "security check" | Multi-level review (L1 syntax → L5 exhaustive) → write findings to `.hyperflow/audits/<timestamp>.md` → ask fix-gate |
| `ship`, `push`, `release`, `deploy` | Pre-push gates (lint + typecheck + build + tests + security sweep) → ask before push → never `--no-verify`, never force-push to main |

**Bypass per-message:** starts with `/`, or contains "without hyperflow" / "just answer".

## Commit cadence

Every distinct task or request produces its own commit. Never bundle two features, two fixes, or feature-plus-doc-update into one commit just because they're in one session.

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:` / `fix:` / `docs:` / `refactor:` / `chore:` / `perf:` / `style:` / `test:`.

## Roles

**Every agent runs on the current session model** — there is no model-tier routing and no model configuration. Roles differ by responsibility, not by model:

- **Workers** (Implementer / Searcher / Writer) execute mechanical work.
- **Per-batch / per-sub-task Reviewer** runs an anchored review of one batch's small diff (L1-L2 territory).
- **Final integration Reviewer** (end-of-chain over cumulative diff) and **Standalone Reviewer** (audit, security sweep, final sanity check) are decision-agent passes.
- **Debugger / Analyst / Planner / Brainstormer / Orchestrator** are decision agents.
- **Specialist reviewers** (`security-reviewer`, `database-reviewer`, `algorithm-reviewer`, …) act as the per-batch and standalone Reviewer; security/correctness specialists always run a full review pass even per-batch. **Investigators** (`searcher` worker; `debugger` / `analyst` / `researcher` decision agents); **Brain** (specialist router) is a decision-maker. All run on the session model.

Workers never review. Reviewers never coordinate. Triage stays a decision-agent consultation. Reviews and investigations are run by the **matching domain specialist** ([`agents/`](agents/)), not a generic role — the Brain decides the responsible roster once after triage and the chain inherits it. On deep / security work, specialists research current best-practices and CVEs before acting (web-research-first).

## File-first artefacts

Plans, specs, audits, task decompositions live in `.hyperflow/` files — never as long-form chat content. Chat shows a short status box pointing at the file.

| Artefact | Path |
|---|---|
| Task decomposition (single-phase) | `.hyperflow/tasks/<slug>.md` |
| Feature (multi-phase) | `.hyperflow/features/<slug>/` — `feature.md` + `phase-<n>-<name>/` folders, each with `phase.md` + `tasks/` + `spec.md`/`research.md`/`decisions.md` |
| Feature spec | `.hyperflow/specs/<slug>.md` |
| Design system | `.hyperflow/design/system.md` |
| Audit findings | `.hyperflow/audits/<YYYY-MM-DD-HHmm>-<scope>.md` |
| Project memory | `.hyperflow/memory/<category>.md` |

**Banned locations for plans:** repo root (no `PLAN.md`, `DESIGN.md`, `TODO.md`, `ROADMAP.md`, `SPEC.md`), `docs/` (reserved for user-facing docs), ad-hoc folders.

Files start with a markdown-table status block (NOT box-drawing — alignment breaks). Then TL;DR (2-3 sentences), scope-at-a-glance, per-task lines with file paths inline.

## No AI attribution

Never reference "Claude" / "AI" / "assistant" / "LLM" as actor in commits, docs, code comments, memory entries, task files, or anywhere written by the orchestrator. Describe what changed and why — never who made it. No `Co-Authored-By: Claude` (or any LLM) in commits.

Product names used as named tools/files are fine (`claude` CLI binary, `Claude Code` platform, `CLAUDE.md` filename).

## Security blocklist

**Blocked files** — return `BLOCKED:` on access:
- `.env`, `.env.*` · `*.pem`, `*.key`, `*.crt` · `~/.ssh/*` · `~/.aws/credentials`, `~/.aws/config` · `~/.config/gcloud/*` · `~/.kube/config`

**Blocked commands** — refuse:
- `rm -rf` · `git push --force` to `main`/`master` · `sudo` · `chmod 777` · package publish (`npm publish`, `cargo publish`) unless explicitly invoked

Reviewer that detects a security violation reports `SECURITY_VIOLATION:` — halt pipeline immediately, no auto-continue.

---

> **Not in this block** (need the terminal CLI): `/hyperflow:*` slash commands, plugin skill files, session-strategy Step-0 question (one/two sessions + cross-environment handoff), operational pre-elections, background agents, sticky mode, status skill, cache skill, handoff skill, adaptive flow profiles. Run hyperflow in the terminal CLI for the full chain.

<!-- hyperflow:doctrine:end -->
