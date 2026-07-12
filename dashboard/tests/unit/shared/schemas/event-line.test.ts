import { describe, expect, it } from "vitest";
import {
  parseEventLine,
  type EventLineV1,
} from "../../../../src/shared/schemas/event-line.js";

describe("event-line", () => {
  it("parses v1 line with optional fields typed", () => {
    const input = {
      v: 1,
      ts: "2026-07-12T10:00:00Z",
      chain: "c1",
      skill: "dispatch",
      type: "status",
      task: "T3",
      tokens: 1200,
    };

    const result = parseEventLine(input);
    expect(result.variant).toBe("v1");
    if (result.variant !== "v1") return;

    const event: EventLineV1 = result.event;
    expect(event.v).toBe(1);
    expect(event.chain).toBe("c1");
    expect(event.skill).toBe("dispatch");
    expect(event.type).toBe("status");
    expect(event.task).toBe("T3");
    expect(event.tokens).toBe(1200);
    expect(event.batch).toBeUndefined();
    expect(event.agent).toBeUndefined();
  });

  it("maps unknown v to opaque raw-event without throwing", () => {
    const input = {
      v: 9,
      ts: "2026-07-12T10:00:00Z",
      chain: "c1",
      skill: "dispatch",
      type: "status",
      task: "T3",
      tokens: 1200,
      future: "x",
    };

    expect(() => parseEventLine(input)).not.toThrow();
    const result = parseEventLine(input);
    expect(result.variant).toBe("opaque");
    if (result.variant !== "opaque") return;

    expect(result.v).toBe(9);
    expect(result.ts).toBe("2026-07-12T10:00:00Z");
    expect(result.type).toBe("status");
    expect(result.raw).toEqual(input);
    expect(
      (result.raw as { future?: string }).future,
    ).toBe("x");
  });

  it("preserves unknown extra fields on v1 via passthrough", () => {
    const input = {
      v: 1,
      ts: "2026-07-12T10:00:00Z",
      chain: "c1",
      skill: "dispatch",
      type: "status",
      novel: "keep-me",
    };
    const result = parseEventLine(input);
    expect(result.variant).toBe("v1");
    if (result.variant !== "v1") return;
    expect(result.event["novel"]).toBe("keep-me");
  });
});
