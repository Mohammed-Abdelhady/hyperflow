/**
 * Config GET/PUT — transport over config service.
 */
import { Hono } from "hono";
import {
  ConfigGetResponseSchema,
  ConfigPutRequestSchema,
  ConfigPutResponseSchema,
} from "@shared/schemas/api.js";
import { ValidationError } from "../services/errors.js";
import type { ConfigService } from "../services/config.js";

export type ConfigRouteDeps = {
  config: ConfigService;
};

export function createConfigRoutes(deps: ConfigRouteDeps): Hono {
  const app = new Hono();

  app.get("/config", (c) => {
    const result = deps.config.read();
    return c.json(
      ConfigGetResponseSchema.parse({
        config: {
          config: result.config,
          unrecognized: result.unrecognized,
          unrecognizedKeys: result.unrecognizedKeys,
        },
      }),
    );
  });

  app.put("/config", async (c) => {
    let json: unknown;
    try {
      json = await c.req.json();
    } catch {
      throw new ValidationError("Invalid JSON body");
    }
    const parsed = ConfigPutRequestSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError("Invalid config body", parsed.error.flatten());
    }
    const writeInput: Parameters<ConfigService["write"]>[0] = {
      config: parsed.data.config,
    };
    if (parsed.data.expectedMtimeMs !== undefined) {
      writeInput.expectedMtimeMs = parsed.data.expectedMtimeMs;
    }
    if (parsed.data.writeId !== undefined) {
      writeInput.writeId = parsed.data.writeId;
    }
    const result = await deps.config.write(writeInput);
    if (!result.ok) throw new ValidationError(result.reason);
    return c.json(
      ConfigPutResponseSchema.parse({
        accepted: true as const,
        writeId: result.writeId,
      }),
    );
  });

  return app;
}
