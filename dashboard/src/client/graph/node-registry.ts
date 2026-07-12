import { createElement, type ReactElement } from "react";
import { NodeCard, type NodeCardProps } from "../components/NodeCard";
import type { GraphNodeData, GraphNodeKind } from "./types";

export type NodeRenderer = (props: {
  data: GraphNodeData;
  selected: boolean;
  onSelect?: () => void;
}) => ReactElement;

function cardProps(
  data: GraphNodeData,
  selected: boolean,
  onSelect?: () => void,
): NodeCardProps {
  const props: NodeCardProps = {
    title: data.title,
    typeTag: data.typeTag,
    selected,
    testId: `graph-node-${data.id}`,
  };
  if (data.costLabel !== undefined) props.costLabel = data.costLabel;
  if (onSelect) props.onSelect = onSelect;
  if (data.state) {
    props.ports = [{ id: "out", state: data.state }];
  }
  return props;
}

function makeCardRenderer(defaultTag: string): NodeRenderer {
  return ({ data, selected, onSelect }) =>
    createElement(NodeCard, {
      ...cardProps(
        {
          ...data,
          typeTag: data.typeTag || defaultTag,
        },
        selected,
        onSelect,
      ),
    });
}

const KNOWN: Readonly<Record<GraphNodeKind, NodeRenderer>> = {
  "chain-stage": makeCardRenderer("stage"),
  batch: makeCardRenderer("batch"),
  task: makeCardRenderer("task"),
  "memory-entry": makeCardRenderer("memory"),
  agent: makeCardRenderer("agent"),
  unknown: makeCardRenderer("unknown"),
};

const FALLBACK: NodeRenderer = ({ data, selected, onSelect }) =>
  createElement(NodeCard, {
    ...cardProps(
      {
        ...data,
        typeTag: data.typeTag || "unknown",
        title: data.title || data.id,
      },
      selected,
      onSelect,
    ),
  });

/** Lookup renderer for a node kind — unknown kinds get labelled fallback. */
export function resolveNodeRenderer(
  kind: GraphNodeKind | string,
): NodeRenderer {
  if (kind in KNOWN) {
    return KNOWN[kind as GraphNodeKind];
  }
  return FALLBACK;
}

export function knownNodeKinds(): readonly GraphNodeKind[] {
  return Object.keys(KNOWN) as GraphNodeKind[];
}

export { KNOWN as NODE_REGISTRY, FALLBACK as FALLBACK_NODE_RENDERER };
