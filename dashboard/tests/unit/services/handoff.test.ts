import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWriteDoor } from "../../../src/server/services/write.js";
import { createHandoffService } from "../../../src/server/services/handoff.js";
import { IllegalTransitionError } from "../../../src/server/services/errors.js";

describe("handoff service", () => {
  let root: string;
  let jail: string;
  let handoff: string;
  let configPath: string;
  let pkg: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "hf-ho-"));
    jail = join(root, ".hyperflow");
    handoff = join(root, ".hyperflow-handoff");
    configPath = join(root, "home", ".hyperflow", "config.json");
    pkg = join(handoff, "demo");
    mkdirSync(jail, { recursive: true });
    mkdirSync(pkg, { recursive: true });
    mkdirSync(join(root, "home", ".hyperflow"), { recursive: true });
    writeFileSync(configPath, "{}");
    writeFileSync(join(pkg, "HANDOFF.md"), "# Handoff\n\n## Manifest\n\n");
    writeFileSync(join(pkg, "STATUS"), "planned\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function svc() {
    const door = createWriteDoor({
      jailRoot: jail,
      globalConfigPath: configPath,
      handoffRoot: handoff,
      homeDir: join(root, "home"),
      backupRoot: join(jail, ".bak"),
    });
    return {
      door,
      handoff: createHandoffService({ handoffDir: handoff, writeDoor: door }),
    };
  }

  it("legal transitions planned→built→reviewed", async () => {
    const { handoff: h } = svc();
    await h.transition({ slug: "demo", status: "built" });
    expect(readFileSync(join(pkg, "STATUS"), "utf8").trim()).toBe("built");
    await h.transition({ slug: "demo", status: "reviewed" });
    expect(readFileSync(join(pkg, "STATUS"), "utf8").trim()).toBe("reviewed");
  });

  it("illegal transition throws and creates no backup", async () => {
    const { handoff: h } = svc();
    await h.transition({ slug: "demo", status: "built" });
    const bakBefore = readdirSync(join(jail, ".bak"), { withFileTypes: true }).length;
    await expect(
      h.transition({ slug: "demo", status: "planned" }),
    ).rejects.toBeInstanceOf(IllegalTransitionError);
    expect(readFileSync(join(pkg, "STATUS"), "utf8").trim()).toBe("built");
    const bakAfter = readdirSync(join(jail, ".bak"), { withFileTypes: true }).length;
    expect(bakAfter).toBe(bakBefore);
  });

  it("skip planned→reviewed is illegal", async () => {
    const { handoff: h } = svc();
    await expect(
      h.transition({ slug: "demo", status: "reviewed" }),
    ).rejects.toMatchObject({
      details: { current: "planned", requested: "reviewed" },
    });
  });
});
