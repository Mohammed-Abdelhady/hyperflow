import { memo } from "react";
import type { HealthFactorBreakdown } from "@shared/derived/index.js";
import { formatPercent } from "../../../utils/format";

export interface FactorListProps {
  factors: HealthFactorBreakdown;
  testId?: string;
}

const FACTORS: readonly {
  key: keyof Pick<
    HealthFactorBreakdown,
    "parseSuccessRate" | "gatePassRate" | "nonFailureRate" | "stalenessDecay"
  >;
  label: string;
  weightKey: keyof HealthFactorBreakdown["weights"];
}[] = [
  {
    key: "parseSuccessRate",
    label: "Parse success rate",
    weightKey: "parseSuccess",
  },
  { key: "gatePassRate", label: "Gate pass rate", weightKey: "gatePass" },
  {
    key: "nonFailureRate",
    label: "Non-failure rate",
    weightKey: "nonFailure",
  },
  {
    key: "stalenessDecay",
    label: "Staleness decay",
    weightKey: "staleness",
  },
];

function FactorListImpl({
  factors,
  testId = "health-factors",
}: FactorListProps) {
  return (
    <ul className="hf-factor-list" data-testid={testId}>
      {FACTORS.map((f) => (
        <li
          key={f.key}
          className="hf-factor-list__row"
          tabIndex={0}
          data-testid={`${testId}-${f.key}`}
        >
          <span>
            {f.label}
            <span style={{ color: "var(--text-dim)" }}>
              {" "}
              · w={formatPercent(factors.weights[f.weightKey])}
            </span>
          </span>
          <span
            className="hf-factor-list__value"
            data-testid={`${testId}-${f.key}-value`}
          >
            {formatPercent(factors[f.key])}
          </span>
        </li>
      ))}
    </ul>
  );
}

export const FactorList = memo(FactorListImpl);
