/**
 * Dashboard server factory — Hono on node:http, 127.0.0.1 only.
 */
import { createServer, type Server } from "node:http";
import { join, resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { Hono } from "hono";
import { getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  type ErrorEnvelope,
} from "@shared/schemas/api.js";
import { SSE_EVENT_NAMES } from "@shared/schemas/delta.js";
import { createOriginAllowlist } from "./security/origin-allowlist.js";
import { createTokenGate } from "./security/token.js";
import {
  createErrorHandler,
  errorMapperMiddleware,
  notFoundEnvelope,
} from "./routes/error-mapper.js";
import { createSnapshotRoutes } from "./routes/snapshot.js";
import { createEventsRoutes } from "./routes/events.js";
import { createStreamRoutes } from "./routes/stream.js";
import { createInstanceRoutes } from "./routes/instance.js";
import { createMemoryRoutes } from "./routes/memory.js";
import { createConfigRoutes } from "./routes/config.js";
import { createMarkersRoutes } from "./routes/markers.js";
import { createHandoffRoutes } from "./routes/handoff.js";
import { createRestoreRoutes } from "./routes/restore.js";
import { createSnapshotService } from "./services/snapshot.js";
import { createEventsService } from "./services/events.js";
import { createMemoryService } from "./services/memory.js";
import { createConfigService } from "./services/config.js";
import { createMarkersService } from "./services/markers.js";
import { createHandoffService } from "./services/handoff.js";
import { createRestoreService } from "./services/restore.js";
import { createWriteDoor } from "./services/write.js";
import { createSseHub } from "./sse/hub.js";
import { createFileWatcher } from "./watch/watcher.js";
import { isEmptyDelta } from "./services/delta.js";

export type DashboardServerOptions = {
  /** Project root (parent of `.hyperflow/` when present). */
  rootDir: string;
  port: number;
  token: string;
  openBrowser?: boolean | undefined;
  /** Absolute global config path (default: ~/.hyperflow/config.json). */
  globalConfigPath?: string | undefined;
  /** Absolute client SPA dist (default: package dist/client). */
  clientDist?: string | undefined;
  /** Skip watcher start (tests). */
  disableWatcher?: boolean | undefined;
  homeDir?: string | undefined;
};

export type DashboardServer = {
  port: number;
  host: string;
  token: string;
  rootDir: string;
  hyperflowDir: string;
  hub: ReturnType<typeof createSseHub>;
  snapshot: ReturnType<typeof createSnapshotService>;
  events: ReturnType<typeof createEventsService>;
  writeDoor: ReturnType<typeof createWriteDoor>;
  close: () => Promise<void>;
  url: () => string;
};

const HOST = "127.0.0.1";

function resolvePaths(options: DashboardServerOptions) {
  const rootDir = resolve(options.rootDir);
  const hyperflowDir = join(rootDir, ".hyperflow");
  const handoffDir = join(rootDir, ".hyperflow-handoff");
  const homeDir = options.homeDir ?? process.env["HOME"] ?? rootDir;
  const globalConfigPath =
    options.globalConfigPath ?? join(homeDir, ".hyperflow", "config.json");
  return { rootDir, hyperflowDir, handoffDir, homeDir, globalConfigPath };
}

export async function createDashboardServer(
  options: DashboardServerOptions,
): Promise<DashboardServer> {
  const paths = resolvePaths(options);

  // Jail construction requires an existing root; empty guided state is fine.
  if (!existsSync(paths.hyperflowDir)) {
    mkdirSync(paths.hyperflowDir, { recursive: true });
  }
  if (!existsSync(paths.handoffDir)) {
    mkdirSync(paths.handoffDir, { recursive: true });
  }

  const hub = createSseHub();
  const writeDoor = createWriteDoor({
    jailRoot: paths.hyperflowDir,
    globalConfigPath: paths.globalConfigPath,
    handoffRoot: paths.handoffDir,
    homeDir: paths.homeDir,
  });
  const observe = !writeDoor.probeWritability();

  const snapshot = createSnapshotService({
    roots: {
      hyperflowDir: paths.hyperflowDir,
      handoffDir: paths.handoffDir,
      globalConfigPath: paths.globalConfigPath,
    },
    meta: {
      epoch: hub.epoch,
      lastEventId: null,
      observeMode: observe,
    },
  });
  snapshot.assemble();

  const events = createEventsService({
    eventsPath: join(paths.hyperflowDir, "events.ndjson"),
    onEvent: (event) => {
      hub.publish({ event: SSE_EVENT_NAMES.HF_EVENT, data: event });
    },
  });
  events.poll();

  const watcher = createFileWatcher({
    roots: {
      hyperflowDir: paths.hyperflowDir,
      handoffDir: paths.handoffDir,
      globalConfigPath: paths.globalConfigPath,
    },
    onChangeset: (entries) => {
      const eventsPath = join(paths.hyperflowDir, "events.ndjson");
      const touchedEvents = entries.some((e) => e.path === eventsPath);
      if (touchedEvents) events.poll();

      const { delta } = snapshot.applyChangeset(entries);
      if (!isEmptyDelta(delta)) {
        hub.publish({
          event: SSE_EVENT_NAMES.SNAPSHOT_DELTA,
          data: delta,
        });
      }
    },
  });

  if (!options.disableWatcher) {
    await watcher.start();
  }

  const app = new Hono();
  app.onError(createErrorHandler());
  // Host/Origin gate every request (SPA + API). Token gate is API-only so the
  // static shell can load and perform the fragment → sessionStorage handshake.
  app.use("*", createOriginAllowlist({ port: options.port }));
  app.use("/api/*", createTokenGate({ sessionToken: options.token }));
  app.use("/api/*", errorMapperMiddleware());

  const api = new Hono();
  api.route(
    "/",
    createSnapshotRoutes({
      snapshot,
      hub,
      isObserveMode: () => writeDoor.isObserveMode(),
    }),
  );
  api.route("/", createEventsRoutes({ events }));
  api.route("/", createStreamRoutes({ hub }));
  api.route(
    "/",
    createInstanceRoutes({
      port: options.port,
      projectRoot: paths.rootDir,
    }),
  );

  const memory = createMemoryService({
    hyperflowDir: paths.hyperflowDir,
    writeDoor,
  });
  const config = createConfigService({
    globalConfigPath: paths.globalConfigPath,
    writeDoor,
  });
  const markers = createMarkersService({
    hyperflowDir: paths.hyperflowDir,
    writeDoor,
  });
  const handoff = createHandoffService({
    handoffDir: paths.handoffDir,
    writeDoor,
  });
  const restore = createRestoreService({
    jailRoot: paths.hyperflowDir,
    writeDoor,
  });

  api.route("/", createMemoryRoutes({ memory }));
  api.route("/", createConfigRoutes({ config }));
  api.route("/", createMarkersRoutes({ markers }));
  api.route("/", createHandoffRoutes({ handoff }));
  api.route("/", createRestoreRoutes({ restore }));

  app.route("/api/v1", api);

  app.notFound((c) => {
    const path = new URL(c.req.url).pathname;
    if (path.startsWith("/api/")) {
      const body: ErrorEnvelope = notFoundEnvelope();
      return c.json(body, ERROR_HTTP_STATUS[ERROR_CODES.NOT_FOUND] as 404);
    }
    // History fallback handled below for static; if no static, 404 JSON for API-like
    return c.json(notFoundEnvelope(), 404);
  });

  // dist/server → ../client is the Vite SPA output (package ships dist/client).
  const clientDist =
    options.clientDist ??
    resolve(join(import.meta.dirname, "../client"));

  if (existsSync(clientDist)) {
    app.use(
      "/*",
      serveStatic({
        root: clientDist,
        rewriteRequestPath: (p) => (p === "/" ? "/index.html" : p),
      }),
    );
    // History fallback for SPA routes
    app.get("*", async (c) => {
      const path = new URL(c.req.url).pathname;
      if (path.startsWith("/api/")) {
        return c.json(notFoundEnvelope(), 404);
      }
      const index = join(clientDist, "index.html");
      if (!existsSync(index)) {
        return c.json(notFoundEnvelope(), 404);
      }
      const html = readFileSync(index, "utf8");
      return c.html(html);
    });
  }

  const listener = getRequestListener(app.fetch);
  const server: Server = createServer(listener);

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(options.port, HOST, () => resolveListen());
  });

  return {
    port: options.port,
    host: HOST,
    token: options.token,
    rootDir: paths.rootDir,
    hyperflowDir: paths.hyperflowDir,
    hub,
    snapshot,
    events,
    writeDoor,
    url: () => `http://${HOST}:${options.port}/`,
    async close() {
      events.dispose();
      hub.dispose();
      await watcher.stop();
      await new Promise<void>((res, rej) => {
        server.close((err) => (err ? rej(err) : res()));
      });
    },
  };
}

/** Re-export for write-route mounting helpers. */
export { Hono };
export type { Server };

/** Test helper: probe path is a file (static). */
export function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
