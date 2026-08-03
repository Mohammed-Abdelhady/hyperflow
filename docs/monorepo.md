# Monorepo worktree isolation

Monorepos make a dirty checkout ambiguous: a backend task can accidentally inherit mobile edits, and a review can no longer distinguish task-owned changes from unrelated work. Hyperflow now ships a deterministic guard that reports the collision before dispatch and can create a clean worktree without resetting the caller's checkout.

## Inspect before dispatch

```bash
python3 <plugin-root>/scripts/worktree-guard.py check <project-root> \
  --paths apps/api packages/contracts --json
```

The read-only report includes:

- current branch and whether it is protected (`main`, `master`, or `develop`);
- every dirty path, including untracked files;
- dirty paths that overlap the requested task scope;
- inferred package scopes (`apps/<name>` / `packages/<name>`);
- `safe_for_in_place` and a conservative `recommendation`.

A clean checkout is safe for in-place work. Any dirty checkout recommends isolation, including a protected branch with only unrelated edits. Use `--strict` when the caller must stop unless the checkout is clean:

```bash
python3 <plugin-root>/scripts/worktree-guard.py check . \
  --paths apps/api --strict
```

The command never edits files, stages changes, resets the checkout, or removes worktrees.

## Create an isolated worktree

Create from an explicit base ref and keep the destination outside the current checkout:

```bash
python3 <plugin-root>/scripts/worktree-guard.py create <project-root> \
  --base origin/main \
  --branch feat/api-contracts \
  --path ../hyperflow-api-contracts \
  --json
```

The helper refuses existing destinations, protected branch names, invalid branch names, and paths inside the source checkout. It runs only `git worktree add`; the caller's branch, index, and dirty files remain untouched. Remove the worktree through normal Git lifecycle commands after the task is complete:

```bash
git worktree remove ../hyperflow-api-contracts
```

For a detached review checkout, omit `--branch`. When `origin/main` is unavailable, pass the exact local base ref explicitly (for example, `--base HEAD`).

## Dispatch contract

Before the first worker in a monorepo task, run `check` against the task file's allowlist. A scope collision or any dirty protected checkout selects an isolated worktree; it does not absorb unrelated changes into the task. Reviewers still receive the exact task-owned diff from the isolated checkout.
