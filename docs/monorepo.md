# Monorepo isolation

Hyperflow uses the same three lanes in a monorepo, with workspace boundaries treated as dependencies.

## Before editing

- Map the affected apps, packages, shared contracts, and root gates.
- Inspect the current worktree and preserve unrelated changes.
- Use a separate clean worktree when another task already owns overlapping paths.
- Put shared types in one package rather than copying them across apps.

## Lane guidance

- **Direct:** one package, clear reversible change, no cross-package contract change.
- **Focused:** a few independent packages with one compact task file and a batch reviewer.
- **Deep:** shared-schema migrations, release-system changes, or architecture crossing package boundaries.

Run package-local checks during implementation and root-level checks before completion. Keep each distinct task in its own scoped Conventional Commit.
