/**
 * Backup list + restore action.
 */
import { Hono } from "hono";
import { z } from "zod";
import { WriteAcceptedResponseSchema } from "@shared/schemas/api.js";
import { ValidationError } from "../services/errors.js";
import type { RestoreService } from "../services/restore.js";

export type RestoreRouteDeps = {
  restore: RestoreService;
};

const RestoreRequestSchema = z.object({
  backupId: z.string().min(1),
  targetPath: z.string().min(1),
  expectedMtimeMs: z.number().optional(),
  expectedContentHash: z.string().optional(),
  writeId: z.string().optional(),
});

export function createRestoreRoutes(deps: RestoreRouteDeps): Hono {
  const app = new Hono();

  app.get("/restore", (c) => {
    const target = c.req.query("target");
    const backups = deps.restore.listBackups(target);
    return c.json({ backups });
  });

  app.post("/restore", async (c) => {
    let json: unknown;
    try {
      json = await c.req.json();
    } catch {
      throw new ValidationError("Invalid JSON body");
    }
    const parsed = RestoreRequestSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError("Invalid restore body", parsed.error.flatten());
    }
    const result = await deps.restore.restore(parsed.data);
    if (!result.ok) throw new ValidationError(result.reason);
    return c.json(
      WriteAcceptedResponseSchema.parse({
        accepted: true as const,
        writeId: result.writeId,
      }),
    );
  });

  return app;
}
