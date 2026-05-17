# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.13.1] — 2026-05-17

### Fixed
- Remove --no-verify from queue-commit; reinforce hook + LLM-actor rules


## [4.13.0] — 2026-05-17

### Added
- Commit=per-task-deferred — queue on staging branch, flush at end


## [4.12.6] — 2026-05-17

### Changed
- S8 — lazy-load Examples sections from chain skills


## [4.12.5] — 2026-05-17

### Changed
- S4 — split DOCTRINE into core + extensions, summaries-in-place


## [4.12.4] — 2026-05-17

### Changed
- S2 per-skill plumbing — mode resolution in dispatch/scope/spec


## [4.12.3] — 2026-05-17

### Changed
- S2 foundation — central mode resolver + hook lean-mode collapse


## [4.12.2] — 2026-05-17

### Changed
- S3 + S5 worker-side contract for --lean mode
- S7 body-hash invalidation + revise --lean spec to preserve quality


## [4.12.1] — 2026-05-17

### Changed
- Trim CLAUDE.md template + introduce --lean flag (S1 + S2)


## [4.12.0] — 2026-05-17

### Added
- Auto-detect + auto-bridge on every CLI session start


## [4.11.0] — 2026-05-17

### Added
- Partial Desktop/web support via CLAUDE.md doctrine embedding


## [4.10.1] — 2026-05-17

### Changed
- Clarify hyperflow runs in CLI only, not Claude Code Desktop / web


## [4.10.0] — 2026-05-17

### Added
- Intent-detection is on by default — verbs auto-route without sticky toggle


## [4.9.0] — 2026-05-17

### Added
- Per-session auto-routing — mention 'hyperflow' once, every task routes


## [4.8.0] — 2026-05-16

### Added
- Introduce background agents — doctrine, /hyperflow:background skill


## [4.7.0] — 2026-05-16

### Added
- All planning artefacts under .hyperflow/ — banned-location list


## [4.6.1] — 2026-05-16

### Fixed
- Replace box-drawing status block with markdown table


## [4.6.0] — 2026-05-16

### Added
- Tier split — per-batch Reviewer is Sonnet, final integration is Opus


## [4.5.0] — 2026-05-16

### Added
- Unified artefact-format reference for tasks/specs/audits


## [4.4.0] — 2026-05-16

### Added
- File-first artefacts — write to .hyperflow/, gate references path


## [4.3.1] — 2026-05-16

### Changed
- Rewrite — fix broken links, sync to v4.3.0 doctrine


## [4.3.0] — 2026-05-16

### Added
- Consolidate operational clarifications upfront for true auto-mode silence

### Fixed
- No (Recommended) marker on binary yes/no action gates
- Clarification fires AFTER analysis, not before
- Clarify chain-mode controls confirmations only, not clarifications
- Forbid mid-batch usage summaries and partial-chain hand-offs in auto mode


## [4.2.0] — 2026-05-16

### Added
- Mark Step 7 hand-off as trivial-inline per section 12.1
- Prefer session-context.md as single-read entry
- Generate .hyperflow/memory/session-context.md at session start
- Add Honor the Level Cap instruction
- Classifier on Haiku 4.5 + security/integration_risk schema
- Combined audit+deploy gate + conditional integration review + L1-L2 default + 12.1 wrap-up
- Drop Step 2 coverage Reviewer + aggressive P4 + 12.1 inline
- Add section 12.1 trivial-inline + round 2 updates

### Fixed
- Tighten D7 skip + inline wrap-up dedup + question count note
- Remove dead silent brainstormDepth + replace warning icon
- Repair Step 7 hand-off skill name (execute -> dispatch)
- Tighten round 2 wording from audit findings

### Changed
- Soften round 2 latency claims to modeled estimates
- Cap session-context.md sections at 500 lines
- Sync 9 per-skill DOCTRINE.md copies from canonical
- Note round 2 latency optimization release
- Clarify session-context.md is hook-populated
- Add Round 2 levers L1-L9 to latency-patterns reference


## [4.1.1] — 2026-05-16

### Fixed
- Correct P5 example to dual-location path scheme
- Correct lean-prompt memory reference paths

### Changed
- Note reviewer-prompt path asymmetry is intentional
- Document --thorough does not affect Step 2 Searchers
- Scope P1 wording + --thorough canonical answer
- Expose --thorough in arg hint, link templates, fix typo
- Clarify batched Reviewer counts as one per batch


## [4.1.0] — 2026-05-16

### Added
- Generate .hyperflow/memory/doctrine.md at scaffold time
- Add rule 13 (latency discipline)
- Apply P2 batched per-batch reviewer
- Apply P1/P3 latency patterns
- Apply P1/P2/P3/P4 latency patterns
- Add batched reviewer prompt template (P2)
- Add lean worker prompt template (P5)
- Add non-blocking memory compaction advisory
- Add compact subcommand for memory compaction
- Add memory.compactionThreshold schema property
- Document compaction protocol in memory-system reference
- Document compaction protocol in memory-system reference
- Document compaction protocol in memory-system reference
- Document compaction protocol in memory-system reference
- Document compaction protocol in memory-system reference
- Document compaction protocol in memory-system reference
- Describe user-invoked compaction in capabilities
- Add memory-compaction protocol reference

### Fixed
- Show per-file lineCount in compaction advisory
- Clamp invalid compactionThreshold to default at runtime
- Include compact and off in cache skill purpose
- No paragraph-rationale in option labels · concrete-only signals for Deploy-gate No

### Changed
- Log session-start python errors for debuggability
- Cap .checksums entry count for defensive memory bound
- Cap memory/index.md read at 200 lines per memory-system spec
- Note latency optimization release
- Align step numbering with cache SKILL.md (8 steps)
- Add latency-patterns reference doc (P1-P5)
- Document archive sidecar in plugin-writes table
- Add compact to cache subcommand list
- Remove email address from public plugin metadata
- Bump version badge to v4.0.1


## [4.0.1] — 2026-05-16

### Fixed
- Ban invented inter-batch gates ("transparency checkpoint")


## [4.0.0] — 2026-05-16

### Added
- Marketplace-tier rewrite — references/, full body sections, A grades


## [3.1.2] — 2026-05-16

### Fixed
- Marketplace validator compliance — quote YAML, add frontmatter fields, scope Bash


## [3.1.1] — 2026-05-16

### Changed
- Sync orchestration.md + README gates to v3.x reality


## [3.1.0] — 2026-05-16

### Added
- Live in-flight progress — per-task done/pending/tokens/ETA

### Changed
- Bump version badge to v3.0.0


## [3.0.0] — 2026-05-16

### Added
- Add fix-gate — ask user to apply findings after NEEDS_FIX
- Drop Cursor, Codex, Antigravity, Gemini CLI, Copilot — Claude Code + OpenCode only

### Changed
- Bump version badge to v2.7.0


## [2.7.0] — 2026-05-16

### Added
- Make parallel dispatch provable from the usage summary
- Add /hyperflow:status read-only project snapshot skill


## [2.6.2] — 2026-05-16

### Fixed
- Tune default render settings to keep gif under 3 MB
- Handle non-integer layer indices and 11-layer count


## [2.6.1] — 2026-05-16

### Fixed
- Rule 9 expanded — no LLM as narrative subject anywhere

### Changed
- Mandate per-task commits when developing this repo


## [2.6.0] — 2026-05-16

### Added
- Per-sub-task commits + explicit audit/deploy gates at end of chain

### Changed
- Add PRIVACY.md — local-only data handling, no telemetry, security blocklist


## [2.5.1] — 2026-05-16

### Fixed
- Three stale decorative-char instances missed in the v2.0 sweep
- Match real Claude Code transcript markers (⏺ / ⎿ / Done lines)
- Match real Claude Code output style — Skill markers + batch table

### Changed
- Creative plugin description distinct from README + GitHub
- Refresh tagline — lead with advanced multi-agent + cross-session memory


## [2.5.0] — 2026-05-15

### Added
- Move spec files from docs/specs/ to .hyperflow/specs/


## [2.4.0] — 2026-05-15

### Added
- Mandate recommended option in every AskUserQuestion


## [2.3.0] — 2026-05-15

### Added
- Hard floor of 2 questions per spec run · retire silent mode


## [2.2.1] — 2026-05-15

### Fixed
- Make Step 0 chain-mode question an unskippable structural gate
- Show per-step Worker→Reviewer (rule 12), Classifier, Analyst, Planner, personas, wrap-up reviewer

### Changed
- Refresh repo descriptions for v2.2.0 chain + rule 12


## [2.2.0] — 2026-05-15

### Added
- Force multi-level agents inside every chain step (rule 12)

### Fixed
- Show interactive gates + questions + multi-level review

### Changed
- Raise demo.gif size threshold from 1.5 MB to 2 MB


## [2.1.0] — 2026-05-15

### Added
- Make 10 layers, L1-L5 review, and approval gates explicit in chain

### Changed
- Re-render demo.gif at font 10 (1.3 MB · 735×490)


## [2.0.1] — 2026-05-15

### Changed
- Refresh demo cast for v2.0.0 + drop hero from README


## [2.0.0] — 2026-05-15

### Added
- Rename slugs, drop always-on orchestrator, elegant output style


## [1.13.1] — 2026-05-15

### Fixed
- Use HTTPS URL source so install works without SSH key


## [1.13.0] — 2026-05-15

### Added
- TriageFlow — adaptive flow profiles + 15 personas

### Changed
- Document TriageFlow orchestrator for v1.11.0
- Modernize README and enforce README-on-every-push


### Added
- **Layer 0.5: Task Triage** — every user request now starts with a cheap thinking-tier classification call producing `{ types[], complexity, risk, scope, ambiguity, brainstormDepth, flow, personas[], estimatedWorkers, estimatedBatches, budget, rationale }` JSON. The output drives every downstream decision. See `skills/hyperflow/task-triage.md`.

- **6 adaptive flow profiles** — replace the rigid pipeline with profiles sized to the task: `fast` (≤30k tokens, trivial single-file edits), `standard` (≤100k, moderate work), `deep` (300k, complex/cross-cutting), `research` (≤80k, exploration), `creative` (≤150k, design-dominant), `scientific` (300k, correctness-critical with TDD). Triage picks the profile; workers can `ESCALATE:` mid-flight to upgrade. See `skills/hyperflow/flow-profiles.md`.

- **15 specialist personas** — `architect`, `frontend`, `ui`, `api`, `db`, `security`, `scientific`, `creative`, `refactor`, `bugfix`, `devops`, `docs`, `test`, `research`, `performance`. Tasks can have multiple types (e.g. user auth = `[api, db, security]`); persona blocks are stitched into worker prompts in priority order (`security` first, `creative` last). See `skills/hyperflow/personas-A.md` and `skills/hyperflow/personas-B.md`.

- **Mid-flight escalation protocol** — workers return `ESCALATE: <reason>` when a profile turns out to be wrong. Orchestrator upgrades the profile and re-dispatches with preserved context. Irreversible-risk discoveries (prod data, secrets, force pushes, schema-destructive migrations) halt for `AskUserQuestion` consent. See `skills/hyperflow/escalation.md`.

- **Token budget tracking** — every flow profile has a soft budget. Usage summary flags overruns at 1.5× (warn) and 2.0× (halt for user approval). Per-task usage now reports triage classification, brainstorm depth, flow profile, actual vs budget, escalations, and downgrades.

- **README maintenance rule** — `scripts/release.sh` now warns if `README.md` has not been modified since the last release tag, prompting contributors to keep the README in sync with shipped features. Codified in `CLAUDE.md` under a new README Maintenance section.

### Changed
- **Brainstorming is now always-on with adaptive depth.** Previously hard-gated ("when to brainstorm" / "when not to"). Now runs on every task, depth scaled to the triage `ambiguity` score (0.0–1.0): `silent` (recap only), `light` (1 question), `standard` (2-3 questions + alternatives), `deep` (full 6-dimension exploration + section-by-section approval). Some types force a minimum depth (`creative` → deep; `architect`/`security`/`scientific` → standard). See `skills/hyperflow/adaptive-brainstorming.md`.

- **Layer 3 (Orchestrator) restructured.** The rigid `research → plan → dispatch → review → integrate` pipeline is replaced by flow-profile execution. Profile-dependent rules: minimum thinking agents is now `1` for `fast`, `≥1` for `standard`, `batches + 1` for `deep` and `scientific`. Workers receive persona-typed prompts based on the triage `personas[]` field.

- **`skills/hyperflow/SKILL.md` integration.** Reduced rigid pipeline detail in favor of flow-profile references. SKILL.md stays under 500 lines per project convention; detail offloaded to the new reference files.

- **README overhaul** — rewrote for current features (8 skills, 10 orchestration layers, 5 supported providers), removed standalone hero image, added shields.io badges, condensed from 631 to 230 lines, restructured for SEO with descriptive section headings and keyword-rich opening.


## [1.12.1] — 2026-05-15

### Fixed
- Enforce dispatched reviews over inline — fix usage tracking


## [1.12.0] — 2026-05-15

### Added
- Add output-style.md visual language guide


## [1.11.1] — 2026-05-15

### Fixed
- Push only the new tag instead of all tags


## [1.11.0] — 2026-05-15

### Added
- Smart analysis — skip/partial/full decision tree

## [1.10.0] — 2026-05-15

### Added
- Feature-aware release pipeline
- Add 7 specialized skills


## [1.9.0] — 2026-05-15

### Added
- Project-scoped memory system + multi-tool auto-detection shims

### Changed
- Add comprehensive hero diagram and synthesized demo GIF


## [1.8.2] — 2026-05-15

### Fixed
- Correct duplicate Opus listing and sync VERSION file


## [1.8.1] — 2026-05-15

### Changed
- Add hero SVG illustrating orchestration flow


## [1.8.0] — 2026-05-15

### Added
- Default to Opus 4.7; expand memory feature; add transparency section


## [1.7.1] — 2026-05-15

### Fixed
- Enforce final integration review as separate step


## [1.7.0] — 2026-05-15

### Added
- Thinking model stays active — never idle during workers


## [1.6.1] — 2026-05-15

### Fixed
- Clarify thinking model owns questions, tasks, and reviews


## [1.6.0] — 2026-05-15

### Added
- Display actual version from VERSION file on start


## [1.5.0] — 2026-05-15

### Added
- Print active thinking/worker models on session start


## [1.4.4] — 2026-05-15

### Fixed
- Use resolved thinking-tier model, not hardcoded Opus


## [1.4.3] — 2026-05-15

### Fixed
- Enforce Opus as mandatory reviewer — never Sonnet


## [1.4.2] — 2026-05-15

### Changed
- Fix inconsistencies across skill reference files


## [1.4.1] — 2026-05-15

### Fixed
- Make AskUserQuestion mandatory at all phases, separate from confirmation ban


## [1.4.0] — 2026-05-15

### Added
- Research-first task creation with dynamic updates and comprehensive format


## [1.3.1] — 2026-05-15

### Fixed
- Make task file creation mandatory in orchestrator flow diagram


## [1.3.0] — 2026-05-15

### Added
- Add 5-level multi-level review system scaled by complexity


## [1.2.0] — 2026-05-15

### Added
- Add version check on session start with update notification
- Add persistent task tracking in .hyperflow/tasks/
- Auto-release on push with version bump and changelog generation
- Add Layer 0 project analysis with staleness detection
- Add automated release script, versioning, and update docs
- Add agent labels on dispatch and usage summary on completion
- Add --uninstall flag to install script and uninstall docs
- Add Codex as supported provider with o3/o4-mini defaults
- Include Claude Code in install wizard with provider detection
- Add interactive setup wizard to install script
- Add install script with auto-detect and symlink for all providers
- Add security schema and default blocklists to config
- Add security sections to worker and reviewer prompt templates
- Add Layer 9 to SKILL.md, remove security from override list
- Add security.md reference with default blocklists and config
- Make Layer 2 model routing configurable per provider
- Add model-config.md skill reference
- Add hardcoded model catalogs per provider
- Add JSON Schema for config.json validation
- Add auto-branch, auto-commit, and squash option
- Add pre-built decomposition patterns
- Persist learnings across conversations
- Add automated lint, typecheck, and test checks
- Add session startup hook for auto-pilot injection
- Add collaborative design skill
- Add core orchestrator skill with model routing

### Fixed
- Move auto-release on push to project CLAUDE.md, not user-facing skill
- Update Claude Code install to two-step marketplace flow
- Wrap script in braces + read from /dev/tty for curl|bash
- Use fd 3 for interactive reads so curl|bash works
- Change repository to string format for Claude Code validation
- Address deep review findings across all files
- Use correct claude plugin install/uninstall commands
- Correct subheading in installation security section

### Changed
- Clarify Claude Code plugin uses defaults, wizard is optional
- Add all provider install instructions to Quick Start
- Reorganize for better scannability and visual hierarchy
- Add security configuration section
- Add Layer 9 Security to layers table, How It Works, and project structure
- Add implementation plan for security layer (Layer 9)
- Add security layer (Layer 9) design spec
- Update descriptions and keywords for multi-platform positioning
- Rewrite with value props, multi-platform positioning, and updated copy
- Add implementation plan for README/docs rewrite
- Add spec for README rewrite and value prop messaging
- Add model configuration section and multi-provider support
- Rewrite for multi-provider support and resolution priority
- Add model selection and multi-provider config
- Add per-provider setup guides
- Add implementation plan for multi-provider model config
- Add multi-provider model configuration spec
- Update SKILL.md and README with layers 5-8
- Add /hyperflow activation instructions to usage section
- Add usage section with real-world examples
- Remove recommended settings from README
- Merge brainstorming into hyperflow, rename from auto-pilot
- Add README and contributing guide
- Add model routing, orchestration, and installation guides
- Initialize hyperflow plugin project


## [1.1.0] — 2026-05-15

### Added
- Advanced brainstorming framework with multi-dimensional analysis, structured question techniques, and AskUserQuestion integration
- Version bump script (`scripts/bump-version.sh`) for synchronized version updates
- Update instructions in README

## [1.0.0] — 2026-05-14

### Added
- Multi-agent orchestration with 9 layers (Autonomy, Model Routing, Orchestrator, Brainstorming, Quality Gates, Session Memory, Task Templates, Git Workflow, Security)
- Multi-provider support (Claude Code, Cursor, OpenCode, Codex, Antigravity)
- Configurable model routing with per-provider defaults and role overrides
- Interactive install script with setup wizard
- Claude Code marketplace plugin
- Agent labels and usage summary on task completion

[Unreleased]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.13.1...HEAD
[4.13.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.13.0...v4.13.1
[4.13.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.12.6...v4.13.0
[4.12.6]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.12.5...v4.12.6
[4.12.5]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.12.4...v4.12.5
[4.12.4]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.12.3...v4.12.4
[4.12.3]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.12.2...v4.12.3
[4.12.2]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.12.1...v4.12.2
[4.12.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.12.0...v4.12.1
[4.12.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.11.0...v4.12.0
[4.11.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.10.1...v4.11.0
[4.10.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.10.0...v4.10.1
[4.10.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.9.0...v4.10.0
[4.9.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.8.0...v4.9.0
[4.8.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.7.0...v4.8.0
[4.7.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.6.1...v4.7.0
[4.6.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.6.0...v4.6.1
[4.6.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.5.0...v4.6.0
[4.5.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.4.0...v4.5.0
[4.4.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.3.1...v4.4.0
[4.3.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.3.0...v4.3.1
[4.3.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.2.0...v4.3.0
[4.2.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.1.1...v4.2.0
[4.1.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.1.0...v4.1.1
[4.1.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.0.1...v4.1.0
[4.0.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.0.0...v4.0.1
[4.0.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v3.1.2...v4.0.0
[3.1.2]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v3.1.1...v3.1.2
[3.1.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v3.1.0...v3.1.1
[3.1.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v2.7.0...v3.0.0
[2.7.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v2.6.2...v2.7.0
[2.6.2]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v2.6.1...v2.6.2
[2.6.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v2.6.0...v2.6.1
[2.6.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v2.5.1...v2.6.0
[2.5.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v2.5.0...v2.5.1
[2.5.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v2.4.0...v2.5.0
[2.4.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v2.2.1...v2.3.0
[2.2.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.13.1...v2.0.0
[1.13.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.13.0...v1.13.1
[1.13.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.12.1...v1.13.0
[1.12.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.12.0...v1.12.1
[1.12.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.11.1...v1.12.0
[1.11.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.11.0...v1.11.1
[1.11.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.8.2...v1.9.0
[1.8.2]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.8.1...v1.8.2
[1.8.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.8.0...v1.8.1
[1.8.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.7.1...v1.8.0
[1.7.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.6.1...v1.7.0
[1.6.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.4.4...v1.5.0
[1.4.4]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.4.3...v1.4.4
[1.4.3]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.4.2...v1.4.3
[1.4.2]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Mohammed-Abdelhady/hyperflow/releases/tag/v1.2.0
[1.1.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Mohammed-Abdelhady/hyperflow/releases/tag/v1.0.0
