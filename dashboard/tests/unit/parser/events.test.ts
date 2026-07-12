import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseEventsBatch,
  parseEventsLine,
  parseEventsText,
} from "../../../src/server/parser/events.js";

const FIX = resolve(import.meta.dirname, "../../fixtures/golden/events");

function load(name: string): string {
  return readFileSync(resolve(FIX, name), "utf8");
}

describe("parseEvents", () => {
  it("parses five v1 lines", () => {
    const batch = parseEventsText(load("lines-v1.ndjson"));
    expect(batch.diagnostics.parsed).toBe(5);
    expect(batch.events.every((e) => e.variant === "v1")).toBe(true);
    const withTokens = batch.events.find(
      (e) => e.variant === "v1" && e.event.tokens === 1200,
    );
    expect(withTokens).toBeDefined();
  });

  it("opaque on unknown v with best-effort fields", () => {
    const line = load("line-unknown-v.ndjson").trim();
    const result = parseEventsLine(line);
    expect(result?.variant).toBe("opaque");
    if (result?.variant !== "opaque") return;
    expect(result.ts).toBe("2026-05-16T11:00:00Z");
    expect(result.type).toBe("future-thing");
    expect((result.raw as { novel?: string }).novel).toBe("keep");
  });

  it("preserves extra fields on v1", () => {
    const line = load("line-extra-fields.ndjson").trim();
    const result = parseEventsLine(line);
    expect(result?.variant).toBe("v1");
    if (result?.variant !== "v1") return;
    expect(result.event["novel"]).toBe("keep-me");
  });

  it("torn last line becomes unparseable opaque", () => {
    const batch = parseEventsText(load("torn-last-line.ndjson"));
    expect(batch.diagnostics.parsed).toBe(2);
    expect(batch.diagnostics.unparseable).toBe(1);
    const last = batch.events[batch.events.length - 1];
    expect(last?.variant).toBe("opaque");
    if (last?.variant !== "opaque") return;
    expect(last.unparseable).toBe(true);
  });

  it("non-object JSON is opaque", () => {
    const result = parseEventsLine(load("line-not-object.ndjson").trim());
    expect(result?.variant).toBe("opaque");
  });

  it("batch helper never throws", () => {
    expect(() => parseEventsBatch(["", "{", "[]"])).not.toThrow();
  });
});
