import { memo } from "react";
import { SEVERITY_ORDER } from "../utils/severity";

export interface SeverityFiltersProps {
  active: string | null;
  onChange: (severity: string | null) => void;
  testId?: string;
}

function SeverityFiltersImpl({
  active,
  onChange,
  testId = "severity-filters",
}: SeverityFiltersProps) {
  return (
    <div className="hf-stream-filters" data-testid={testId} role="toolbar">
      <button
        type="button"
        className={
          active === null
            ? "hf-stream-filters__chip hf-stream-filters__chip--active"
            : "hf-stream-filters__chip"
        }
        data-testid={`${testId}-all`}
        onClick={() => onChange(null)}
      >
        All
      </button>
      {SEVERITY_ORDER.filter((s) => s !== "unknown").map((s) => (
        <button
          key={s}
          type="button"
          className={
            active === s
              ? "hf-stream-filters__chip hf-stream-filters__chip--active"
              : "hf-stream-filters__chip"
          }
          data-testid={`${testId}-${s}`}
          onClick={() => onChange(s)}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

export const SeverityFilters = memo(SeverityFiltersImpl);
