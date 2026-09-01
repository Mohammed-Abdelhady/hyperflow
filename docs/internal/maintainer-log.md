# Maintainer log

## 2026-09-01 — v6.5.0

- Version: v6.5.0
- PR: #55 — https://github.com/Mohammed-Abdelhady/hyperflow/pull/55
- Shipped: added explicit `plan <request> --remember` support for bounded, source-linked approved planning decision cards; kept decisions separate from task/spec detail and inert startup; added duplicate and 20-entry bound rules, documentation, roadmap alignment, and a decision-memory golden eval.
- Validation: local plugin validation, 22 Node tests, 7/7 evals, shell syntax, patch hygiene, PR checks, main push validation, and release certification passed.
- Release: https://github.com/Mohammed-Abdelhady/hyperflow/releases/tag/v6.5.0
- Compatibility note: Codex preview remains uncertified; no Codex certificate was claimed.
- Next candidate: improve workspace-boundary guidance and verification for monorepo changes crossing apps, packages, and shared contracts.

## 2026-08-28 — v6.4.0

- Version: v6.4.0
- PR: #51 — https://github.com/Mohammed-Abdelhady/hyperflow/pull/51; #52 — https://github.com/Mohammed-Abdelhady/hyperflow/pull/52; #53 — https://github.com/Mohammed-Abdelhady/hyperflow/pull/53
- Shipped: formalized case-sensitive handoff metadata and the exact Markdown task pointer, added a reviewed handoff round-trip eval for resolvable Git base/head refs, and synchronized Changelog comparison links during version stamping.
- Validation: local plugin validation, 20 Node tests, 5/5 evals, shell syntax, patch hygiene, all three PR checks, main push validation, and release certification passed.
- Release: https://github.com/Mohammed-Abdelhady/hyperflow/releases/tag/v6.4.0
- Compatibility note: Codex preview remains uncertified; no Codex certificate was claimed.
- Next candidate: carry accepted review outcomes into the next session through bounded Markdown memory without copying full investigation transcripts.

## 2026-08-26 — v6.3.0

- Version: v6.3.0
- PR: #50 — https://github.com/Mohammed-Abdelhady/hyperflow/pull/50
- Shipped: added `author: Mohammed Abdelhady` to all seven specialist agent frontmatter blocks for marketplace interoperability, with validator and unit-test coverage tied to `package.json` author metadata.
- Validation: local `validate-plugin`, 19 Node tests, 4/4 evals, shell syntax, patch hygiene, PR checks, main push validation, and release certification all passed.
- Release: https://github.com/Mohammed-Abdelhady/hyperflow/releases/tag/v6.3.0
- Compatibility note: Codex preview remains uncertified; no Codex certificate was claimed.
- Next candidate: add a bounded handoff round-trip eval for the Markdown task pointer and Git base/head refs.

## 2026-08-24 — v6.2.5

- Version: v6.2.5
- PR: #48 — https://github.com/Mohammed-Abdelhady/hyperflow/pull/48
- Shipped: restored `docs/roadmap.md` as the current lightweight-core source for bounded train selection, replaced stale pre-v6 references with the shipped v6.0-v6.2 trains and evidence-based next candidates, added a roadmap golden eval, and published the page in the sitemap.
- Validation: PR validation, main push validation, Pages deployment, and release certification all passed; local `validate-plugin`, 18 Node tests, 4/4 evals, shell syntax, and patch hygiene passed.
- Release: https://github.com/Mohammed-Abdelhady/hyperflow/releases/tag/v6.2.5
- Compatibility note: Codex preview remains uncertified; no Codex certificate was claimed.
- Next candidate: add a bounded handoff round-trip eval for the Markdown task pointer and Git base/head refs.

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
