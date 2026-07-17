/* Hyperflow viewer — shared component library. Pure (data) -> HTMLElement.
   No framework, no dependencies. Namespaced on window.HF. */
(function () {
  "use strict";

  /** Tiny hyperscript: el("div", {class:"x"}, child, "text"). */
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === "class") node.className = v;
        else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? "" : String(v));
      }
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  function section(title, ...children) {
    return el("section", { class: "panel reveal spotlight" },
      title && el("h3", { class: "section-title" }, title),
      ...children);
  }

  /** Artefact header: type badge, title, status pill, specialists, accent rule.
      Sets --accent on the returned node so descendants theme to the type color. */
  function statusHead(env) {
    const type = env.type || "spec";
    const wrap = el("div");
    wrap.style.setProperty("--accent", `var(--type-${type})`);
    const specs = (env.specialists || []).join(", ");
    wrap.append(
      el("div", { class: "art-head" },
        el("span", { class: "badge" }, type),
        el("span", { class: "status-pill" }, el("span", { class: `dot st-${env.status || "pending"}` }), env.status || ""),
      ),
      el("h1", { class: "art-title" }, env.title || env.slug || "Untitled"),
      specs && el("div", { class: "specialists" }, "Specialists: ", el("code", null, specs)),
      el("div", { class: "accent-rule" }),
    );
    return wrap;
  }

  function table(headers, rows) {
    const thead = el("thead", null, el("tr", null, ...headers.map((h) =>
      el("th", h.num ? { class: "num" } : null, h.label != null ? h.label : h))));
    const tbody = el("tbody", null, ...rows.map((r) =>
      el("tr", null, ...r.map((cell) =>
        cell && cell.node ? el("td", cell.cls ? { class: cell.cls } : null, cell.node)
          : el("td", (cell && cell.num) ? { class: "num" } : null, cell && cell.text != null ? cell.text : cell)))));
    return el("table", { class: "data" }, thead, tbody);
  }

  function scopeTable(scope) {
    const rows = scope.map((s) => [
      s.surface, { text: s.files, num: true }, { text: s.created, num: true },
      { text: s.modified, num: true },
      { node: el("span", { class: `risk-${s.risk || "low"}` }, s.risk || "low") },
    ]);
    return table([{ label: "Surface" }, { label: "Files", num: true }, { label: "Created", num: true },
      { label: "Modified", num: true }, { label: "Risk" }], rows);
  }

  /** SVG progress ring. done/total -> filled arc + centered percentage. */
  function progressRing(done, total) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    const r = 34, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "ring"); svg.setAttribute("width", "84"); svg.setAttribute("height", "84"); svg.setAttribute("viewBox", "0 0 84 84");
    const mk = (cls, extra) => {
      const ci = document.createElementNS(ns, "circle");
      ci.setAttribute("class", cls); ci.setAttribute("cx", "42"); ci.setAttribute("cy", "42"); ci.setAttribute("r", String(r));
      ci.setAttribute("fill", "none"); ci.setAttribute("stroke-width", "7");
      if (extra) { ci.setAttribute("stroke-dasharray", String(c)); ci.setAttribute("stroke-dashoffset", String(off)); }
      return ci;
    };
    svg.append(mk("track"), mk("fill", true));
    return el("div", { class: "ring-wrap" }, svg,
      el("div", null, el("div", { class: "ring-label" }, pct + "%"),
        el("div", { class: "dag-meta" }, `${done} / ${total} done`)));
  }

  const SEV = ["critical", "important", "suggestion", "praise"];
  function findings(list) {
    const out = [];
    for (const sev of SEV) {
      for (const f of list.filter((x) => x.severity === sev)) {
        const loc = f.file ? `${f.file}${f.line ? ":" + f.line : ""}` : (f.anchor || "");
        out.push(el("div", { class: `finding sev-${sev}` },
          el("div", null, el("span", { class: "sev", style: `color:var(--${sev === "critical" || sev === "important" ? (sev === "critical" ? "security" : "memory") : (sev === "praise" ? "worker" : "git")})` }, sev),
            loc && el("span", { class: "loc" }, "  " + loc)),
          f.issue && el("p", null, f.issue),
          f.fix && el("p", null, el("strong", null, "Fix: "), f.fix),
          f.why && el("p", null, el("strong", null, "Why: "), f.why)));
      }
    }
    return out;
  }

  function memoryGallery(entries) {
    return el("div", { class: "grid" }, ...entries.map((e) =>
      el("div", { class: "card" },
        el("h4", null, e.title),
        e.task && el("p", { class: "dag-meta", style: "margin:0 0 6px" }, "task: " + e.task),
        el("p", null, e.decision),
        (e.tags && e.tags.length) && el("p", { class: "tag", style: "margin-top:8px" }, "tags: " + e.tags.join(", ")))));
  }

  function emptyState(big, sub) {
    return el("div", { class: "empty" }, el("div", { class: "big" }, big), sub && el("div", null, sub));
  }

  window.HF = { el, section, statusHead, table, scopeTable, progressRing, findings, memoryGallery, emptyState };
})();
