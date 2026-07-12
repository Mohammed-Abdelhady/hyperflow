import { useMemo } from "react";
import { useConnectionSlice } from "../../../hooks/use-slice";

export const OBSERVE_MODE_TOOLTIP =
  "Observe mode — filesystem is read-only; writes are disabled";

export function useObserveMode() {
  const connection = useConnectionSlice();
  return useMemo(
    () => ({
      observeMode: connection.observeMode,
      writeDisabled: connection.observeMode,
      tooltip: connection.observeMode ? OBSERVE_MODE_TOOLTIP : null,
    }),
    [connection.observeMode],
  );
}
