import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  frontmatterBody,
  parseFrontmatter,
} from "../../../../src/server/parser/primitives/frontmatter.js";

const FIX = resolve(
  import.meta.dirname,
  "../../../fixtures/golden/status-block",
);

function load(name: string): string {
  return readFileSync(resolve(FIX, name), "utf8");
}

describe("parseFrontmatter", () => {
  it("extracts task-tracking scalars and preserves unknown keys", () => {
    const raw = load("frontmatter-task.md");
    const result = parseFrontmatter(raw);
    expect(result.present).toBe(true);
    if (!result.present) return;
    expect(result.fields["id"]).toBe("implement-user-auth");
    expect(result.fields["status"]).toBe("in-progress");
    expect(result.fields["complexity"]).toBe("medium");
    expect(result.fields["created"]).toBe("2026-05-15T14:30:00Z");
    expect(result.fields["updated"]).toBe("2026-05-15T15:00:00Z");
    expect(result.fields["extra"]).toBe("preserved");
    const body = frontmatterBody(raw, result);
    expect(body).toContain("# implement-user-auth");
    expect(body).toContain("## Objective");
    expect(body.startsWith("---")).toBe(false);
  });

  it("returns absent for unterminated fence without throwing", () => {
    expect(() =>
      parseFrontmatter(load("frontmatter-unterminated.md")),
    ).not.toThrow();
    const result = parseFrontmatter(load("frontmatter-unterminated.md"));
    expect(result.present).toBe(false);
    if (result.present) return;
    expect(result.reason).toBe("unterminated-fence");
  });

  it("returns absent when no fence", () => {
    const result = parseFrontmatter("# just a title\n");
    expect(result.present).toBe(false);
  });

  it("never throws on garbage", () => {
    for (const c of ["", "---\n", "\x00---\nfoo: bar\n---"]) {
      expect(() => parseFrontmatter(c)).not.toThrow();
    }
  });
});
