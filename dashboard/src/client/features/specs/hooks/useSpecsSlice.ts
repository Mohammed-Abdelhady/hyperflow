import { useMemo } from "react";
import { isRawEntry } from "@shared/derived/parse-nodes.js";
import type { SpecEntry, SpecNode } from "@shared/schemas/index.js";
import { useSnapshotSlice } from "../../../hooks/use-slice";
import { selectSpecs } from "../../../utils/selectors";

export interface SpecListItem {
  slug: string;
  path: string;
  title: string;
  mtimeMs?: number;
  parseError: boolean;
  draft: boolean;
}

function toItem(entry: SpecEntry): SpecListItem {
  if (isRawEntry(entry)) {
    return {
      slug: entry.path,
      path: entry.path,
      title: entry.path.split("/").pop() ?? entry.path,
      ...(entry.mtimeMs !== undefined ? { mtimeMs: entry.mtimeMs } : {}),
      parseError: true,
      draft: false,
    };
  }
  const node = entry as SpecNode;
  return {
    slug: node.slug,
    path: node.path,
    title: node.slug,
    ...(node.mtimeMs !== undefined ? { mtimeMs: node.mtimeMs } : {}),
    parseError: false,
    draft: node.draft,
  };
}

export function useSpecsSlice() {
  const specs = useSnapshotSlice((s) => selectSpecs(s.data));

  const items = useMemo(() => {
    const list = specs.map(toItem);
    list.sort((a, b) => {
      const am = a.mtimeMs ?? 0;
      const bm = b.mtimeMs ?? 0;
      return bm - am || a.slug.localeCompare(b.slug);
    });
    return list;
  }, [specs]);

  const bySlug = useMemo(() => {
    const map = new Map<string, SpecEntry>();
    for (const s of specs) {
      if (isRawEntry(s)) map.set(s.path, s);
      else map.set((s as SpecNode).slug, s);
    }
    return map;
  }, [specs]);

  /** Revision pairs by shared base name (slug without trailing revision suffix). */
  const revisionGroups = useMemo(() => {
    const groups = new Map<string, SpecNode[]>();
    for (const s of specs) {
      if (isRawEntry(s)) continue;
      const node = s as SpecNode;
      const base = node.slug.replace(/-v\d+$/i, "").replace(/-rev\d+$/i, "");
      const arr = groups.get(base) ?? [];
      arr.push(node);
      groups.set(base, arr);
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) => (a.mtimeMs ?? 0) - (b.mtimeMs ?? 0));
    }
    return groups;
  }, [specs]);

  return {
    items,
    bySlug,
    revisionGroups,
    empty: items.length === 0,
  };
}

export function revisionsForSlug(
  groups: Map<string, SpecNode[]>,
  slug: string,
): SpecNode[] {
  const base = slug.replace(/-v\d+$/i, "").replace(/-rev\d+$/i, "");
  return groups.get(base) ?? groups.get(slug) ?? [];
}
