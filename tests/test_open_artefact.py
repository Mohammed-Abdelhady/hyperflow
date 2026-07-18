"""Tests for open-artefact.py — the gated, headless-safe artefact auto-open engine.

Every case mocks webbrowser.open so no real browser is ever launched, and
isolates HOME (like test_reap) so viewer.enabled / viewer.autoOpen are
deterministic. Temp .hyperflow fixtures only — nothing outside tmp is touched.
"""

from __future__ import annotations

import importlib.util
import io
import json
import os
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT = REPO_ROOT / "scripts" / "open-artefact.py"


def _load():
    spec = importlib.util.spec_from_file_location("open_artefact", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


open_mod = _load()


class OpenArtefactTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        # Isolate HOME so load_viewer_cfg reads only our temp config.json.
        home = self.root / "_home"
        home.mkdir(parents=True, exist_ok=True)
        env_patch = patch.dict(
            os.environ, {"HOME": str(home), "USERPROFILE": str(home)}
        )
        env_patch.start()
        self.addCleanup(env_patch.stop)
        # A stray HYPERFLOW_NO_BROWSER in the outer env would force the headless
        # path and mask the open-vs-not-open assertions — clear it per test.
        os.environ.pop("HYPERFLOW_NO_BROWSER", None)
        self.hf = self.root / ".hyperflow"
        (self.hf / "artefacts" / "spec").mkdir(parents=True, exist_ok=True)

    def _write_config(self, *, enabled: bool = True, auto_open: bool = True) -> None:
        cfg_dir = Path(os.environ["HOME"]) / ".hyperflow"
        cfg_dir.mkdir(parents=True, exist_ok=True)
        (cfg_dir / "config.json").write_text(
            json.dumps({"viewer": {"enabled": enabled, "autoOpen": auto_open}}),
            encoding="utf-8",
        )

    def _write_spec(self, slug: str = "demo-plan") -> str:
        env = {
            "hf": 1,
            "type": "spec",
            "slug": slug,
            "title": "Demo Plan",
            "status": "draft",
            "created": "2026-07-18",
            "updated": "2026-07-18",
            "specialists": [],
            "payload": {"summary": "x"},
        }
        (self.hf / "artefacts" / "spec" / f"{slug}.json").write_text(
            json.dumps(env), encoding="utf-8"
        )
        return slug

    def _run(self, *args: str) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = open_mod.main(["open-artefact.py", *args])
        return code, out.getvalue(), err.getvalue()

    def _export_path(self, slug: str) -> Path:
        return self.hf / "exports" / f"spec-{slug}.html"

    # ── open path ────────────────────────────────────────────────────────────
    def test_autoopen_true_opens_export_once(self) -> None:
        slug = self._write_spec()
        self._write_config(enabled=True, auto_open=True)
        with patch.object(open_mod.webbrowser, "open", return_value=True) as mock_open:
            code, _out, _err = self._run(str(self.hf), slug, "--type", "spec")
        self.assertEqual(code, 0)
        mock_open.assert_called_once()
        url = mock_open.call_args[0][0]
        self.assertTrue(url.startswith("file://"), url)
        self.assertTrue(url.endswith(f"exports/spec-{slug}.html"), url)
        self.assertTrue(self._export_path(slug).is_file())

    # ── viewer.enabled=false → no export, no open ─────────────────────────────
    def test_viewer_disabled_does_not_open_or_export(self) -> None:
        slug = self._write_spec()
        self._write_config(enabled=False, auto_open=True)
        with patch.object(open_mod.webbrowser, "open") as mock_open:
            code, out, _err = self._run(str(self.hf), slug, "--type", "spec")
        self.assertEqual(code, 0)
        mock_open.assert_not_called()
        self.assertIn("disabled", out)
        self.assertFalse((self.hf / "exports").exists())  # gated before export

    # ── autoOpen=false: skip without --force, open with it ────────────────────
    def test_autoopen_false_needs_force(self) -> None:
        slug = self._write_spec()
        self._write_config(enabled=True, auto_open=False)
        with patch.object(open_mod.webbrowser, "open") as mock_open:
            code, out, _err = self._run(str(self.hf), slug, "--type", "spec")
        self.assertEqual(code, 0)
        mock_open.assert_not_called()
        self.assertIn("autoOpen off", out)

        with patch.object(open_mod.webbrowser, "open", return_value=True) as mock_forced:
            code2, _out2, _err2 = self._run(str(self.hf), slug, "--type", "spec", "--force")
        self.assertEqual(code2, 0)
        mock_forced.assert_called_once()

    # ── --no-open → print the path, never open ────────────────────────────────
    def test_no_open_prints_path(self) -> None:
        slug = self._write_spec()
        self._write_config(enabled=True, auto_open=True)
        with patch.object(open_mod.webbrowser, "open") as mock_open:
            code, out, _err = self._run(str(self.hf), slug, "--type", "spec", "--no-open")
        self.assertEqual(code, 0)
        mock_open.assert_not_called()
        self.assertIn("Open manually:", out)
        self.assertIn(f"spec-{slug}.html", out)
        # E2E: the export is still generated so the manual path resolves.
        self.assertTrue(self._export_path(slug).is_file())

    # ── HYPERFLOW_NO_BROWSER env → same headless behavior ─────────────────────
    def test_env_no_browser_prints_path(self) -> None:
        slug = self._write_spec()
        self._write_config(enabled=True, auto_open=True)
        with patch.dict(os.environ, {"HYPERFLOW_NO_BROWSER": "1"}), patch.object(
            open_mod.webbrowser, "open"
        ) as mock_open:
            code, out, _err = self._run(str(self.hf), slug, "--type", "spec")
        self.assertEqual(code, 0)
        mock_open.assert_not_called()
        self.assertIn("Open manually:", out)

    # ── traversal slug → non-zero refusal, no open ────────────────────────────
    def test_traversal_slug_refused(self) -> None:
        self._write_config(enabled=True, auto_open=True)
        with patch.object(open_mod.webbrowser, "open") as mock_open:
            code, _out, err = self._run(str(self.hf), "../etc", "--type", "spec")
        self.assertNotEqual(code, 0)
        mock_open.assert_not_called()
        self.assertIn("refused", err)

    # ── missing artefact → clear reason, exit 0 (never crash the caller) ──────
    def test_missing_artefact_exits_zero(self) -> None:
        self._write_config(enabled=True, auto_open=True)
        with patch.object(open_mod.webbrowser, "open") as mock_open:
            code, out, _err = self._run(str(self.hf), "nonexistent", "--type", "spec")
        self.assertEqual(code, 0)
        mock_open.assert_not_called()
        self.assertIn("skipping", out)


if __name__ == "__main__":
    unittest.main()
