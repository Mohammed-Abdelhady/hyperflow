"""Tests for scripts/generate-portable-doctrine.py."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "generate-portable-doctrine.py"
DOCTRINE = ROOT / "skills" / "hyperflow" / "DOCTRINE.md"
TEMPLATE = ROOT / "templates" / "claude-md-doctrine.md"


def _load_generator():
    spec = importlib.util.spec_from_file_location("generate_portable_doctrine", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gen = _load_generator()


VALID = (
    '<!-- portable:section id=alpha order=2 title="Alpha"\n'
    "\n"
    "## Alpha\n"
    "\n"
    "alpha rule\n"
    "\n"
    "<!-- /portable:section -->\n"
    "\n"
    "Some visible canonical prose that must never reach the template.\n"
    "\n"
    '<!-- portable:section id=beta order=1 title="Beta"\n'
    "\n"
    "## Beta\n"
    "\n"
    "beta rule\n"
    "\n"
    "<!-- /portable:section -->\n"
)


class RenderTests(unittest.TestCase):
    def test_sections_emit_in_order_attribute_not_document_order(self):
        out = gen.render(VALID)
        self.assertLess(out.index("## Beta"), out.index("## Alpha"))

    def test_visible_prose_is_not_emitted(self):
        self.assertNotIn("visible canonical prose", gen.render(VALID))

    def test_markers_do_not_leak_into_output(self):
        self.assertNotIn("portable:section", gen.render(VALID))

    def test_render_is_deterministic(self):
        self.assertEqual(gen.render(VALID), gen.render(VALID))

    def test_generated_output_matches_committed_template(self):
        expected = gen.render(DOCTRINE.read_text(encoding="utf-8"))
        self.assertEqual(TEMPLATE.read_text(encoding="utf-8"), expected)

    def test_auto_bridge_contract_preserved(self):
        out = gen.render(VALID)
        self.assertIn("__HYPERFLOW_VERSION__", out)
        self.assertIn("__GENERATED_AT__", out)
        self.assertTrue(out.startswith("<!-- hyperflow:doctrine:start "))
        self.assertTrue(out.endswith("<!-- hyperflow:doctrine:end -->\n"))


class MalformedMarkerTests(unittest.TestCase):
    """A malformed block must fail loudly, never silently drop one section."""

    def _assert_raises(self, text, needle):
        with self.assertRaises(ValueError) as ctx:
            gen.render(text)
        self.assertIn(needle, str(ctx.exception))

    def test_non_integer_order_is_not_silently_dropped(self):
        broken = VALID.replace("order=2", "order=two")
        self._assert_raises(broken, "malformed portable:section markers")

    def test_missing_closer_is_not_silently_dropped(self):
        # A dropped closer lets this block's body run on into the next opener. Which
        # guard catches it depends on what follows; the invariant is that one does.
        broken = VALID.replace("<!-- /portable:section -->\n\nSome visible", "\nSome visible")
        with self.assertRaises(ValueError):
            gen.render(broken)

    def test_missing_closer_on_final_section_trips_the_marker_count(self):
        # Nothing follows, so no forbidden token is swallowed — the opener/closer
        # counter is the only thing standing between this and a silently lost rule.
        broken = (
            '<!-- portable:section id=a order=1 title="A"\n'
            "\n## A\n\na rule\n\n"
            "<!-- /portable:section -->\n"
            "\n"
            '<!-- portable:section id=b order=2 title="B"\n'
            "\n## B\n\nb rule\n"
        )
        self._assert_raises(broken, "malformed portable:section markers")

    def test_comment_terminator_in_body_is_rejected(self):
        broken = VALID.replace("alpha rule", "alpha --> rule")
        self._assert_raises(broken, "would close or nest the wrapping")

    def test_nested_comment_opener_in_body_is_rejected(self):
        broken = VALID.replace("alpha rule", "alpha <!-- rule")
        self._assert_raises(broken, "would close or nest the wrapping")

    def test_bare_doctrine_start_token_in_body_is_rejected(self):
        # No comment delimiters, so the delimiter guard alone would let it through —
        # and it would land a second doctrine boundary in every downstream CLAUDE.md.
        broken = VALID.replace("alpha rule", "alpha hyperflow:doctrine:start version=9 rule")
        self._assert_raises(broken, "smuggle a doctrine marker")

    def test_bare_doctrine_end_token_in_body_is_rejected(self):
        broken = VALID.replace("alpha rule", "alpha hyperflow:doctrine:end rule")
        self._assert_raises(broken, "smuggle a doctrine marker")

    def test_duplicate_order_is_rejected(self):
        self._assert_raises(VALID.replace("order=2", "order=1"), "orders must be unique")

    def test_duplicate_id_is_rejected(self):
        broken = VALID.replace("id=beta", "id=alpha").replace("order=1", "order=3")
        self._assert_raises(broken, "declared twice")

    def test_empty_content_is_rejected(self):
        broken = (
            '<!-- portable:section id=a order=1 title="A"\n'
            "\n"
            "<!-- /portable:section -->\n"
        )
        self._assert_raises(broken, "empty content")

    def test_no_markers_at_all_is_rejected(self):
        self._assert_raises("# Doctrine\n\nnothing portable here\n", "no portable:section markers")


class CheckModeTests(unittest.TestCase):
    def test_check_passes_on_the_committed_tree(self):
        self.assertEqual(gen.check(ROOT), [])


if __name__ == "__main__":
    unittest.main()
