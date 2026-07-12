import {
  computeConclusions,
  computeFlowHealth,
  computeLeaderboard,
  computeTokenSpend,
} from "@shared/derived/index.js";
import type { Snapshot } from "@shared/schemas/index.js";

/**
 * Input-reference memoization — returns prior result when input === lastInput.
 */
export function createMemoSelector<TIn, TOut>(
  fn: (input: TIn) => TOut,
): (input: TIn) => TOut {
  let lastInput: TIn | typeof UNSET = UNSET;
  let lastOutput: TOut | typeof UNSET = UNSET;
  return (input: TIn): TOut => {
    if (input === lastInput && lastOutput !== UNSET) {
      return lastOutput as TOut;
    }
    const output = fn(input);
    lastInput = input;
    lastOutput = output;
    return output;
  };
}

const UNSET = Symbol("unset");

/** Injected clock for pure health scoring (tests pass a fixed now). */
export function createFlowHealthSelector(now: () => Date | number) {
  return createMemoSelector((snapshot: Snapshot | null) =>
    snapshot ? computeFlowHealth(snapshot, now()) : null,
  );
}

export const selectFlowHealth = createFlowHealthSelector(() => Date.now());

export const selectLeaderboard = createMemoSelector(
  (snapshot: Snapshot | null) =>
    snapshot ? computeLeaderboard(snapshot) : null,
);

export const selectConclusions = createMemoSelector(
  (snapshot: Snapshot | null) =>
    snapshot ? computeConclusions(snapshot) : null,
);

export const selectTokenAnalytics = createMemoSelector(
  (snapshot: Snapshot | null) =>
    snapshot ? computeTokenSpend(snapshot) : null,
);

/** Reference-stable slice extractors for store subscriptions. */
export function selectTasks(snapshot: Snapshot | null) {
  return snapshot?.tasks ?? EMPTY_ARR;
}
export function selectAudits(snapshot: Snapshot | null) {
  return snapshot?.audits ?? EMPTY_ARR;
}
export function selectMemory(snapshot: Snapshot | null) {
  return snapshot?.memory ?? EMPTY_ARR;
}
export function selectFeatures(snapshot: Snapshot | null) {
  return snapshot?.features ?? EMPTY_ARR;
}
export function selectSpecs(snapshot: Snapshot | null) {
  return snapshot?.specs ?? EMPTY_ARR;
}
export function selectHandoff(snapshot: Snapshot | null) {
  return snapshot?.handoff ?? EMPTY_ARR;
}
export function selectMarkers(snapshot: Snapshot | null) {
  return snapshot?.markers ?? null;
}

const EMPTY_ARR: never[] = [];
