import { lazy, memo, Suspense, useState } from "react";
import { RosterRow } from "../../../components/RosterRow";
import { StageChip } from "../../../components/StageChip";
import type { GraphEdgeData, GraphNodeData } from "../../../graph/types";
import type { RosterAgent } from "../hooks/use-mission-roster";

const LazyGraph = lazy(async () => {
  const { GraphCanvas } = await import("../../../graph/GraphCanvas");
  return { default: GraphCanvas };
});

export interface DispatchBoardProps {
  agents: readonly RosterAgent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  testId?: string;
}

function toGraph(agents: readonly RosterAgent[]): {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
} {
  const nodes: GraphNodeData[] = agents.map((a) => ({
    id: a.id,
    kind: "agent",
    title: a.title,
    typeTag: "agent",
    costLabel: a.costLabel,
    state: a.stageState,
  }));
  const edges: GraphEdgeData[] = [];
  for (let i = 0; i < agents.length - 1; i += 1) {
    edges.push({
      id: `e-${agents[i]!.id}-${agents[i + 1]!.id}`,
      source: agents[i]!.id,
      target: agents[i + 1]!.id,
    });
  }
  return { nodes, edges };
}

function DispatchBoardImpl({
  agents,
  selectedId,
  onSelect,
  testId = "mission-board",
}: DispatchBoardProps) {
  const [view, setView] = useState<"roster" | "graph">("roster");
  const graph = toGraph(agents);

  return (
    <section className="hf-cockpit__board" data-testid={testId}>
      <div className="hf-board-views" role="toolbar">
        <button
          type="button"
          className={
            view === "roster"
              ? "hf-board-views__btn hf-board-views__btn--active"
              : "hf-board-views__btn"
          }
          data-testid={`${testId}-view-roster`}
          aria-pressed={view === "roster"}
          onClick={() => setView("roster")}
        >
          Roster
        </button>
        <button
          type="button"
          className={
            view === "graph"
              ? "hf-board-views__btn hf-board-views__btn--active"
              : "hf-board-views__btn"
          }
          data-testid={`${testId}-view-graph`}
          aria-pressed={view === "graph"}
          onClick={() => setView("graph")}
        >
          Graph
        </button>
      </div>
      {view === "roster" ? (
        <div
          className="hf-roster"
          role="listbox"
          aria-label="Dispatch roster"
          data-testid={`${testId}-roster`}
        >
          {agents.map((agent) => {
            const selected = agent.id === selectedId;
            return (
              <div
                key={agent.id}
                className="hf-roster__row-wrap"
                data-testid={`${testId}-row-${agent.id}`}
              >
                <RosterRow
                  title={agent.title}
                  meta={agent.costLabel}
                  selected={selected}
                  onSelect={() => onSelect(agent.id)}
                  testId={`${testId}-roster-${agent.id}`}
                />
                <StageChip
                  label={agent.stageLabel}
                  state={agent.stageState}
                  {...(agent.stageState === "live"
                    ? { indeterminate: true }
                    : {})}
                  testId={`${testId}-chip-${agent.id}`}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="hf-board-graph" data-testid={`${testId}-graph-host`}>
          <Suspense
            fallback={
              <div className="hf-placeholder" data-testid={`${testId}-graph-loading`}>
                Loading graph…
              </div>
            }
          >
            <LazyGraph
              nodes={graph.nodes}
              edges={graph.edges}
              algorithm="layered"
              selectedId={selectedId}
              onSelect={onSelect}
              testId={`${testId}-graph`}
            />
          </Suspense>
        </div>
      )}
    </section>
  );
}

export const DispatchBoard = memo(DispatchBoardImpl);
