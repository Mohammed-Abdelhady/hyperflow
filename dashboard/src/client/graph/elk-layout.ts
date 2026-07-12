/**
 * Async elkjs layout adapter.
 *
 * Layout runs off the React render path: callers await this function from an
 * effect / scheduled task (or a future Web Worker). Never invoke synchronously
 * inside a component body.
 */
import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  type ElkAlgorithm,
  type GraphEdgeData,
  type GraphNodeData,
  type LayoutResult,
  type PositionedNode,
} from "./types";

const elk = new ELK();

const ALGO_ID: Record<ElkAlgorithm, string> = {
  layered: "layered",
  mrtree: "mrtree",
};

export interface LayoutInput {
  nodes: readonly GraphNodeData[];
  edges: readonly GraphEdgeData[];
  algorithm: ElkAlgorithm;
  nodeWidth?: number;
  nodeHeight?: number;
}

function filterEdges(
  nodes: readonly GraphNodeData[],
  edges: readonly GraphEdgeData[],
): { kept: GraphEdgeData[]; dropped: string[] } {
  const ids = new Set(nodes.map((n) => n.id));
  const kept: GraphEdgeData[] = [];
  const dropped: string[] = [];
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      dropped.push(edge.id);
      continue;
    }
    kept.push(edge);
  }
  return { kept, dropped };
}

/**
 * Run ELK layout. Deterministic for a fixed node/edge set + algorithm.
 * Malformed edges (dangling targets/sources) are dropped with ids returned.
 */
export async function layoutGraph(input: LayoutInput): Promise<LayoutResult> {
  const width = input.nodeWidth ?? DEFAULT_NODE_WIDTH;
  const height = input.nodeHeight ?? DEFAULT_NODE_HEIGHT;
  const { kept, dropped } = filterEdges(input.nodes, input.edges);

  if (input.nodes.length === 0) {
    return { nodes: [], edges: kept, droppedEdgeIds: dropped };
  }

  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": ALGO_ID[input.algorithm],
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "48",
      "elk.layered.spacing.nodeNodeBetweenLayers": "64",
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children: input.nodes.map((n) => ({
      id: n.id,
      width,
      height,
    })),
    edges: kept.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const laid = await elk.layout(graph);
  const byId = new Map(input.nodes.map((n) => [n.id, n]));

  const positioned: PositionedNode[] = (laid.children ?? []).map((child) => {
    const base = byId.get(child.id)!;
    return {
      ...base,
      x: child.x ?? 0,
      y: child.y ?? 0,
      width: child.width ?? width,
      height: child.height ?? height,
    };
  });

  // Stable order matching input nodes for deterministic consumers/tests.
  const order = new Map(input.nodes.map((n, i) => [n.id, i]));
  positioned.sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );

  return {
    nodes: positioned,
    edges: kept,
    droppedEdgeIds: dropped,
  };
}
