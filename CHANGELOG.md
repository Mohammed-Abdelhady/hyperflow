# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/Mohammed-Abdelhady/hyperflow/compare/v1.10.0...HEAD
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
