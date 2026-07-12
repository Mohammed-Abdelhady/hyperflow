import { useMemo } from "react";
import { isRawEntry } from "@shared/derived/parse-nodes.js";
import type {
  FeatureEntry,
  FeatureNode,
} from "@shared/schemas/index.js";
import { useSnapshotSlice } from "../../../hooks/use-slice";
import { selectFeatures } from "../../../utils/selectors";
import {
  featureToListItem,
  orderPhases,
  progressPercent,
} from "../utils/feature-tree";

export function useFeaturesSlice() {
  const features = useSnapshotSlice((s) => selectFeatures(s.data));

  const items = useMemo(() => {
    const list = features.map(featureToListItem);
    list.sort((a, b) => {
      const am = a.mtimeMs ?? 0;
      const bm = b.mtimeMs ?? 0;
      return bm - am || a.slug.localeCompare(b.slug);
    });
    return list;
  }, [features]);

  const bySlug = useMemo(() => {
    const map = new Map<string, FeatureEntry>();
    for (const f of features) {
      if (isRawEntry(f)) map.set(f.path, f);
      else map.set((f as FeatureNode).slug, f);
    }
    return map;
  }, [features]);

  return {
    items,
    bySlug,
    empty: items.length === 0,
    orderPhases,
    progressPercent,
  };
}
