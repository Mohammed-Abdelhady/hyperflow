# Project Analysis

On first `/hyperflow` session in a project, analyze the entire codebase and generate a profile in `.hyperflow/`. On subsequent sessions, check for staleness and refresh only sections affected by changed config files.

## Session Start Flow

```
User runs /hyperflow
    |
[Opus] Version check — compare installed vs latest GitHub tag
    |   If newer: print update notification
    |
[Opus] Does .hyperflow/ exist in project root?
    |
    |-- NO  → Full analysis (dispatch parallel searcher agents)
    |         → Ask 2-3 clarifying questions if ambiguous (via AskUserQuestion)
    |         → Generate all analysis files
    |         → Create .checksums
    |         → Add .hyperflow/ to .gitignore if not already there
    |
    |-- YES → Load .checksums, compute current hashes
    |         |-- STALE → Identify affected files, refresh only those
    |         |-- FRESH → Skip analysis, load cached files
    |
[Opus] Check .hyperflow/tasks/ for incomplete tasks from previous sessions
    |   If found: present summary, ask continue or start fresh
    |
[Opus] Session ready — analysis context available for worker injection
```

## Analysis Files

```
.hyperflow/
├── tasks/              # Active task tracking (auto-cleaned)
├── profile.md          # Project identity + tech stack
├── architecture.md     # Folder structure + component relationships
├── conventions.md      # Naming, patterns, code style
├── dependencies.md     # Key deps + how they're used
├── testing.md          # Test framework, patterns, commands
├── git-workflow.md     # Branch strategy, CI/CD, PR conventions
└── .checksums          # SHA256 of config files for staleness detection
```

### profile.md
Discover: project name (from package.json, Cargo.toml, pyproject.toml), language and runtime version, framework (React, Next.js, Express, Django, etc.), build commands (dev, build, start, lint), entry points, environment setup notes, monorepo structure if applicable.

### architecture.md
Discover: top-level folder map with purpose of each directory, architectural pattern (layered, feature-based, MVC, hexagonal), data flow (frontend: state → UI; backend: request → handler → DB), state management approach, routing structure, API layer pattern (REST, GraphQL, tRPC), key abstractions and base classes.

### conventions.md
Discover from linter configs, editorconfig, and existing code: file naming (kebab-case, PascalCase), variable/function naming (camelCase, snake_case), component patterns (functional only? HOCs?), import ordering, error handling patterns, logging patterns, code style rules from ESLint/Prettier/Biome config.

### dependencies.md
Discover architecturally significant choices only — not a full dependency list:
- UI library (Shadcn, MUI, Chakra) + how it's used
- State management (Redux, Zustand, Context)
- Data fetching (React Query, SWR, fetch, axios)
- Database + ORM (Prisma, Drizzle, TypeORM)
- Auth solution
- Validation library (Zod, Yup, Joi)
- Key utilities (lodash, date-fns)

### testing.md
Discover: test runner (Jest, Vitest, pytest), assertion library, component testing (RTL, Testing Library), E2E framework (Playwright, Cypress, Detox), mocking approach (MSW, jest.mock), test file patterns (co-located, `__tests__/`, `*.test.*`, `*.spec.*`), coverage setup and thresholds, test commands.

### git-workflow.md
Discover: default/main branch name, branch naming conventions (from recent branches), commit message conventions (from recent commits — conventional commits?), CI/CD pipeline (GitHub Actions, GitLab CI) and stages, deploy targets/environments, PR template from `.github/PULL_REQUEST_TEMPLATE.md`, release process.

## Staleness Detection

### .checksums format

```
# Hyperflow project analysis checksums
# Generated: 2026-05-15T14:30:00Z
package.json=sha256:a1b2c3d4e5f6...
tsconfig.json=sha256:a1b2c3d4e5f6...
eslint.config.js=sha256:a1b2c3d4e5f6...
```

### Config files to track (check whichever exist)

- `package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
- `tsconfig.json`, `jsconfig.json`
- `eslint.config.*`, `.eslintrc*`, `biome.json`, `.prettierrc*`
- `vite.config.*`, `next.config.*`, `webpack.config.*`
- `Dockerfile`, `docker-compose.yml`
- `.github/workflows/*`, `.gitlab-ci.yml`
- `pyproject.toml`, `Cargo.toml`, `go.mod`, `composer.json`

### Staleness → refresh mapping

| Changed file | Refresh |
|---|---|
| package.json, lock file | profile.md, dependencies.md, testing.md |
| tsconfig, eslint/prettier/biome config | conventions.md |
| vite/next/webpack config | profile.md, architecture.md |
| Dockerfile, CI configs | git-workflow.md |
| Major folder additions/removals | architecture.md |

## Worker Prompt Injection

When dispatching workers, inject only relevant analysis under `## Project Context`. Keep injected content under 50 lines per worker — condense to relevant parts, not the full file.

| Worker role | Inject |
|---|---|
| Implementer | conventions.md + architecture.md + relevant from dependencies.md |
| Writer (tests) | testing.md + conventions.md |
| Writer (docs) | profile.md + architecture.md |
| Searcher | architecture.md |
| Reviewer | All files (full context for quality review) |

## Clarifying Questions

During first analysis, if ambiguity is detected, ask via AskUserQuestion after initial file scanning — not before.

**Trigger conditions:**
- Multiple conflicting configs (e.g., both Jest and Vitest present)
- No clear entry point
- Unclear primary language (e.g., both Python and JS in project)
- No CI/CD config found
- Multiple apps in a monorepo — which is primary?

**Rules:** Max 2-3 questions total. Skip if everything is unambiguous from config files. Use multiple-choice options where possible.

## .gitignore Integration

On first analysis, check if `.hyperflow/` is in `.gitignore`. If not, append:

```
# Hyperflow project analysis (machine-specific)
.hyperflow/
```

If no `.gitignore` exists, create one with just this entry.
