/**
 * Recursive file watcher: native fs.watch with runtime probe + chokidar fallback.
 * Emits raw path events into settle → integrity; never assigns SSE ids.
 */
import { watch as fsWatch, type FSWatcher, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, relative, sep, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { createSettler, type SettleClock, type SettledChangeset } from "./settle.js";
import {
  createIntegrityChecker,
  type IntegrityChecker,
  type IntegrityEntry,
  type IntegrityClock,
  type IntegrityFs,
} from "./integrity.js";

export type WatchEngineKind = "native" | "chokidar";

export type RawWatchEvent = {
  path: string;
  kind: "rename" | "change" | "unknown";
};

export type WatcherRoots = {
  /** Project `.hyperflow/` tree. */
  hyperflowDir: string;
  /** Sibling `.hyperflow-handoff/` tree. */
  handoffDir: string;
  /** Absolute path of `~/.hyperflow/config.json`. */
  globalConfigPath: string;
};

export type WatcherOptions = {
  roots: WatcherRoots;
  onChangeset: (entries: IntegrityEntry[]) => void;
  /** Force engine (tests). */
  forceEngine?: WatchEngineKind;
  /** Inject settle clock. */
  settleClock?: SettleClock;
  integrityClock?: IntegrityClock;
  integrityFs?: IntegrityFs;
  debounceMs?: number;
  coalesceMs?: number;
  /** Inject chokidar factory for tests. */
  chokidarWatch?: typeof import("chokidar").watch;
};

export type FileWatcher = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  engine: () => WatchEngineKind | null;
  /** Test helper: inject a raw path event as if the engine fired. */
  injectRaw: (absPath: string) => void;
};

function toPosixRel(from: string, abs: string): string {
  return relative(from, abs).split(sep).join("/");
}

/**
 * Probe whether fs.watch({recursive:true}) actually delivers nested events.
 * Creates a scratch dir, watches it, writes a nested file, waits briefly.
 */
export async function probeNativeRecursive(
  timeoutMs = 400,
): Promise<boolean> {
  const scratch = join(
    tmpdir(),
    `hf-watch-probe-${randomBytes(6).toString("hex")}`,
  );
  mkdirSync(join(scratch, "nested"), { recursive: true });
  let saw = false;
  let watcher: FSWatcher | null = null;
  try {
    watcher = fsWatch(scratch, { recursive: true }, () => {
      saw = true;
    });
    // Allow watch registration
    await new Promise((r) => setTimeout(r, 30));
    writeFileSync(join(scratch, "nested", "probe.txt"), "x");
    const start = Date.now();
    while (!saw && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 20));
    }
    return saw;
  } catch {
    return false;
  } finally {
    try {
      watcher?.close();
    } catch {
      /* ignore */
    }
    try {
      rmSync(scratch, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export function createFileWatcher(options: WatcherOptions): FileWatcher {
  const { roots } = options;
  let engine: WatchEngineKind | null = null;
  let nativeWatchers: FSWatcher[] = [];
  // chokidar instance is loosely typed to avoid tight coupling
  let chokidarInst: { close: () => Promise<void> } | null = null;
  let stopped = true;

  const settle = createSettler({
    debounceMs: options.debounceMs,
    coalesceMs: options.coalesceMs,
    clock: options.settleClock,
    onSettled: (cs: SettledChangeset) => {
      void handleSettled(cs);
    },
  });

  const integrity: IntegrityChecker = createIntegrityChecker({
    clock: options.integrityClock,
    fs: options.integrityFs,
  });

  async function handleSettled(cs: SettledChangeset): Promise<void> {
    const result = await integrity.check(cs.paths);
    if (result.defer.length > 0) {
      for (const p of result.defer) settle.note(p);
    }
    if (result.emit.length > 0) {
      options.onChangeset(result.emit);
    }
  }

  function noteAbs(absPath: string): void {
    if (!absPath || absPath.length === 0) return;
    settle.note(absPath);
  }

  function attachNative(dir: string, recursive: boolean): FSWatcher {
    const w = fsWatch(dir, { recursive }, (eventType, filename) => {
      if (stopped) return;
      const name =
        typeof filename === "string"
          ? filename
          : filename != null
            ? String(filename)
            : "";
      const abs = name.length > 0 ? join(dir, name) : dir;
      noteAbs(abs);
      void eventType;
    });
    w.on("error", () => {
      // One-way swap to chokidar on runtime failure.
      void swapToChokidar();
    });
    return w;
  }

  async function startNative(): Promise<void> {
    nativeWatchers = [];
    nativeWatchers.push(attachNative(roots.hyperflowDir, true));
    nativeWatchers.push(attachNative(roots.handoffDir, true));
    // Config: watch parent dir (editors replace via rename).
    const configDir = dirname(roots.globalConfigPath);
    nativeWatchers.push(attachNative(configDir, false));
    engine = "native";
  }

  async function startChokidar(): Promise<void> {
    const watchFn =
      options.chokidarWatch ?? (await import("chokidar")).watch;
    const configDir = dirname(roots.globalConfigPath);
    const inst = watchFn(
      [roots.hyperflowDir, roots.handoffDir, configDir],
      {
        ignoreInitial: true,
        persistent: true,
        awaitWriteFinish: false,
      },
    );
    const onAny = (abs: string): void => {
      if (stopped) return;
      noteAbs(abs);
    };
    inst.on("add", onAny);
    inst.on("change", onAny);
    inst.on("unlink", onAny);
    chokidarInst = inst;
    engine = "chokidar";
  }

  async function swapToChokidar(): Promise<void> {
    if (engine === "chokidar" || stopped) return;
    for (const w of nativeWatchers) {
      try {
        w.close();
      } catch {
        /* ignore */
      }
    }
    nativeWatchers = [];
    await startChokidar();
  }

  return {
    async start() {
      stopped = false;
      if (options.forceEngine === "chokidar") {
        await startChokidar();
        return;
      }
      if (options.forceEngine === "native") {
        await startNative();
        return;
      }
      const ok = await probeNativeRecursive();
      if (ok) await startNative();
      else await startChokidar();
    },
    async stop() {
      stopped = true;
      settle.dispose();
      for (const w of nativeWatchers) {
        try {
          w.close();
        } catch {
          /* ignore */
        }
      }
      nativeWatchers = [];
      if (chokidarInst) {
        try {
          await chokidarInst.close();
        } catch {
          /* ignore */
        }
        chokidarInst = null;
      }
      engine = null;
    },
    engine: () => engine,
    injectRaw: (absPath: string) => noteAbs(absPath),
  };
}

/** Re-export path helper for tests. */
export { toPosixRel };
