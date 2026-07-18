/* Hyperflow viewer — pure graph logic (no DOM), shared by graph.js and unit
   tests. UMD: attaches to window.HF.graphCore in the browser, exports via
   module.exports under node so tests/graph-core.test.js can require it. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.HF = root.HF || {}; root.HF.graphCore = api; }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const NODE_W = 208, NODE_H = 78, GAP_X = 92, GAP_Y = 26, PAD = 20;

  // mermaid flowchart -> {dir, nodes, edges}
  function parseFlow(src) {
    const lines = src.split("\n").map((l) => l.trim()).filter(Boolean);
    let dir = "LR";
    const nodes = new Map(), edges = [];
    const nodeRe = /^([A-Za-z0-9_]+)(?:\[\((.+?)\)\]|\{(.+?)\}|\[(.+?)\])?$/;
    for (const line of lines) {
      const head = line.match(/^flowchart\s+(LR|TB|TD|RL|BT)/i);
      if (head) { dir = head[1].toUpperCase().replace("TD", "TB"); continue; }
      if (!line.includes("-->")) continue;
      const segs = line.split("-->").map((s) => s.trim());
      let prev = null;
      for (let seg of segs) {
        // A leading |label| belongs to the edge INTO this node (mermaid: A -->|lbl| B).
        const lbl = seg.match(/^\|(.+?)\|\s*(.*)$/);
        let edgeLabel = "";
        if (lbl) { edgeLabel = lbl[1]; seg = lbl[2].trim(); }
        const m = seg.match(nodeRe);
        if (!m) { prev = null; continue; }
        const id = m[1], shape = m[2] ? "store" : m[3] ? "decision" : "step";
        const label = m[2] || m[3] || m[4] || id;
        if (!nodes.has(id)) nodes.set(id, { id, label, shape });
        if (prev) edges.push({ from: prev, to: id, label: edgeLabel });
        prev = id;
      }
    }
    return { dir, nodes: [...nodes.values()], edges };
  }

  // longest-path layering
  function assignLayers(nodes, edges) {
    const layer = new Map(nodes.map((n) => [n.id, 0]));
    const adj = edges.map((e) => [e.from, e.to]);
    for (let i = 0; i < nodes.length; i++) {
      let changed = false;
      for (const [u, v] of adj) {
        if (layer.get(v) < layer.get(u) + 1) { layer.set(v, layer.get(u) + 1); changed = true; }
      }
      if (!changed) break;
    }
    return layer;
  }

  // Barycenter crossing-minimization: reorder each layer's nodes (in place) by
  // the average position of their predecessors, a couple of down-sweeps. Cuts
  // edge crossings on graphs with more than a handful of nodes.
  function orderLayers(byLayer, edges) {
    const layers = [...byLayer.keys()].sort((a, b) => a - b);
    const posInLayer = new Map();
    const reindex = () => byLayer.forEach((g) => g.forEach((n, i) => posInLayer.set(n.id, i)));
    reindex();
    for (let sweep = 0; sweep < 2; sweep++) {
      for (const L of layers) {
        if (L === layers[0]) continue;
        const group = byLayer.get(L);
        const bary = new Map();
        group.forEach((n, i) => {
          const preds = edges.filter((e) => e.to === n.id).map((e) => posInLayer.get(e.from)).filter((v) => v != null);
          bary.set(n.id, preds.length ? preds.reduce((a, b) => a + b, 0) / preds.length : i);
        });
        group.sort((a, b) => bary.get(a.id) - bary.get(b.id));
        reindex();
      }
    }
  }

  function layout(model) {
    const horizontal = model.dir !== "TB" && model.dir !== "BT";
    const layer = assignLayers(model.nodes, model.edges);
    const byLayer = new Map();
    model.nodes.forEach((n) => {
      const L = layer.get(n.id);
      (byLayer.get(L) || byLayer.set(L, []).get(L)).push(n);
    });
    const maxRows = Math.max(...[...byLayer.values()].map((a) => a.length));
    orderLayers(byLayer, model.edges);
    const pos = new Map();
    for (const [L, group] of byLayer) {
      const span = group.length;
      group.forEach((n, i) => {
        const cross = (i - (span - 1) / 2) + (maxRows - 1) / 2;
        if (horizontal) pos.set(n.id, { x: PAD + L * (NODE_W + GAP_X), y: PAD + cross * (NODE_H + GAP_Y) });
        else pos.set(n.id, { x: PAD + cross * (NODE_W + GAP_X), y: PAD + L * (NODE_H + GAP_Y) });
      });
    }
    const layers = byLayer.size;
    const w = horizontal ? PAD * 2 + layers * NODE_W + (layers - 1) * GAP_X : PAD * 2 + maxRows * NODE_W + (maxRows - 1) * GAP_X;
    const h = horizontal ? PAD * 2 + maxRows * NODE_H + (maxRows - 1) * GAP_Y : PAD * 2 + layers * NODE_H + (layers - 1) * GAP_Y;
    return { pos, w, h, horizontal };
  }

  function edgePath(a, b, horizontal) {
    let x1, y1, x2, y2;
    if (horizontal) {
      x1 = a.x + NODE_W; y1 = a.y + NODE_H / 2; x2 = b.x; y2 = b.y + NODE_H / 2;
      const dx = Math.max(40, (x2 - x1) / 2);
      return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
    }
    x1 = a.x + NODE_W / 2; y1 = a.y + NODE_H; x2 = b.x + NODE_W / 2; y2 = b.y;
    const dy = Math.max(30, (y2 - y1) / 2);
    return `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`;
  }

  // batches -> graph model (task nodes + dependency edges)
  function fromBatches(batches) {
    const nodes = [], edges = [];
    batches.forEach((b) => (b.tasks || []).forEach((t) => nodes.push({
      id: t.id, tag: t.id, label: t.task,
      sub: [t.role, t.complexity].filter(Boolean).join(" · "),
      chip: t.specialist, shape: "step", status: t.status,
      brief: t.briefBody, acceptance: t.acceptance,
    })));
    const has = new Set(nodes.map((n) => n.id));
    batches.forEach((b, bi) => {
      const cur = b.tasks || [];
      if (!cur.length) return;
      // Prefer the batch's declared dependsOn (task ids); else chain from the
      // previous batch's first task so the flow is still legible.
      const deps = (b.dependsOn && b.dependsOn.length)
        ? b.dependsOn.filter((d) => has.has(d))
        : (bi > 0 && (batches[bi - 1].tasks || [])[0] ? [batches[bi - 1].tasks[0].id] : []);
      deps.forEach((from) => edges.push({ from, to: cur[0].id, label: bi > 0 ? b.name : "" }));
    });
    return { dir: batches.length > 3 ? "LR" : "TB", nodes, edges };
  }

  return { NODE_W, NODE_H, GAP_X, GAP_Y, PAD, parseFlow, assignLayers, layout, edgePath, fromBatches };
});
