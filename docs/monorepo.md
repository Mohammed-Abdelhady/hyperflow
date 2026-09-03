# Monorepo isolation

Hyperflow uses the same three lanes in a monorepo, with workspace boundaries treated as dependencies.

## Before editing

- Map affected apps, packages, shared contracts, package-local gates, and root gates.
- Inspect the worktree and preserve unrelated changes; use a separate clean worktree when paths overlap another task.
- Put shared types in one package rather than copying them across apps.

## Workspace boundary record

Every plan that crosses an app, package, or shared contract records the boundary before implementation. Use this exact table in the task file:

| Field | Value |
|---|---|
| Affected roots | `apps/web`, `packages/contracts` |
| Shared contracts | `packages/contracts/src/index.ts` or `not applicable` |
| Package-local gates | `npm test --workspace apps/web`; `npm test --workspace packages/contracts` |
| Root gates | `npm run lint`; `npm run typecheck` |
| Out of scope | `apps/admin` and unrelated packages |

`Affected roots` and `Out of scope` are repository-relative. Name every shared contract and gate explicitly; use `not applicable` only when the inspected workspace has no such item. Before committing, compare `git diff --name-only` with the affected roots and explicit root configuration files. Out-of-bound changes are a failed scope check, not an invitation to widen the task.

## Lane guidance

- **Direct:** one package, clear reversible change, no cross-package contract change.
- **Focused:** a few independent packages with one compact task file and a boundary record.
- **Deep:** shared-schema migrations, release-system changes, or architecture crossing package boundaries.

Run each listed package-local gate during implementation and each root gate before completion. Keep each distinct task in its own scoped Conventional Commit.
