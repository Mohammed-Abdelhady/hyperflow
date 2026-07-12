import { memo, useState } from "react";
import { useReducedMotion } from "../../../hooks/use-reduced-motion";
import type { SpecDiffModel } from "../hooks/useSpecDiff";

export interface SectionDiffProps {
  model: SpecDiffModel;
  testId?: string;
}

function SectionDiffImpl({
  model,
  testId = "section-diff",
}: SectionDiffProps) {
  const reduced = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);

  if (!model.canCompare) {
    return (
      <div className="hf-diff__controls" data-testid={testId}>
        <button
          type="button"
          className="hf-btn"
          disabled
          data-testid={`${testId}-compare-disabled`}
          title={model.label}
        >
          {model.label}
        </button>
      </div>
    );
  }

  return (
    <div data-testid={testId}>
      <div className="hf-diff__controls">
        <button
          type="button"
          className="hf-btn"
          data-testid={`${testId}-toggle`}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? "Expand diff" : "Collapse diff"}
        </button>
      </div>
      <div
        className="hf-diff__reveal"
        data-collapsed={collapsed ? "true" : "false"}
        data-reduced-motion={reduced ? "true" : "false"}
        data-testid={`${testId}-reveal`}
      >
        <div className="hf-diff" data-testid={`${testId}-grid`}>
          <div className="hf-diff__pane" data-testid={`${testId}-left`}>
            {model.rows
              .filter((r) => r.side === "left" || r.side === "both")
              .map((row, i) => (
                <div
                  key={`L-${row.anchor}-${i}`}
                  className="hf-diff__row"
                  data-testid={`${testId}-row-left-${i}`}
                >
                  <span
                    className={
                      row.kind === "remove"
                        ? "hf-diff__gutter hf-diff__gutter--remove"
                        : "hf-diff__gutter"
                    }
                    data-testid={
                      row.kind === "remove"
                        ? `${testId}-gutter-remove-${i}`
                        : undefined
                    }
                  />
                  <div
                    className={
                      row.kind === "remove"
                        ? "hf-diff__body hf-diff__body--remove"
                        : "hf-diff__body"
                    }
                  >
                    {row.text}
                  </div>
                </div>
              ))}
          </div>
          <div className="hf-diff__pane" data-testid={`${testId}-right`}>
            {model.rows
              .filter((r) => r.side === "right" || r.side === "both")
              .map((row, i) => (
                <div
                  key={`R-${row.anchor}-${i}`}
                  className="hf-diff__row"
                  data-testid={`${testId}-row-right-${i}`}
                >
                  <span
                    className={
                      row.kind === "add"
                        ? "hf-diff__gutter hf-diff__gutter--add"
                        : "hf-diff__gutter"
                    }
                    data-testid={
                      row.kind === "add"
                        ? `${testId}-gutter-add-${i}`
                        : undefined
                    }
                  />
                  <div
                    className={
                      row.kind === "add"
                        ? "hf-diff__body hf-diff__body--add"
                        : "hf-diff__body"
                    }
                  >
                    {row.text}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export const SectionDiff = memo(SectionDiffImpl);
