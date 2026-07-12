import { describe, expect, it } from "vitest";
import { FEATURE_REGISTRY } from "../../../src/client/constants/features";
import {
  ROUTES,
  buildRoutePath,
  isKnownRoute,
} from "../../../src/client/constants/routes";

describe("routes", () => {
  it("covers all 11 surfaces", () => {
    expect(Object.keys(ROUTES)).toHaveLength(11);
    expect(FEATURE_REGISTRY).toHaveLength(11);
  });

  it("builds slug query paths the router can resolve", () => {
    for (const feature of FEATURE_REGISTRY) {
      expect(isKnownRoute(feature.route)).toBe(true);
      const withSlug = buildRoutePath(feature.route, {
        slug: "2026-07-12-scope",
      });
      expect(withSlug).toBe(`${feature.route}?slug=2026-07-12-scope`);
    }
  });

  it("round-trips every route-map entry", () => {
    for (const path of Object.values(ROUTES)) {
      expect(buildRoutePath(path)).toBe(path);
      expect(isKnownRoute(path)).toBe(true);
    }
  });
});
