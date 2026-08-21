# Maintainer log

## 2026-08-21 — v6.2.4

- Version: v6.2.4
- PR: #47 — https://github.com/Mohammed-Abdelhady/hyperflow/pull/47
- Shipped: validation and release workflows now use the current Node 24-based checkout/setup-node action majors instead of Node 20-based majors; a unit regression guard prevents the deprecated action majors from returning.
- Validation: local `validate-plugin`, 18 Node tests, 3/3 evals, shell syntax, PR checks, main push validation, Pages deployment, and release certification all passed. The repo-owned workflows are warning-free; GitHub's managed Pages workflow still reports `actions/upload-artifact@v4` being forced from Node 20 to Node 24.
- Release: https://github.com/Mohammed-Abdelhady/hyperflow/releases/tag/v6.2.4
- Compatibility note: Codex preview remains uncertified; no Codex certificate was claimed.
- Next candidate: restore `docs/roadmap.md` as the durable source for future train selection; it is currently absent from the lightweight-core tree and must remain out of README marketing.

## 2026-08-17 — v6.2.3

- Version: v6.2.3
- PR: #46 — https://github.com/Mohammed-Abdelhady/hyperflow/pull/46
- Shipped: source-managed installer updates now inspect the fetched package and all seven skill entrypoints before fast-forwarding, preserving the existing checkout when the remote tree is incomplete; raw origin URL validation remains compatible with local Git URL rewrites; local-remote coverage now exercises fetch failures, successful updates, and rejected incomplete trees.
- Validation: `validate-plugin`, 17 Node tests, 3/3 evals, shell syntax, PR checks, main push validation, and release certification all passed.
- Release: https://github.com/Mohammed-Abdelhady/hyperflow/releases/tag/v6.2.3
- Compatibility note: Codex preview remains uncertified; no Codex certificate was claimed.
- Next candidate: refresh the GitHub Actions runtime targets to remove the Node.js 20 deprecation warning observed on the green validation and release runs.

## 2026-08-15 — v6.2.2

- Version: v6.2.2
- PR: #44 — https://github.com/Mohammed-Abdelhady/hyperflow/pull/44; release-hardening follow-up #45 — https://github.com/Mohammed-Abdelhady/hyperflow/pull/45
- Shipped: source-managed installer now refuses dirty or diverged checkouts and reports fetch, package-version, and fast-forward failures without updating checked-out files; documentation and regression coverage were added.
- Validation: `validate-plugin`, 16 Node tests, 3/3 evals, shell syntax, PR checks, release certification, and Pages deployment all passed.
- Release: https://github.com/Mohammed-Abdelhady/hyperflow/releases/tag/v6.2.2
- Compatibility note: Codex preview remains uncertified; no Codex certificate was claimed.
- Next candidate: add a local-remote installer fixture covering successful fast-forward updates and mocked fetch failures.

## 2026-08-13 — v6.2.1

- Version: v6.2.1
- PR: #43 — https://github.com/Mohammed-Abdelhady/hyperflow/pull/43
- Shipped: source-managed installer now accepts Git worktree checkouts (`.git` file), with end-to-end `--link-only` regression coverage.
- Validation: `validate-plugin`, 16 Node tests, 3/3 evals, shell syntax, release certification all passed.
- Release: https://github.com/Mohammed-Abdelhady/hyperflow/releases/tag/v6.2.1
- Compatibility note: Codex preview remains uncertified; no Codex certificate was claimed.
- Next candidate: improve installer update safety around dirty worktrees and fetch/merge failures.
