import {
  mkdtempSync,
  writeFileSync,
  appendFileSync,
  rmSync,
  truncateSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createNdjsonTailer,
  type TailerSignal,
} from "../../../src/server/watch/tailer.js";

describe("ndjson tailer", () => {
  let dir: string;
  let file: string;
  let signals: TailerSignal[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hf-tail-"));
    file = join(dir, "events.ndjson");
    signals = [];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function tailer(initialOffset = 0) {
    return createNdjsonTailer({
      path: file,
      initialOffset,
      onSignal: (s) => signals.push(s),
    });
  }

  function lines(): string[] {
    return signals.filter((s) => s.kind === "line").map((s) => {
      if (s.kind !== "line") return "";
      return s.line;
    });
  }

  it("emits complete lines and advances offset; no re-emission", () => {
    writeFileSync(
      file,
      '{"v":1,"n":1}\n{"v":1,"n":2}\n{"v":1,"n":3}\n',
    );
    const t = tailer();
    t.poll();
    expect(lines()).toEqual([
      '{"v":1,"n":1}',
      '{"v":1,"n":2}',
      '{"v":1,"n":3}',
    ]);
    const off = t.offset();
    appendFileSync(file, '{"v":1,"n":4}\n{"v":1,"n":5}\n');
    t.poll();
    expect(lines()).toHaveLength(5);
    expect(lines()[3]).toBe('{"v":1,"n":4}');
    expect(lines()[4]).toBe('{"v":1,"n":5}');
    expect(t.offset()).toBeGreaterThan(off);
    t.dispose();
  });

  it("holds partial line and emits once completed", () => {
    writeFileSync(file, "");
    const t = tailer();
    appendFileSync(file, '{"v":1,"ts":');
    t.poll();
    expect(lines()).toEqual([]);
    const held = t.offset();
    appendFileSync(file, '"x"}\n');
    t.poll();
    expect(lines()).toEqual(['{"v":1,"ts":"x"}']);
    expect(t.offset()).toBeGreaterThan(held);
    t.dispose();
  });

  it("resyncs on shrink-below-offset", () => {
    writeFileSync(file, '{"a":1}\n{"a":2}\n{"a":3}\n');
    const t = tailer();
    t.poll();
    expect(lines()).toHaveLength(3);
    truncateSync(file, 0);
    appendFileSync(file, '{"a":9}\n');
    t.poll();
    const resyncs = signals.filter((s) => s.kind === "resync");
    expect(resyncs.length).toBeGreaterThanOrEqual(1);
    expect(resyncs[0]).toMatchObject({ kind: "resync", reason: "shrink" });
    // after resync, only post-shrink line
    const after = signals
      .slice(signals.findIndex((s) => s.kind === "resync") + 1)
      .filter((s) => s.kind === "line");
    expect(after).toHaveLength(1);
    if (after[0]?.kind === "line") {
      expect(after[0].line).toBe('{"a":9}');
    }
    t.dispose();
  });

  it("decodes multi-byte UTF-8 split across writes", () => {
    writeFileSync(file, "");
    const t = tailer();
    // "é" is c3 a9 — write opening + first byte, then rest
    const full = '{"msg":"café"}\n';
    const bytes = Buffer.from(full, "utf8");
    const mid = bytes.indexOf(0xc3) + 1; // split mid codepoint
    appendFileSync(file, bytes.subarray(0, mid));
    t.poll();
    expect(lines()).toEqual([]);
    appendFileSync(file, bytes.subarray(mid));
    t.poll();
    expect(lines()).toEqual(['{"msg":"café"}']);
    t.dispose();
  });

  it("file absent then created → resync and start tailing", () => {
    const missing = join(dir, "later.ndjson");
    const t = createNdjsonTailer({
      path: missing,
      onSignal: (s) => signals.push(s),
    });
    t.poll();
    expect(lines()).toEqual([]);
    writeFileSync(missing, '{"ok":true}\n');
    t.poll();
    expect(signals.some((s) => s.kind === "resync")).toBe(true);
    expect(lines()).toContain('{"ok":true}');
    t.dispose();
  });
});
