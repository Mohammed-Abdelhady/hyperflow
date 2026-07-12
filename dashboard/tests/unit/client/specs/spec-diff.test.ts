import { describe, expect, it } from "vitest";
import type { SpecNode } from "../../../../src/shared/schemas/index.js";
import { buildSpecDiff } from "../../../../src/client/features/specs/hooks/useSpecDiff";
import { okHealth } from "../../shared/derived/fixture-base";

function spec(
  slug: string,
  sections: Array<{ text: string; anchor: string; level?: number }>,
): SpecNode {
  return {
    path: `specs/${slug}.md`,
    slug,
    draft: false,
    sections: sections.map((s) => ({
      level: s.level ?? 2,
      text: s.text,
      anchor: s.anchor,
      startLine: 1,
      endLine: 2,
      mermaidBlocks: [],
    })),
    components: [],
    hasTradeoffs: false,
    parseHealth: okHealth,
  };
}

describe("buildSpecDiff", () => {
  it("returns single-revision no-compare model", () => {
    const one = spec("api-v1", [{ text: "Goals", anchor: "goals" }]);
    const model = buildSpecDiff(one, null);
    expect(model.canCompare).toBe(false);
    expect(model.label).toBe("one revision — nothing to diff yet");
    expect(model.rows).toEqual([]);
  });

  it("same slug is treated as single revision", () => {
    const one = spec("api-v1", [{ text: "Goals", anchor: "goals" }]);
    const model = buildSpecDiff(one, one);
    expect(model.canCompare).toBe(false);
    expect(model.label).toBe("one revision — nothing to diff yet");
  });

  it("produces add/remove rows for a revision pair", () => {
    const left = spec("api-v1", [
      { text: "Goals", anchor: "goals" },
      { text: "Old section", anchor: "old" },
    ]);
    const right = spec("api-v2", [
      { text: "Goals", anchor: "goals" },
      { text: "New section", anchor: "new" },
    ]);
    const model = buildSpecDiff(left, right);
    expect(model.canCompare).toBe(true);
    expect(model.rows.some((r) => r.kind === "same" && r.text === "Goals")).toBe(
      true,
    );
    expect(
      model.rows.some((r) => r.kind === "remove" && r.text === "Old section"),
    ).toBe(true);
    expect(
      model.rows.some((r) => r.kind === "add" && r.text === "New section"),
    ).toBe(true);
  });
});
