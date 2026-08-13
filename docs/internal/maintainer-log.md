# Maintainer log

## 2026-08-13 — v6.2.1

- Version: v6.2.1
- PR: #43 — https://github.com/Mohammed-Abdelhady/hyperflow/pull/43
- Shipped: source-managed installer now accepts Git worktree checkouts (`.git` file), with end-to-end `--link-only` regression coverage.
- Validation: `validate-plugin`, 16 Node tests, 3/3 evals, shell syntax, release certification all passed.
- Release: https://github.com/Mohammed-Abdelhady/hyperflow/releases/tag/v6.2.1
- Compatibility note: Codex preview remains uncertified; no Codex certificate was claimed.
- Next candidate: improve installer update safety around dirty worktrees and fetch/merge failures.
