import { useMemo } from "react";
import type { SpecNode, SpecSection } from "@shared/schemas/index.js";

export type DiffKind = "same" | "add" | "remove";

export interface DiffSectionRow {
  kind: DiffKind;
  text: string;
  anchor: string;
  side: "left" | "right" | "both";
}

export interface SpecDiffModel {
  canCompare: boolean;
  label: string;
  rows: DiffSectionRow[];
}

function sectionKey(s: SpecSection): string {
  return `${s.level}:${s.text.trim().toLowerCase()}`;
}

/**
 * Section-level add/remove model between two revisions.
 * Single revision → stable "no comparison" model with §4.7 label.
 */
export function buildSpecDiff(
  left: SpecNode | null,
  right: SpecNode | null,
): SpecDiffModel {
  if (!left || !right || left.slug === right.slug) {
    // Same node or missing pair — single-revision honest empty.
    if (left && !right) {
      return {
        canCompare: false,
        label: "one revision — nothing to diff yet",
        rows: [],
      };
    }
    if (left && right && left.slug === right.slug) {
      return {
        canCompare: false,
        label: "one revision — nothing to diff yet",
        rows: [],
      };
    }
    return {
      canCompare: false,
      label: "one revision — nothing to diff yet",
      rows: [],
    };
  }

  const leftKeys = new Map(left.sections.map((s) => [sectionKey(s), s]));
  const rightKeys = new Map(right.sections.map((s) => [sectionKey(s), s]));
  const rows: DiffSectionRow[] = [];

  for (const [key, section] of leftKeys) {
    if (rightKeys.has(key)) {
      rows.push({
        kind: "same",
        text: section.text,
        anchor: section.anchor,
        side: "both",
      });
    } else {
      rows.push({
        kind: "remove",
        text: section.text,
        anchor: section.anchor,
        side: "left",
      });
    }
  }
  for (const [key, section] of rightKeys) {
    if (!leftKeys.has(key)) {
      rows.push({
        kind: "add",
        text: section.text,
        anchor: section.anchor,
        side: "right",
      });
    }
  }

  return {
    canCompare: true,
    label: "section diff",
    rows,
  };
}

export function useSpecDiff(
  left: SpecNode | null,
  right: SpecNode | null,
): SpecDiffModel {
  return useMemo(() => buildSpecDiff(left, right), [left, right]);
}
