import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONTRACT = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/core-contract.json"), "utf8"));
const read = (path) => readFileSync(join(ROOT, path), "utf8");

function publicSkillNames() {
  return readdirSync(join(ROOT, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, "skills", entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}

test("exactly four approved public skills are discoverable", () => {
  assert.deepEqual(publicSkillNames(), [...CONTRACT.skills].sort());
  for (const name of CONTRACT.skills) {
    const source = read(`skills/${name}/SKILL.md`);
    assert.match(source, new RegExp(`^name: ${name}$`, "m"));
    assert.match(source, /^description: .+$/m);
    assert.match(source, /^node <plugin-root>\/runtime\/cli\.mjs/m);
  }
});

test("every CLI operation is represented as an operational smash subcommand or public route", () => {
  const smash = read("skills/hyperflow-smash/SKILL.md");
  const publicSources = CONTRACT.skills.map((name) => read(`skills/${name}/SKILL.md`)).join("\n");
  for (const command of CONTRACT.runtimeCommands) {
    assert.ok(publicSources.includes(command), `missing documented runtime operation: ${command}`);
  }
  for (const operation of ["status", "graph", "stop", "resume", "sessions", "rename", "messages"]) {
    assert.ok(smash.includes(operation), `${operation} must remain a smash subcommand`);
  }
});

test("model roles and planning contract preserve actual user participation", () => {
  const plan = read("skills/hyperflow-plan/SKILL.md");
  const agents = read("skills/hyperflow-agents-skill/SKILL.md");
  for (const role of CONTRACT.roles) assert.ok(agents.includes(role));
  assert.match(plan, /questions[\s\S]*answers[\s\S]*workflow/i);
  assert.match(plan, /grill-me|decision.frontier/i);
});

test("risk and quality references stay lazy and evidence based", () => {
  const docs = read("skills/hyperflow-crash/SKILL.md");
  assert.match(docs, /references\//);
  assert.match(docs, /accessibility/i);
  assert.match(docs, /performance/i);
  assert.match(docs, /SEO/i);
  assert.match(docs, /GEO/i);
  assert.match(docs, /mobile/i);
  assert.match(docs, /browser/i);
  assert.match(docs, /evidence/i);
});

test("modern web guidance is lazy, progressively enhanced, and provenance scoped", () => {
  const plan = read("skills/hyperflow-plan/SKILL.md");
  const smash = read("skills/hyperflow-smash/references/modern-web.md");
  const notes = read("skills/hyperflow-crash/references/chrome-channel-notes.md");
  assert.match(plan, /modern-web\.md/);
  assert.match(smash, /scheduler\.yield\(\)/);
  assert.match(smash, /@starting-style/);
  assert.match(smash, /Temporal/);
  assert.match(smash, /DOM fallback/);
  assert.match(smash, /server/);
  assert.match(smash, /untrusted/);
  assert.match(notes, /24 Chrome for Developers uploads/);
  assert.match(notes, /caption text was unavailable/);
  assert.match(notes, /_3V3cQf_1r4/);
  assert.match(notes, /WccuSkL7KOQ/);
});
