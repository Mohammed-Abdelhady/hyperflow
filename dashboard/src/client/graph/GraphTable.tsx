import { memo, type KeyboardEvent } from "react";
import type { GraphNodeData } from "./types";

export interface GraphTableProps {
  nodes: readonly GraphNodeData[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  testId?: string;
}

function GraphTableImpl({
  nodes,
  selectedId = null,
  onSelect,
  testId = "graph-table",
}: GraphTableProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(id);
    }
  };

  return (
    <div className="hf-graph-table" data-testid={testId}>
      <table className="hf-graph-table__table">
        <thead>
          <tr>
            <th scope="col">Title</th>
            <th scope="col">Type</th>
            <th scope="col">Cost</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => {
            const selected = node.id === selectedId;
            return (
              <tr
                key={node.id}
                className={
                  selected
                    ? "hf-graph-table__row hf-graph-table__row--selected"
                    : "hf-graph-table__row"
                }
                data-testid={`${testId}-row-${node.id}`}
                tabIndex={0}
                aria-selected={selected}
                onClick={() => onSelect?.(node.id)}
                onKeyDown={(e) => onKeyDown(e, node.id)}
              >
                <td data-testid={`${testId}-title-${node.id}`}>{node.title}</td>
                <td>{node.typeTag}</td>
                <td data-testid={`${testId}-cost-${node.id}`}>
                  {node.costLabel ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {nodes.length === 0 ? (
        <p className="hf-graph-table__empty" data-testid={`${testId}-empty`}>
          No graph nodes.
        </p>
      ) : null}
    </div>
  );
}

export const GraphTable = memo(GraphTableImpl);
