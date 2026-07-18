/* Hyperflow viewer — router + render registry + gallery.
   Fetches artefact JSON over localhost and renders via the HF components.
   Data-driven: a new type needs one render[type] entry + one sample. */
(function () {
  "use strict";
  const HF = window.HF, el = HF.el;
  const TYPES = ["spec", "task", "feature", "dispatch", "audit", "memory", "review"];
  const app = document.getElementById("app");

  async function getJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }

  function diagram(m) {
    if (!m || !m.mermaid) return null;
    try {
      const model = HF.graph.parseFlow(m.mermaid);
      if (model.nodes.length) return HF.graph.render(model);
    } catch (_e) { /* fall through to source */ }
    return el("pre", { class: "mermaid-src", "aria-label": "diagram source" }, m.mermaid);
  }

  const render = {
    spec(env) {
      const p = env.payload || {};
      return [
        HF.statusHead(env),
        p.tldr && HF.section("TL;DR", el("p", { class: "tldr" }, p.tldr)),
        p.components && p.components.length && HF.section("Components",
          el("div", { class: "grid" }, ...p.components.map((c) => el("div", { class: "card" }, el("h4", null, c.name), el("p", null, c.role))))),
        p.architecture && HF.section("1 · Architecture", el("p", null, p.architecture.summary || ""), diagram(p.architecture)),
        p.dataFlow && HF.section("2 · Data flow", el("p", null, p.dataFlow.summary || ""), diagram(p.dataFlow)),
        p.decisions && p.decisions.length && HF.section("3 · Key decisions (click to flip)", HF.decisionCards(p.decisions)),
        p.edgeCases && p.edgeCases.length && HF.section("4 · Edge cases",
          el("ul", null, ...p.edgeCases.map((e) => el("li", { style: "margin:6px 0;color:var(--fg-dim)" }, e)))),
        p.fileStructure && p.fileStructure.length && HF.section("5 · File structure",
          HF.table([{ label: "Path" }, { label: "Change" }, { label: "Note" }],
            p.fileStructure.map((f) => [{ node: el("code", null, f.path) }, f.change, f.note]))),
      ];
    },
    task(env) {
      const p = env.payload || {};
      const all = (p.batches || []).flatMap((b) => b.tasks || []);
      return [
        HF.statusHead(env),
        HF.section("Goal", el("p", { class: "tldr" }, p.goal || ""), HF.progressRing(0, all.length)),
        p.scope && p.scope.length && HF.section("Scope at a glance", HF.scopeTable(p.scope)),
        p.batches && p.batches.length && HF.section("Execution graph", HF.graph.render(HF.graph.fromBatches(p.batches))),
        p.verification && p.verification.length && HF.section("Verification",
          el("ul", null, ...p.verification.map((v) => el("li", { style: "margin:6px 0;color:var(--fg-dim)" }, v)))),
        p.commits && p.commits.length && HF.section("Commit plan",
          el("ol", null, ...p.commits.map((c) => el("li", { style: "margin:6px 0" }, el("code", null, c))))),
      ];
    },
    feature(env) {
      const p = env.payload || {};
      const phases = p.phases || [];
      const done = phases.filter((ph) => ph.status === "completed").length;
      const nodes = phases.map((ph) => ({
        id: `p${ph.n}`, tag: `P${ph.n}`, label: ph.name, sub: ph.goal, status: ph.status || "pending",
      }));
      const edges = [];
      phases.forEach((ph) => {
        const deps = String(ph.dependsOn || "").match(/phase-(\d+)/g) || [];
        deps.forEach((d) => edges.push({ from: `p${d.match(/\d+/)[0]}`, to: `p${ph.n}` }));
      });
      return [
        HF.statusHead(env),
        HF.section("Goal", el("p", { class: "tldr" }, p.goal || ""), HF.progressRing(done, phases.length)),
        HF.section("Phase graph", HF.graph.render({ dir: "LR", nodes, edges })),
      ];
    },
    dispatch(env) {
      const p = env.payload || {};
      const all = (p.batches || []).flatMap((b) => b.tasks || []);
      const done = all.filter((t) => t.status === "completed").length;
      const t = p.totals || {};
      return [
        HF.statusHead(env),
        HF.section("Live progress", HF.progressRing(done, all.length),
          el("p", { class: "dag-meta", style: "margin-top:12px" }, `${t.agents || 0} agents · ${t.tokens || 0} tokens · ${t.elapsed || ""}`)),
        ...(p.batches || []).map((b) => HF.section(b.name || "Batch",
          HF.table([{ label: "Task" }, { label: "Status" }, { label: "Tokens", num: true }, { label: "Wall-clock" }],
            (b.tasks || []).map((tk) => [
              { node: el("span", { class: "tid", style: "font-family:var(--mono)" }, tk.id) },
              { node: el("span", null, el("span", { class: `dot st-${tk.status || "pending"}` }), tk.status || "") },
              { text: tk.tokens || 0, num: true }, tk.wallclock || ""])))),
      ];
    },
    audit(env) {
      const p = env.payload || {};
      const c = p.counts || {};
      const head = HF.statusHead({ ...env, status: p.verdict });
      return [head,
        HF.section("Verdict", el("p", null, el("strong", null, p.verdict || ""), "  ", el("span", { class: "dag-meta" }, p.scope || "")),
          el("p", { class: "dag-meta" }, `${p.level || ""} · ${c.critical || 0} critical · ${c.important || 0} important · ${c.suggestion || 0} suggestion · ${c.praise || 0} praise`)),
        HF.section("Findings", ...(p.findings && p.findings.length ? HF.findings(p.findings) : [HF.emptyState("No findings")])),
      ];
    },
    memory(env) {
      const p = env.payload || {};
      return [HF.statusHead(env), HF.section("Decisions", HF.memoryGallery(p.entries || []))];
    },
    review(env) {
      const p = env.payload || {};
      return [HF.statusHead({ ...env, status: p.verdict }),
        HF.section("Findings", ...(p.findings && p.findings.length ? HF.findings(p.findings) : [HF.emptyState("Clean")]))];
    },
  };

  const POLL_MS = 2500;
  let poller = null;
  function stopPoll() { if (poller) { clearInterval(poller); poller = null; } }
  function isTerminal(env) { return !!(env && env.payload && env.payload.totals && env.payload.totals.terminal); }

  // Live dispatch: re-fetch the JSON and re-render only when it changed; stop at
  // terminal. This is what makes the "Live progress" label + pulse animation true.
  function startDispatchPoll(slug, lastText) {
    poller = setInterval(async () => {
      try {
        const env = await getJSON(`/artefacts/dispatch/${slug}.json`);
        const text = JSON.stringify(env);
        if (text !== lastText) { lastText = text; renderEnv(env); }
        if (isTerminal(env)) stopPoll();
      } catch (_e) { stopPoll(); }
    }, POLL_MS);
  }

  function mount(nodes) {
    app.replaceChildren();
    for (const n of nodes) if (n) app.append(n);
    HF.armReveals(app);
    HF.armSpotlight(app);
  }

  function renderEnv(env) {
    const fn = render[env.type];
    if (!fn) return mount([HF.emptyState("Unsupported artefact type", `No renderer for "${env.type}".`)]);
    mount(fn(env));
    setSource(`${env.type}/${env.slug}`);
  }

  async function showArtefact(type, slug) {
    try {
      mount([el("div", { class: "loading" }, "Loading…")]);
      const env = await getJSON(`/artefacts/${type}/${slug}.json`);
      renderEnv(env);
      if (type === "dispatch" && !isTerminal(env)) startDispatchPoll(slug, JSON.stringify(env));
    } catch (_e) {
      mount([HF.emptyState("No visual artefact here",
        `No JSON at .hyperflow/artefacts/${type}/${slug}.json. Enable viewer mode and re-run the chain to generate one.`)]);
    }
  }

  async function showSample(type) {
    try { renderEnv(await getJSON(`./samples/${type}.json`)); }
    catch (_e) { mount([HF.emptyState("Sample missing", `viewer/samples/${type}.json not found.`)]); }
  }

  async function showGallery() {
    mount([el("div", { class: "loading" }, "Loading gallery…")]);
    const hero = el("section", { class: "gallery-hero" },
      el("h1", null, "Artefact gallery"),
      el("p", null, "Every Hyperflow artefact template, rendered from a compact JSON payload the agent emits — no verbose markdown, nothing sent off your machine. This page doubles as the living documentation: scroll to see each template."));
    const sections = [hero];
    for (const type of TYPES) {
      let env = null;
      try { env = await getJSON(`./samples/${type}.json`); } catch (_e) { /* skip missing */ }
      if (!env) continue;
      const body = (render[type](env)).filter(Boolean);
      sections.push(el("section", { class: "gallery-section", id: `g-${type}` },
        el("h2", { class: "section-title" }, el("span", { class: "badge", style: `--accent:var(--type-${type})` }, type),
          el("a", { href: `#sample/${type}`, style: "font-size:.72rem;color:var(--fg-dim);text-decoration:none" }, "open ›")),
        ...body));
    }
    mount(sections);
    setSource("gallery · samples");
    markNav("gallery");
  }

  function setSource(txt) { const f = document.getElementById("footer-src"); if (f) f.textContent = txt; }
  function markNav(active) {
    document.querySelectorAll("#type-nav a").forEach((a) =>
      a.setAttribute("aria-current", a.dataset.type === active ? "true" : "false"));
  }

  function route() {
    stopPoll();  // leaving any view halts a live dispatch poll
    const hash = location.hash.replace(/^#/, "");
    if (!hash || hash === "gallery") return showGallery();
    const [a, b] = hash.split("/");
    if (a === "sample" && b) { markNav(b); return showSample(b); }
    if (TYPES.includes(a) && b) { markNav(a); return showArtefact(a, b); }
    return showGallery();
  }

  function buildNav() {
    const nav = document.getElementById("type-nav");
    for (const type of TYPES) {
      const a = el("a", { href: `#sample/${type}` }, type);
      a.dataset.type = type;
      nav.append(a);
    }
  }

  function initTheme() {
    const saved = localStorage.getItem("hf-theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    else if (window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches)
      document.documentElement.setAttribute("data-theme", "light");
    document.getElementById("theme-toggle").addEventListener("click", () => {
      const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("hf-theme", next);
    });
  }

  buildNav();
  initTheme();
  window.addEventListener("hashchange", route);
  route();
})();
