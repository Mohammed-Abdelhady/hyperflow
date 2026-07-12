/**
 * Memory read + write routes — transport only.
 */
import { Hono } from "hono";
import {
  MemoryListResponseSchema,
  MemoryWriteRequestSchema,
  MemoryWriteResponseSchema,
} from "@shared/schemas/api.js";
import { ValidationError } from "../services/errors.js";
import type { MemoryService } from "../services/memory.js";

export type MemoryRouteDeps = {
  memory: MemoryService;
};

export function createMemoryRoutes(deps: MemoryRouteDeps): Hono {
  const app = new Hono();

  app.get("/memory", (c) => {
    const memory = deps.memory.list();
    return c.json(MemoryListResponseSchema.parse({ memory }));
  });

  app.get("/memory/:category", (c) => {
    const category = c.req.param("category");
    const entry = deps.memory.read(category);
    return c.json({ memory: [entry] });
  });

  app.put("/memory/:category", async (c) => {
    const category = c.req.param("category");
    let json: unknown;
    try {
      json = await c.req.json();
    } catch {
      throw new ValidationError("Invalid JSON body");
    }
    const parsed = MemoryWriteRequestSchema.safeParse({
      ...(typeof json === "object" && json !== null ? json : {}),
      category,
    });
    if (!parsed.success) {
      throw new ValidationError("Invalid memory write body", parsed.error.flatten());
    }
    const result = await deps.memory.writeCategory(parsed.data);
    if (!result.ok) throw new ValidationError(result.reason);
    return c.json(
      MemoryWriteResponseSchema.parse({
        accepted: true as const,
        writeId: result.writeId,
        path: result.resolvedPath,
      }),
    );
  });

  app.post("/memory", async (c) => {
    let json: unknown;
    try {
      json = await c.req.json();
    } catch {
      throw new ValidationError("Invalid JSON body");
    }
    const parsed = MemoryWriteRequestSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError("Invalid memory write body", parsed.error.flatten());
    }
    const result = await deps.memory.writeCategory(parsed.data);
    if (!result.ok) throw new ValidationError(result.reason);
    return c.json(
      MemoryWriteResponseSchema.parse({
        accepted: true as const,
        writeId: result.writeId,
        path: result.resolvedPath,
      }),
      201,
    );
  });

  return app;
}
