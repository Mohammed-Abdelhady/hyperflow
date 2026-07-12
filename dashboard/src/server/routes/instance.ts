/**
 * GET /api/v1/instance — token-authenticated identity ping for second launch.
 */
import { Hono } from "hono";
import { InstanceResponseSchema } from "@shared/schemas/api.js";

export type InstanceRouteDeps = {
  port: number;
  projectRoot: string;
  version?: string | undefined;
};

export function createInstanceRoutes(deps: InstanceRouteDeps): Hono {
  const app = new Hono();

  app.get("/instance", (c) => {
    const body = InstanceResponseSchema.parse({
      ok: true as const,
      port: deps.port,
      projectRoot: deps.projectRoot,
    });
    return c.json(body);
  });

  return app;
}
