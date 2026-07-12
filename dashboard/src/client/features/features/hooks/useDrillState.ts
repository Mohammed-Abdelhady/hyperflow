import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { SLUG_QUERY_KEY } from "../../../constants/routes";

export interface DrillPosition {
  feature: string | null;
  phase: string | null;
  task: string | null;
}

const PHASE_KEY = "phase";
const TASK_KEY = "task";

/**
 * Drill position lives in the URL so back/forward walks levels.
 * Encodes feature via ?slug=, phase via ?phase=, task via ?task=.
 */
export function useDrillState() {
  const [params, setParams] = useSearchParams();

  const position: DrillPosition = useMemo(
    () => ({
      feature: params.get(SLUG_QUERY_KEY),
      phase: params.get(PHASE_KEY),
      task: params.get(TASK_KEY),
    }),
    [params],
  );

  const setPosition = useCallback(
    (next: Partial<DrillPosition>, replace = false) => {
      const merged: DrillPosition = {
        feature:
          next.feature !== undefined ? next.feature : position.feature,
        phase: next.phase !== undefined ? next.phase : position.phase,
        task: next.task !== undefined ? next.task : position.task,
      };
      const sp = new URLSearchParams();
      if (merged.feature) sp.set(SLUG_QUERY_KEY, merged.feature);
      if (merged.phase) sp.set(PHASE_KEY, merged.phase);
      if (merged.task) sp.set(TASK_KEY, merged.task);
      setParams(sp, { replace });
    },
    [position, setParams],
  );

  const selectFeature = useCallback(
    (slug: string) => {
      setPosition({ feature: slug, phase: null, task: null });
    },
    [setPosition],
  );

  const selectPhase = useCallback(
    (phase: string) => {
      setPosition({ phase, task: null });
    },
    [setPosition],
  );

  const selectTask = useCallback(
    (task: string) => {
      setPosition({ task });
    },
    [setPosition],
  );

  const goFeature = useCallback(() => {
    setPosition({ phase: null, task: null });
  }, [setPosition]);

  const goPhase = useCallback(() => {
    setPosition({ task: null });
  }, [setPosition]);

  return {
    position,
    selectFeature,
    selectPhase,
    selectTask,
    goFeature,
    goPhase,
  };
}

/** Pure helper for unit tests — round-trip drill position through URLSearchParams. */
export function encodeDrill(pos: DrillPosition): string {
  const sp = new URLSearchParams();
  if (pos.feature) sp.set(SLUG_QUERY_KEY, pos.feature);
  if (pos.phase) sp.set(PHASE_KEY, pos.phase);
  if (pos.task) sp.set(TASK_KEY, pos.task);
  return sp.toString();
}

export function decodeDrill(query: string): DrillPosition {
  const sp = new URLSearchParams(query);
  return {
    feature: sp.get(SLUG_QUERY_KEY),
    phase: sp.get(PHASE_KEY),
    task: sp.get(TASK_KEY),
  };
}
