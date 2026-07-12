import { isRawEntry } from "@shared/derived/parse-nodes.js";
import type {
  MemoryCategoryEntry,
  MemoryCategoryFile,
  MemoryEntry,
} from "@shared/schemas/index.js";
import type {
  GraphEdgeData,
  GraphNodeData,
} from "../../../graph/types";

export interface MemoryGraphModel {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
  unlinked: boolean;
  gridEntries: MemoryEntryView[];
}

export interface MemoryEntryView {
  id: string;
  category: string;
  title: string;
  entry: MemoryEntry;
  derived: boolean;
  legacy: boolean;
  path: string;
  mtimeMs?: number;
}

const DERIVED_CATEGORIES = new Set(["index", ".checksums", "checksums"]);

export function isDerivedCategory(category: string, path: string): boolean {
  const base = path.split("/").pop()?.toLowerCase() ?? "";
  if (base === "index.md" || base === ".checksums") return true;
  return DERIVED_CATEGORIES.has(category.toLowerCase());
}

export function flattenEntries(
  memory: readonly MemoryCategoryEntry[],
): MemoryEntryView[] {
  const out: MemoryEntryView[] = [];
  for (const cat of memory) {
    if (isRawEntry(cat)) {
      out.push({
        id: cat.path,
        category: cat.path,
        title: cat.path,
        entry: {
          id: cat.path,
          class: "raw",
          title: cat.path,
          rawBody: cat.raw,
          tags: [],
        },
        derived: isDerivedCategory(cat.path, cat.path),
        legacy: true,
        path: cat.path,
        ...(cat.mtimeMs !== undefined ? { mtimeMs: cat.mtimeMs } : {}),
      });
      continue;
    }
    const file = cat as MemoryCategoryFile;
    const derived = isDerivedCategory(file.category, file.path);
    for (const entry of file.entries) {
      out.push({
        id: entry.id,
        category: file.category,
        title: entry.title,
        entry,
        derived,
        legacy: entry.class === "legacy" || entry.class === "raw",
        path: file.path,
        ...(file.mtimeMs !== undefined ? { mtimeMs: file.mtimeMs } : {}),
      });
    }
  }
  return out;
}

function extractRefs(entry: MemoryEntry): string[] {
  const refs: string[] = [];
  const hay = [entry.evidence, entry.what, entry.why, entry.rawBody]
    .filter(Boolean)
    .join("\n");
  const re = /\[\[([^\]]+)\]\]|memory\/([a-zA-Z0-9_.-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(hay)) !== null) {
    const hit = (m[1] ?? m[2] ?? "").trim();
    if (hit) refs.push(hit);
  }
  return refs;
}

export function buildMemoryGraphModel(
  memory: readonly MemoryCategoryEntry[],
): MemoryGraphModel {
  const views = flattenEntries(memory).filter((v) => !v.derived);
  const byId = new Map(views.map((v) => [v.id, v]));
  const byTitle = new Map(views.map((v) => [v.title.toLowerCase(), v]));

  const nodes: GraphNodeData[] = views.map((v) => ({
    id: v.id,
    kind: "memory-entry",
    title: v.title,
    typeTag: "memory",
    meta: { category: v.category, class: v.entry.class },
  }));

  const edges: GraphEdgeData[] = [];
  let edgeN = 0;
  for (const v of views) {
    for (const ref of extractRefs(v.entry)) {
      const target =
        byId.get(ref) ??
        byTitle.get(ref.toLowerCase()) ??
        views.find((x) => x.category === ref);
      if (!target || target.id === v.id) continue;
      edges.push({
        id: `e-${edgeN++}`,
        source: v.id,
        target: target.id,
        weight: 2,
      });
    }
  }

  return {
    nodes,
    edges,
    unlinked: edges.length === 0,
    gridEntries: views,
  };
}
