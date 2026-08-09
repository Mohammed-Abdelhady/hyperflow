import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

function run(script, args = []) {
  return execFileSync("node", [join(ROOT, "scripts", script), ...args], { cwd: ROOT, encoding: "utf8" });
}

test("maintainer gates are wired and pass in the current checkout", () => {
  assert.equal(packageJson.scripts["validate-plugin"], "node scripts/validate-plugin.mjs");
  assert.equal(packageJson.scripts.unittest, "node --test tests/*.test.js");
  assert.equal(packageJson.scripts.evals, "node scripts/run-evals.mjs");
  assert.match(run("validate-plugin.mjs"), /^PASS plugin-validation/m);
  assert.match(run("run-evals.mjs"), /\d+\/\d+ evals passed/);
});

test("eval harness supports listing and machine-readable output", () => {
  assert.match(run("run-evals.mjs", ["--list"]), /core-surface/);
  const output = JSON.parse(run("run-evals.mjs", ["--json"]));
  assert.equal(output.passed, output.total);
  assert.ok(output.total >= 3);
});
