"""Tests for the deterministic monorepo worktree guard."""
from __future__ import annotations

import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "worktree-guard.py"
spec = importlib.util.spec_from_file_location("worktree_guard", SCRIPT)
assert spec and spec.loader
worktree_guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worktree_guard)


def git(root: Path, *args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=root, text=True).strip()


class TestWorktreeGuard(unittest.TestCase):
    def make_repo(self) -> Path:
        root = Path(tempfile.mkdtemp())
        subprocess.run(["git", "init", "-b", "main"], cwd=root, check=True, capture_output=True)
        subprocess.run(["git", "config", "user.email", "test@example.invalid"], cwd=root, check=True)
        subprocess.run(["git", "config", "user.name", "Test"], cwd=root, check=True)
        (root / "apps" / "api").mkdir(parents=True)
        (root / "apps" / "web").mkdir(parents=True)
        (root / "apps" / "api" / "README.md").write_text("api\n", encoding="utf-8")
        (root / "apps" / "web" / "README.md").write_text("web\n", encoding="utf-8")
        subprocess.run(["git", "add", "."], cwd=root, check=True)
        subprocess.run(["git", "commit", "-m", "chore: seed fixture"], cwd=root, check=True, capture_output=True)
        return root

    def test_clean_checkout_is_safe_in_place(self) -> None:
        root = self.make_repo()
        result = worktree_guard.check(root, ["apps/api"])
        self.assertTrue(result["clean"])
        self.assertTrue(result["safe_for_in_place"])
        self.assertEqual(result["recommendation"], "in-place")
        self.assertEqual(result["scopes"], ["apps/api"])

    def test_dirty_scope_collision_is_reported(self) -> None:
        root = self.make_repo()
        (root / "apps" / "api" / "README.md").write_text("changed\n", encoding="utf-8")
        result = worktree_guard.check(root, ["apps/api"])
        self.assertFalse(result["clean"])
        self.assertEqual(result["overlap_paths"], ["apps/api/README.md"])
        self.assertEqual(result["recommendation"], "isolated-worktree")

    def test_unrelated_dirty_path_is_still_isolated_on_main(self) -> None:
        root = self.make_repo()
        (root / "apps" / "web" / "README.md").write_text("changed\n", encoding="utf-8")
        result = worktree_guard.check(root, ["apps/api"])
        self.assertEqual(result["overlap_paths"], [])
        self.assertFalse(result["safe_for_in_place"])
        self.assertEqual(result["reason"], "protected branch is dirty; keep new work out of this checkout")

    def test_create_uses_explicit_base_without_touching_current_checkout(self) -> None:
        root = self.make_repo()
        destination = root.parent / "isolated-api"
        result = worktree_guard.create(root, str(destination), "HEAD", "feat/isolated-api")
        self.assertEqual(result["status"], "created")
        self.assertTrue((destination / "apps" / "api" / "README.md").is_file())
        self.assertEqual(git(root, "branch", "--show-current"), "main")
        self.assertIn("feat/isolated-api", git(root, "worktree", "list"))
        subprocess.run(["git", "worktree", "remove", "--force", str(destination)], cwd=root, check=True)

    def test_cli_json_is_machine_readable(self) -> None:
        root = self.make_repo()
        proc = subprocess.run(
            ["python3", str(SCRIPT), "check", str(root), "--paths", "apps/api", "--json"],
            text=True,
            capture_output=True,
            check=True,
        )
        payload = json.loads(proc.stdout)
        self.assertEqual(payload["scopes"], ["apps/api"])
        self.assertTrue(payload["safe_for_in_place"])


if __name__ == "__main__":
    unittest.main()
