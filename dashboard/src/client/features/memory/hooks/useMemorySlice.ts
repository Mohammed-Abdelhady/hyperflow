import { useMemo } from "react";
import { useSnapshotSlice } from "../../../hooks/use-slice";
import { selectMemory } from "../../../utils/selectors";
import {
  buildMemoryGraphModel,
  flattenEntries,
  type MemoryEntryView,
} from "../utils/graph-model";

export function useMemorySlice() {
  const memory = useSnapshotSlice((s) => selectMemory(s.data));
  const observeMode = useSnapshotSlice((s) => s.connection.observeMode);

  const entries = useMemo(() => flattenEntries(memory), [memory]);
  const graph = useMemo(() => buildMemoryGraphModel(memory), [memory]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(e.category);
    return [...set].sort();
  }, [entries]);

  const byId = useMemo(() => {
    const map = new Map<string, MemoryEntryView>();
    for (const e of entries) map.set(e.id, e);
    return map;
  }, [entries]);

  return {
    memory,
    entries,
    categories,
    byId,
    graph,
    empty: entries.length === 0,
    observeMode,
  };
}
