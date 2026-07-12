import type { SemanticState } from "../constants/state-tokens";

/** Graph node kinds known to the dashboard registry. */
export type GraphNodeKind =
  | "chain-stage"
  | "batch"
  | "task"
  | "memory-entry"
  | "agent"
  | "unknown";

export interface GraphNodeData {
  id: string;
  kind: GraphNodeKind | string;
  title: string;
  typeTag: string;
  costLabel?: string;
  state?: SemanticState;
  /** Optional payload for consumers (inspector, table columns). */
  meta?: Record<string, string | number | boolean | null>;
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  /** Relative weight 1–3 for hairline thickness steps (not color). */
  weight?: 1 | 2 | 3;
  label?: string;
}

export type ElkAlgorithm = "layered" | "mrtree";

export interface PositionedNode extends GraphNodeData {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  nodes: PositionedNode[];
  edges: GraphEdgeData[];
  /** Dangling/malformed edges dropped during layout. */
  droppedEdgeIds: string[];
}

export interface GraphCanvasProps {
  nodes: readonly GraphNodeData[];
  edges: readonly GraphEdgeData[];
  algorithm?: ElkAlgorithm;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Override table columns renderer — defaults to title/type/cost. */
  viewMode?: "graph" | "table";
  onViewModeChange?: (mode: "graph" | "table") => void;
  testId?: string;
}

export const DEFAULT_NODE_WIDTH = 180;
export const DEFAULT_NODE_HEIGHT = 88;
