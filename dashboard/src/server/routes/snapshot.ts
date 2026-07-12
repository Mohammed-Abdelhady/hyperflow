/**
 * GET /api/v1/snapshot — transport over snapshot service.
 */
import { Hono } from "hono";
import { SnapshotResponseSchema } from "@shared/schemas/api.js";
import type { SnapshotService } from "../services/snapshot.js";
import type { SseHub } from "../sse/hub.js";
import { formatEpochSeqId } from "@shared/schemas/delta.js";

export type SnapshotRouteDeps = {
  snapshot: SnapshotService;
  hub: SseHub;
  isObserveMode: () => boolean;
};

export function createSnapshotRoutes(deps: SnapshotRouteDeps): Hono {
  const app = new Hono();

  app.get("/snapshot", (c) => {
    const snap =
      deps.snapshot.getCached() ?? deps.snapshot.assemble();
    const lastSeq = deps.hub.lastSeq();
    const lastEventId =
      lastSeq > 0 ? formatEpochSeqId(deps.hub.epoch, lastSeq) : null;
    const withMeta = deps.snapshot.setMeta({
      epoch: deps.hub.epoch,
      lastEventId,
      observeMode: deps.isObserveMode(),
    });
    // Prefer freshly assembled content with updated meta
    const body = SnapshotResponseSchema.parse({
      snapshot: {
        ...snap,
        meta: withMeta.meta,
      },
    });
    return c.json(body);
  });

  return app;
}
