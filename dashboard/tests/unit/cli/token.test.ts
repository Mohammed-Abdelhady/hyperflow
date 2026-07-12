import { describe, expect, it } from "vitest";
import {
  mintSessionToken,
  resolveToken,
  TOKEN_BYTES,
} from "../../../src/cli/token.js";

describe("token mint", () => {
  it("two mints differ", () => {
    expect(mintSessionToken()).not.toBe(mintSessionToken());
  });

  it("URL-safe charset and length", () => {
    const t = mintSessionToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    // base64url length for 24 bytes is 32
    expect(t.length).toBe(Math.ceil((TOKEN_BYTES * 4) / 3));
  });

  it("explicit override respected", () => {
    expect(resolveToken("abc")).toBe("abc");
  });
});
