import { describe, expect, it } from "vitest";
import {
  createRawFallback,
  isRawFallback,
  withParseFallback,
} from "../../../../src/server/parser/primitives/fallback.js";
import { RawFallbackNodeSchema } from "@shared/schemas/common.js";

describe("createRawFallback", () => {
  it("produces schema-valid RawFallback with parseError true", () => {
    const node = createRawFallback({
      path: "tasks/demo.md",
      raw: "# broken\r\n",
      reason: "malformed",
      mtimeMs: 123,
    });
    expect(node.parseError).toBe(true);
    expect(node.path).toBe("tasks/demo.md");
    expect(node.raw).toBe("# broken\n");
    expect(node.reason).toBe("malformed");
    expect(node.mtimeMs).toBe(123);
    const parsed = RawFallbackNodeSchema.safeParse(node);
    expect(parsed.success).toBe(true);
  });

  it("withParseFallback converts throws into fallback", () => {
    const result = withParseFallback("x.md", "raw", () => {
      throw new Error("boom");
    });
    expect(isRawFallback(result)).toBe(true);
    if (!isRawFallback(result)) return;
    expect(result.reason).toBe("boom");
  });

  it("withParseFallback returns successful parse", () => {
    const result = withParseFallback("x.md", "raw", () => ({ ok: true }));
    expect(result).toEqual({ ok: true });
  });
});
