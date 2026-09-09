# Maintainer log

## 2026-09-09 — v6.6.3

- v6.6.3; PR #60; shipped `--link-only` partial-checkout guard; next: local-remote failure probes.

## 2026-09-07 — v6.6.2

- Version: v6.6.2; PR: #58/#59.
- Shipped: `--link-only` skips native installs.
- Next: local-remote failure probes.

## 2026-09-05 — v6.6.1

- Version: v6.6.1
- PR: #57 — https://github.com/Mohammed-Abdelhady/hyperflow/pull/57
- Shipped: source-managed installs now accept the standard exact `ssh://git@github.com/Mohammed-Abdelhady/hyperflow` origin form while continuing to reject unrelated repositories.
- Next candidate: exercise more local-remote update failures and host capability gaps in the install/release reliability train.

## 2026-09-03 — v6.6.0

- Version: v6.6.0
- PR: #56 — https://github.com/Mohammed-Abdelhady/hyperflow/pull/56
- Shipped: monorepo plans now record affected roots, shared contracts, package-local/root gates, and out-of-scope paths; dispatch checks changed paths before committing, with a boundary eval.
- Validation: local and PR validation passed; 23 Node tests, 7/7 evals, shell syntax, patch hygiene, main validation, Pages deployment, and tag release certification passed.
- Release: https://github.com/Mohammed-Abdelhady/hyperflow/releases/tag/v6.6.0
- Compatibility: Codex preview remains uncertified; no Codex certificate was claimed.
- Next candidate: install and release reliability around local-remote failures and host capability gaps.

## 2026-09-01 — v6.5.0

- Version: v6.5.0
- PR: #55 — https://github.com/Mohammed-Abdelhady/hyperflow/pull/55
- Shipped: `plan --remember` adds bounded source-linked planning decision cards; docs and a golden eval protect the contract.
- Next candidate: monorepo workspace-boundary verification.
