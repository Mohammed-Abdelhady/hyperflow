"""Unit / integration tests for Codex release certification gate (T14).

Missing required certificates must block release mutation. Dry-run / precheck
must leave the git tree and tags unchanged.
"""

from __future__ import annotations

import os
import stat
import subprocess
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CERTIFY = REPO_ROOT / "scripts" / "certify-codex.sh"
RELEASE = REPO_ROOT / "scripts" / "release.sh"
BUMP = REPO_ROOT / "scripts" / "bump-version.sh"
COMPAT = REPO_ROOT / "config" / "codex-compatibility.json"
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "release-certification.yml"


def _run(
    args: list[str],
    *,
    env: dict[str, str] | None = None,
    timeout: int = 300,
) -> subprocess.CompletedProcess[str]:
    full_env = os.environ.copy()
    # Never allow preview unless the test opts in explicitly.
    full_env.pop("HYPERFLOW_CERTIFY_ALLOW_PREVIEW", None)
    if env:
        full_env.update(env)
    return subprocess.run(
        args,
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
        env=full_env,
    )


def _git_snapshot() -> str:
    parts = [
        subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            check=False,
        ).stdout,
        subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            check=False,
        ).stdout,
        subprocess.run(
            ["git", "tag", "-l"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            check=False,
        ).stdout,
    ]
    return "\n".join(parts)


class TestCertifyCodexScript(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not CERTIFY.is_file():
            raise unittest.SkipTest(f"missing {CERTIFY}")

    def test_script_is_executable_bits_or_invokable(self) -> None:
        mode = CERTIFY.stat().st_mode
        # At least readable; bash invocation does not require +x in all envs
        self.assertTrue(mode & stat.S_IRUSR)
        proc = _run(["bash", str(CERTIFY), "--help"])
        self.assertEqual(proc.returncode, 0, msg=proc.stderr)
        self.assertIn("precheck", proc.stdout.lower() + proc.stderr.lower())

    def test_self_test_passes(self) -> None:
        proc = _run(["bash", str(CERTIFY), "--self-test"], timeout=300)
        self.assertEqual(
            proc.returncode,
            0,
            msg=f"stdout:\n{proc.stdout}\nstderr:\n{proc.stderr}",
        )
        self.assertIn("SELF-TEST PASS", proc.stdout)

    def test_precheck_fails_when_uncertified(self) -> None:
        """Current checked-in lanes are uncertified → hard-stop."""
        proc = _run(["bash", str(CERTIFY), "--precheck"], timeout=300)
        self.assertNotEqual(proc.returncode, 0, msg=proc.stdout)
        self.assertNotEqual(proc.returncode, 2, msg="unexpected SECURITY_VIOLATION")
        combined = proc.stdout + proc.stderr
        self.assertIn("RESULT: FAIL", combined)
        self.assertIn("cli.minimum", combined)

    def test_status_mode_non_blocking(self) -> None:
        proc = _run(["bash", str(CERTIFY), "--status"], timeout=300)
        self.assertEqual(proc.returncode, 0, msg=proc.stderr)
        self.assertIn("STATUS_ONLY", proc.stdout)

    def test_preview_soft_fail(self) -> None:
        proc = _run(
            ["bash", str(CERTIFY), "--precheck"],
            env={"HYPERFLOW_CERTIFY_ALLOW_PREVIEW": "1"},
            timeout=300,
        )
        self.assertEqual(proc.returncode, 0, msg=proc.stderr)
        self.assertIn("PREVIEW_SOFT_FAIL", proc.stdout)

    def test_missing_cert_blocks_without_mutating_git(self) -> None:
        before = _git_snapshot()
        proc = _run(["bash", str(CERTIFY), "--precheck"], timeout=300)
        after = _git_snapshot()
        self.assertNotEqual(proc.returncode, 0)
        self.assertEqual(before, after, msg="certify-codex.sh must not mutate git")

    def test_app_claim_requires_attestation_row(self) -> None:
        # Live package may be CLI-only after claim gating; force the App claim path.
        proc = _run(
            ["bash", str(CERTIFY), "--precheck"],
            env={"HYPERFLOW_CLAIM_APP": "1"},
            timeout=300,
        )
        combined = proc.stdout + proc.stderr
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("desktop-app", combined)
        self.assertRegex(
            combined,
            r"FAIL: desktop-app|package claims Codex App|claims_app=True",
        )

    def test_live_metadata_without_app_claim_skips_app_attestation(self) -> None:
        proc = _run(["bash", str(CERTIFY), "--precheck"], timeout=300)
        combined = proc.stdout + proc.stderr
        self.assertIn("desktop-app", combined)
        # Either not claimed (PASS) or claimed without cert (FAIL) — both valid shapes.
        self.assertTrue(
            "not claimed" in combined
            or "FAIL: desktop-app" in combined
            or "package claims" in combined,
            msg=combined[-800:],
        )


class TestReleasePrecheckIntegration(unittest.TestCase):
    def test_release_precheck_fails_and_leaves_tree(self) -> None:
        if not RELEASE.is_file():
            self.skipTest("release.sh missing")
        before = _git_snapshot()
        proc = _run(["bash", str(RELEASE), "--precheck"], timeout=300)
        after = _git_snapshot()
        self.assertNotEqual(
            proc.returncode,
            0,
            msg=f"expected certification block\n{proc.stdout}\n{proc.stderr}",
        )
        self.assertEqual(before, after, msg="release --precheck must not mutate git")
        combined = proc.stdout + proc.stderr
        self.assertTrue(
            "Certification blocked" in combined
            or "RESULT: FAIL" in combined
            or "unchanged" in combined.lower(),
            msg=combined[-1500:],
        )

    def test_release_dry_run_fails_cert_without_mutation(self) -> None:
        if not RELEASE.is_file():
            self.skipTest("release.sh missing")
        before = _git_snapshot()
        proc = _run(["bash", str(RELEASE), "--dry-run", "--force", "patch"], timeout=300)
        after = _git_snapshot()
        # Uncertified → dry-run must fail certification before mutation
        self.assertNotEqual(proc.returncode, 0, msg=proc.stdout + proc.stderr)
        self.assertEqual(before, after, msg="dry-run must leave tree unchanged on fail")

    def test_bump_version_refuses_without_prepare_phase(self) -> None:
        if not BUMP.is_file():
            self.skipTest("bump-version.sh missing")
        env = os.environ.copy()
        env.pop("HYPERFLOW_RELEASE_PHASE", None)
        env.pop("HYPERFLOW_BUMP_ALLOW_DIRECT", None)
        proc = subprocess.run(
            ["bash", str(BUMP), "9.9.9"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            check=False,
            env=env,
        )
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("prepare-only", proc.stderr + proc.stdout)

    def test_bump_version_refuses_finalize_phase(self) -> None:
        if not BUMP.is_file():
            self.skipTest("bump-version.sh missing")
        proc = _run(
            ["bash", str(BUMP), "9.9.9"],
            env={"HYPERFLOW_RELEASE_PHASE": "finalize"},
        )
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("premature publication", proc.stderr + proc.stdout)

    def test_workflow_file_exists(self) -> None:
        self.assertTrue(WORKFLOW.is_file())
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("release-candidate/", text)
        self.assertIn("certify-codex.sh", text)
        self.assertIn("stable-tag", text)
        self.assertIn("fix-forward", text.lower())

    def test_compat_policy_still_uncertified_floor(self) -> None:
        import json

        data = json.loads(COMPAT.read_text(encoding="utf-8"))
        for name in ("minimum", "currentStable"):
            lane = data["cli"]["lanes"][name]
            self.assertEqual(lane.get("status"), "uncertified")
            self.assertEqual(lane.get("certificateIds") or [], [])
        self.assertEqual(data["desktopApp"].get("status"), "uncertified")


if __name__ == "__main__":
    unittest.main()
