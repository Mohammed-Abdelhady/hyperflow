import { lazy, memo, Suspense } from "react";
import type { MemoryGraphModel } from "../utils/graph-model";

const GraphCanvas = lazy(async () => {
  const mod = await import("../../../graph/GraphCanvas");
  return { default: mod.GraphCanvas };
});

export interface KnowledgeGraphProps {
  model: MemoryGraphModel;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  testId?: string;
}

function KnowledgeGraphImpl({
  model,
  selectedId,
  onSelect,
  testId = "memory-graph",
}: KnowledgeGraphProps) {
  if (model.unlinked) {
    return (
      <div data-testid={testId}>
        <p className="hf-replay__note" data-testid={`${testId}-fallback-note`}>
          No cross-references yet — entries appear as a grid until links form
          via [[wikilinks]] or memory/ paths in evidence.
        </p>
        <div className="hf-memory-grid" data-testid={`${testId}-grid`}>
          {model.gridEntries.map((e) => (
            <button
              key={e.id}
              type="button"
              className="hf-btn"
              data-testid={`${testId}-grid-${e.id}`}
              onClick={() => onSelect(e.id)}
            >
              {e.title}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div data-testid={testId} style={{ minHeight: 280 }}>
      <Suspense
        fallback={
          <div data-testid={`${testId}-loading`}>Loading knowledge graph…</div>
        }
      >
        <GraphCanvas
          nodes={model.nodes}
          edges={model.edges}
          selectedId={selectedId}
          onSelect={onSelect}
          testId={`${testId}-canvas`}
        />
      </Suspense>
    </div>
  );
}

export const KnowledgeGraph = memo(KnowledgeGraphImpl);
