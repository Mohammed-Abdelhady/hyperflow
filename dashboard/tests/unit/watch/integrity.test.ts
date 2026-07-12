import { describe, expect, it } from "vitest";
import {
  checksumBuffer,
  createIntegrityChecker,
} from "../../../src/server/watch/integrity.js";

function memFs(initial: Record<string, Buffer> = {}) {
  const files = new Map<string, { buf: Buffer; mtimeMs: number }>();
  let clock = 1000;
  for (const [p, buf] of Object.entries(initial)) {
    files.set(p, { buf, mtimeMs: clock++ });
  }

  return {
    files,
    tick: () => {
      clock += 1;
      return clock;
    },
    fs: {
      exists: (p: string) => files.has(p),
      stat: (p: string) => {
        const f = files.get(p);
        if (!f) throw new Error("missing");
        return { size: f.buf.length, mtimeMs: f.mtimeMs };
      },
      read: (p: string) => {
        const f = files.get(p);
        if (!f) throw new Error("missing");
        return f.buf;
      },
    },
    write: (p: string, content: string) => {
      files.set(p, { buf: Buffer.from(content), mtimeMs: clock++ });
    },
    append: (p: string, extra: string) => {
      const prev = files.get(p)?.buf ?? Buffer.alloc(0);
      files.set(p, {
        buf: Buffer.concat([prev, Buffer.from(extra)]),
        mtimeMs: clock++,
      });
    },
    del: (p: string) => {
      files.delete(p);
    },
    touch: (p: string) => {
      const f = files.get(p);
      if (!f) throw new Error("missing");
      files.set(p, { buf: f.buf, mtimeMs: clock++ });
    },
  };
}

describe("integrity", () => {
  it("file appended in 3 chunks → zero emissions until final stability, then one changed", async () => {
    const mem = memFs({ "/a.md": Buffer.from("v1") });
    const checker = createIntegrityChecker({
      fs: mem.fs,
      stabilityMs: 0,
    });
    // seed as known content
    checker.seed("/a.md", checksumBuffer(Buffer.from("v1")));

    // Simulate mid-write: size changes between stability checks via custom fs
    let phase = 0;
    const flakyFs = {
      exists: () => true,
      stat: () => {
        phase += 1;
        // first pair of stats disagree on size → defer
        if (phase <= 2) {
          return { size: phase, mtimeMs: 1 };
        }
        return { size: 10, mtimeMs: 2 };
      },
      read: () => Buffer.from("final-content"),
    };

    const mid = createIntegrityChecker({ fs: flakyFs, stabilityMs: 0 });
    const deferred = await mid.check(["/growing.md"]);
    expect(deferred.defer).toContain("/growing.md");
    expect(deferred.emit).toHaveLength(0);

    // Stable final write
    mem.write("/a.md", "final");
    const done = await checker.check(["/a.md"]);
    expect(done.defer).toHaveLength(0);
    expect(done.emit).toHaveLength(1);
    expect(done.emit[0]?.kind).toBe("changed");
    expect(done.emit[0]?.checksum).toBe(
      checksumBuffer(Buffer.from("final")),
    );
  });

  it("rewrite with byte-identical content → suppressed as no-op", async () => {
    const content = Buffer.from("same");
    const mem = memFs({ "/x.md": content });
    const checker = createIntegrityChecker({ fs: mem.fs, stabilityMs: 0 });
    checker.seed("/x.md", checksumBuffer(content));
    mem.touch("/x.md"); // mtime bump only
    // rewrite identical
    mem.write("/x.md", "same");
    const r = await checker.check(["/x.md"]);
    expect(r.emit).toHaveLength(0);
  });

  it("touch (mtime bump, same content) → suppressed", async () => {
    const content = Buffer.from("body");
    const mem = memFs({ "/t.md": content });
    const checker = createIntegrityChecker({ fs: mem.fs, stabilityMs: 0 });
    // first check creates cache
    const first = await checker.check(["/t.md"]);
    expect(first.emit[0]?.kind).toBe("created");
    mem.touch("/t.md");
    const second = await checker.check(["/t.md"]);
    expect(second.emit).toHaveLength(0);
  });

  it("delete → delete entry + cache eviction", async () => {
    const mem = memFs({ "/d.md": Buffer.from("x") });
    const checker = createIntegrityChecker({ fs: mem.fs, stabilityMs: 0 });
    await checker.check(["/d.md"]);
    expect(checker.cacheSize()).toBe(1);
    mem.del("/d.md");
    const r = await checker.check(["/d.md"]);
    expect(r.emit).toEqual([{ path: "/d.md", kind: "deleted" }]);
    expect(checker.cacheSize()).toBe(0);
  });
});
