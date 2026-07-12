import type { SpecSection } from "@shared/schemas/index.js";

export function sectionDomId(anchor: string): string {
  return `spec-section-${anchor}`;
}

export function buildSectionIndex(
  sections: readonly SpecSection[],
): Array<{ anchor: string; text: string; level: number; domId: string }> {
  return sections.map((s) => ({
    anchor: s.anchor,
    text: s.text,
    level: s.level,
    domId: sectionDomId(s.anchor),
  }));
}

export function scrollToSection(anchor: string): boolean {
  if (typeof document === "undefined") return false;
  const el = document.getElementById(sectionDomId(anchor));
  if (!el) return false;
  el.scrollIntoView({ block: "start", behavior: "instant" });
  return true;
}
