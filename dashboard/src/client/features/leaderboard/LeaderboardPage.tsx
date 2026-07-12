import { CountBarTable } from "./components/CountBarTable";
import { useLeaderboard } from "./hooks/use-leaderboard";

export function LeaderboardPage() {
  const { result, markdownOnly, empty } = useLeaderboard();

  return (
    <div className="hf-analytics" data-testid="surface-leaderboard">
      <h1 className="hf-analytics__title">Agent Leaderboard</h1>
      <div className="hf-analytics__panel">
        <CountBarTable rows={result?.rows ?? []} />
        {empty ? (
          <p className="hf-replay__note" data-testid="leaderboard-empty">
            No agent activity yet. Stats come from dispatch telemetry in task
            rosters, cost tables, and background registry entries.
          </p>
        ) : null}
        {markdownOnly ? (
          <p className="hf-fidelity-note" data-testid="leaderboard-fidelity">
            Markdown-only mode — events.ndjson absent; rankings use artefact
            telemetry only and may under-count live dispatch.
          </p>
        ) : null}
      </div>
    </div>
  );
}
