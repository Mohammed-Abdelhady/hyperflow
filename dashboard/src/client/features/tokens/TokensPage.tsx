import { useState } from "react";
import { ChartCards, type TokensTab } from "./components/ChartCards";
import { StatTileRow } from "./components/StatTileRow";
import { useTokens } from "./hooks/use-tokens";

export function TokensPage() {
  const spend = useTokens();
  const [tab, setTab] = useState<TokensTab>("tokens");

  return (
    <div className="hf-analytics" data-testid="surface-tokens">
      <h1 className="hf-analytics__title">Token analytics</h1>
      <div className="hf-analytics__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "tokens"}
          className={
            tab === "tokens"
              ? "hf-analytics__tab hf-analytics__tab--active"
              : "hf-analytics__tab"
          }
          data-testid="tokens-tab-tokens"
          onClick={() => setTab("tokens")}
        >
          Tokens
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "cost"}
          className={
            tab === "cost"
              ? "hf-analytics__tab hf-analytics__tab--active"
              : "hf-analytics__tab"
          }
          data-testid="tokens-tab-cost"
          onClick={() => setTab("cost")}
        >
          Cost
        </button>
      </div>
      {!spend || spend.empty ? (
        <div className="hf-analytics__panel" data-testid="tokens-zero">
          <p className="hf-replay__note">
            No token or cost data found. Sources searched: task estimated/actual
            cost tables, Tokens used: status lines, and feature-phase task
            rosters.
          </p>
        </div>
      ) : (
        <>
          <StatTileRow spend={spend} />
          <ChartCards spend={spend} tab={tab} />
        </>
      )}
    </div>
  );
}
