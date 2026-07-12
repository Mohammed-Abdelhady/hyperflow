import { memo } from "react";
import type { LeaderboardRow } from "@shared/derived/index.js";
import { formatTokens } from "../../../utils/format";

export interface CountBarTableProps {
  rows: readonly LeaderboardRow[];
  testId?: string;
}

function CountBarTableImpl({
  rows,
  testId = "leaderboard-table",
}: CountBarTableProps) {
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div data-testid={testId} role="table" aria-label="Agent leaderboard">
      <div
        className="hf-count-bar"
        role="row"
        data-testid={`${testId}-header`}
        style={{ color: "var(--text-dim)" }}
      >
        <span className="hf-count-bar__rank">#</span>
        <span className="hf-count-bar__label">Name</span>
        <span className="hf-count-bar__value">Count · Tokens</span>
      </div>
      {rows.map((row) => {
        const scale = row.count / max;
        return (
          <div
            key={`${row.dimension}-${row.name}`}
            className="hf-count-bar"
            role="row"
            tabIndex={0}
            data-testid={`${testId}-row-${row.rank}`}
          >
            <span
              className="hf-count-bar__fill"
              style={{ transform: `scaleX(${scale})` }}
              aria-hidden
            />
            <span
              className="hf-count-bar__rank"
              data-testid={`${testId}-rank-${row.rank}`}
            >
              {row.rank}
            </span>
            <span
              className="hf-count-bar__label"
              data-testid={`${testId}-name-${row.rank}`}
            >
              {row.name}
              <span style={{ color: "var(--text-dim)" }}>
                {" "}
                · {row.dimension}
              </span>
            </span>
            <span
              className="hf-count-bar__value"
              data-testid={`${testId}-count-${row.rank}`}
            >
              {row.count} · {formatTokens(row.tokens)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const CountBarTable = memo(CountBarTableImpl);
