/**
 * GET /api/v1/stream — SSE endpoint (query-param token accepted by gate).
 * Never logs the request URL.
 */
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { SseHub } from "../sse/hub.js";

export type StreamRouteDeps = {
  hub: SseHub;
};

export function createStreamRoutes(deps: StreamRouteDeps): Hono {
  const app = new Hono();

  app.get("/stream", (c) => {
    const lastEventId =
      c.req.header("last-event-id") ?? c.req.query("lastEventId") ?? null;

    return streamSSE(c, async (stream) => {
      const sink = {
        write: (frame: string): boolean => {
          // frame is fully serialized SSE; write raw
          void stream.write(frame);
          return true;
        },
        close: () => {
          void stream.close();
        },
      };
      const sub = deps.hub.subscribe(sink, lastEventId);
      stream.onAbort(() => {
        deps.hub.unsubscribe(sub.clientId);
      });
      // Keep the handler alive until the client disconnects.
      await new Promise<void>((resolve) => {
        stream.onAbort(() => resolve());
      });
    });
  });

  return app;
}
