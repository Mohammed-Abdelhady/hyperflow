import { describe, expect, it } from "vitest";
import { deriveBanners } from "../../../src/client/app/banners";

describe("deriveBanners", () => {
  it("emits all four variants with label text", () => {
    const banners = deriveBanners({
      streamStatus: "reconnecting",
      resyncInProgress: true,
      fidelity: "reduced",
      observeMode: true,
    });
    expect(banners.map((b) => b.variant)).toEqual([
      "connection",
      "resync",
      "reduced-fidelity",
      "observe-mode",
    ]);
    for (const b of banners) {
      expect(b.message.length).toBeGreaterThan(0);
    }
  });

  it("is empty when healthy", () => {
    expect(
      deriveBanners({
        streamStatus: "live",
        resyncInProgress: false,
        fidelity: "full",
        observeMode: false,
      }),
    ).toEqual([]);
  });
});
