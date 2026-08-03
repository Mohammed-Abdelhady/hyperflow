#!/usr/bin/env python3
"""Detect dirty-worktree scope collisions and create isolated worktrees.

The helper is deliberately conservative: ``check`` never mutates git and
reports whether a task can safely run in the current checkout. ``create``
only asks git to add a new worktree from an explicit base ref; it never resets,
cleans, or changes the caller's checkout.

Usage:
  python3 scripts/worktree-guard.py check [PROJECT_ROOT] [--paths PATH ...]
  python3 scripts/worktree-guard.py create [PROJECT_ROOT] --path PATH [--base REF]
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Sequence


PROTECTED_BRANCHES = frozenset({"main", "master", "develop"})
BRANCH_RE = re.compile(r"^[A-Za-z0-9._/-]+$")


def _git(root: Path, *args: str, check: bool = True) -> str:
    proc = subprocess.run(
        ["git", *args],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )
    if check and proc.returncode != 0:
        detail = (proc.stderr or proc.stdout).strip()
        raise RuntimeError(detail or f"git {' '.join(args)} failed")
    return proc.stdout


def find_root(project_root: Path) -> Path:
    candidate = project_root.expanduser().resolve()
    if not candidate.exists() or not candidate.is_dir():
        raise RuntimeError(f"project root is not a directory: {project_root}")
    try:
        return Path(_git(candidate, "rev-parse", "--show-toplevel").strip()).resolve()
    except RuntimeError as exc:
        raise RuntimeError(f"not a git worktree: {candidate}") from exc


def _relative_path(root: Path, raw: str) -> str:
    value = Path(raw).expanduser()
    absolute = value.resolve() if value.is_absolute() else (root / value).resolve()
    try:
        rel = absolute.relative_to(root)
    except ValueError as exc:
        raise RuntimeError(f"path escapes project root: {raw}") from exc
    if rel == Path("."):
        return "."
    return rel.as_posix()


def dirty_paths(root: Path) -> list[str]:
    # NUL-delimited output preserves spaces and unusual filenames. Rename
    # records contain old and new paths; report both so overlap is conservative.
    raw = _git(root, "status", "--porcelain=v1", "--untracked-files=all", "-z")
    parts = raw.split("\0")
    paths: list[str] = []
    for index, item in enumerate(parts):
        if not item:
            continue
        path = item[3:] if len(item) >= 3 else item
        if " -> " in path:
            old, new = path.split(" -> ", 1)
            paths.extend((old, new))
            continue
        paths.append(path)
    return sorted(set(paths))


def _overlaps(left: str, right: str) -> bool:
    if left == "." or right == ".":
        return True
    return left == right or left.startswith(right + "/") or right.startswith(left + "/")


def _scopes(paths: Sequence[str]) -> list[str]:
    scopes: set[str] = set()
    for path in paths:
        parts = Path(path).parts
        if len(parts) >= 2 and parts[0] in {"apps", "packages"}:
            scopes.add(f"{parts[0]}/{parts[1]}")
        elif path != ".":
            scopes.add("root")
    return sorted(scopes) or ["root"]


def check(root: Path, requested: Sequence[str]) -> dict[str, object]:
    branch = _git(root, "branch", "--show-current").strip() or "(detached)"
    dirty = dirty_paths(root)
    requested_paths = [_relative_path(root, path) for path in requested]
    overlap = [
        path
        for path in dirty
        if any(_overlaps(path, requested_path) for requested_path in requested_paths)
    ]
    protected = branch in PROTECTED_BRANCHES
    clean = not dirty
    if clean:
        recommendation = "in-place"
        reason = "worktree is clean"
    elif protected and overlap:
        recommendation = "isolated-worktree"
        reason = "protected branch has dirty paths overlapping the requested scope"
    elif protected:
        recommendation = "isolated-worktree"
        reason = "protected branch is dirty; keep new work out of this checkout"
    elif overlap:
        recommendation = "isolated-worktree"
        reason = "dirty paths overlap the requested scope"
    else:
        recommendation = "isolated-worktree"
        reason = "worktree has unrelated dirty paths; isolate to keep the task reviewable"
    return {
        "root": str(root),
        "branch": branch,
        "protected_branch": protected,
        "clean": clean,
        "dirty_paths": dirty,
        "requested_paths": requested_paths,
        "overlap_paths": overlap,
        "scopes": _scopes(requested_paths or dirty),
        "safe_for_in_place": clean,
        "recommendation": recommendation,
        "reason": reason,
    }


def _emit(value: object, as_json: bool) -> None:
    if as_json:
        print(json.dumps(value, indent=2, sort_keys=True))
        return
    if isinstance(value, dict) and "recommendation" in value:
        print(f"Worktree: {value['recommendation']} · {value['reason']}")
        print(f"Branch: {value['branch']} · scopes: {', '.join(value['scopes'])}")
        dirty = value["dirty_paths"]
        if dirty:
            print("Dirty paths: " + ", ".join(dirty))
        if value["overlap_paths"]:
            print("Scope collisions: " + ", ".join(value["overlap_paths"]))
    else:
        print(json.dumps(value, indent=2, sort_keys=True))


def create(root: Path, destination: str, base: str, branch: str | None) -> dict[str, str]:
    target = Path(destination).expanduser().resolve()
    if target == root or root in target.parents:
        raise RuntimeError("worktree path must be outside the project checkout")
    if target.exists():
        raise RuntimeError(f"worktree path already exists: {target}")
    if not target.parent.exists():
        raise RuntimeError(f"worktree parent does not exist: {target.parent}")
    if branch:
        if not BRANCH_RE.fullmatch(branch) or ".." in branch.split("/"):
            raise RuntimeError(f"invalid worktree branch name: {branch}")
        if branch in PROTECTED_BRANCHES:
            raise RuntimeError("refusing to create a protected branch")
        args = ("worktree", "add", "-b", branch, str(target), base)
    else:
        args = ("worktree", "add", "--detach", str(target), base)
    _git(root, *args)
    return {
        "root": str(root),
        "path": str(target),
        "base": base,
        "branch": branch or "(detached)",
        "status": "created",
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    check_parser = sub.add_parser("check", help="inspect dirty paths without mutating git")
    check_parser.add_argument("project_root", nargs="?", default=".")
    check_parser.add_argument("--paths", nargs="*", default=[], help="task-owned paths")
    check_parser.add_argument("--json", action="store_true")
    check_parser.add_argument("--strict", action="store_true", help="exit 1 when not safe in place")

    create_parser = sub.add_parser("create", help="create a new worktree from a base ref")
    create_parser.add_argument("project_root", nargs="?", default=".")
    create_parser.add_argument("--path", required=True, help="new worktree path outside the checkout")
    create_parser.add_argument("--base", default="origin/main")
    create_parser.add_argument("--branch")
    create_parser.add_argument("--json", action="store_true")

    args = parser.parse_args(argv)
    try:
        root = find_root(Path(args.project_root))
        if args.command == "check":
            result = check(root, args.paths)
            _emit(result, args.json)
            return 0 if not args.strict or bool(result["safe_for_in_place"]) else 1
        result = create(root, args.path, args.base, args.branch)
        _emit(result, args.json)
        return 0
    except (OSError, RuntimeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
