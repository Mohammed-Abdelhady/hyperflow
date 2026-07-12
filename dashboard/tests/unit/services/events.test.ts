import {
  mkdtempSync,
  writeFileSync,
  appendFileSync,
  rmSync,
  truncateSync,
  readFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEventsService } from "../../../src/server/services/events.js";
import { EventLineResultSchema } from "../../../src/shared/schemas/event-line.js";

const FIX = resolve(import.meta.dirname, "../../fixtures/golden/events");

describe("events service", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hf-ev-"));
    file = join(dir, "events.ndjson");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("validates v1 lines and tallies unparseable", () => {
    writeFileSync(file, "");
    const live: unknown[] = [];
    const svc = createEventsService({
      eventsPath: file,
      onEvent: (e) => live.push(e),
    });
    appendFileSync(
      file,
      [
        '{"v":1,"ts":"t1","chain":"c","skill":"s","type":"start"}',
        "not-json",
        '{"v":99,"ts":"t2","type":"x","extra":true}',
        "",
      ].join("\n") + "\n",
    );
    svc.poll();
    expect(live).toHaveLength(2);
    expect(live[0]).toMatchObject({ variant: "v1" });
    expect(live[1]).toMatchObject({ variant: "opaque", v: 99 });
    const d = svc.diagnostics();
    expect(d.parsed).toBe(1);
    expect(d.opaque).toBeGreaterThanOrEqual(1);
    expect(d.unparseable).toBeGreaterThanOrEqual(1);
    svc.dispose();
  });

  it("range read returns schema-valid page from fixture", () => {
    const lines = Array.from({ length: 50 }, (_, i) =>
      JSON.stringify({
        v: 1,
        ts: `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`,
        chain: "c",
        skill: "s",
        type: "tick",
        task: `T${i}`,
      }),
    );
    writeFileSync(file, lines.join("\n") + "\n");
    const svc = createEventsService({ eventsPath: file });
    const page = svc.range({ offset: 10, limit: 10 });
    expect(page.events).toHaveLength(10);
    for (const ev of page.events) {
      expect(EventLineResultSchema.parse(ev).variant).toBe("v1");
    }
    expect(page.truncated).toBe(true);
    expect(page.nextOffset).toBe(20);
    svc.dispose();
  });

  it("timeline rebuilds after resync", () => {
    writeFileSync(
      file,
      '{"v":1,"ts":"a","chain":"c","skill":"s","type":"x"}\n',
    );
    const svc = createEventsService({ eventsPath: file });
    svc.poll();
    expect(svc.timeline()).toHaveLength(1);
    truncateSync(file, 0);
    // Shrink must be observed while size < stored offset (poll mid-truncation).
    svc.poll();
    appendFileSync(
      file,
      '{"v":1,"ts":"b","chain":"c","skill":"s","type":"y","detail":"longer"}\n',
    );
    svc.poll();
    const tl = svc.timeline();
    expect(tl).toHaveLength(1);
    expect(tl[0]?.ts).toBe("b");
    svc.dispose();
  });

  it("file absent → markdown-only; create later flips", () => {
    const missing = join(dir, "nope.ndjson");
    const svc = createEventsService({ eventsPath: missing });
    expect(svc.isMarkdownOnly()).toBe(true);
    writeFileSync(
      missing,
      '{"v":1,"ts":"t","chain":"c","skill":"s","type":"z"}\n',
    );
    svc.poll();
    expect(svc.isMarkdownOnly()).toBe(false);
    expect(svc.liveEvents().length).toBe(1);
    svc.dispose();
  });

  it("unknown v is opaque without incrementing unparseable", () => {
    writeFileSync(file, "");
    const svc = createEventsService({ eventsPath: file });
    appendFileSync(file, '{"v":99,"foo":1}\n');
    svc.poll();
    const d = svc.diagnostics();
    expect(d.opaque).toBe(1);
    expect(d.unparseable).toBe(0);
    expect(d.parsed).toBe(0);
    svc.dispose();
  });

  it("loads golden lines-v1 for range", () => {
    const raw = readFileSync(join(FIX, "lines-v1.ndjson"), "utf8");
    writeFileSync(file, raw.endsWith("\n") ? raw : raw + "\n");
    const svc = createEventsService({ eventsPath: file });
    const page = svc.range({});
    expect(page.events.length).toBeGreaterThan(0);
    svc.dispose();
  });
});
