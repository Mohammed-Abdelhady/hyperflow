import { describe, expect, it } from "vitest";
import { HydrationBuffer } from "../../../../src/client/services/sse-buffer";

describe("HydrationBuffer", () => {
  it("flushes after hydrate in id order respecting watermark", () => {
    const buf = new HydrationBuffer();
    buf.push("e1-3", { ops: [] });
    buf.push("e1-1", { ops: [] });
    buf.push("e1-2", { ops: [] });
    buf.push("e1-5", { ops: [] });
    const flushed = buf.flush("e1-2");
    expect(flushed.map((f) => f.id)).toEqual(["e1-3", "e1-5"]);
  });
});
