import { memo, type KeyboardEvent } from "react";
import {
  HEATMAP_INTENSITY_RAMP,
  type HeatmapIntensity,
} from "../constants/state-tokens";

export interface HeatmapCellProps {
  intensity: HeatmapIntensity;
  /** Accessible name carries the value — never printed in-cell. */
  valueLabel: string;
  onActivate?: () => void;
  testId?: string;
}

function HeatmapCellImpl({
  intensity,
  valueLabel,
  onActivate,
  testId = "heatmap-cell",
}: HeatmapCellProps) {
  const bg = HEATMAP_INTENSITY_RAMP[intensity] ?? HEATMAP_INTENSITY_RAMP[0];

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate?.();
    }
  };

  return (
    <button
      type="button"
      className="hf-heatmap-cell"
      data-testid={testId}
      data-intensity={intensity}
      style={{ background: bg }}
      aria-label={valueLabel}
      title={valueLabel}
      onClick={onActivate}
      onKeyDown={onKeyDown}
    />
  );
}

export const HeatmapCell = memo(HeatmapCellImpl);
