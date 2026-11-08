# Hyperflow

**A local workflow planner and execution runner for coding agents.** Hyperflow keeps plans readable, validates static workflows, delegates bounded tasks through an available provider adapter, and records durable execution state locally.

[![version v6.10.1](https://img.shields.io/badge/version-v6.10.1-blueviolet?style=flat-square)](CHANGELOG.md)
[![validation](https://img.shields.io/github/actions/workflow/status/Mohammed-Abdelhady/hyperflow/plugin-validation.yml?style=flat-square&label=validation)](https://github.com/Mohammed-Abdelhady/hyperflow/actions)
[![MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

## Four public skills

| Skill | Responsibility |
|---|---|
| `/hyperflow-plan` | Inspect, ask consequential questions, record answers, and compile a workflow. It stops before execution. |
| `/hyperflow-smash` | Execute an approved workflow through isolated tasks, independent review, scoped repair, and verification. Status, graph, stop, resume, sessions, rename, and messages are subcommands. |
| `/hyperflow-crash` | Review a pinned pull request or Git range in fresh read-only sessions. |
| `/hyperflow-agents-skill` | Inspect or update validated primary, general, and lightweight model roles. |

Smash runs unattended with full-access writing delegates, automatic checks and repairs, and read-only reviewers. It records blockers and continues independent tasks without asking questions.

The skills invoke `node <plugin-root>/runtime/cli.mjs`. Installation does not execute a workflow or modify provider credentials. No daemon or cloud service is required.

## Models

Default profiles are preferences: native Codex `gpt-6.1-sol` for primary, `zai/glm-5.3` for general, and `zai/glm-5.3-flash` for lightweight. Each role can select an available delegate harness and model. Hyperflow resolves preferences against actual configuration before dispatch and never changes the active host coordinator. Effort is assigned per task during planning and shown in the workflow.

## Local state

Readable plans and approved knowledge stay in Markdown under `.hyperflow/`. The local runtime store keeps execution leases, attempts, run IDs, stop generations, messages, and evidence references. Existing `.hyperflow` data, credentials, shared skills, and foreign host registrations are preserved during installation and migration.

The workflow file is a static JSON-compatible declaration parsed without evaluating JavaScript. Tasks declare dependencies, read/write ownership, acceptance criteria, registered checks, and resource needs. A workflow digest binds execution authority to the reviewed plan.

## Install

Use the native plugin installation flow for the host you use. The source installer links skills into detected Claude Code, Codex, Antigravity, Cursor, OpenCode, and Pi skill directories. It registers four native command files only for OpenCode and preserves unrelated config:

```bash
./install.sh
```

Installation never runs plans or contacts model providers. Use `node <plugin-root>/runtime/cli.mjs setup-delegates` only when you explicitly want the pinned upstream relay. See [installation](docs/installation.md) and [getting started](docs/getting-started.md).

## Host compatibility

Host command discovery and runtime execution are separate checks. This repository does not treat a manifest, skill directory, or static validation as host certification. See [host compatibility evidence](docs/installation.md#host-compatibility-evidence).

## Documentation

- [Orchestration contract](docs/orchestration.md)
- [Privacy](PRIVACY.md)
- [Releasing](RELEASING.md)
- [Changelog](CHANGELOG.md)

## License

Copyright (c) 2026 Mohammed Abdelhady. Released under the [MIT License](LICENSE).
