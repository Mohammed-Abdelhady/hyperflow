import { describe, expect, it } from "vitest";
import { createEventsStore } from "../../../../src/client/stores/events";

describe("events store retention", () => {
  it("drop-oldest enforces cap with lossless order of survivors", () => {
    const store = createEventsStore(3);
    store.getState().append([
      { id: "1", line: { variant: "opaque", raw: 1 } },
      { id: "2", line: { variant: "opaque", raw: 2 } },
      { id: "3", line: { variant: "opaque", raw: 3 } },
      { id: "4", line: { variant: "opaque", raw: 4 } },
    ]);
    expect(store.getState().items.map((i) => i.id)).toEqual(["2", "3", "4"]);
  });

  it("mergeRange coalesces by id", () => {
    const store = createEventsStore(10);
    store.getState().append([{ id: "a", line: { variant: "opaque", raw: 1 } }]);
    store.getState().mergeRange([
      { id: "a", line: { variant: "opaque", raw: 2 } },
      { id: "b", line: { variant: "opaque", raw: 3 } },
    ]);
    expect(store.getState().items).toHaveLength(2);
    expect(store.getState().items[0]?.line).toEqual({
      variant: "opaque",
      raw: 2,
    });
  });
});
