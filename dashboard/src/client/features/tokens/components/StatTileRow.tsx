import { memo } from "react";
import type { TokenSpendResult } from "@shared/derived/index.js";
import { StatCard } from "../../../components/StatCard";
import { formatDelta, formatTokens } from "../../../utils/format";

export interface StatTileRowProps {
  spend: TokenSpendResult;
  testId?: string;
}

function StatTileRowImpl({
  spend,
  testId = "tokens-tiles",
}: StatTileRowProps) {
  const deltaState =
    spend.deltaTokens > 0
      ? "blocked"
      : spend.deltaTokens < 0
        ? "pass"
        : "queued";

  return (
    <div className="hf-analytics__tiles" data-testid={testId}>
      <StatCard
        caption="Total tokens"
        value={formatTokens(spend.totalTokens)}
        testId={`${testId}-total`}
      />
      <StatCard
        caption="Estimated"
        value={formatTokens(spend.estimatedTotal)}
        testId={`${testId}-estimated`}
      />
      <StatCard
        caption="Actual"
        value={formatTokens(spend.actualTotal)}
        testId={`${testId}-actual`}
      />
      <StatCard
        caption="Delta"
        value={formatDelta(spend.deltaTokens, "tok")}
        {...(spend.deltaTokens === 0 ? { delta: "flat" } : {})}
        deltaState={deltaState}
        testId={`${testId}-delta`}
      />
    </div>
  );
}

export const StatTileRow = memo(StatTileRowImpl);
