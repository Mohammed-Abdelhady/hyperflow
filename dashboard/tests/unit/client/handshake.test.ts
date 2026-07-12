import { describe, expect, it, vi } from "vitest";
import { consumeTokenFragment } from "../../../src/client/utils/handshake";

describe("consumeTokenFragment", () => {
  it("stores fragment token and strips hash via replaceState", () => {
    const setStoredToken = vi.fn();
    const replaceState = vi.fn();
    const result = consumeTokenFragment({
      locationHash: "#token=abc123",
      getStoredToken: () => null,
      setStoredToken,
      replaceState,
      pathAndSearch: "/mission",
    });
    expect(result).toEqual({
      status: "authenticated",
      token: "abc123",
      source: "fragment",
    });
    expect(setStoredToken).toHaveBeenCalledWith("abc123");
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith("/mission");
  });

  it("falls back to sessionStorage when fragment absent", () => {
    const result = consumeTokenFragment({
      locationHash: "",
      getStoredToken: () => "stored-token",
      setStoredToken: vi.fn(),
      replaceState: vi.fn(),
      pathAndSearch: "/",
    });
    expect(result).toEqual({
      status: "authenticated",
      token: "stored-token",
      source: "storage",
    });
  });

  it("returns unauthenticated when neither fragment nor storage", () => {
    const replaceState = vi.fn();
    const result = consumeTokenFragment({
      locationHash: "#",
      getStoredToken: () => null,
      setStoredToken: vi.fn(),
      replaceState,
      pathAndSearch: "/",
    });
    expect(result).toEqual({ status: "unauthenticated" });
    expect(replaceState).not.toHaveBeenCalled();
  });
});
