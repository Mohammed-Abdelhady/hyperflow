/**
 * Cross-platform best-effort browser open. Never throws.
 */
import { spawn } from "node:child_process";
import { platform } from "node:os";

export type OpenResult =
  | { ok: true }
  | { ok: false; reason: string };

export type OpenBrowserOptions = {
  url: string;
  /** Override platform detection (tests). */
  platformName?: NodeJS.Platform | undefined;
  /** Inject spawn (tests). */
  spawnImpl?: typeof spawn | undefined;
};

/**
 * Open `http://127.0.0.1:<port>/#token=<token>` in the default browser.
 * Failure is non-fatal.
 */
export function openBrowser(options: OpenBrowserOptions): Promise<OpenResult> {
  const plat = options.platformName ?? platform();
  const spawnFn = options.spawnImpl ?? spawn;

  let command: string;
  let args: string[];

  if (plat === "darwin") {
    command = "open";
    args = [options.url];
  } else if (plat === "win32") {
    command = "cmd";
    args = ["/c", "start", "", options.url];
  } else {
    command = "xdg-open";
    args = [options.url];
  }

  return new Promise((resolve) => {
    try {
      const child = spawnFn(command, args, {
        detached: true,
        stdio: "ignore",
      });
      child.once("error", (err) => {
        resolve({ ok: false, reason: err.message });
      });
      child.unref();
      // Resolve success after a short tick if no immediate error.
      setTimeout(() => resolve({ ok: true }), 50);
    } catch (err) {
      resolve({
        ok: false,
        reason: err instanceof Error ? err.message : "spawn-failed",
      });
    }
  });
}

/** Fragment URL — token never as query param in printed cold-start URL. */
export function formatDashboardUrl(port: number, token: string): string {
  return `http://127.0.0.1:${port}/#token=${token}`;
}
