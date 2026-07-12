import { describe, expect, it } from "vitest";
import {
  clearFormatCaches,
  formatDuration,
  formatPercent,
  formatTokens,
} from "../../../src/client/utils/format";

describe("format utils", () => {
  it("formats token counts with unit for en-US", () => {
    clearFormatCaches();
    expect(formatTokens(12_400, "en-US")).toBe("12.4k tok");
    expect(formatTokens(500, "en-US")).toBe("500 tok");
  });

  it("formats durations with unit", () => {
    expect(formatDuration(42, "en-US")).toBe("42 ms");
    expect(formatDuration(1500, "en-US")).toBe("1.5 s");
  });

  it("formats percent", () => {
    expect(formatPercent(0.42, "en-US")).toBe("42%");
  });

  it("caches Intl instances (repeat call stable)", () => {
    clearFormatCaches();
    const a = formatTokens(1000, "de-DE");
    const b = formatTokens(1000, "de-DE");
    expect(a).toBe(b);
  });
});
