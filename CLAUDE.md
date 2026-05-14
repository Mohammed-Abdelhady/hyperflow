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

## Git Push Flow

When pushing, always run `./scripts/release.sh` first:
1. Auto-detects bump type from conventional commits (feat→minor, fix→patch, BREAKING→major)
2. Generates CHANGELOG entries
3. Bumps version in all manifests (package.json, plugin.json, marketplace.json, README)
4. Commits `chore(release): vX.Y.Z` and creates annotated tag
5. Then push with `git push && git push --tags`

If release.sh says "Nothing to release", skip and push directly.
