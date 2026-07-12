import { describe, expect, it } from "vitest";
import { PLACEHOLDER_SHARED } from "../../src/shared/placeholder.js";

describe("scaffold", () => {
  it("shared placeholder is defined", () => {
    expect(PLACEHOLDER_SHARED).toBe("shared-scaffold");
  });
});
