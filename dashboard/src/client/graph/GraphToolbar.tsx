import { memo } from "react";

export type GraphTool = "select" | "pan";

export interface GraphToolbarProps {
  tool: GraphTool;
  viewMode: "graph" | "table";
  onToolChange: (tool: GraphTool) => void;
  onViewModeChange: (mode: "graph" | "table") => void;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  testId?: string;
}

function GraphToolbarImpl({
  tool,
  viewMode,
  onToolChange,
  onViewModeChange,
  onFit,
  onZoomIn,
  onZoomOut,
  testId = "graph-toolbar",
}: GraphToolbarProps) {
  return (
    <div className="hf-graph-toolbar" data-testid={testId} role="toolbar">
      <button
        type="button"
        className={
          tool === "select"
            ? "hf-graph-toolbar__btn hf-graph-toolbar__btn--active"
            : "hf-graph-toolbar__btn"
        }
        data-testid={`${testId}-select`}
        aria-pressed={tool === "select"}
        onClick={() => onToolChange("select")}
      >
        Select
      </button>
      <button
        type="button"
        className={
          tool === "pan"
            ? "hf-graph-toolbar__btn hf-graph-toolbar__btn--active"
            : "hf-graph-toolbar__btn"
        }
        data-testid={`${testId}-pan`}
        aria-pressed={tool === "pan"}
        onClick={() => onToolChange("pan")}
      >
        Pan
      </button>
      <span className="hf-graph-toolbar__sep" aria-hidden />
      <button
        type="button"
        className="hf-graph-toolbar__btn"
        data-testid={`${testId}-zoom-in`}
        onClick={onZoomIn}
      >
        Zoom in
      </button>
      <button
        type="button"
        className="hf-graph-toolbar__btn"
        data-testid={`${testId}-zoom-out`}
        onClick={onZoomOut}
      >
        Zoom out
      </button>
      <button
        type="button"
        className="hf-graph-toolbar__btn"
        data-testid={`${testId}-fit`}
        onClick={onFit}
      >
        Fit
      </button>
      <span className="hf-graph-toolbar__sep" aria-hidden />
      <button
        type="button"
        className="hf-graph-toolbar__btn"
        data-testid={`${testId}-view-toggle`}
        aria-pressed={viewMode === "table"}
        onClick={() =>
          onViewModeChange(viewMode === "graph" ? "table" : "graph")
        }
      >
        {viewMode === "graph" ? "Table view" : "Graph view"}
      </button>
    </div>
  );
}

export const GraphToolbar = memo(GraphToolbarImpl);
