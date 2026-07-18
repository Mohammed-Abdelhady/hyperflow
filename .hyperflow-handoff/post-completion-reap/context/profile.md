# Profile

| Field | Value |
|---|---|
| Name | hyperflow |
| Kind | Multi-agent orchestration plugin (Claude Code, Codex, OpenCode, Grok, Antigravity, Cursor) |
| Language | Python 3 (scripts/tests), shell (hooks/install), Markdown (skills/agents), vanilla JS (viewer) |
| Package version | 5.14.0 (`package.json`) |
| Test | `python3 -m unittest discover tests -v` · `node --test tests/*.test.js` |
| Validate | `./scripts/validate-plugin.py` |
| Lint shell | `shellcheck -S warning hooks/* scripts/*.sh` |
| Release | `./scripts/release.sh` / `./scripts/bump-version.sh` |
| Config | `config/features.json`, `config/defaults.json`, `config/schema.json` |
| Artefacts | `.hyperflow/` (gitignored) · committed handoffs `.hyperflow-handoff/` |
