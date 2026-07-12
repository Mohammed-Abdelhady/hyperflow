import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { selectPort } from "../../../src/cli/port.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((res) => {
          s.close(() => res());
        }),
    ),
  );
});

function occupy(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(port, "127.0.0.1", () => {
      servers.push(s);
      resolve();
    });
    s.on("error", reject);
  });
}

describe("selectPort", () => {
  it("preferred free → chosen", async () => {
    const preferred = 27_100 + Math.floor(Math.random() * 200);
    const r = await selectPort({ preferred, bound: 5 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.port).toBe(preferred);
  });

  it("occupied preferred → next free", async () => {
    const preferred = 27_300 + Math.floor(Math.random() * 200);
    await occupy(preferred);
    const r = await selectPort({ preferred, bound: 5 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.port).toBeGreaterThan(preferred);
      expect(r.occupied).toContain(preferred);
    }
  });

  it("entire bound occupied → failure", async () => {
    const preferred = 27_500 + Math.floor(Math.random() * 100);
    for (let i = 0; i < 3; i += 1) await occupy(preferred + i);
    const r = await selectPort({ preferred, bound: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/No free port/);
  });
});
