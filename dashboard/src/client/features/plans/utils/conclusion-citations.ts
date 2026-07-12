import type { EvidenceCitation } from "@shared/derived/index.js";

export interface CitationAnchor {
  /** DOM id target inside the document pane. */
  anchorId: string;
  file: string;
  startLine: number;
  endLine: number;
  label: string;
}

/** Map evidence citation → document-pane anchor target. */
export function citationToAnchor(citation: EvidenceCitation): CitationAnchor {
  const start = Math.max(1, citation.startLine);
  const end = Math.max(start, citation.endLine);
  const safeFile = citation.file.replace(/[^a-zA-Z0-9._/-]/g, "_");
  return {
    anchorId: `cite-${safeFile}-L${start}`,
    file: citation.file,
    startLine: start,
    endLine: end,
    label: `${citation.file}:${start}${end !== start ? `–${end}` : ""}`,
  };
}

export function lineAnchorId(path: string, line: number): string {
  const safe = path.replace(/[^a-zA-Z0-9._/-]/g, "_");
  return `cite-${safe}-L${Math.max(1, line)}`;
}

export function scrollToCitation(anchorId: string): boolean {
  if (typeof document === "undefined") return false;
  const el = document.getElementById(anchorId);
  if (!el) return false;
  el.scrollIntoView({ block: "center", behavior: "instant" });
  el.classList.add("hf-doc__highlight");
  window.setTimeout(() => el.classList.remove("hf-doc__highlight"), 1200);
  return true;
}
