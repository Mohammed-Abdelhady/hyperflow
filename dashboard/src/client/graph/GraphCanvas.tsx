import {
  Background,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { GraphTable } from "./GraphTable";
import { GraphToolbar, type GraphTool } from "./GraphToolbar";
import { layoutGraph } from "./elk-layout";
import { resolveNodeRenderer } from "./node-registry";
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  type GraphCanvasProps,
  type GraphNodeData,
  type PositionedNode,
} from "./types";

const MOTION_SWEEP_MS = 450;
const INTERPOLATE_MS = 280;

type FlowNodeData = {
  graph: GraphNodeData;
  selected: boolean;
  onSelect: ((id: string) => void) | null;
  enter: boolean;
  reduced: boolean;
};

function RegistryNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const render = resolveNodeRenderer(data.graph.kind);
  const style: CSSProperties = {
    opacity: 1,
    transform: "scale(1)",
    transition: data.reduced
      ? "none"
      : data.enter
        ? `opacity ${INTERPOLATE_MS}ms var(--ease-out), transform ${INTERPOLATE_MS}ms var(--ease-out)`
        : "none",
  };
  const payload =
    data.onSelect !== null
      ? {
          data: data.graph,
          selected: data.selected,
          onSelect: () => {
            data.onSelect?.(data.graph.id);
          },
        }
      : { data: data.graph, selected: data.selected };
  return (
    <div style={style} className="hf-graph-node-wrap">
      {render(payload)}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  registry: RegistryNode,
};

function weightStroke(weight: 1 | 2 | 3 | undefined): number {
  if (weight === 3) return 2;
  if (weight === 2) return 1.5;
  return 1;
}

function CanvasInner({
  nodes,
  edges,
  algorithm = "layered",
  selectedId = null,
  onSelect,
  viewMode: controlledView,
  onViewModeChange,
  testId = "graph-canvas",
}: GraphCanvasProps) {
  const reduced = useReducedMotion();
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const [tool, setTool] = useState<GraphTool>("select");
  const [internalView, setInternalView] = useState<"graph" | "table">("graph");
  const viewMode = controlledView ?? internalView;
  const setViewMode = (mode: "graph" | "table") => {
    setInternalView(mode);
    onViewModeChange?.(mode);
  };

  const [laid, setLaid] = useState<PositionedNode[]>([]);
  const [enter, setEnter] = useState(true);
  const layoutGen = useRef(0);
  const prevPos = useRef<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    const gen = ++layoutGen.current;
    let cancelled = false;
    void layoutGraph({ nodes, edges, algorithm }).then((result) => {
      if (cancelled || gen !== layoutGen.current) return;
      if (!reduced && prevPos.current.size > 0) {
        // Position interpolation handled by React Flow position transitions
        // via CSS on nodes when reduced is false — store target positions.
      }
      const map = new Map<string, { x: number; y: number }>();
      for (const n of result.nodes) map.set(n.id, { x: n.x, y: n.y });
      prevPos.current = map;
      setLaid(result.nodes);
      setEnter(true);
      const t = window.setTimeout(
        () => setEnter(false),
        reduced ? 0 : INTERPOLATE_MS,
      );
      return () => window.clearTimeout(t);
    });
    return () => {
      cancelled = true;
    };
  }, [nodes, edges, algorithm, reduced]);

  const flowNodes: Node<FlowNodeData>[] = useMemo(
    () =>
      laid.map((n) => ({
        id: n.id,
        type: "registry",
        position: { x: n.x, y: n.y },
        data: {
          graph: n,
          selected: n.id === selectedId,
          onSelect: onSelect ? (id: string) => onSelect(id) : null,
          enter,
          reduced,
        },
        style: {
          width: n.width || DEFAULT_NODE_WIDTH,
          height: n.height || DEFAULT_NODE_HEIGHT,
          transition:
            reduced || !enter
              ? "none"
              : `transform ${INTERPOLATE_MS}ms var(--ease-out)`,
        },
        selectable: tool === "select",
        draggable: false,
      })),
    [laid, selectedId, onSelect, enter, reduced, tool],
  );

  const flowEdges: Edge[] = useMemo(
    () =>
      edges
        .filter((e) => laid.some((n) => n.id === e.source))
        .filter((e) => laid.some((n) => n.id === e.target))
        .map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          style: {
            stroke: "var(--hairline-strong)",
            strokeWidth: weightStroke(e.weight),
          },
          data: { testId: `graph-edge-${e.id}` },
        })),
    [edges, laid],
  );

  const duration = reduced ? 0 : MOTION_SWEEP_MS;

  const onFit = useCallback(() => {
    void fitView({ duration, padding: 0.2 });
  }, [fitView, duration]);

  useEffect(() => {
    if (laid.length > 0 && viewMode === "graph") {
      void fitView({ duration, padding: 0.2 });
    }
  }, [laid, viewMode, fitView, duration]);

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      onSelect?.(node.id);
    },
    [onSelect],
  );

  if (viewMode === "table") {
    return (
      <div className="hf-graph-canvas" data-testid={testId} data-view="table">
        <GraphToolbar
          tool={tool}
          viewMode={viewMode}
          onToolChange={setTool}
          onViewModeChange={setViewMode}
          onFit={onFit}
          onZoomIn={() => zoomIn({ duration })}
          onZoomOut={() => zoomOut({ duration })}
        />
        <GraphTable
          nodes={nodes}
          selectedId={selectedId}
          onSelect={(id) => onSelect?.(id)}
          testId={`${testId}-table`}
        />
      </div>
    );
  }

  return (
    <div className="hf-graph-canvas" data-testid={testId} data-view="graph">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={() => onSelect?.(null)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={tool === "select"}
        panOnDrag={tool === "pan" || tool === "select"}
        selectionOnDrag={tool === "select"}
        fitView
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background color="var(--hairline)" gap={16} />
        <MiniMap
          pannable
          zoomable
          nodeColor="var(--surface-3)"
          maskColor="rgb(10 12 16 / 0.7)"
          className="hf-graph-minimap"
        />
      </ReactFlow>
      <GraphToolbar
        tool={tool}
        viewMode={viewMode}
        onToolChange={setTool}
        onViewModeChange={setViewMode}
        onFit={onFit}
        onZoomIn={() => void zoomIn({ duration })}
        onZoomOut={() => void zoomOut({ duration })}
      />
    </div>
  );
}

function GraphCanvasImpl(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

export const GraphCanvas = memo(GraphCanvasImpl);
