import { useMemo } from "react";
import type { TokenSpendResult } from "@shared/derived/index.js";
import { useSnapshotData } from "../../../hooks/use-slice";
import { selectTokenAnalytics } from "../../../utils/selectors";

export function useTokens(): TokenSpendResult | null {
  const snapshot = useSnapshotData();
  return useMemo(() => selectTokenAnalytics(snapshot), [snapshot]);
}
