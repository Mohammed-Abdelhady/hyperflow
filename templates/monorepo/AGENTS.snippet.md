# Monorepo agent notes (Hyperflow template)

Paste or merge into project `AGENTS.md` / `.hyperflow` conventions.

## Layout assumptions

- pnpm or yarn workspaces + turbo (or nx)
- Apps under `apps/*`, libraries under `packages/*`
- Root gates: format, lint, typecheck, test, secrets scan

## Hard rules

1. **Never mix dirty feature worktrees.** Start API/backend work from a clean `main` worktree, not a mobile-only dirty tree.
2. **Scope commits by package** when possible (`feat(api):`, `feat(mobile):`).
3. **Do not reimplement local device DB as server DB.** Device SQLite stays device; server is Postgres.
4. **Run root gates before claiming done** — package-local green is not enough.
5. **Shared contracts** live in a workspace package (Zod) imported by clients; do not duplicate shapes.

## Suggested Hyperflow tags

- `api` | `mobile` | `web` | `infra` for specialist-priority.json subsets

## First commands

```text
/hyperflow:scaffold
/hyperflow:plan
```
