import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import {
  allowedHostsForPort,
  createOriginAllowlist,
  isAllowedHost,
  isAllowedOrigin,
} from "../../../src/server/security/origin-allowlist.js";
import { ERROR_CODES } from "../../../src/shared/schemas/api.js";

const PORT = 7331;
const TOKEN = "test-session-token-value";

function buildApp(onNext?: () => void): Hono {
  const app = new Hono();
  app.use("*", createOriginAllowlist({ port: PORT }));
  app.get("/api/v1/health", (c) => {
    onNext?.();
    return c.json({ ok: true });
  });
  app.get("/ok", (c) => {
    onNext?.();
    return c.json({ ok: true });
  });
  return app;
}

function headers(
  host: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return { host, ...extra };
}

describe("origin-allowlist pure helpers", () => {
  it("builds exact host:port allowlist entries", () => {
    const set = allowedHostsForPort(PORT);
    expect(set.has(`127.0.0.1:${PORT}`)).toBe(true);
    expect(set.has(`localhost:${PORT}`)).toBe(true);
    expect(set.has(`127.0.0.1:9999`)).toBe(false);
  });

  it("rejects localhost-prefixed and dotted attacker hosts", () => {
    expect(isAllowedHost(`localhost.evil.com:${PORT}`, PORT)).toBe(false);
    expect(isAllowedHost(`127.0.0.1.evil.com:${PORT}`, PORT)).toBe(false);
    expect(isAllowedHost(`evil.127.0.0.1:${PORT}`, PORT)).toBe(false);
  });

  it("rejects allowlisted host on wrong port", () => {
    expect(isAllowedHost("127.0.0.1:9999", PORT)).toBe(false);
    expect(isAllowedHost(`localhost:80`, PORT)).toBe(false);
  });

  it("rejects IPv6 and userinfo tricks", () => {
    expect(isAllowedHost(`[::1]:${PORT}`, PORT)).toBe(false);
    expect(isAllowedHost(`user@127.0.0.1:${PORT}`, PORT)).toBe(false);
  });

  it("accepts exact loopback hosts on bound port", () => {
    expect(isAllowedHost(`127.0.0.1:${PORT}`, PORT)).toBe(true);
    expect(isAllowedHost(`localhost:${PORT}`, PORT)).toBe(true);
    expect(isAllowedHost(`LOCALHOST:${PORT}`, PORT)).toBe(true);
  });

  it("treats Origin: null as present-and-denied, not absent", () => {
    expect(isAllowedOrigin("null", PORT)).toBe(false);
    expect(isAllowedOrigin("NULL", PORT)).toBe(false);
  });

  it("allows missing origin; rejects foreign origin", () => {
    expect(isAllowedOrigin(undefined, PORT)).toBe(true);
    expect(isAllowedOrigin("", PORT)).toBe(true);
    expect(isAllowedOrigin("https://evil.example", PORT)).toBe(false);
    expect(isAllowedOrigin(`http://127.0.0.1:${PORT}`, PORT)).toBe(true);
    expect(isAllowedOrigin(`http://localhost:${PORT}`, PORT)).toBe(true);
  });
});

describe("origin-allowlist middleware", () => {
  it("rejects host header of attacker domain resolving to loopback (dns rebinding)", async () => {
    const spy = vi.fn();
    const app = buildApp(spy);
    const res = await app.request("http://rebind.evil.example/api/v1/health", {
      headers: headers("rebind.evil.example"),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({
      code: ERROR_CODES.ORIGIN_DENIED,
      message: "Request origin is not allowed",
    });
    expect(JSON.stringify(body)).not.toContain("rebind");
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects origin from foreign site with valid token (csrf to localhost)", async () => {
    const spy = vi.fn();
    const app = buildApp(spy);
    const res = await app.request(
      `http://127.0.0.1:${PORT}/api/v1/health`,
      {
        headers: headers(`127.0.0.1:${PORT}`, {
          origin: "https://evil.example",
          "X-Hyperflow-Token": TOKEN,
        }),
      },
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: ERROR_CODES.ORIGIN_DENIED });
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects localhost-prefixed attacker hosts", async () => {
    const app = buildApp();
    for (const host of [
      `localhost.evil.com:${PORT}`,
      `127.0.0.1.evil.com:${PORT}`,
    ]) {
      const res = await app.request("http://x/api/v1/health", {
        headers: headers(host),
      });
      expect(res.status).toBe(403);
    }
  });

  it("rejects allowlisted host on wrong port", async () => {
    const app = buildApp();
    const res = await app.request("http://x/api/v1/health", {
      headers: headers("127.0.0.1:9999"),
    });
    expect(res.status).toBe(403);
  });

  it("accepts absent origin with valid host (curl-shaped request)", async () => {
    const spy = vi.fn();
    const app = buildApp(spy);
    const res = await app.request(
      `http://127.0.0.1:${PORT}/api/v1/health`,
      { headers: headers(`127.0.0.1:${PORT}`) },
    );
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("403 fires before downstream middleware", async () => {
    const downstream = vi.fn(async (_c, next) => {
      await next();
    });
    const app = new Hono();
    app.use("*", createOriginAllowlist({ port: PORT }));
    app.use("*", downstream);
    app.get("/x", (c) => c.text("ok"));
    const res = await app.request("http://x/x", {
      headers: headers("attacker.example"),
    });
    expect(res.status).toBe(403);
    expect(downstream).not.toHaveBeenCalled();
  });

  it("does not echo the offending header value in the body", async () => {
    const app = buildApp();
    const res = await app.request("http://x/ok", {
      headers: headers("secret-host.internal:1234", {
        origin: "https://leak.example/path",
      }),
    });
    const text = await res.text();
    expect(text).not.toContain("secret-host");
    expect(text).not.toContain("leak.example");
  });
});
