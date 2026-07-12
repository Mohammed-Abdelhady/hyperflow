import { memo } from "react";
import type { TokenSpendResult } from "@shared/derived/index.js";
import { formatTokens } from "../../../utils/format";

export type TokensTab = "tokens" | "cost";

export interface ChartCardsProps {
  spend: TokenSpendResult;
  tab: TokensTab;
  testId?: string;
}

function ChartCardsImpl({
  spend,
  tab,
  testId = "tokens-charts",
}: ChartCardsProps) {
  const series =
    tab === "cost"
      ? spend.byRole.map((r) => ({
          id: r.role,
          label: r.role,
          value: r.tokens,
        }))
      : spend.byChain.map((c) => ({
          id: c.chain,
          label: c.chain,
          value: c.tokens,
        }));

  const max = Math.max(1, ...series.map((s) => s.value));

  return (
    <div className="hf-chart-card" data-testid={testId}>
      <h3 className="hf-chart-card__title">
        {tab === "cost" ? "Cost by role" : "Tokens by chain"}
      </h3>
      {series.length === 0 ? (
        <p className="hf-replay__note" data-testid={`${testId}-empty`}>
          No series data.
        </p>
      ) : (
        <div className="hf-chart-bars" data-testid={`${testId}-bars`}>
          {series.slice(0, 12).map((s) => (
            <div key={s.id} className="hf-chart-bars__col">
              <div
                className="hf-chart-bars__bar"
                style={{ height: `${(s.value / max) * 100}%` }}
                title={formatTokens(s.value)}
                data-testid={`${testId}-bar-${s.id}`}
              />
              <span className="hf-chart-bars__label">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const ChartCards = memo(ChartCardsImpl);
