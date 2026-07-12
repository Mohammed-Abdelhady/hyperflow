/**
 * Preferred-port probe with bounded free-port scan.
 */
import { createServer } from "node:net";

export const DEFAULT_PORT = 7432;
export const PORT_SCAN_BOUND = 30;

export type PortSelectResult =
  | { ok: true; port: number; occupied: number[] }
  | { ok: false; message: string; occupied: number[] };

export type PortSelectOptions = {
  preferred?: number | undefined;
  bound?: number | undefined;
  /** Host to bind when probing (default 127.0.0.1). */
  host?: string | undefined;
};

function tryListen(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

/**
 * Probe preferred port first, then scan next free ports within bound.
 */
export async function selectPort(
  options: PortSelectOptions = {},
): Promise<PortSelectResult> {
  const preferred = options.preferred ?? DEFAULT_PORT;
  const bound = options.bound ?? PORT_SCAN_BOUND;
  const host = options.host ?? "127.0.0.1";
  const occupied: number[] = [];

  for (let i = 0; i < bound; i += 1) {
    const port = preferred + i;
    const free = await tryListen(port, host);
    if (free) {
      return { ok: true, port, occupied };
    }
    occupied.push(port);
  }

  return {
    ok: false,
    message: `No free port in range ${preferred}–${preferred + bound - 1}`,
    occupied,
  };
}
