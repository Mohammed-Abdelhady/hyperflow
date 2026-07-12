import { describe, expect, it, vi } from "vitest";
import { HYPERFLOW_TOKEN_HEADER } from "../../../../src/shared/schemas/api.js";
import { createApiClient } from "../../../../src/client/services/api";
import { ApiError } from "../../../../src/client/services/api-error";
import { emptySnapshot } from "../../shared/derived/fixture-base";

describe("api client", () => {
  it("sends X-Hyperflow-Token on every request", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({ snapshot: emptySnapshot() }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const client = createApiClient({
      getToken: () => "tok-1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.getSnapshot();
    expect(fetchImpl).toHaveBeenCalled();
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get(HYPERFLOW_TOKEN_HEADER)).toBe("tok-1");
  });

  it("maps WRITE_CONFLICT envelope to typed ApiError", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          code: "WRITE_CONFLICT",
          message: "mtime mismatch",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    });
    const client = createApiClient({
      getToken: () => "tok-1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getSnapshot()).rejects.toMatchObject({
      code: "WRITE_CONFLICT",
      status: 409,
    });
  });

  it("invokes onUnauthorized for TOKEN_INVALID", async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({ code: "TOKEN_INVALID", message: "bad" }),
        { status: 401 },
      );
    });
    const client = createApiClient({
      getToken: () => "x",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onUnauthorized,
    });
    await expect(client.getSnapshot()).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it("puts token only on stream URL query", () => {
    const client = createApiClient({ getToken: () => "secret" });
    const url = client.buildStreamUrl("e1-3");
    expect(url).toContain("token=secret");
    expect(url).toContain("lastEventId=e1-3");
    expect(url.startsWith("/api/v1/stream")).toBe(true);
  });
});
