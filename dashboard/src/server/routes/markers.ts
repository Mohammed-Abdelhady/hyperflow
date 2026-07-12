/**
 * Markers GET/POST toggle — transport only.
 */
import { Hono } from "hono";
import {
  MarkersResponseSchema,
  MarkersToggleRequestSchema,
  WriteAcceptedResponseSchema,
} from "@shared/schemas/api.js";
import { ValidationError } from "../services/errors.js";
import type { MarkersService } from "../services/markers.js";

export type MarkersRouteDeps = {
  markers: MarkersService;
};

export function createMarkersRoutes(deps: MarkersRouteDeps): Hono {
  const app = new Hono();

  app.get("/markers", (c) => {
    return c.json(
      MarkersResponseSchema.parse({ markers: deps.markers.read() }),
    );
  });

  app.post("/markers", async (c) => {
    let json: unknown;
    try {
      json = await c.req.json();
    } catch {
      throw new ValidationError("Invalid JSON body");
    }
    const parsed = MarkersToggleRequestSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError("Invalid markers body", parsed.error.flatten());
    }
    const result = await deps.markers.toggle(parsed.data);
    return c.json(
      WriteAcceptedResponseSchema.parse({
        accepted: true as const,
        writeId: result.writeIds[0],
      }),
    );
  });

  return app;
}
