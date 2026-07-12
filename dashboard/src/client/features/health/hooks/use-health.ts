import { useMemo } from "react";
import type { FlowHealthResult } from "@shared/derived/index.js";
import { useSnapshotData } from "../../../hooks/use-slice";
import { selectFlowHealth } from "../../../utils/selectors";

export function useHealth(): FlowHealthResult | null {
  const snapshot = useSnapshotData();
  return useMemo(() => selectFlowHealth(snapshot), [snapshot]);
}
