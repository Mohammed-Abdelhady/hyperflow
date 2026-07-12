import { memo } from "react";
import type { SemanticState } from "../../../constants/state-tokens";

const FILTERS: readonly { id: SemanticState | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "pass", label: "Pass" },
  { id: "fix", label: "Fix" },
  { id: "blocked", label: "Blocked" },
  { id: "queued", label: "Queued" },
];

export interface StreamFiltersProps {
  active: SemanticState | "all";
  onChange: (id: SemanticState | "all") => void;
  testId?: string;
}

function StreamFiltersImpl({
  active,
  onChange,
  testId = "stream-filters",
}: StreamFiltersProps) {
  return (
    <div className="hf-stream-filters" role="toolbar" data-testid={testId}>
      {FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          className={
            active === f.id
              ? "hf-stream-filters__chip hf-stream-filters__chip--active"
              : "hf-stream-filters__chip"
          }
          data-testid={`${testId}-${f.id}`}
          aria-pressed={active === f.id}
          onClick={() => onChange(f.id)}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

export const StreamFilters = memo(StreamFiltersImpl);
