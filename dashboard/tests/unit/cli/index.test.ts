import { describe, expect, it, vi } from "vitest";
import {
  checkNodeVersion,
  parseFlags,
  runCli,
  MIN_NODE_MAJOR,
} from "../../../src/cli/index.js";

describe("cli entry", () => {
  it("version gate rejects Node < 20", () => {
    const r = checkNodeVersion("18.19.0");
    expect(r.ok).toBe(false);
    expect(r.message).toContain(String(MIN_NODE_MAJOR));
    expect(r.message).toContain("18.19.0");
  });

  it("version gate accepts Node 20+", () => {
    expect(checkNodeVersion("20.11.0").ok).toBe(true);
    expect(checkNodeVersion("22.0.0").ok).toBe(true);
  });

  it("parseFlags", () => {
    const f = parseFlags([
      "--port",
      "9000",
      "--root",
      "/tmp/p",
      "--token",
      "abc",
      "--no-open",
    ]);
    expect(f.port).toBe(9000);
    expect(f.root).toBe("/tmp/p");
    expect(f.token).toBe("abc");
    expect(f.openBrowser).toBe(false);
  });

  it("Node < 20 exits before server import", async () => {
    const startServer = vi.fn();
    const lines: string[] = [];
    const code = await runCli({
      nodeVersion: "18.0.0",
      startServer,
      stderr: (s) => lines.push(s),
    });
    expect(code).toBe(1);
    expect(startServer).not.toHaveBeenCalled();
    expect(lines.join("")).toMatch(/18\.0\.0/);
  });

  it("URL always printed even when open fails", async () => {
    const lines: string[] = [];
    const preferred = 28_100 + Math.floor(Math.random() * 200);
    const code = await runCli({
      nodeVersion: "22.0.0",
      argv: ["--no-open", "--port", String(preferred)],
      startServer: async (opts) => ({
        port: opts.port,
        close: async () => undefined,
      }),
      openImpl: async () => ({ ok: false, reason: "fail" }),
      stdout: (s) => lines.push(s),
      stderr: () => undefined,
    });
    expect(code).toBe(0);
    expect(
      lines.some((l) => l.includes("http://127.0.0.1:") && l.includes("#token=")),
    ).toBe(true);
  });

  it("prints URL then attempts open", async () => {
    const lines: string[] = [];
    let openCalled = false;
    const preferred = 28_300 + Math.floor(Math.random() * 200);
    const code = await runCli({
      nodeVersion: "22.0.0",
      argv: ["--port", String(preferred), "--token", "fixedtoken"],
      startServer: async (opts) => ({
        port: opts.port,
        close: async () => undefined,
      }),
      openImpl: async ({ url }) => {
        openCalled = true;
        expect(url).toContain("#token=fixedtoken");
        return { ok: false, reason: "no-browser" };
      },
      stdout: (s) => lines.push(s),
      stderr: () => undefined,
    });
    expect(code).toBe(0);
    expect(lines[0]).toMatch(/#token=fixedtoken/);
    expect(openCalled).toBe(true);
  });
});
