import { describe, expect, it } from "vitest";
import { formatDashboardUrl, openBrowser } from "../../../src/cli/open.js";

describe("open browser", () => {
  it("maps platforms to commands", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const spawnImpl = ((cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return {
        once: () => undefined,
        unref: () => undefined,
      } as unknown as ReturnType<typeof import("node:child_process").spawn>;
    }) as typeof import("node:child_process").spawn;

    await openBrowser({
      url: "http://127.0.0.1:1/#token=t",
      platformName: "darwin",
      spawnImpl,
    });
    expect(calls[0]?.cmd).toBe("open");

    calls.length = 0;
    await openBrowser({
      url: "http://x",
      platformName: "linux",
      spawnImpl,
    });
    expect(calls[0]?.cmd).toBe("xdg-open");

    calls.length = 0;
    await openBrowser({
      url: "http://x",
      platformName: "win32",
      spawnImpl,
    });
    expect(calls[0]?.cmd).toBe("cmd");
  });

  it("spawn failure is non-fatal", async () => {
    const spawnImpl = (() => {
      throw new Error("nope");
    }) as unknown as typeof import("node:child_process").spawn;
    const r = await openBrowser({
      url: "http://x",
      spawnImpl,
    });
    expect(r.ok).toBe(false);
  });

  it("formatDashboardUrl uses fragment not query", () => {
    const url = formatDashboardUrl(7432, "tok");
    expect(url).toBe("http://127.0.0.1:7432/#token=tok");
    expect(url).not.toContain("?token=");
  });
});
