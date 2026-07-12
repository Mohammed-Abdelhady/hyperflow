import { describe, expect, it } from "vitest";
import { mergeConfigPayload } from "../../../../src/client/features/management/config/hooks/useConfigMutation";
import { splitConfig } from "../../../../src/client/features/management/config/hooks/useConfigQuery";
import { CONFIG_FIELD_DEFS } from "../../../../src/client/features/management/config/components/ConfigForm";

describe("config merge + split", () => {
  it("splits known vs unrecognized from read result", () => {
    const model = splitConfig({
      config: { memory: { compactionThreshold: 100 } },
      unrecognized: { cleanup: { days: 7 } },
      unrecognizedKeys: ["cleanup"],
    });
    expect(model.known.memory?.compactionThreshold).toBe(100);
    expect(model.unrecognizedKeys).toEqual(["cleanup"]);
    expect(model.unrecognized["cleanup"]).toEqual({ days: 7 });
  });

  it("merges edited known values with preserved unrecognized keys", () => {
    const payload = mergeConfigPayload(
      { handoff: { autoPush: true } },
      { cleanup: { days: 7 }, provider: "x" },
    );
    expect(payload["cleanup"]).toEqual({ days: 7 });
    expect(payload["provider"]).toBe("x");
    expect(payload["handoff"]).toEqual({ autoPush: true });
  });

  it("exposes a field def for every schema root section", () => {
    const sections = new Set(CONFIG_FIELD_DEFS.map((f) => f.section));
    expect(sections.has("security")).toBe(true);
    expect(sections.has("memory")).toBe(true);
    expect(sections.has("context")).toBe(true);
    expect(sections.has("handoff")).toBe(true);
    expect(sections.has("specialists")).toBe(true);
  });
});
