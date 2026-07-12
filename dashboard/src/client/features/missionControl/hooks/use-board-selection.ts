import { useCallback } from "react";
import { useUiSlice } from "../../../hooks/use-slice";
import { useUiStore } from "../../../stores/ui";

const SURFACE = "mission";

export function useBoardSelection() {
  const selection = useUiSlice((s) =>
    s.selection?.surface === SURFACE ? s.selection.id : null,
  );

  const select = useCallback((id: string | null) => {
    if (id === null) {
      useUiStore.getState().setSelection(null);
      return;
    }
    useUiStore.getState().setSelection({ surface: SURFACE, id });
  }, []);

  return { selectedId: selection, select };
}
