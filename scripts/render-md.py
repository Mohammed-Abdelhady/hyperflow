#!/usr/bin/env python3
"""render-md.py — render a plan markdown file as a self-contained HTML page.

The fallback the auto-open path uses when a plan produced only classic markdown
(``.hyperflow/specs/<slug>.md`` / ``.hyperflow/tasks/<slug>.md``) and no JSON
artefact exists. Converts the markdown to HTML and renders any ```mermaid```
fences through the viewer's graph engine, inlined so the page opens offline with
no network request and nothing uploaded — same privacy posture as
``export-artefact.py``.

Usage:
  render-md.py <path-to.md> [-o OUT.html] [--title T]

Stdlib only. No network.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

_VIEWER = Path(__file__).resolve().parent.parent / "viewer"
_CSS = ["styles.css", "graph.css"]
# components.js sets window.HF; graph-core.js + graph.js add HF.graph (parseFlow/render).
_JS = ["components.js", "graph-core.js", "graph.js"]

_INLINE = re.compile(
    r"(?P<code>`[^`]+`)"
    r"|(?P<bold>\*\*[^*]+\*\*)"
    r"|(?P<link>\[[^\]]+\]\([^)]+\))"
)


def _inline_breakout_safe(text: str) -> str:
    """Neutralize `</` so inlined CSS/JS cannot close the surrounding tag."""
    return text.replace("</", "<\\/")


def _inline(text: str) -> str:
    """Escape a text run, then re-apply inline code/bold/link markup."""
    out: list[str] = []
    pos = 0
    for m in _INLINE.finditer(text):
        out.append(html.escape(text[pos : m.start()]))
        if m.group("code"):
            out.append(f"<code>{html.escape(m.group('code')[1:-1])}</code>")
        elif m.group("bold"):
            out.append(f"<strong>{html.escape(m.group('bold')[2:-2])}</strong>")
        else:  # link
        # split [text](url)
            lm = re.match(r"\[([^\]]+)\]\(([^)]+)\)", m.group("link"))
            label, url = lm.group(1), lm.group(2)
            safe_url = url if re.match(r"^(https?:|mailto:|#|\.?/)", url) else "#"
            out.append(
                f'<a href="{html.escape(safe_url)}">{html.escape(label)}</a>'
            )
        pos = m.end()
    out.append(html.escape(text[pos:]))
    return "".join(out)


def _cells(row: str) -> list[str]:
    row = row.strip().strip("|")
    return [c.strip() for c in row.split("|")]


def md_to_html(md: str) -> str:
    """Compact markdown → HTML for plan docs. ```mermaid``` → a graph box."""
    lines = md.replace("\r\n", "\n").split("\n")
    out: list[str] = []
    i, n = 0, len(lines)
    while i < n:
        line = lines[i]

        # Fenced code (incl. mermaid).
        fence = re.match(r"^```+\s*([\w-]*)\s*$", line)
        if fence:
            lang = fence.group(1).lower()
            i += 1
            buf: list[str] = []
            while i < n and not re.match(r"^```+\s*$", lines[i]):
                buf.append(lines[i])
                i += 1
            i += 1  # closing fence
            src = "\n".join(buf)
            if lang == "mermaid":
                out.append(
                    '<div class="hf-graph"><pre class="hf-graph-src" hidden>'
                    f"{html.escape(src)}</pre></div>"
                )
            else:
                out.append(f"<pre class='code'>{html.escape(src)}</pre>")
            continue

        # Heading.
        h = re.match(r"^(#{1,6})\s+(.*)$", line)
        if h:
            lvl = min(len(h.group(1)), 6)
            out.append(f"<h{lvl}>{_inline(h.group(2).strip())}</h{lvl}>")
            i += 1
            continue

        # Horizontal rule.
        if re.match(r"^\s*(-{3,}|\*{3,}|_{3,})\s*$", line):
            out.append("<hr>")
            i += 1
            continue

        # Table (header row followed by a |---|--- separator).
        if line.lstrip().startswith("|") and i + 1 < n and re.match(
            r"^\s*\|?\s*:?-{2,}", lines[i + 1]
        ):
            head = _cells(line)
            i += 2  # header + separator
            rows: list[list[str]] = []
            while i < n and lines[i].lstrip().startswith("|"):
                rows.append(_cells(lines[i]))
                i += 1
            th = "".join(f"<th>{_inline(c)}</th>" for c in head)
            body = "".join(
                "<tr>" + "".join(f"<td>{_inline(c)}</td>" for c in r) + "</tr>"
                for r in rows
            )
            out.append(f"<table><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>")
            continue

        # List (bullets + task checkboxes).
        if re.match(r"^\s*([-*+]|\d+\.)\s+", line):
            ordered = bool(re.match(r"^\s*\d+\.\s+", line))
            tag = "ol" if ordered else "ul"
            items: list[str] = []
            while i < n and re.match(r"^\s*([-*+]|\d+\.)\s+", lines[i]):
                item = re.sub(r"^\s*([-*+]|\d+\.)\s+", "", lines[i])
                cb = re.match(r"^\[([ xX])\]\s+(.*)$", item)
                if cb:
                    mark = "✓" if cb.group(1).lower() == "x" else "□"
                    items.append(
                        f'<li class="task">{mark} {_inline(cb.group(2))}</li>'
                    )
                else:
                    items.append(f"<li>{_inline(item)}</li>")
                i += 1
            out.append(f"<{tag}>{''.join(items)}</{tag}>")
            continue

        # Blockquote.
        if line.lstrip().startswith(">"):
            quote: list[str] = []
            while i < n and lines[i].lstrip().startswith(">"):
                quote.append(re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            out.append(f"<blockquote>{_inline(' '.join(quote))}</blockquote>")
            continue

        # Blank line.
        if not line.strip():
            i += 1
            continue

        # Paragraph (gather until blank / block start).
        para: list[str] = []
        while i < n and lines[i].strip() and not re.match(
            r"^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+\.\s|>|\|)", lines[i]
        ):
            para.append(lines[i].strip())
            i += 1
        out.append(f"<p>{_inline(' '.join(para))}</p>")
    return "\n".join(out)


_BOOT = (
    "document.querySelectorAll('.hf-graph').forEach(function(box){"
    "var s=box.querySelector('.hf-graph-src');"
    "if(!s||!window.HF||!HF.graph){if(s)s.hidden=false;return;}"
    "try{var el=HF.graph.render(HF.graph.parseFlow(s.textContent),{});"
    "box.insertBefore(el,box.firstChild);s.remove();}"
    "catch(e){s.hidden=false;}});"
)


def build_html(title: str, body: str) -> str:
    css = _inline_breakout_safe(
        "\n".join((_VIEWER / f).read_text(encoding="utf-8") for f in _CSS)
    )
    js = _inline_breakout_safe(
        "\n".join((_VIEWER / f).read_text(encoding="utf-8") for f in _JS)
    )
    extra = (
        ".hf-doc{max-width:960px;margin:0 auto;padding:2rem 1.5rem;}"
        ".hf-doc table{border-collapse:collapse;margin:1rem 0;}"
        ".hf-doc th,.hf-doc td{border:1px solid #8884;padding:.35rem .6rem;text-align:left;}"
        ".hf-doc pre.code{overflow:auto;padding:.75rem;border-radius:6px;background:#8881;}"
        ".hf-doc li.task{list-style:none;} .hf-graph{margin:1rem 0;overflow:auto;}"
    )
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        f"<title>{html.escape(title)}</title>"
        f"<style>{css}\n{extra}</style></head><body>"
        f"<main class='hf-doc'>{body}</main>"
        f"<script>{js}</script><script>{_BOOT}</script>"
        "</body></html>\n"
    )


def render_markdown(md_path: Path, out_path: Path, title: str | None = None) -> Path:
    md = md_path.read_text(encoding="utf-8", errors="replace")
    heading = re.search(r"^#\s+(.+)$", md, re.MULTILINE)
    title = title or (heading.group(1).strip() if heading else md_path.stem)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(build_html(title, md_to_html(md)), encoding="utf-8")
    return out_path


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Render a markdown file to self-contained HTML.")
    ap.add_argument("md")
    ap.add_argument("-o", "--out")
    ap.add_argument("--title")
    args = ap.parse_args(argv[1:])
    md_path = Path(args.md)
    if not md_path.is_file():
        print(f"render-md: no such file: {md_path}", file=sys.stderr)
        return 1
    out = Path(args.out) if args.out else md_path.with_suffix(".html")
    dest = render_markdown(md_path, out, args.title)
    print(str(dest))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
