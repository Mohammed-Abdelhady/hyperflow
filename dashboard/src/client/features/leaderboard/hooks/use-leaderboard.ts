import { useMemo } from "react";
import type { LeaderboardResult } from "@shared/derived/index.js";
import { useSnapshotData } from "../../../hooks/use-slice";
import { selectLeaderboard } from "../../../utils/selectors";

export interface LeaderboardView {
  result: LeaderboardResult | null;
  /** True when events.ndjson absent — markdown-only fidelity note. */
  markdownOnly: boolean;
  empty: boolean;
}

export function useLeaderboard(): LeaderboardView {
  const snapshot = useSnapshotData();
  return useMemo(() => {
    const result = selectLeaderboard(snapshot);
    const markdownOnly = snapshot?.events.reducedFidelity === true;
    const empty = !result || result.rows.length === 0;
    return { result, markdownOnly, empty };
  }, [snapshot]);
}
