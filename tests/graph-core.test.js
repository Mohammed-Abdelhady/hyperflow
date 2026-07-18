/* Unit tests for viewer/graph-core.js — the pure parse/layout logic behind the
   graph renderer (highest-regression JS, previously browser-verified only).
   Run: node --test tests/  (or npm run test:js). No browser, no dependencies.
   ESM (package.json "type":"module"); graph-core's UMD sets globalThis.HF.graphCore. */
import { test } from "node:test";
import assert from "node:assert/strict";
import "../viewer/graph-core.js";
const core = globalThis.HF.graphCore;

test("parseFlow: nodes, edges, direction", () => {
  const m = core.parseFlow("flowchart LR\n A[Start] --> B[End]");
  assert.equal(m.dir, "LR");
  assert.deepEqual(m.nodes.map((n) => n.id), ["A", "B"]);
  assert.equal(m.edges.length, 1);
  assert.deepEqual(m.edges[0], { from: "A", to: "B", label: "" });
});

test("parseFlow: TD normalizes to TB", () => {
  assert.equal(core.parseFlow("flowchart TD\n A-->B").dir, "TB");
});

test("parseFlow: edge label attaches to the correct edge (regression)", () => {
  // P -->|payload| W --> J  — 'payload' belongs to P->W, not W->J
  const m = core.parseFlow("flowchart LR\n P[p] -->|payload| W[w] --> J[(j)]");
  const pw = m.edges.find((e) => e.from === "P" && e.to === "W");
  const wj = m.edges.find((e) => e.from === "W" && e.to === "J");
  assert.equal(pw.label, "payload");
  assert.equal(wj.label, "");
});

test("parseFlow: shapes (store / decision / step)", () => {
  const m = core.parseFlow("flowchart LR\n A[(store)] --> B{decide} --> C[step] --> D");
  const byId = Object.fromEntries(m.nodes.map((n) => [n.id, n.shape]));
  assert.equal(byId.A, "store");
  assert.equal(byId.B, "decision");
  assert.equal(byId.C, "step");
  assert.equal(byId.D, "step");  // bare id defaults to step, label = id
  assert.equal(m.nodes.find((n) => n.id === "D").label, "D");
});

test("assignLayers: longest-path diamond", () => {
  const nodes = ["A", "B", "C", "D"].map((id) => ({ id }));
  const edges = [{ from: "A", to: "B" }, { from: "A", to: "C" }, { from: "B", to: "D" }, { from: "C", to: "D" }];
  const layer = core.assignLayers(nodes, edges);
  assert.equal(layer.get("A"), 0);
  assert.equal(layer.get("B"), 1);
  assert.equal(layer.get("D"), 2);  // longest path A->B->D wins over A->D shortcut absence
});

test("layout: positive canvas dimensions and positions for every node", () => {
  const model = core.parseFlow("flowchart LR\n A-->B-->C");
  const { pos, w, h } = core.layout(model);
  assert.ok(w > 0 && h > 0);
  assert.ok(pos.get("A") && pos.get("C"));
  assert.ok(pos.get("C").x > pos.get("A").x);  // later layer is further right (LR)
});

test("layout: barycenter ordering reduces crossings", () => {
  // A (left) -> D, B (right) -> C. Barycenter should reorder layer 1 to [D, C]
  // so the edges don't cross (D lands left, under A).
  const model = { dir: "TB", nodes: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }], edges: [{ from: "A", to: "D" }, { from: "B", to: "C" }] };
  const { pos } = core.layout(model);
  assert.ok(pos.get("D").x < pos.get("C").x, "D should sit left of C after barycenter ordering");
});

test("edgePath: returns an SVG path", () => {
  const d = core.edgePath({ x: 0, y: 0 }, { x: 300, y: 0 }, true);
  assert.match(d, /^M[\d.]+,[\d.]+ C/);
});

test("fromBatches: dependsOn drives edges; falls back to prev-batch chaining", () => {
  const model = core.fromBatches([
    { name: "B1", tasks: [{ id: "T1", task: "a" }, { id: "T2", task: "b" }] },
    { name: "B2", dependsOn: ["T1"], tasks: [{ id: "T3", task: "c" }] },
  ]);
  assert.equal(model.nodes.length, 3);
  assert.deepEqual(model.edges.map((e) => `${e.from}->${e.to}`), ["T1->T3"]);
  assert.equal(model.dir, "TB");  // <=3 batches
});

test("fromBatches: >3 batches lays out left-to-right", () => {
  const b = (id) => ({ name: id, tasks: [{ id, task: id }] });
  assert.equal(core.fromBatches([b("A"), b("B"), b("C"), b("D")]).dir, "LR");
});
