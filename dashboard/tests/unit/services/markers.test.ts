import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWriteDoor } from "../../../src/server/services/write.js";
import { createMarkersService } from "../../../src/server/services/markers.js";

describe("markers service", () => {
  let root: string;
  let jail: string;
  let configPath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "hf-mark-"));
    jail = join(root, ".hyperflow");
    configPath = join(root, "home", ".hyperflow", "config.json");
    mkdirSync(jail, { recursive: true });
    mkdirSync(join(root, "home", ".hyperflow"), { recursive: true });
    writeFileSync(configPath, "{}");
    writeFileSync(join(jail, ".mode"), "build\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function svc() {
    const door = createWriteDoor({
      jailRoot: jail,
      globalConfigPath: configPath,
      homeDir: join(root, "home"),
    });
    return createMarkersService({ hyperflowDir: jail, writeDoor: door });
  }

  it("reads mode and default sticky when sticky absent", () => {
    const m = svc().read();
    expect(m.mode).toBe("build");
    expect(m.sticky).toBe(false);
  });

  it("toggle mode twice restores original", async () => {
    const markers = svc();
    await markers.toggle({ mode: "review" });
    expect(markers.read().mode).toBe("review");
    await markers.toggle({ mode: "build" });
    expect(markers.read().mode).toBe("build");
  });

  it("toggle sticky on and off", async () => {
    const markers = svc();
    await markers.toggle({ sticky: true });
    expect(markers.read().sticky).toBe(true);
    await markers.toggle({ sticky: false });
    expect(markers.read().sticky).toBe(false);
  });
});
