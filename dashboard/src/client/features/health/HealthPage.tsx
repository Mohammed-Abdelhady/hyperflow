import { ScoreMeter } from "../../components/ScoreMeter";
import { FactorList } from "./components/FactorList";
import { ParseFailureList } from "./components/ParseFailureList";
import { useHealth } from "./hooks/use-health";

export function HealthPage() {
  const health = useHealth();

  return (
    <div className="hf-analytics" data-testid="surface-health">
      <h1 className="hf-analytics__title">Flow Health</h1>
      <div className="hf-analytics__panel">
        <div className="hf-health-layout">
          <ScoreMeter
            value={health?.score ?? 0}
            testId="health-score"
          />
          <div>
            {health ? (
              <FactorList factors={health.factors} />
            ) : (
              <p
                className="hf-replay__note"
                data-testid="health-zero"
              >
                No snapshot loaded. Open the dashboard against a project with a
                .hyperflow tree to score Flow Health.
              </p>
            )}
          </div>
        </div>
        {health ? (
          <ParseFailureList failures={health.parseFailures} />
        ) : null}
      </div>
    </div>
  );
}
