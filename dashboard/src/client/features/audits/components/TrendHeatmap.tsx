import { memo, useCallback, useState } from "react";
import { HeatmapCell } from "../../../components/HeatmapCell";
import type { HeatmapModel } from "../hooks/useHeatmapModel";

export interface TrendHeatmapProps {
  model: HeatmapModel;
  onSelectAudit?: (slug: string) => void;
  testId?: string;
}

function TrendHeatmapImpl({
  model,
  onSelectAudit,
  testId = "trend-heatmap",
}: TrendHeatmapProps) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const onActivate = useCallback(
    (slug: string) => {
      setOpenSlug((prev) => (prev === slug ? null : slug));
      onSelectAudit?.(slug);
    },
    [onSelectAudit],
  );

  if (model.cells.length === 0) return null;

  const openCell = model.cells.find((c) => c.auditSlug === openSlug) ?? null;

  return (
    <div
      className="hf-heatmap"
      data-testid={testId}
      style={{ position: "relative" }}
    >
      <h3 className="hf-doc__section-title">Audit trend</h3>
      {model.note ? (
        <p className="hf-replay__note" data-testid={`${testId}-single-note`}>
          {model.note}
        </p>
      ) : null}
      <div
        className="hf-heatmap__grid"
        data-testid={`${testId}-grid`}
        data-single={model.singleAudit ? "true" : "false"}
        style={{
          gridTemplateColumns: model.singleAudit
            ? "1fr"
            : `repeat(${model.cells.length}, minmax(2rem, 1fr))`,
        }}
      >
        {model.cells.map((cell) => (
          <HeatmapCell
            key={cell.auditSlug}
            intensity={cell.intensity}
            valueLabel={cell.valueLabel}
            onActivate={() => onActivate(cell.auditSlug)}
            testId={`${testId}-cell-${cell.auditSlug}`}
          />
        ))}
      </div>
      {openCell ? (
        <div
          className="hf-heatmap__popover"
          role="dialog"
          data-testid={`${testId}-popover`}
        >
          <div data-testid={`${testId}-popover-value`}>{openCell.total}</div>
          <div data-testid={`${testId}-popover-breakdown`}>
            {openCell.breakdown}
          </div>
          <button
            type="button"
            className="hf-btn"
            data-testid={`${testId}-popover-dismiss`}
            onClick={() => setOpenSlug(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}

export const TrendHeatmap = memo(TrendHeatmapImpl);
