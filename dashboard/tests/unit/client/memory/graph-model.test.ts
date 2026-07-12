import { describe, expect, it } from "vitest";
import type { MemoryCategoryFile } from "../../../../src/shared/schemas/index.js";
import {
  buildMemoryGraphModel,
  isDerivedCategory,
} from "../../../../src/client/features/memory/utils/graph-model";
import { okHealth } from "../../shared/derived/fixture-base";

function cat(
  category: string,
  entries: MemoryCategoryFile["entries"],
  path = `memory/${category}.md`,
): MemoryCategoryFile {
  return {
    path,
    category,
    entries,
    parseHealth: okHealth,
  };
}

describe("memory graph-model", () => {
  it("flags derived files", () => {
    expect(isDerivedCategory("index", "memory/index.md")).toBe(true);
    expect(isDerivedCategory("checksums", "memory/.checksums")).toBe(true);
    expect(isDerivedCategory("decisions", "memory/decisions.md")).toBe(false);
  });

  it("builds edges from wikilinks and flags unlinked grid", () => {
    const unlinked = buildMemoryGraphModel([
      cat("decisions", [
        {
          id: "a",
          class: "tagged",
          title: "Alpha",
          tags: [],
          what: "no links",
        },
        {
          id: "b",
          class: "tagged",
          title: "Beta",
          tags: [],
          what: "still none",
        },
      ]),
    ]);
    expect(unlinked.unlinked).toBe(true);
    expect(unlinked.nodes).toHaveLength(2);
    expect(unlinked.edges).toHaveLength(0);

    const linked = buildMemoryGraphModel([
      cat("decisions", [
        {
          id: "a",
          class: "tagged",
          title: "Alpha",
          tags: [],
          evidence: "see [[Beta]]",
        },
        {
          id: "b",
          class: "tagged",
          title: "Beta",
          tags: [],
          what: "target",
        },
      ]),
    ]);
    expect(linked.unlinked).toBe(false);
    expect(linked.edges.some((e) => e.source === "a" && e.target === "b")).toBe(
      true,
    );
  });

  it("never places derived files as write-capable graph nodes", () => {
    const model = buildMemoryGraphModel([
      cat(
        "index",
        [{ id: "idx", class: "tagged", title: "Index", tags: [] }],
        "memory/index.md",
      ),
      cat("decisions", [
        { id: "d1", class: "tagged", title: "D1", tags: [] },
      ]),
    ]);
    expect(model.nodes.every((n) => n.id !== "idx")).toBe(true);
    expect(model.nodes.some((n) => n.id === "d1")).toBe(true);
  });
});
