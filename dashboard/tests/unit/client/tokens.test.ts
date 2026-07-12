import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const tokensPath = resolve(
  import.meta.dirname,
  "../../../src/client/styles/tokens.css",
);
const css = readFileSync(tokensPath, "utf8");

describe("tokens.css", () => {
  it("declares exact surface-0", () => {
    expect(css).toMatch(/--surface-0:\s*#0A0C10\s*;/);
  });

  it("declares exact accent", () => {
    expect(css).toMatch(/--accent:\s*#14B8A6\s*;/);
  });

  it("declares exact state-fix", () => {
    expect(css).toMatch(/--state-fix:\s*#F59E0B\s*;/);
  });

  it("declares exact sp-5", () => {
    expect(css).toMatch(/--sp-5:\s*24px\s*;/);
  });

  it("declares exact r-2", () => {
    expect(css).toMatch(/--r-2:\s*6px\s*;/);
  });

  it("declares exact motion-panel duration", () => {
    expect(css).toMatch(/--motion-panel:\s*280ms\s*;/);
  });

  it("declares exact ease-out cubic-bezier", () => {
    expect(css).toMatch(
      /--ease-out:\s*cubic-bezier\(\s*0\.25\s*,\s*1\s*,\s*0\.5\s*,\s*1\s*\)\s*;/,
    );
  });

  it("aliases state-live to accent via var()", () => {
    expect(css).toMatch(/--state-live:\s*var\(--accent\)\s*;/);
    expect(css).not.toMatch(/--state-live:\s*#/);
  });

  it("holds anti-slop floor: no violet, no gradient", () => {
    expect(css).not.toContain("#7C3AED");
    expect(css.toLowerCase()).not.toContain("gradient");
  });
});
