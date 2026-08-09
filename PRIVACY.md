# Hyperflow privacy

Hyperflow is a local-first, Markdown-only plugin with no plugin-owned cloud service.

## Automatic activity

There is none.

At session start Hyperflow launches no subprocess, makes no network request, and writes no project or home-directory file. It does not automatically check for updates, migrate data, rebuild indexes, archive files, compact memory, open a browser, or bridge host instructions.

## User-invoked activity

Hyperflow acts only while handling an explicit request. Depending on that request and the capabilities exposed by the host, it may:

- read repository files needed to inspect the requested scope;
- write Markdown under `.hyperflow/` or `.hyperflow-handoff/`;
- edit application files inside the requested scope;
- run local verification commands;
- invoke the host's child-agent tools for Focused or Deep work;
- use Git for status, diff, commits, handoff refs, release checks, and an explicitly approved push;
- access a user-provided issue, pull request, documentation page, or research source when the task requires it.

Network requests made by the host, model provider, Git client, package manager, browser, or another user-invoked tool remain governed by those products. Hyperflow does not proxy or record their traffic.

## Local files

Current Hyperflow persistence is human-readable Markdown:

| Path | Purpose |
|---|---|
| `.hyperflow/tasks/*.md` | Compact work plans and progress |
| `.hyperflow/specs/*.md` | Approved design or architecture decisions |
| `.hyperflow/audits/*.md` | Review findings |
| `.hyperflow/memory/*.md` | Project-scoped learnings and decisions |
| `.hyperflow-handoff/<slug>/` | Cross-session task pointer, status, and Git refs |

Existing user `.hyperflow` data is never deleted or rewritten by installation.

<!-- hyperflow:legacy-migration:start -->
> **Migration warning:** removal of the old viewer does not authorize deletion of user data. Before a major-version upgrade, inspect `.hyperflow/artefacts/**/*.json`, archived JSON under `.hyperflow/archive/**`, and legacy `.hyperflow-handoff/**` copies. Copy JSON-only information into the matching Markdown task, spec, audit, or memory file and retain a backup until it has been checked.
<!-- hyperflow:legacy-migration:end -->

## Sensitive files and destructive commands

The portable doctrine blocks direct access to common secret locations, including `.env*`, private keys, SSH material, cloud credentials, and Kubernetes configuration. It also blocks destructive operations such as broad recursive deletion, force-pushing the default branch, `sudo`, world-writable permissions, and unsolicited package publication.

No prompt-level rule can replace operating-system permissions, repository protections, provider controls, or review of the final diff. Use least-privilege credentials and keep branch protection enabled.

## Data retention and deletion

Hyperflow has no remote account and retains no plugin-owned server data. Local Markdown remains until the user edits or deletes it. Git-tracked handoff packages remain in repository history according to the repository's own retention policy.

## Verification scope

Claude Code is the primary plugin surface. Codex and OpenCode support are compatibility paths with separately verified capabilities. A successful install or one working host surface does not prove another surface, background execution, or lifecycle support.

Questions or reports: [GitHub issues](https://github.com/Mohammed-Abdelhady/hyperflow/issues).
