# Handoff: post-completion-reap

## Manifest

| Field | Value |
|---|---|
| Slug | `post-completion-reap` |
| Status | `planned` |
| Artefact type | flat task (8 sub-tasks · 4 batches) |
| Artefact path | `artefact/tasks/post-completion-reap.md` (+ `artefact/tasks/post-completion-reap/T1–T8.md`) |
| Spec | `artefact/specs/post-completion-reap.md` |
| Chain args | `post-completion-reap briefs=auto mode=flat` |
| on_complete | **Return for review** — stop after build; session 1 runs `/hyperflow:audit` on the diff |
| Originating commit | `9c55d65` (`feat/portable-runtime-ops`) |
| Specialists | `architect, backend-reviewer, devops-reviewer, security-reviewer, docs` |

## Goal

Add a scope-aware **reap** phase that garbage-collects a finished task's entire artefact scope — task file, brief dir, viewer JSON twin, draft specs, feature tree, and ephemeral session leftovers — **archive-first** and **memory-preserving**, firing automatically at every lifecycle terminus (dispatch wrap-up, deploy end, handoff `complete`) and available as `/hyperflow:reap <slug>`, then reporting exactly what it removed.

## Locked decisions (do not re-litigate)

1. **Archive-first** — meaningful artefacts move to `.hyperflow/archive/` (learnings promoted to durable memory first). Only ephemeral junk (stale `usage/*.jsonl`, oversized `.session-start.log`, terminal background buffers, empty commit-queue) is hard-deleted.
2. **Auto at every lifecycle end + manual command** — dispatch Step 4, deploy Step 7, handoff `complete`, plus `/hyperflow:reap <slug>`. Gated on `cleanup.reapOnComplete`.
3. **Memory preserved** — durable `learnings/decisions/patterns/conventions/anti-patterns/project-decisions` are NEVER deleted. Reap only rebuilds `index.md`, refreshes `session-context.md`, drops orphaned refs, and compacts oversized files.

## How to build (session 2)

1. Read `artefact/specs/post-completion-reap.md` (design + disposition policy + Mermaid) and `artefact/tasks/post-completion-reap.md` (batched roster).
2. Copy the artefact back into the live cache if needed: `.hyperflow/tasks/post-completion-reap.md` + `.hyperflow/tasks/post-completion-reap/` + `.hyperflow/specs/post-completion-reap.md`.
3. Run `/hyperflow:dispatch post-completion-reap briefs=auto mode=flat`.
4. Each sub-task brief (`T1–T8.md`) is self-contained: Task · Why · Scope · Files+exact change · Acceptance · Test cases (+E2E) · Related context (file:line) · Gotchas.
5. **Build order:** B1 {T1,T2} parallel → B2 {T3} → B3 {T4,T5,T6} → B4 {T7,T8}.
6. **Security gate is mandatory** on T2/T3/T6 (the deletion paths): slug `^[a-z0-9-]+$`, every path asserted under `.hyperflow/`, archive-before-delete, `--dry-run` honored, idempotent.
7. On completion: **STOP** (do not deploy). Write `COMPLETION.md`, set `STATUS=built`, and return to session 1 for `/hyperflow:audit`.

## Safety notes

- Verify on a COPY/fixture — never reap the repo's real in-flight tasks (`full-codex-support`, `visual-artefacts`, `pi-first-class-support`) during testing.
- `.hyperflow/` is gitignored; `.hyperflow-handoff/` is tracked (this package).
- No force-push, no push to a protected branch, no `--no-verify`.

## Context snapshot

`context/` carries the originating session's `conventions.md`, `profile.md`, `architecture.md`, and `memory-index.md` so session 2 builds with the same project understanding.
