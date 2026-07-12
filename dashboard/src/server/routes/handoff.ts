/**
 * Handoff list/detail + STATUS transition.
 */
import { Hono } from "hono";
import {
  HandoffListResponseSchema,
  HandoffTransitionRequestSchema,
  HandoffTransitionResponseSchema,
} from "@shared/schemas/api.js";
import { ValidationError } from "../services/errors.js";
import type { HandoffService } from "../services/handoff.js";

export type HandoffRouteDeps = {
  handoff: HandoffService;
};

export function createHandoffRoutes(deps: HandoffRouteDeps): Hono {
  const app = new Hono();

  app.get("/handoff", (c) => {
    return c.json(
      HandoffListResponseSchema.parse({ handoff: deps.handoff.list() }),
    );
  });

  app.get("/handoff/:slug", (c) => {
    const slug = c.req.param("slug");
    const entry = deps.handoff.read(slug);
    return c.json({ handoff: [entry] });
  });

  app.post("/handoff/transition", async (c) => {
    let json: unknown;
    try {
      json = await c.req.json();
    } catch {
      throw new ValidationError("Invalid JSON body");
    }
    const parsed = HandoffTransitionRequestSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid handoff transition body",
        parsed.error.flatten(),
      );
    }
    const result = await deps.handoff.transition(parsed.data);
    if (!result.ok) throw new ValidationError(result.reason);
    return c.json(
      HandoffTransitionResponseSchema.parse({
        accepted: true as const,
        slug: parsed.data.slug,
        status: parsed.data.status,
        writeId: result.writeId,
      }),
    );
  });

  return app;
}
