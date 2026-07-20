# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.22.0] — 2026-07-20

### Added
- Market bar, vs-superpowers, decision-card plan wiring

### Changed
- Refresh AGENTS.md doctrine stamp for v5.21.0


## [5.21.0] — 2026-07-20

### Added
- Monorepo template, decision cards, privacy one-pager, handoff test

### Changed
- Refresh AGENTS.md doctrine stamp for v5.20.0


## [5.20.0] — 2026-07-20

### Added
- Memory hygiene scan and specialist priority stack

### Changed
- Refresh AGENTS.md doctrine stamp for v5.19.0


## [5.19.0] — 2026-07-20

### Added
- Add eval harness and host parity smoke

### Changed
- Refresh AGENTS.md doctrine stamp for v5.18.0


## [5.18.0] — 2026-07-20

### Changed
- Golden path, progressive disclosure, proof pack, and roadmap


## [5.17.1] — 2026-07-19

### Fixed
- Auto-open renders plan markdown when no JSON artefact exists


### Fixed
- Plan-completion auto-open now works for plans that only produced classic markdown (the common case — the plan skill writes markdown, not always a JSON artefact): when no `.hyperflow/artefacts/<type>/<slug>.json` exists, it renders the plan's `specs/<slug>.md` / `tasks/<slug>.md` (with any Mermaid graphs) to a self-contained HTML via the new `scripts/render-md.py` and opens that. Model-independent and works for already-created plans.

## [5.17.0] — 2026-07-18

### Added
- Opt-in auto-update on every Claude Code session start


### Added
- Installer opt-in: auto-update hyperflow on every Claude Code session start — sets the marketplace `autoUpdate` flag plus a background, fail-silent `SessionStart` hook that refreshes the repo clone and marketplace cache (off by default; idempotent; skipped in non-interactive installs)

## [5.16.1] — 2026-07-18

### Fixed
- Auto-open falls back to task/feature when a plan has no spec


## [5.16.0] — 2026-07-18

### Added
- Auto-open the plan HTML at Step 12 when viewer.autoOpen
- Add plan-completion auto-open engine
- Invoke reap at dispatch deploy and handoff termini
- Register reap across hosts and README
- Add reap skill and phase contract
- Add scope-aware reap engine
- Archive brief dirs, JSON twins, and --slug mode
- Add schema-validated cleanup block
- Require Codex certification before tagging
- Machine-readable automatic network and write contract
- Complete runtime-contract wiring for entry skills
- Wire portable runtime-contract into skill bodies
- Render specialist charters for Codex
- Make Codex lifecycle and AGENTS updates safe
- Define portable workflow operations
- Enforce Codex plugin contracts
- Add provider capability resolution
- Auto-scaffold on first use, elevate permissions setup, gh auth preflight
- Add reference-drift detector (advisory; distinguishes drift from tailored subsets)
- Self-contained read-only artefact export (zero upload, offline)
- Artefact index route + searchable home screen (real artefacts)
- Telemetry/ROI dashboard — stat tiles + sparkline usage view
- Add usage-aggregate.py cross-chain ledger rollup
- Wire onNode->brief, measured edge anchors, viewer.markdown=always; drop dead tokens.json
- Accessibility — skip-link, scoped live region, graph roles, flip state, route focus
- Live dispatch progress via poll+re-render, stops at terminal
- Reproduce artefact-format.md faithfully (status metrics, diagram, cost, briefs)
- Widen payload contract (cost/progress/briefs) + add usage type

### Fixed
- Gate dry-run archive plan by feature completion to match live
- Atomic log truncation, anchored terminal detection, arg-parse and rmtree hardening
- Run targeted mode regardless of auto and guard incomplete feature
- Archive in-process and abort GC on archive failure
- Make durable-memory prune non-destructive and opt-in
- Clear shellcheck SC2120 and tighten Codex claim honesty
- Harden cert evidence, transcript reads, and audit-fix docs
- Read Codex aliases from hook-runtime after launcher split
- Align TYPES with artefact_lib (include usage)
- HTML-escape artefact title in export to prevent XSS
- Keyboard-activate graph nodes, usage view coherence, poll leak guard + SR announce

### Changed
- Document plan-completion auto-open toggle
- Mark post-completion-reap reviewed
- Align memory guarantee with opt-in dropOrphanRefs behavior
- Cover compaction advisory, index rebuild, idempotency, config modes
- Correct post-completion-reap Diff range
- Finalize post-completion-reap Evidence head
- Build complete post-completion-reap
- Document reap config and verify end-to-end
- Define reap as terminal cleanup phase
- Plan post-completion-reap for second-session build
- Include AGENTS.md doctrine refresh for v5.15.0
- V5.15.0
- Sync certified support surfaces
- Gate Codex claims on certification
- Publish certified support and privacy matrix
- Separate App and app-server certification
- Add CLI workflow conformance
- Add isolated plugin lifecycle conformance
- Enforce shared-reference portability
- Migrate shared workflow references
- Migrate shared orchestration prompts
- Normalize PR and diagnosis references
- Normalize execution references
- Normalize cache deploy scaffold references
- Normalize shared runtime references
- Normalize canonical orchestration references
- Normalize provider lifecycle handling
- Freeze existing provider behavior
- Rewrite product story around memory, rules, and templates
- Split rarely-loaded detail out of DOCTRINE.md
- Proof link to real reviewed PRs + prepared official-registry submission checklist
- Unify landing hero to the issue→PR line + add visual-artefacts viewer section
- Barycenter crossing-minimization + drag-to-pan for large graphs
- Extract graph-core.js + node unit tests for parser/layout
- Cover migrate-cache version ordering, no-op, migration, idempotency, no-clobber
- Cover archive-artefacts promotion, dedup idempotency, prune


### Added
- Plan-completion auto-open of the static, self-contained plan HTML (`.hyperflow/exports/spec-<slug>.html`, both Mermaid graphs inlined) as a pre-gate review template, gated on `viewer.autoOpen` (default off); headless prints the export path
- Post-completion reap — slug-scoped archive-first cleanup at dispatch wrap-up, deploy end, and handoff complete (gated on `cleanup.reapOnComplete`), plus `/hyperflow:reap <slug>`
- `cleanup` config block fully schema-validated: `auto`, `staleDays`, `pruneDays`, `reapOnComplete`, `usageRetentionDays`, `logMaxLines`, `dryRun`, `dropOrphanRefs`
- Ephemeral retention for unbounded `usage/*.jsonl` ledgers and `.session-start.log` truncation; durable memory optimized in place — an auto-reap drops no durable entry (index rebuild + compaction advisory only). Entry pruning is opt-in (`cleanup.dropOrphanRefs`, default off) and quarantines orphaned entries to `memory/archive/YYYY-MM.md`, never hard-deleting

### Changed
- Document the full `cleanup.*` block and reap lifecycle in orchestration docs
- Lifecycle wrap-up disposes finished artefact scopes via `scripts/reap.py` instead of ad-hoc task-file deletes

## [5.15.0] — 2026-07-18

### Added
- Require Codex certification before tagging
- Machine-readable automatic network and write contract
- Complete runtime-contract wiring for entry skills
- Wire portable runtime-contract into skill bodies
- Render specialist charters for Codex
- Make Codex lifecycle and AGENTS updates safe
- Define portable workflow operations
- Enforce Codex plugin contracts
- Add provider capability resolution
- Auto-scaffold on first use, elevate permissions setup, gh auth preflight
- Add reference-drift detector (advisory; distinguishes drift from tailored subsets)
- Self-contained read-only artefact export (zero upload, offline)
- Artefact index route + searchable home screen (real artefacts)
- Telemetry/ROI dashboard — stat tiles + sparkline usage view
- Add usage-aggregate.py cross-chain ledger rollup
- Wire onNode->brief, measured edge anchors, viewer.markdown=always; drop dead tokens.json
- Accessibility — skip-link, scoped live region, graph roles, flip state, route focus
- Live dispatch progress via poll+re-render, stops at terminal
- Reproduce artefact-format.md faithfully (status metrics, diagram, cost, briefs)
- Widen payload contract (cost/progress/briefs) + add usage type

### Fixed
- Clear shellcheck SC2120 and tighten Codex claim honesty
- Harden cert evidence, transcript reads, and audit-fix docs
- Read Codex aliases from hook-runtime after launcher split
- Align TYPES with artefact_lib (include usage)
- HTML-escape artefact title in export to prevent XSS
- Keyboard-activate graph nodes, usage view coherence, poll leak guard + SR announce

### Changed
- Sync certified support surfaces
- Gate Codex claims on certification
- Publish certified support and privacy matrix
- Separate App and app-server certification
- Add CLI workflow conformance
- Add isolated plugin lifecycle conformance
- Enforce shared-reference portability
- Migrate shared workflow references
- Migrate shared orchestration prompts
- Normalize PR and diagnosis references
- Normalize execution references
- Normalize cache deploy scaffold references
- Normalize shared runtime references
- Normalize canonical orchestration references
- Normalize provider lifecycle handling
- Freeze existing provider behavior
- Rewrite product story around memory, rules, and templates
- Split rarely-loaded detail out of DOCTRINE.md
- Proof link to real reviewed PRs + prepared official-registry submission checklist
- Unify landing hero to the issue→PR line + add visual-artefacts viewer section
- Barycenter crossing-minimization + drag-to-pan for large graphs
- Extract graph-core.js + node unit tests for parser/layout
- Cover migrate-cache version ordering, no-op, migration, idempotency, no-clobber
- Cover archive-artefacts promotion, dedup idempotency, prune

## [5.14.0] — 2026-07-17

### Added
- Add viewer-mode artefact emit contract (artefact-data.md)
- Let hyperflow view target a handoff package's artefacts dir
- Add hyperflow view server bound to 127.0.0.1
- Add self-contained local artefact viewer with SVG graph rendering
- Add viewer config block (default on, reversible classic mode)
- Add render-artefact.py to rehydrate markdown from JSON
- Add artefact writer with stdlib schema validation
- Add compact JSON artefact envelope schema + samples

### Fixed
- Show memory entry task line; give status dots a default color
- Lead rehydrated markdown with the H1 title; make --all resilient
- Resolve any artefact type for hyperflow view; disable directory listing
- Correct mermaid edge labels, dependency-aware batch edges, empty-graph guard
- Sanitize slugs, bound file reads, harden validation per review

### Changed
- Add visual-artefacts viewer screenshots
- Copy artefacts JSON during handoff rehydration
- Document the local visual artefact viewer (README, features.json, orchestration)
- Carry compact JSON artefacts through the two-session handoff
- Reference the viewer-mode contract from artefact skills
- Branch core references between classic and viewer mode
- Cover bind address, port fallback, and path-traversal clamping
- Cover writer round-trip, schema rejection, and rehydration


## [5.13.0] — 2026-07-16

### Added
- Persist token efficiency metrics

### Changed
- Document token-efficient orchestration
- Enforce token-efficient execution
- Make lean mode the true default


## [5.12.0] — 2026-07-16

### Added
- Ask PR on every build; require screenshots for UI/mobile

### Fixed
- Clarify three end-of-chain gates in git-workflow


## [5.11.0] — 2026-07-14

### Added
- Port tiered gates to antigravity and Evidence examples
- Tiered gates — light per-batch, full suite at Step 3.5
- Mirror tiered policy into dispatch and deploy references
- Define size-aware light/standard/full quality tiers

### Fixed
- Require Evidence block after dispatch builds

### Changed
- Align Layer 5 and flow-profiles with tiered policy


## [5.10.0] — 2026-07-14

### Added
- Surface Evidence on status and review
- Persist full Evidence in COMPLETION.md
- Print Evidence before Usage at terminal wrap-up
- Mirror Evidence contract in local output-style
- Require structured Evidence block before Usage
- Generate the portable subset from DOCTRINE.md
- Automate downstream-dependents verification

### Fixed
- Derive the memory index so stored learnings actually load
- Reject bare doctrine markers in portable section bodies
- Reject schema keywords the validator does not enforce
- Compare doctrine blocks by content, not version label
- Register all sixteen skills and align provider registry at six hosts
- Unpack full block tuple on doctrine refresh

### Changed
- Align Evidence vs Usage wording across skill mirrors
- V5.9.0
- Note that release.sh stages its artifacts whole
- Drop dead assignments from the README staleness check
- Re-stamp the dogfood doctrine block and automate its refresh


## [5.9.0] — 2026-07-12

### Added
- Generate the portable subset from DOCTRINE.md
- Automate downstream-dependents verification

### Fixed
- Derive the memory index so stored learnings actually load
- Reject bare doctrine markers in portable section bodies
- Reject schema keywords the validator does not enforce
- Compare doctrine blocks by content, not version label
- Register all sixteen skills and align provider registry at six hosts
- Unpack full block tuple on doctrine refresh

### Changed
- Note that release.sh stages its artifacts whole
- Drop dead assignments from the README staleness check
- Re-stamp the dogfood doctrine block and automate its refresh


## [5.8.0] — 2026-07-10

### Added
- Validate docs-site version and skill-count drift
- Sync site version, JSON-LD, and sitemap on bump
- Dark premium redesign of landing, installation, orchestration pages
- Add og-image generation, demo video, and SEO infrastructure

### Fixed
- Orchestration-led hero headline
- WCAG-clean dim text and zero-CLS font fallbacks

### Changed
- Tone pass on installation and orchestration guides
- Align feature taglines and specialist registry
- Replace run-on manifest descriptions with canonical copy
- Rewrite README as a benefit-led overview


## [5.7.0] — 2026-07-10

### Added
- PR exit gate + gh pre-elections for GitHub-native chains
- L1-L5 review chain for incoming pull requests
- GitHub issue → reviewed PR chain

### Fixed
- Apply final-integration review findings
- Keep the README shields version badge in sync on bump

### Changed
- GitHub-native chain section, demo scene, manifest re-lead


## [5.6.0] — 2026-07-10

### Added
- Register Grok in features and portable gate wording
- Add Grok project shims
- Add Grok portable workflow adapter
- Portable Grok runtime adapter
- Detect Grok and link full skills tree

### Changed
- Document Grok as a supported Hyperflow host
- List Grok among setup-detection tools
- Add release checklist with downstream-dependents registry


### Added
- First-class Grok CLI / Grok Build support — install detects `~/.grok`, links full `skills/*` tree, portable doctrine + workflow adapter, setup-detection shims (`AGENTS.md` + `.grok/rules/`)

## [5.5.0] — 2026-07-10

### Added
- Complete skill frontmatter — allowed-tools, metadata, agent-native trigger line

### Fixed
- Close allowed-tools gaps — grant every tool each skill's own flow directs


## [5.4.1] — 2026-07-05

### Added
- Emit hyperflow-role marker on dispatched sub-agent prompts


## [5.4.0] — 2026-06-21

### Added
- Stop at a build-location gate, never auto-implement


## [5.3.1] — 2026-06-20

### Fixed
- De-tier the model wizard and add Cursor provider

### Changed
- Repoint deleted-skill references to the merged plan chain
- Purge removed model-tier language


## [5.3.0] — 2026-06-20

### Added
- Author full per-sub-task implementation briefs for cheap-model dispatch


## [5.2.0] — 2026-06-20

### Added
- Add Cursor as a first-class host

### Fixed
- Refresh Antigravity host templates to the merged skill set


## [5.1.0] — 2026-06-20

### Added
- Upgrade mobile-reviewer into hybrid mobile specialist
- Add universal agent consultation protocol (hybrid broker)

### Changed
- Document the agent consultation protocol


## [5.0.0] — 2026-06-20

### Added
- Add animation specialist agent
- Add design specialist + /hyperflow:design skill
- Add architect specialist and use it in plan's design phase
- Merge amplify + spec + scope into one plan skill

### Changed
- Repoint marketing site to the merged plan chain


## [4.31.2] — 2026-06-20

### Changed
- Reword plugin descriptions to role/session-model language
- Drop model-routing/providers, reframe site around session model
- Run every agent on the session model, drop tier routing
- Drop model-tier providers block, keep security/handoff/specialists


## [4.31.1] — 2026-06-19

### Fixed
- Drop invalid agents dir-string from Claude Code manifest


## [4.31.0] — 2026-06-19

### Added
- Sync two-session handoff into antigravity, codex, and opencode artefacts
- Add handoff transport settings
- Accept a git diff-range target for handoff review
- Surface pending two-session handoffs at session start
- Add /hyperflow:handoff operator skill
- Ask phase-by-phase vs all-phases for multi-phase features
- Pick up handoff package and write build-complete marker
- Write committed handoff package on two-session split
- Replace chain-mode auto/manual with one/two-session gate
- Add session-handoff reference and package contract
- Auto-migrate old .hyperflow cache forward on session start
- Surface and archive multi-phase features
- Execute multi-phase feature folders phase by phase
- Decompose multi-phase features into encapsulated phase folders
- Add feature/phase folder structure for multi-phase work
- Add database-optimization-reviewer for query and index performance
- Register specialists, Brain, and web-research defaults
- Add algorithm-reviewer for Big-O complexity and data-structure analysis
- Wire debugger and security specialist agents
- Dispatch domain specialist reviewers
- Assign responsible specialists per section and sub-task
- Name responsible specialists in the rationale
- Add specialists[] field and types-to-specialists mapping
- Add Brain dispatch and sub-agent fan-out rules
- Add specialist agent folder and Brain router
- Add web-research-first protocol reference

### Fixed
- Update remaining chain-mode references to session in audit and feature-phases

### Changed
- Repoint bundled DOCTRINE links to canonical, drop drifted copies
- V4.30.0
- Document two-session handoff and /hyperflow:handoff
- V4.29.0
- Document the feature/phase task structure
- V4.28.0
- V4.27.0
- Document the specialist registry and Brain
- State specialist tiers provider-neutrally (thinking/worker)


## [4.30.0] — 2026-06-19

### Added
- Sync two-session handoff into antigravity, codex, and opencode artefacts
- Add handoff transport settings
- Accept a git diff-range target for handoff review
- Surface pending two-session handoffs at session start
- Add /hyperflow:handoff operator skill
- Ask phase-by-phase vs all-phases for multi-phase features
- Pick up handoff package and write build-complete marker
- Write committed handoff package on two-session split
- Replace chain-mode auto/manual with one/two-session gate
- Add session-handoff reference and package contract

### Fixed
- Update remaining chain-mode references to session in audit and feature-phases

### Changed
- Document two-session handoff and /hyperflow:handoff


## [4.29.0] — 2026-06-19

### Added
- Auto-migrate old .hyperflow cache forward on session start
- Surface and archive multi-phase features
- Execute multi-phase feature folders phase by phase
- Decompose multi-phase features into encapsulated phase folders
- Add feature/phase folder structure for multi-phase work

### Changed
- Document the feature/phase task structure


## [4.28.0] — 2026-06-19

### Added
- Add database-optimization-reviewer for query and index performance


## [4.27.0] — 2026-06-19

### Added
- Register specialists, Brain, and web-research defaults
- Add algorithm-reviewer for Big-O complexity and data-structure analysis
- Wire debugger and security specialist agents
- Dispatch domain specialist reviewers
- Assign responsible specialists per section and sub-task
- Name responsible specialists in the rationale
- Add specialists[] field and types-to-specialists mapping
- Add Brain dispatch and sub-agent fan-out rules
- Add specialist agent folder and Brain router
- Add web-research-first protocol reference
- Add portable workflow adapters
- Add dynamic workflow routing
- Default Claude thinking to Opus 4.8
- Add codex app and cli support
- Token-economy directive for workers and reviewers
- On-completion archive + proactive-compact doctrine
- Auto-archive stale artefacts and promote learnings to memory
- Preserve chain state across context compaction
- Prompt to update when a newer version is available
- Single-agent skill + workflow templates
- Add brutalist HTML doc pages + link them from the landing

### Fixed
- Gate automatic compact at dispatch end
- Gate automatic compaction by context usage
- Resolve hyperflow hook paths across hosts
- Use relative hook commands
- Route hyperflow aliases and subagents
- Correct dispatch escalation link
- Preserve hyperflow question gates
- Bump codex plugin manifest
- Hero install command actually installs
- Write all detected providers to config.json
- Keep the hero chain-hint on one line on desktop
- Wrap footer links on mobile
- Two-line install on mobile, no x-scroll, tier-bracket hero
- Mobile overflow, accessibility, and SEO
- Detect and install hyperflow into antigravity

### Changed
- Document the specialist registry and Brain
- State specialist tiers provider-neutrally (thinking/worker)
- V4.26.2
- V4.26.1
- V4.26.0
- V4.25.0
- V4.24.4
- V4.24.3
- Add codex agent instructions
- V4.24.2
- V4.24.1
- V4.24.0
- V4.23.0
- V4.22.0
- Full installer-written config + compaction recovery
- Show the whole system — review loop, sub-phases, cross-session memory
- Start the flow from amplify across website, README, and docs
- Correct skills path and add changelog entry
- Expand from minimal to a full overview
- Embed portable doctrine subset for non-CLI surfaces
- V4.21.0
- Sharpen positioning to lead with what's unique
- Enrich memory diagram with session flow + auto-written files
- Refresh plugin + marketplace descriptions to current state
- Frame amplify + operational utilities in the skills section
- Recolor diagrams to light brutalist + enrich chain/review flow
- Extract brutalist styles into shared stylesheet
- Redraw hero.svg generator in the brutalist style system


## [4.26.2] — 2026-06-06

### Fixed
- Gate automatic compact at dispatch end


## [4.26.1] — 2026-05-29

### Fixed
- Gate automatic compaction by context usage


## [4.26.0] — 2026-05-29

### Added
- Add portable workflow adapters
- Add dynamic workflow routing


## [4.25.0] — 2026-05-28

### Added
- Default Claude thinking to Opus 4.8


## [4.24.4] — 2026-05-28

### Fixed
- Resolve hyperflow hook paths across hosts


## [4.24.3] — 2026-05-27

### Fixed
- Use relative hook commands

### Changed
- Add codex agent instructions


## [4.24.2] — 2026-05-26

### Fixed
- Route hyperflow aliases and subagents


## [4.24.1] — 2026-05-26

### Fixed
- Correct dispatch escalation link


## [4.24.0] — 2026-05-26

### Added
- Token-economy directive for workers and reviewers

### Fixed
- Preserve hyperflow question gates


## [4.23.0] — 2026-05-26

### Added
- Add codex app and cli support
- On-completion archive + proactive-compact doctrine
- Auto-archive stale artefacts and promote learnings to memory

### Fixed
- Bump codex plugin manifest
- Hero install command actually installs


## [4.22.0] — 2026-05-26

### Added
- Preserve chain state across context compaction
- Prompt to update when a newer version is available
- Single-agent skill + workflow templates

### Fixed
- Write all detected providers to config.json
- Keep the hero chain-hint on one line on desktop
- Wrap footer links on mobile
- Two-line install on mobile, no x-scroll, tier-bracket hero
- Mobile overflow, accessibility, and SEO
- Detect and install hyperflow into antigravity

### Changed
- Full installer-written config + compaction recovery
- Show the whole system — review loop, sub-phases, cross-session memory
- Start the flow from amplify across website, README, and docs
- Correct skills path and add changelog entry
- Expand from minimal to a full overview


### Fixed
- Antigravity install was advertised but never wired: `install.sh` only targeted Claude Code and OpenCode, and the documented skills path (`~/.gemini/antigravity/skills/`) was wrong. The installer now detects Antigravity at the live `~/.gemini/config/skills/` (legacy fallback `~/.antigravity/skills/`) and links a single-agent-adapted skill set.

### Added
- Single-agent-adapted Antigravity skill + workflow templates under `templates/antigravity/` (12 skills incl. `hyperflow-amplify`, and the matching `.agent/workflows/hyperflow*` slash commands). Adapts the multi-agent doctrine to Antigravity's single-agent runtime (no sub-agent dispatch, no tier split — self-review before per-task commits).
- `setup-detection.sh --tools antigravity` writes the `/hyperflow*` slash commands into a project's `.agent/workflows/` (and AGENTS.md).

## [4.21.0] — 2026-05-24

### Added
- Add brutalist HTML doc pages + link them from the landing

### Changed
- Sharpen positioning to lead with what's unique
- Enrich memory diagram with session flow + auto-written files
- Refresh plugin + marketplace descriptions to current state
- Frame amplify + operational utilities in the skills section
- Recolor diagrams to light brutalist + enrich chain/review flow
- Extract brutalist styles into shared stylesheet
- Redraw hero.svg generator in the brutalist style system
- Redesign to brutalist/technical style system
- Rebuild as a system schematic — layers, agents, sub-phases


## [4.20.1] — 2026-05-23

### Fixed
- Hand off to spec, not scaffold
- Route handoff through scaffold → spec for the brainstorm flow

### Changed
- Trim to a minimal landing — depth moves to docs + site


## [4.20.0] — 2026-05-23

### Added
- Add /hyperflow:amplify — domain-aware prompt enhancement
- De-genericize type + add seven feature sections

### Changed
- Redesign chain diagram as a clean tier-bracketed schematic


## [4.19.0] — 2026-05-23

### Added
- Add GitHub Pages landing site
- Tighten scenario to full chain + re-theme to dracula

### Changed
- Restyle the four guides to editorial minimalism
- Restyle to editorial minimalism + lead with hero.svg
- Rebuild hero.svg as an editorial dark card


## [4.18.0] — 2026-05-23

### Added
- Add Antigravity runtime provider with Gemini 3 Pro / 3.5 Flash

### Fixed
- Correct Antigravity config path, models, and install mechanism from real docs


## [4.17.0] — 2026-05-23

### Added
- Add retry/escalate/abort observability to failure-recovery policy
- Apply 5 logic improvements across all 6 chain skills
- Add rule 14 (failure recovery) + rule 15 (triage validation) + sub-phase × flag clarifications
- Add rule 12.2 — sub-phase decomposition with mandatory per-sub-phase Reviewer

### Fixed
- Address second-pass integration review findings
- Address Opus integration review findings
- Refuse to bump version when commits since last tag are docs/chore-only

### Changed
- Document sub-phases, triage validation, failure recovery, and new memory files
- Register anti-patterns.md (hot) and project-decisions.md (spec-tier) in memory-system catalog
- Update inside-a-chain diagram to show sub-phase fan-out
- Apply DOCTRINE 12.2 sub-phase decomposition across all 6 chain skills
- Trim verbose comments and section dividers from validator + CI workflow
- Correct install instructions — official marketplace CLI not live yet


## [4.16.3] — 2026-05-23

### Changed
- Surface official Anthropic marketplace listing as primary install path


## [4.16.2] — 2026-05-17

### Changed
- Clarify task-level vs Claude Code session-level background agents


## [4.16.1] — 2026-05-17

### Fixed
- Test cases must reflect real domain logic + real edges, not formulaic placeholders


## [4.16.0] — 2026-05-17

### Added
- Test cases promoted from optional to mandatory in every Worker brief


## [4.15.0] — 2026-05-17

### Added
- Team-Lead-to-Worker detail floor — mandatory sections in every dispatch


## [4.14.0] — 2026-05-17

### Added
- Thinking Lead splits oversized tasks — pre-dispatch + mid-flight escape hatch


## [4.13.3] — 2026-05-17

### Changed
- Formalize Team Lead model — orchestrator coordinates, Thinking Lead decides


## [4.13.2] — 2026-05-17

### Fixed
- Move operational pre-elections to Step 0.5 — ask right after chain-mode


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

[Unreleased]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.22.0...HEAD
[5.22.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.21.0...v5.22.0
[5.21.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.20.0...v5.21.0
[5.20.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.19.0...v5.20.0
[5.19.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.18.0...v5.19.0
[5.18.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.17.1...v5.18.0
[5.17.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.17.0...v5.17.1
[5.17.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.16.1...v5.17.0
[5.16.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.16.0...v5.16.1
[5.16.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.14.0...v5.16.0
[5.15.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.14.0...v5.15.0
[5.14.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.13.0...v5.14.0
[5.13.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.12.0...v5.13.0
[5.12.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.11.0...v5.12.0
[5.11.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.10.0...v5.11.0
[5.10.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.8.0...v5.10.0
[5.9.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.8.0...v5.9.0
[5.8.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.7.0...v5.8.0
[5.7.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.6.0...v5.7.0
[5.6.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.5.0...v5.6.0
[5.5.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.4.1...v5.5.0
[5.4.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.4.0...v5.4.1
[5.4.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.3.1...v5.4.0
[5.3.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.3.0...v5.3.1
[5.3.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.2.0...v5.3.0
[5.2.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.1.0...v5.2.0
[5.1.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v5.0.0...v5.1.0
[5.0.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.31.2...v5.0.0
[4.31.2]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.31.1...v4.31.2
[4.31.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.31.0...v4.31.1
[4.31.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.26.2...v4.31.0
[4.30.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.29.0...v4.30.0
[4.29.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.28.0...v4.29.0
[4.28.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.27.0...v4.28.0
[4.27.0]: https://github.com/Mohammed-Abdelhady/hyperflow/releases/tag/v4.27.0
[4.26.2]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.26.1...v4.26.2
[4.26.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.26.0...v4.26.1
[4.26.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.25.0...v4.26.0
[4.25.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.24.4...v4.25.0
[4.24.4]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.24.3...v4.24.4
[4.24.3]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.24.2...v4.24.3
[4.24.2]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.24.1...v4.24.2
[4.24.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.24.0...v4.24.1
[4.24.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.23.0...v4.24.0
[4.23.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.22.0...v4.23.0
[4.22.0]: https://github.com/Mohammed-Abdelhady/hyperflow/releases/tag/v4.22.0
[4.21.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.20.1...v4.21.0
[4.20.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.20.0...v4.20.1
[4.20.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.19.0...v4.20.0
[4.19.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.18.0...v4.19.0
[4.18.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.17.0...v4.18.0
[4.17.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.16.3...v4.17.0
[4.16.3]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.16.2...v4.16.3
[4.16.2]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.16.1...v4.16.2
[4.16.1]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.16.0...v4.16.1
[4.16.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.15.0...v4.16.0
[4.15.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.14.0...v4.15.0
[4.14.0]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.13.3...v4.14.0
[4.13.3]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.13.2...v4.13.3
[4.13.2]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v4.13.1...v4.13.2
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
