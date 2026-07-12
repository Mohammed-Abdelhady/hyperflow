import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDashboardServer } from "../../../src/server/index.js";
import { HYPERFLOW_TOKEN_HEADER } from "../../../src/shared/schemas/api.js";

describe("write routes", () => {
  let root: string;
  let server: Awaited<ReturnType<typeof createDashboardServer>> | null = null;
  const token = "write-token-xyz98765";
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "hf-wr-"));
    mkdirSync(join(root, ".hyperflow", "memory"), { recursive: true });
    mkdirSync(join(root, ".hyperflow-handoff", "demo"), { recursive: true });
    mkdirSync(join(root, "home", ".hyperflow"), { recursive: true });
    writeFileSync(
      join(root, ".hyperflow", "memory", "decisions.md"),
      "### [2026-01-01] Seed  `[t]`\n\n**What:** x\n",
    );
    writeFileSync(
      join(root, ".hyperflow-handoff", "demo", "HANDOFF.md"),
      "# H\n",
    );
    writeFileSync(join(root, ".hyperflow-handoff", "demo", "STATUS"), "planned\n");
    writeFileSync(
      join(root, "home", ".hyperflow", "config.json"),
      JSON.stringify({ memory: { compactionThreshold: 80 }, cleanup: { on: true } }),
    );
  });

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
    rmSync(root, { recursive: true, force: true });
  });

  async function boot() {
    // Fresh ephemeral port each boot — reuse after close races ECONNRESET on macOS.
    for (let i = 0; i < 12; i += 1) {
      const candidate = 32_000 + Math.floor(Math.random() * 20_000);
      try {
        server = await createDashboardServer({
          rootDir: root,
          port: candidate,
          token,
          disableWatcher: true,
          homeDir: join(root, "home"),
          globalConfigPath: join(root, "home", ".hyperflow", "config.json"),
        });
        return;
      } catch {
        /* port in use — try another */
      }
    }
    throw new Error("bind failed");
  }

  async function api(
    method: string,
    path: string,
    body?: unknown,
    withToken = true,
  ) {
    const headers: Record<string, string> = {
      Host: `127.0.0.1:${server!.port}`,
      "Content-Type": "application/json",
    };
    if (withToken) headers[HYPERFLOW_TOKEN_HEADER] = token;
    return fetch(`http://127.0.0.1:${server!.port}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  it("POST memory create → acceptance with writeId", async () => {
    await boot();
    const res = await api("POST", "/api/v1/memory", {
      category: "decisions",
      content:
        "### [2026-01-01] Seed  `[t]`\n\n**What:** x\n\n### [2026-01-02] New  `[t]`\n\n**What:** y\n",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { accepted: boolean; writeId: string };
    expect(body.accepted).toBe(true);
    expect(body.writeId).toBeTruthy();
    expect(readFileSync(join(root, ".hyperflow", "memory", "decisions.md"), "utf8")).toContain(
      "New",
    );
  });

  it("POST memory missing field → 400, no write", async () => {
    await boot();
    const before = readFileSync(
      join(root, ".hyperflow", "memory", "decisions.md"),
      "utf8",
    );
    const res = await api("POST", "/api/v1/memory", { category: "decisions" });
    expect(res.status).toBe(400);
    expect(
      readFileSync(join(root, ".hyperflow", "memory", "decisions.md"), "utf8"),
    ).toBe(before);
  });

  it("tokenless POST → 401", async () => {
    await boot();
    const res = await api(
      "POST",
      "/api/v1/memory",
      { category: "decisions", content: "x" },
      false,
    );
    expect(res.status).toBe(401);
  });

  it("handoff planned→built ok; built→planned 409", async () => {
    await boot();
    const ok = await api("POST", "/api/v1/handoff/transition", {
      slug: "demo",
      status: "built",
    });
    expect(ok.status).toBe(200);
    expect(
      readFileSync(join(root, ".hyperflow-handoff", "demo", "STATUS"), "utf8").trim(),
    ).toBe("built");

    const bad = await api("POST", "/api/v1/handoff/transition", {
      slug: "demo",
      status: "planned",
    });
    expect(bad.status).toBe(409);
    const body = (await bad.json()) as { code: string; details: unknown };
    expect(body.code).toBe("WRITE_CONFLICT");
    expect(body.details).toMatchObject({
      current: "built",
      requested: "planned",
    });
    expect(
      readFileSync(join(root, ".hyperflow-handoff", "demo", "STATUS"), "utf8").trim(),
    ).toBe("built");
  });

  it("marker toggle + config round-trip unrecognized", async () => {
    await boot();
    const m = await api("POST", "/api/v1/markers", { mode: "review", sticky: true });
    expect(m.status).toBe(200);
    const mg = await api("GET", "/api/v1/markers");
    const markers = (await mg.json()) as { markers: { mode: string; sticky: boolean } };
    expect(markers.markers.mode).toBe("review");
    expect(markers.markers.sticky).toBe(true);

    const put = await api("PUT", "/api/v1/config", {
      config: { memory: { compactionThreshold: 99 } },
    });
    expect(put.status).toBe(200);
    const disk = JSON.parse(
      readFileSync(join(root, "home", ".hyperflow", "config.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(disk["cleanup"]).toEqual({ on: true });
    expect(
      (disk["memory"] as { compactionThreshold: number }).compactionThreshold,
    ).toBe(99);
  });

  it("memory index.md target → 403 PATH_BLOCKED", async () => {
    await boot();
    writeFileSync(join(root, ".hyperflow", "memory", "index.md"), "derived\n");
    const res = await api("POST", "/api/v1/memory", {
      category: "index",
      content: "hack\n",
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("PATH_BLOCKED");
    expect(
      readFileSync(join(root, ".hyperflow", "memory", "index.md"), "utf8"),
    ).toBe("derived\n");
  });
});
