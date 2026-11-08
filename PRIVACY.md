# Hyperflow privacy

Hyperflow has no plugin-owned cloud service or daemon. Human plans and approved project knowledge use local Markdown. A local SQLite runtime store records execution state when the user starts a workflow.

## Automatic activity

Session start performs no Hyperflow subprocess, network request, migration, provider call, or project write. Installation registers plugin and command files only; it does not execute workflows or modify provider credentials. Downloading the optional pinned delegate relay is a separate explicit setup action.

## User-invoked activity

When requested, Hyperflow may read scoped repository files, write plans or execution state under `.hyperflow/`, create Git worktrees, invoke configured provider adapters, run approved checks, and create evidence references. Providers and host tools have their own network and data-retention policies. Hyperflow does not proxy or record their traffic.

## Local data

Markdown plans and decisions remain until the user edits or removes them. The runtime store contains run IDs, task state, claims, attempts, messages, and evidence references. Existing `.hyperflow` data is preserved during migration. Credentials and other tools' shared skills are outside the installer's ownership.

## Sensitive files and permissions

Instructions block access to `.env*`, private keys, certificates, SSH material, cloud credentials, and Kubernetes configuration. Use least-privilege provider credentials and host permissions. Hyperflow does not manufacture OS, provider, or delegated permissions.

## Host evidence

A manifest or successful installation does not prove that command discovery, model resolution, execution, stop/resume, or independent review works on a host. Report only capabilities tested on the actual host and version.

Questions or reports: [GitHub issues](https://github.com/Mohammed-Abdelhady/hyperflow/issues).
