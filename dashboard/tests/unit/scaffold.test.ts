import { describe, expect, it } from "vitest";
import { HYPERFLOW_TOKEN_HEADER } from "../../src/shared/schemas/api.js";

describe("scaffold", () => {
  it("shared token header constant is defined", () => {
    expect(HYPERFLOW_TOKEN_HEADER).toBe("X-Hyperflow-Token");
  });
});
