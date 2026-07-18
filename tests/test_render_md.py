"""Tests for render-md.py — plan markdown → self-contained HTML."""
import importlib.util
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("render_md", _ROOT / "scripts" / "render-md.py")
rmd = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rmd)


class RenderMdTests(unittest.TestCase):
    def test_headings_tables_lists(self) -> None:
        h = rmd.md_to_html("# Title\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n")
        self.assertIn("<h1>Title</h1>", h)
        self.assertIn("<table>", h)
        self.assertIn("<th>A</th>", h)
        self.assertIn("✓ done", h)
        self.assertIn("□ todo", h)

    def test_mermaid_fence_becomes_graph_box(self) -> None:
        h = rmd.md_to_html("```mermaid\nflowchart TB\n  A --> B\n```\n")
        self.assertIn('class="hf-graph"', h)
        self.assertIn("hf-graph-src", h)
        self.assertIn("flowchart TB", h)

    def test_inline_escapes_and_markup(self) -> None:
        h = rmd.md_to_html("a **bold** and `code` and <script>x</script>\n")
        self.assertIn("<strong>bold</strong>", h)
        self.assertIn("<code>code</code>", h)
        self.assertNotIn("<script>x", h)  # escaped

    def test_build_html_is_self_contained(self) -> None:
        html = rmd.build_html("T", "<p>hi</p>")
        self.assertTrue(html.startswith("<!doctype html>"))
        self.assertIn("<style>", html)
        self.assertIn("<script>", html)
        # Self-contained: no external stylesheet/script/font references.
        self.assertNotIn("<link", html)
        self.assertNotIn('src="http', html)
        self.assertNotIn('href="http', html)

    def test_render_markdown_writes_file(self) -> None:
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            md = Path(d) / "plan.md"
            md.write_text("# Plan\n\n```mermaid\nflowchart TB\n A-->B\n```\n")
            out = Path(d) / "plan.html"
            rmd.render_markdown(md, out)
            self.assertTrue(out.is_file())
            self.assertIn("hf-graph", out.read_text())


if __name__ == "__main__":
    unittest.main()
