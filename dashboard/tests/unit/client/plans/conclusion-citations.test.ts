import { describe, expect, it } from "vitest";
import {
  citationToAnchor,
  lineAnchorId,
} from "../../../../src/client/features/plans/utils/conclusion-citations";

describe("conclusion-citations", () => {
  it("maps evidence to document-pane anchors", () => {
    const anchor = citationToAnchor({
      file: "tasks/phase-1.md",
      startLine: 12,
      endLine: 14,
    });
    expect(anchor.anchorId).toBe("cite-tasks/phase-1.md-L12");
    expect(anchor.label).toBe("tasks/phase-1.md:12–14");
    expect(anchor.startLine).toBe(12);
    expect(anchor.endLine).toBe(14);
  });

  it("anchors a single-line citation inside a raw artefact path", () => {
    const anchor = citationToAnchor({
      file: "tasks/broken.md",
      startLine: 1,
      endLine: 1,
    });
    expect(anchor.anchorId).toBe(lineAnchorId("tasks/broken.md", 1));
    expect(anchor.label).toBe("tasks/broken.md:1");
  });

  it("clamps invalid line ranges", () => {
    const anchor = citationToAnchor({
      file: "x.md",
      startLine: 0,
      endLine: -3,
    });
    expect(anchor.startLine).toBe(1);
    expect(anchor.endLine).toBe(1);
  });
});
