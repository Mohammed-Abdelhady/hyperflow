#!/usr/bin/env node
/**
 * hyperflow-dashboard CLI entry — version gate, discover, port, token, boot.
 */
import {
  HYPERFLOW_TOKEN_HEADER,
  InstanceResponseSchema,
} from "@shared/schemas/api.js";
import { discoverProjectRoot } from "./discovery.js";
import { selectPort, DEFAULT_PORT } from "./port.js";
import { resolveToken } from "./token.js";
import { formatDashboardUrl, openBrowser } from "./open.js";

export const MIN_NODE_MAJOR = 20;

export type CliFlags = {
  port?: number | undefined;
  root?: string | undefined;
  token?: string | undefined;
  openBrowser: boolean;
};

export type CliRunOptions = {
  argv?: string[] | undefined;
  cwd?: string | undefined;
  nodeVersion?: string | undefined;
  /** Inject server factory (tests). */
  startServer?: ((opts: {
    rootDir: string;
    port: number;
    token: string;
    openBrowser: boolean;
  }) => Promise<{ close: () => Promise<void>; port: number }>) | undefined;
  /** Inject fetch for second-instance probe. */
  fetchImpl?: typeof fetch | undefined;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  /** Skip browser open even if flag allows (tests). */
  openImpl?: typeof openBrowser | undefined;
};

export function checkNodeVersion(version: string): {
  ok: boolean;
  message?: string;
} {
  const major = Number.parseInt(version.split(".")[0] ?? "0", 10);
  if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) {
    return {
      ok: false,
      message: `Node.js ${MIN_NODE_MAJOR}+ required (detected ${version}). Upgrade Node and retry.`,
    };
  }
  return { ok: true };
}

export function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { openBrowser: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--no-open") flags.openBrowser = false;
    else if (a === "--port" && argv[i + 1]) {
      flags.port = Number(argv[++i]);
    } else if (a?.startsWith("--port=")) {
      flags.port = Number(a.slice("--port=".length));
    } else if (a === "--root" && argv[i + 1]) {
      flags.root = argv[++i];
    } else if (a?.startsWith("--root=")) {
      flags.root = a.slice("--root=".length);
    } else if (a === "--token" && argv[i + 1]) {
      flags.token = argv[++i];
    } else if (a?.startsWith("--token=")) {
      flags.token = a.slice("--token=".length);
    }
  }
  return flags;
}

async function probeInstance(
  port: number,
  token: string,
  projectRoot: string,
  fetchImpl: typeof fetch,
): Promise<{ match: boolean; url?: string }> {
  try {
    const res = await fetchImpl(`http://127.0.0.1:${port}/api/v1/instance`, {
      headers: {
        Host: `127.0.0.1:${port}`,
        [HYPERFLOW_TOKEN_HEADER]: token,
      },
    });
    if (!res.ok) return { match: false };
    const json: unknown = await res.json();
    const parsed = InstanceResponseSchema.safeParse(json);
    if (!parsed.success || !parsed.data.ok) return { match: false };
    if (
      parsed.data.projectRoot !== undefined &&
      parsed.data.projectRoot !== projectRoot
    ) {
      return { match: false };
    }
    return {
      match: true,
      url: formatDashboardUrl(parsed.data.port ?? port, token),
    };
  } catch {
    return { match: false };
  }
}

/**
 * Main CLI runner. Version gate runs before any server import.
 */
export async function runCli(
  options: CliRunOptions = {},
): Promise<number> {
  const log = options.stdout ?? ((s: string) => console.log(s));
  const err = options.stderr ?? ((s: string) => console.error(s));
  const version = options.nodeVersion ?? process.versions.node;

  const gate = checkNodeVersion(version);
  if (!gate.ok) {
    err(gate.message ?? "unsupported Node");
    return 1;
  }

  const argv = options.argv ?? process.argv.slice(2);
  const flags = parseFlags(argv);
  const cwd = options.cwd ?? process.cwd();
  const discovery = discoverProjectRoot(cwd, flags.root);
  const rootDir = discovery.found ? discovery.rootDir : discovery.cwd;
  const token = resolveToken(flags.token);
  const preferred = flags.port ?? DEFAULT_PORT;
  const fetchImpl = options.fetchImpl ?? fetch;

  // Second-instance probe on preferred port when an explicit token is provided
  // (reuse requires a token the running instance accepts).
  if (flags.token) {
    const probe = await probeInstance(preferred, token, rootDir, fetchImpl);
    if (probe.match && probe.url) {
      log(probe.url);
      if (flags.openBrowser) {
        const openFn = options.openImpl ?? openBrowser;
        await openFn({ url: probe.url });
      }
      return 0;
    }
  }

  const selected = await selectPort({ preferred });
  if (!selected.ok) {
    err(selected.message);
    return 1;
  }

  // Dynamic import AFTER version gate so old Node never parses server bundle.
  const start =
    options.startServer ??
    (async (opts) => {
      const mod = await import("../server/index.js");
      return mod.createDashboardServer(opts);
    });

  const server = await start({
    rootDir,
    port: selected.port,
    token,
    openBrowser: flags.openBrowser,
  });

  const url = formatDashboardUrl(server.port, token);
  // Print FIRST so no open-failure path can skip the URL (spec §4.1).
  log(url);

  if (flags.openBrowser) {
    const openFn = options.openImpl ?? openBrowser;
    const opened = await openFn({ url });
    if (!opened.ok) {
      err(`Browser open failed (${opened.reason}); open the URL above manually.`);
    }
  }

  // Keep process alive when running as bin; tests inject startServer and close.
  if (!options.startServer) {
    const shutdown = async () => {
      await server.close();
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  }

  return 0;
}

// Bin entry when executed directly.
const isMain =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("/cli/index.js") ||
    process.argv[1].endsWith("/cli/index.ts") ||
    process.argv[1].endsWith("hyperflow-dashboard"));

if (isMain) {
  void runCli().then((code) => {
    if (code !== 0) process.exit(code);
  });
}
