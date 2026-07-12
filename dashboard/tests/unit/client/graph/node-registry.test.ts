import { describe, expect, it } from "vitest";
import {
  knownNodeKinds,
  resolveNodeRenderer,
} from "../../../../src/client/graph/node-registry";
import type { GraphNodeData } from "../../../../src/client/graph/types";

describe("node-registry", () => {
  it("returns a renderer for every known kind", () => {
    for (const kind of knownNodeKinds()) {
      const render = resolveNodeRenderer(kind);
      const data: GraphNodeData = {
        id: kind,
        kind,
        title: kind,
        typeTag: kind,
      };
      const el = render({ data, selected: false });
      expect(el).toBeTruthy();
      expect(typeof render).toBe("function");
    }
  });

  it("falls back for unknown kinds without throwing", () => {
    const render = resolveNodeRenderer("totally-unknown-kind");
    const el = render({
      data: {
        id: "x",
        kind: "totally-unknown-kind",
        title: "X",
        typeTag: "",
      },
      selected: true,
    });
    expect(el).toBeTruthy();
    expect(el.props).toBeTruthy();
  });
});
