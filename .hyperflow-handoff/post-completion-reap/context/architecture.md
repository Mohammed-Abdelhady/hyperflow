# Architecture

```
hyperflow/
├── skills/           # Canonical skill bodies (plan, dispatch, audit, deploy, handoff, …)
├── agents/           # Specialist charters (reviewers, investigators)
├── hooks/            # session-start, pre-compact, hooks.json
├── scripts/          # Python/shell tooling (validate, release, artefacts, usage)
├── config/           # features, schemas, defaults
├── templates/        # AGENTS.md and provider shims
├── tests/            # unittest + node tests + fixtures
├── viewer/           # Local read-only artefact viewer
├── docs/             # User-facing docs + generated HTML
└── .claude-plugin/ .codex-plugin/  # Host manifests
```

**Contract:** skills hold provider-neutral workflow semantics; thin adapters map host operations (spawn, gate, skill continue, hooks). Provider identity is a hint; live capabilities win.

**Data flow:** user intent → skill load → capability resolver → chain router → workers/reviewers → `.hyperflow` artefacts → memory + commits.
