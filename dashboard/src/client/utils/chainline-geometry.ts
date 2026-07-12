export interface ChainStage {
  id: string;
  label: string;
  costLabel?: string;
}

/** Live fill fraction: completed stages + partial current. */
export function liveFillScale(
  stages: readonly ChainStage[],
  activeIndex: number,
): number {
  if (stages.length === 0) return 0;
  if (activeIndex < 0) return 0;
  if (activeIndex >= stages.length - 1) return 1;
  return (activeIndex + 1) / stages.length;
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Map pointer clientX within rail to 0..1, direction-aware. */
export function pointerToProgress(
  clientX: number,
  rect: { left: number; width: number },
  rtl: boolean,
): number {
  if (rect.width <= 0) return 0;
  const raw = (clientX - rect.left) / rect.width;
  return clamp01(rtl ? 1 - raw : raw);
}

export function nearestBoundaryIndex(
  progress: number,
  count: number,
): number {
  if (count <= 0) return 0;
  if (count === 1) return 0;
  return Math.round(progress * (count - 1));
}

export function indexToProgress(index: number, count: number): number {
  if (count <= 1) return 0;
  return clamp01(index / (count - 1));
}

/** Direction-aware step keys. */
export function stepDeltaFromKey(
  key: string,
  rtl: boolean,
): number | null {
  if (key === "ArrowRight") return rtl ? -1 : 1;
  if (key === "ArrowLeft") return rtl ? 1 : -1;
  return null;
}
