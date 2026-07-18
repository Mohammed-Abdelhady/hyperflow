/* Hyperflow viewer — self-contained layered graph engine.
   Parses mermaid flowcharts and renders REAL node/edge graphs (HTML nodes on a
   dotted canvas + SVG bezier connectors), grounded in the node-graph language of
   tools like n8n / Clay / LangGraph. No external library. Smooth compositor-only
   motion (edge stroke-draw + staggered node reveal); reduced-motion aware.
   Extends window.HF.graph. */
(function () {
  "use strict";
  const HF = window.HF, el = HF.el;
  const NS = "http://www.w3.org/2000/svg";
  const NODE_W = 208, NODE_H = 78, GAP_X = 92, GAP_Y = 26, PAD = 20;

  // ---- mermaid flowchart parse -> {dir, nodes, edges} --------------------
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

  // ---- longest-path layering --------------------------------------------
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

  function layout(model) {
    const horizontal = model.dir !== "TB" && model.dir !== "BT";
    const layer = assignLayers(model.nodes, model.edges);
    const byLayer = new Map();
    model.nodes.forEach((n) => {
      const L = layer.get(n.id);
      (byLayer.get(L) || byLayer.set(L, []).get(L)).push(n);
    });
    const maxRows = Math.max(...[...byLayer.values()].map((a) => a.length));
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

  // ---- render ------------------------------------------------------------
  function render(model, opts = {}) {
    if (!model.nodes || !model.nodes.length) return HF.emptyState("Nothing to diagram", "This artefact has no graph nodes yet.");
    const { pos, w, h, horizontal } = layout(model);
    const canvas = el("div", { class: "hf-canvas", role: "group", "aria-label": opts.ariaLabel || "dependency graph" });
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";

    // Edge/dependency structure for screen readers (SVG edges are decorative).
    const inbound = {}, outbound = {};
    model.edges.forEach((e) => { (outbound[e.from] = outbound[e.from] || []).push(e.to); (inbound[e.to] = inbound[e.to] || []).push(e.from); });

    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "hf-edges");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", w); svg.setAttribute("height", h);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const defs = document.createElementNS(NS, "defs");
    const marker = document.createElementNS(NS, "marker");
    for (const [k, v] of Object.entries({ id: "hf-arrow", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" })) marker.setAttribute(k, v);
    const head = document.createElementNS(NS, "path");
    head.setAttribute("d", "M0,0 L10,5 L0,10 z");
    head.setAttribute("fill", "currentColor");
    marker.append(head); defs.append(marker);
    svg.append(defs);
    canvas.append(svg);

    const edgeEls = [];
    model.edges.forEach((e, i) => {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (!a || !b) return;
      const path = document.createElementNS(NS, "path");
      path.setAttribute("class", "hf-edge");
      path.setAttribute("d", edgePath(a, b, horizontal));
      path.setAttribute("marker-end", "url(#hf-arrow)");
      path.dataset.from = e.from; path.dataset.to = e.to;
      svg.append(path);
      edgeEls.push(path);
      if (e.label) {
        const mid = { x: (a.x + NODE_W + b.x) / 2, y: (a.y + b.y) / 2 + NODE_H / 2 };
        const t = el("span", { class: "hf-edge-label" }, e.label);
        t.style.left = mid.x + "px"; t.style.top = mid.y + "px";
        canvas.append(t);
      }
    });

    const nodeEls = new Map();
    model.nodes.forEach((n, i) => {
      const p = pos.get(n.id);
      // Build children via el() (which filters falsy) — native append would
      // stringify undefined/false into literal "undefined" text nodes.
      const deps = [
        inbound[n.id] ? `depends on ${inbound[n.id].join(", ")}` : "",
        outbound[n.id] ? `leads to ${outbound[n.id].join(", ")}` : "",
      ].filter(Boolean).join("; ");
      const interactive = !!opts.onNode;
      const ariaLabel = [n.label, n.sub, deps, interactive ? "Activate to open its brief" : ""].filter(Boolean).join(". ");
      const node = el("div",
        { class: `hf-node shape-${n.shape || "step"}`, "data-id": n.id, tabindex: "0", role: interactive ? "button" : "group", "aria-label": ariaLabel, title: n.sub ? `${n.label} — ${n.sub}` : n.label },
        el("span", { class: "hf-node-head" },
          n.status && el("span", { class: `hf-node-dot st-${n.status}` }),
          n.tag && el("span", { class: "hf-node-tag" }, n.tag),
          el("span", { class: "hf-node-title" }, n.label)),
        n.sub && el("span", { class: "hf-node-sub" }, n.sub),
        n.chip && el("span", { class: "hf-node-chip" }, n.chip));
      if (n.accent) node.style.setProperty("--accent", n.accent);
      node.style.left = p.x + "px"; node.style.top = p.y + "px";
      node.style.setProperty("--i", i);
      if (opts.onNode) {
        node.addEventListener("click", () => opts.onNode(n));
        node.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); opts.onNode(n); }
        });
      }
      canvas.append(node);
      nodeEls.set(n.id, node);
    });

    wireHover(nodeEls, edgeEls, model.edges);
    // draw + reveal on mount (rAF fires after layout/paint)
    requestAnimationFrame(() => animate(canvas, edgeEls, nodeEls, horizontal));
    return el("div", { class: "hf-canvas-wrap" }, canvas);
  }

  // Recompute an edge path from the MEASURED node rects (offset geometry),
  // so a node that grew past NODE_H still gets its edge attached at the real edge.
  function measuredPath(fromEl, toEl, horizontal) {
    const a = { l: fromEl.offsetLeft, t: fromEl.offsetTop, w: fromEl.offsetWidth, h: fromEl.offsetHeight };
    const b = { l: toEl.offsetLeft, t: toEl.offsetTop, w: toEl.offsetWidth, h: toEl.offsetHeight };
    if (horizontal) {
      const x1 = a.l + a.w, y1 = a.t + a.h / 2, x2 = b.l, y2 = b.t + b.h / 2, dx = Math.max(40, (x2 - x1) / 2);
      return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
    }
    const x1 = a.l + a.w / 2, y1 = a.t + a.h, x2 = b.l + b.w / 2, y2 = b.t, dy = Math.max(30, (y2 - y1) / 2);
    return `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`;
  }

  function wireHover(nodeEls, edgeEls, edges) {
    const neighbors = (id) => {
      const set = new Set([id]);
      edges.forEach((e) => { if (e.from === id) set.add(e.to); if (e.to === id) set.add(e.from); });
      return set;
    };
    nodeEls.forEach((node, id) => {
      const enter = () => {
        const near = neighbors(id);
        nodeEls.forEach((nd, nid) => nd.classList.toggle("dim", !near.has(nid)));
        edgeEls.forEach((ed) => {
          const on = ed.dataset.from === id || ed.dataset.to === id;
          ed.classList.toggle("hot", on); ed.classList.toggle("dim", !on);
        });
      };
      const leave = () => {
        nodeEls.forEach((nd) => nd.classList.remove("dim"));
        edgeEls.forEach((ed) => ed.classList.remove("hot", "dim"));
      };
      node.addEventListener("mouseenter", enter);
      node.addEventListener("mouseleave", leave);
      node.addEventListener("focus", enter);
      node.addEventListener("blur", leave);
    });
  }

  function animate(canvas, edgeEls, nodeEls, horizontal) {
    edgeEls.forEach((path) => {
      const fromEl = nodeEls.get(path.dataset.from), toEl = nodeEls.get(path.dataset.to);
      if (fromEl && toEl) path.setAttribute("d", measuredPath(fromEl, toEl, horizontal));
      const len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      // force style flush, then release to 0 to draw
      void path.getBoundingClientRect();
      path.classList.add("drawn");
      path.style.strokeDashoffset = "0";
    });
    canvas.classList.add("live");
  }

  // Build a graph model from batches (task nodes + dependency edges).
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

  HF.graph = { parseFlow, render, fromBatches };
})();
