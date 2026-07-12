import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDashboardServer } from "../../../src/server/index.js";
import {
  HYPERFLOW_TOKEN_HEADER,
  InstanceResponseSchema,
  SnapshotResponseSchema,
} from "../../../src/shared/schemas/api.js";

describe("server read routes", () => {
  let root: string;
  let server: Awaited<ReturnType<typeof createDashboardServer>> | null = null;
  const token = "test-token-abc12345";
  let port = 0;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "hf-srv-"));
    mkdirSync(join(root, ".hyperflow", "memory"), { recursive: true });
    mkdirSync(join(root, ".hyperflow-handoff"), { recursive: true });
    mkdirSync(join(root, "home", ".hyperflow"), { recursive: true });
    writeFileSync(
      join(root, ".hyperflow", "memory", "decisions.md"),
      "### [2026-01-01] Seed  `[t]`\n\n**What:** x\n",
    );
    writeFileSync(join(root, "home", ".hyperflow", "config.json"), "{}");
    // Pick an ephemeral port by binding 0 via server — factory needs explicit port.
    port = 18_000 + Math.floor(Math.random() * 1000);
  });

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
    try {
      chmodSync(join(root, ".hyperflow"), 0o755);
    } catch {
      /* ignore */
    }
    rmSync(root, { recursive: true, force: true });
  });

  async function boot(extra: Partial<Parameters<typeof createDashboardServer>[0]> = {}) {
    for (let i = 0; i < 5; i += 1) {
      try {
        server = await createDashboardServer({
          rootDir: root,
          port: port + i,
          token,
          disableWatcher: true,
          homeDir: join(root, "home"),
          globalConfigPath: join(root, "home", ".hyperflow", "config.json"),
          ...extra,
        });
        port = port + i;
        return server;
      } catch {
        /* port busy — retry */
      }
    }
    throw new Error("could not bind test server");
  }

  async function get(path: string, headers: Record<string, string> = {}) {
    const s = server!;
    return fetch(`http://127.0.0.1:${s.port}${path}`, {
      headers: {
        Host: `127.0.0.1:${s.port}`,
        ...headers,
      },
    });
  }

  it("GET /api/v1/snapshot with token → 200 schema-valid", async () => {
    await boot();
    const res = await get("/api/v1/snapshot", {
      [HYPERFLOW_TOKEN_HEADER]: token,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = SnapshotResponseSchema.parse(body);
    expect(parsed.snapshot.memory.length).toBeGreaterThan(0);
    expect(parsed.snapshot.meta.epoch).toBeTruthy();
    expect(typeof parsed.snapshot.meta.observeMode).toBe("boolean");
    expect(parsed.snapshot.tasks).toBeDefined();
  });

  it("missing token → 401 generic", async () => {
    await boot();
    const res = await get("/api/v1/snapshot");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("TOKEN_INVALID");
  });

  it("evil Host → 403 ORIGIN_DENIED", async () => {
    await boot();
    // Node fetch rewrites Host; use raw http to present a rebinding Host.
    const http = await import("node:http");
    const body = await new Promise<string>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: server!.port,
          path: "/api/v1/snapshot",
          headers: {
            Host: "evil.example",
            [HYPERFLOW_TOKEN_HEADER]: token,
          },
        },
        (res) => {
          expect(res.statusCode).toBe(403);
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        },
      );
      req.on("error", reject);
      req.end();
    });
    expect(JSON.parse(body).code).toBe("ORIGIN_DENIED");
  });

  it("GET /api/v1/instance identity", async () => {
    await boot();
    const res = await get("/api/v1/instance", {
      [HYPERFLOW_TOKEN_HEADER]: token,
    });
    expect(res.status).toBe(200);
    const body = InstanceResponseSchema.parse(await res.json());
    expect(body.ok).toBe(true);
    expect(body.projectRoot).toBe(root);
  });

  it("GET /api/v1/nonexistent → 404 JSON envelope", async () => {
    await boot();
    const res = await get("/api/v1/nonexistent", {
      [HYPERFLOW_TOKEN_HEADER]: token,
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("NOT_FOUND");
  });

  it("events range malformed → 400", async () => {
    await boot();
    const res = await get("/api/v1/events?limit=nope", {
      [HYPERFLOW_TOKEN_HEADER]: token,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("VALIDATION_FAILED");
  });
});
