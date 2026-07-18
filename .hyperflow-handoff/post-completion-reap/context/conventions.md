# Conventions

- Conventional Commits; no AI attribution; never `--no-verify` / force-push main.
- Skills: YAML frontmatter + markdown; semantic ops not hard-coded host tool names when portability matters.
- Tests: `python3 -m unittest`; fixtures under `tests/fixtures/`.
- Config JSON is schema-versioned and deterministic.
- Security blocklist: `.env*`, keys, cloud creds — return `BLOCKED:`.
- Per-sub-task commit cadence in dispatch; Evidence before Usage at chain end.
- Modern Standard Arabic only when writing Arabic; RTL uses directional prefixes.
