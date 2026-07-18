/* Hyperflow viewer — DOM graph renderer. Pure layout/parse logic lives in
   graph-core.js (shared with node tests); this file owns the HTML nodes, SVG
   bezier edges, smooth motion, and hover/keyboard interaction. Extends
   window.HF.graph. */
(function () {
  "use strict";
  const HF = window.HF, el = HF.el;
  const core = HF.graphCore;
  const NS = "http://www.w3.org/2000/svg";
  const { NODE_W, NODE_H } = core;

  function render(model, opts = {}) {
    if (!model.nodes || !model.nodes.length) return HF.emptyState("Nothing to diagram", "This artefact has no graph nodes yet.");
    const { pos, w, h, horizontal } = core.layout(model);
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
    const arrow = document.createElementNS(NS, "path");
    arrow.setAttribute("d", "M0,0 L10,5 L0,10 z");
    arrow.setAttribute("fill", "currentColor");
    marker.append(arrow); defs.append(marker);
    svg.append(defs);
    canvas.append(svg);

    const edgeEls = [];
    model.edges.forEach((e) => {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (!a || !b) return;
      const path = document.createElementNS(NS, "path");
      path.setAttribute("class", "hf-edge");
      path.setAttribute("d", core.edgePath(a, b, horizontal));
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
    requestAnimationFrame(() => animate(canvas, edgeEls, nodeEls, horizontal));
    return el("div", { class: "hf-canvas-wrap" }, canvas);
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

  // Recompute an edge path from the MEASURED node rects (offset geometry), so a
  // node that grew past NODE_H still gets its edge attached at the real edge.
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

  function animate(canvas, edgeEls, nodeEls, horizontal) {
    edgeEls.forEach((path) => {
      const fromEl = nodeEls.get(path.dataset.from), toEl = nodeEls.get(path.dataset.to);
      if (fromEl && toEl) path.setAttribute("d", measuredPath(fromEl, toEl, horizontal));
      const len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      void path.getBoundingClientRect();  // flush, then release to 0 to draw
      path.classList.add("drawn");
      path.style.strokeDashoffset = "0";
    });
    canvas.classList.add("live");
  }

  HF.graph = { parseFlow: core.parseFlow, render, fromBatches: core.fromBatches };
})();
