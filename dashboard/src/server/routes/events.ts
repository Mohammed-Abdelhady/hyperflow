/**
 * GET /api/v1/events — range fetch for replay scrubber.
 */
import { Hono } from "hono";
import {
  EventsRangeQuerySchema,
  EventsRangeResponseSchema,
} from "@shared/schemas/api.js";
import { ValidationError } from "../services/errors.js";
import type { EventsService } from "../services/events.js";

export type EventsRouteDeps = {
  events: EventsService;
};

export function createEventsRoutes(deps: EventsRouteDeps): Hono {
  const app = new Hono();

  app.get("/events", (c) => {
    const raw = {
      from: c.req.query("from"),
      to: c.req.query("to"),
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
    };
    const coerced = {
      ...(raw.from !== undefined ? { from: raw.from } : {}),
      ...(raw.to !== undefined ? { to: raw.to } : {}),
      ...(raw.limit !== undefined ? { limit: Number(raw.limit) } : {}),
      ...(raw.offset !== undefined ? { offset: Number(raw.offset) } : {}),
    };
    const parsed = EventsRangeQuerySchema.safeParse(coerced);
    if (!parsed.success) {
      throw new ValidationError("Invalid events range query", parsed.error.flatten());
    }
    const page = deps.events.range(parsed.data);
    return c.json(EventsRangeResponseSchema.parse(page));
  });

  return app;
}
