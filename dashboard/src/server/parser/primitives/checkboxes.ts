/**
 * Checkbox / roster scanners for task and phase files.
 * Recognizes `- [ ]`, `- [x]`, `- [~]` (in-flight) at line start.
 * Never throws.
 */

import type {
  CheckboxState,
  ProgressCounts,
} from "@shared/schemas/common.js";
import type { SubTaskDetail } from "@shared/schemas/snapshot-artefacts.js";
import { normalizeInput, splitLines } from "./normalize.js";

export type CheckboxItem = {
  state: CheckboxState;
  label: string;
  lineIndex: number;
  /** Original marker text: " ", "x", "~" */
  marker: string;
};

export type SectionCheckboxCounts = {
  heading: string;
  counts: ProgressCounts;
  items: CheckboxItem[];
};

export type CheckboxScanResult = {
  counts: ProgressCounts;
  items: CheckboxItem[];
  sections: SectionCheckboxCounts[];
};

export type RosterParts = {
  taskId?: string;
  role?: string;
  title: string;
};

export type RosterDetail = SubTaskDetail;

const CHECKBOX_RE = /^(\s*)-\s*\[([ xX~])\]\s*(.*)$/;
const ROSTER_RE =
  /^(T\d+)\s*[—–-]\s*(.+?)\s*·\s*(.+)$/;

function stateFromMarker(marker: string): CheckboxState {
  const m = marker.toLowerCase();
  if (m === "x") return "done";
  if (m === "~") return "running";
  return "pending";
}

function emptyCounts(): ProgressCounts {
  return { done: 0, running: 0, pending: 0, total: 0 };
}

function tally(items: CheckboxItem[]): ProgressCounts {
  const counts = emptyCounts();
  for (const item of items) {
    if (item.state === "done") counts.done += 1;
    else if (item.state === "running") counts.running += 1;
    else counts.pending += 1;
  }
  counts.total = counts.done + counts.running + counts.pending;
  return counts;
}

/**
 * Scan a document for checkbox lines; return global + per-H2-section counts.
 */
export function scanCheckboxes(raw: string): CheckboxScanResult {
  try {
    const lines = splitLines(raw);
    const items: CheckboxItem[] = [];
    const sections: SectionCheckboxCounts[] = [];
    let currentHeading = "";
    let sectionItems: CheckboxItem[] = [];

    const flushSection = () => {
      if (currentHeading.length === 0 && sectionItems.length === 0) return;
      sections.push({
        heading: currentHeading,
        counts: tally(sectionItems),
        items: sectionItems,
      });
      sectionItems = [];
    };

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      const trimmed = line.trim();
      const h2 = trimmed.match(/^##\s+(.+)$/);
      if (h2?.[1]) {
        flushSection();
        currentHeading = h2[1].trim();
        continue;
      }

      const m = line.match(CHECKBOX_RE);
      if (!m) continue;
      const marker = m[2] ?? " ";
      const label = (m[3] ?? "").trim();
      const item: CheckboxItem = {
        state: stateFromMarker(marker),
        label,
        lineIndex: i,
        marker: marker.toLowerCase() === "x" ? "x" : marker,
      };
      items.push(item);
      sectionItems.push(item);
    }
    flushSection();

    return { counts: tally(items), items, sections };
  } catch {
    return { counts: emptyCounts(), items: [], sections: [] };
  }
}

/**
 * Split a roster label `T1 — Writer · Author compaction…` into parts.
 * Non-matching labels return plain title only.
 */
export function parseRosterLabel(label: string): RosterParts {
  try {
    const cleaned = label.trim();
    // Strip trailing pointer: `→ \`tasks/T1-foo.md\``
    const withoutPointer = cleaned.replace(/\s*→\s*`?[^`]+`?\s*$/, "").trim();
    const m = withoutPointer.match(ROSTER_RE);
    if (!m?.[1] || !m[2] || !m[3]) {
      return { title: withoutPointer };
    }
    return {
      taskId: m[1],
      role: m[2].trim(),
      title: m[3].trim(),
    };
  } catch {
    return { title: label };
  }
}

/**
 * Parse an indented detail line:
 * `Read: a, b · Create: c · Complexity: medium · Specialist: searcher · Brief: x/T1.md`
 */
export function parseDetailLine(line: string): RosterDetail {
  try {
    const trimmed = line.trim();
    if (trimmed.length === 0) return {};
    const detail: RosterDetail = {};
    const segments = trimmed.split(/\s*·\s*/);
    for (const seg of segments) {
      const colon = seg.indexOf(":");
      if (colon <= 0) continue;
      const key = seg.slice(0, colon).trim().toLowerCase();
      const value = seg.slice(colon + 1).trim();
      if (value.length === 0) continue;
      if (key === "read") {
        detail.read = splitList(value);
      } else if (key === "modify") {
        detail.modify = splitList(value);
      } else if (key === "create") {
        detail.create = splitList(value);
      } else if (key === "complexity") {
        detail.complexity = value;
      } else if (key === "specialist") {
        detail.specialist = value;
      } else if (key === "brief") {
        detail.brief = value;
      }
    }
    return detail;
  } catch {
    return {};
  }
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Extract checkbox items that look like roster lines, with optional detail
 * on the following indented line.
 */
export function extractRosterItems(raw: string): Array<{
  state: CheckboxState;
  taskId?: string;
  role?: string;
  title: string;
  detail?: RosterDetail;
  lineIndex: number;
  pointer?: string;
}> {
  try {
    const text = normalizeInput(raw);
    const lines = splitLines(text);
    const out: Array<{
      state: CheckboxState;
      taskId?: string;
      role?: string;
      title: string;
      detail?: RosterDetail;
      lineIndex: number;
      pointer?: string;
    }> = [];

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      const m = line.match(CHECKBOX_RE);
      if (!m) continue;
      const marker = m[2] ?? " ";
      const label = (m[3] ?? "").trim();
      const pointerMatch = label.match(/→\s*`?([^`\s]+)`?\s*$/);
      const parts = parseRosterLabel(label);
      const entry: {
        state: CheckboxState;
        taskId?: string;
        role?: string;
        title: string;
        detail?: RosterDetail;
        lineIndex: number;
        pointer?: string;
      } = {
        state: stateFromMarker(marker),
        title: parts.title,
        lineIndex: i,
      };
      if (parts.taskId !== undefined) entry.taskId = parts.taskId;
      if (parts.role !== undefined) entry.role = parts.role;
      if (pointerMatch?.[1]) entry.pointer = pointerMatch[1];

      // Look ahead for indented detail line
      const next = lines[i + 1] ?? "";
      if (/^\s{2,}\S/.test(next) && !CHECKBOX_RE.test(next)) {
        const detail = parseDetailLine(next);
        if (Object.keys(detail).length > 0) {
          entry.detail = detail;
        }
        i += 1;
      }
      out.push(entry);
    }
    return out;
  } catch {
    return [];
  }
}
