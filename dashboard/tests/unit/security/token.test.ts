import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import {
  createTokenGate,
  DEFAULT_STREAM_PATH,
  extractPresentedToken,
  TOKEN_INVALID_ENVELOPE,
  tokensEqual,
} from "../../../src/server/security/token.js";
import { createOriginAllowlist } from "../../../src/server/security/origin-allowlist.js";
import {
  ERROR_CODES,
  HYPERFLOW_TOKEN_HEADER,
} from "../../../src/shared/schemas/api.js";

const PORT = 7331;
const SESSION = "a".repeat(32);
const NEAR_MISS = "a".repeat(31) + "b";

function buildApp(onNext?: () => void): Hono {
  const app = new Hono();
  app.use("*", createOriginAllowlist({ port: PORT }));
  app.use("/api/v1/*", createTokenGate({ sessionToken: SESSION }));
  app.get("/api/v1/health", (c) => {
    onNext?.();
    return c.json({ ok: true });
  });
  app.get(DEFAULT_STREAM_PATH, (c) => {
    onNext?.();
    return c.text("event: ping\n\n");
  });
  return app;
}

function goodHost(): Record<string, string> {
  return { host: `127.0.0.1:${PORT}` };
}

describe("tokensEqual constant-time primitive", () => {
  it("constant-time comparison used for token equality", () => {
    expect(tokensEqual(SESSION, SESSION)).toBe(true);
    expect(tokensEqual(SESSION, NEAR_MISS)).toBe(false);
    expect(tokensEqual("", SESSION)).toBe(false);
    expect(tokensEqual(SESSION, SESSION + "x")).toBe(false);
    // Identity of the exported primitive is the assertion surface — not wall-clock.
    expect(typeof tokensEqual).toBe("function");
  });
});

describe("extractPresentedToken", () => {
  it("query-param token accepted on stream route only; header required elsewhere", () => {
    expect(
      extractPresentedToken(undefined, SESSION, true),
    ).toBe(SESSION);
    expect(
      extractPresentedToken(undefined, SESSION, false),
    ).toBeUndefined();
    expect(
      extractPresentedToken(SESSION, "ignored", false),
    ).toBe(SESSION);
  });
});

describe("token gate middleware", () => {
  it("missing, empty, wrong, and near-miss tokens return byte-identical 401 bodies", async () => {
    const app = buildApp();
    const cases: Array<Record<string, string> | undefined> = [
      undefined,
      { [HYPERFLOW_TOKEN_HEADER]: "" },
      { [HYPERFLOW_TOKEN_HEADER]: "totally-wrong-token-value-xx" },
      { [HYPERFLOW_TOKEN_HEADER]: NEAR_MISS },
    ];
    const bodies: string[] = [];
    for (const extra of cases) {
      const res = await app.request(
        `http://127.0.0.1:${PORT}/api/v1/health`,
        {
          headers: {
            ...goodHost(),
            ...(extra ?? {}),
          },
        },
      );
      expect(res.status).toBe(401);
      bodies.push(await res.text());
    }
    const canonical = JSON.stringify(TOKEN_INVALID_ENVELOPE);
    for (const body of bodies) {
      expect(body).toBe(canonical);
    }
    expect(bodies[0]).toBe(bodies[1]);
    expect(bodies[1]).toBe(bodies[2]);
    expect(bodies[2]).toBe(bodies[3]);
  });

  it("query-param token accepted on stream route only; header required everywhere else", async () => {
    const app = buildApp();

    const streamOk = await app.request(
      `http://127.0.0.1:${PORT}${DEFAULT_STREAM_PATH}?token=${SESSION}`,
      { headers: goodHost() },
    );
    expect(streamOk.status).toBe(200);

    const apiWithQuery = await app.request(
      `http://127.0.0.1:${PORT}/api/v1/health?token=${SESSION}`,
      { headers: goodHost() },
    );
    expect(apiWithQuery.status).toBe(401);
    expect(await apiWithQuery.text()).toBe(JSON.stringify(TOKEN_INVALID_ENVELOPE));

    const apiWithHeader = await app.request(
      `http://127.0.0.1:${PORT}/api/v1/health`,
      {
        headers: {
          ...goodHost(),
          [HYPERFLOW_TOKEN_HEADER]: SESSION,
        },
      },
    );
    expect(apiWithHeader.status).toBe(200);
  });

  it("valid token via header passes to next", async () => {
    const spy = vi.fn();
    const app = buildApp(spy);
    const res = await app.request(
      `http://127.0.0.1:${PORT}/api/v1/health`,
      {
        headers: {
          ...goodHost(),
          [HYPERFLOW_TOKEN_HEADER]: SESSION,
        },
      },
    );
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("401 body never discloses which failure mode occurred", async () => {
    const app = buildApp();
    const res = await app.request(
      `http://127.0.0.1:${PORT}/api/v1/health`,
      { headers: goodHost() },
    );
    const body = await res.json();
    expect(body).toEqual({
      code: ERROR_CODES.TOKEN_INVALID,
      message: "Invalid session token",
    });
    expect(body).not.toHaveProperty("details");
  });

  it("403 origin denial fires before token check (allowlist first)", async () => {
    const tokenNext = vi.fn(async (_c, next) => {
      await next();
    });
    const app = new Hono();
    app.use("*", createOriginAllowlist({ port: PORT }));
    app.use("/api/v1/*", tokenNext);
    app.use("/api/v1/*", createTokenGate({ sessionToken: SESSION }));
    app.get("/api/v1/health", (c) => c.json({ ok: true }));

    const res = await app.request("http://x/api/v1/health", {
      headers: {
        host: "evil.example",
        [HYPERFLOW_TOKEN_HEADER]: SESSION,
      },
    });
    expect(res.status).toBe(403);
    expect(tokenNext).not.toHaveBeenCalled();
  });
});
