/* Hyperflow viewer — router + render registry + gallery.
   Fetches artefact JSON over localhost and renders via the HF components.
   Data-driven: a new type needs one render[type] entry + one sample. */
(function () {
  "use strict";
  const HF = window.HF, el = HF.el;
  const TYPES = ["spec", "task", "feature", "dispatch", "audit", "memory", "review", "usage"];
  const app = document.getElementById("app");

  async function getJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }


  const POLL_MS = 2500;
  let poller = null;
  function stopPoll() { if (poller) { clearInterval(poller); poller = null; } }
  function isTerminal(env) { return !!(env && env.payload && env.payload.totals && env.payload.totals.terminal); }

  // Live dispatch: re-fetch the JSON and re-render only when it changed; stop at
  // terminal. This is what makes the "Live progress" label + pulse animation true.
  function startDispatchPoll(slug, lastText) {
    stopPoll();  // clear any orphan interval before installing a new one
    poller = setInterval(async () => {
      if (location.hash.slice(1) !== `dispatch/${slug}`) { stopPoll(); return; }  // navigated away
      try {
        const env = await getJSON(`/artefacts/dispatch/${slug}.json`);
        const text = JSON.stringify(env);
        if (text !== lastText) {
          lastText = text; renderEnv(env, false);
          const all = (env.payload.batches || []).flatMap((b) => b.tasks || []);
          announce(`${all.filter((t) => t.status === "completed").length} of ${all.length} tasks complete`);
        }
        if (isTerminal(env)) stopPoll();
      } catch (_e) { stopPoll(); }
    }, POLL_MS);
  }

  function announce(msg) { const live = document.getElementById("hf-live"); if (live) live.textContent = msg; }

  function mount(nodes, focus = true) {
    app.replaceChildren();
    for (const n of nodes) if (n) app.append(n);
    HF.armReveals(app);
    HF.armSpotlight(app);
    if (focus) {
      // Move focus to the artefact heading on a route change so keyboard/SR
      // users land on the new content (not during live-poll re-renders).
      const h = app.querySelector("h1, h2");
      if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: false }); }
    }
  }

  function renderEnv(env, focus = true) {
    const fn = HF.renderers[env.type];
    if (!fn) return mount([HF.emptyState("Unsupported artefact type", `No renderer for "${env.type}".`)], focus);
    mount(fn(env), focus);
    setSource(`${env.type}/${env.slug}`);
    if (focus) announce(`Loaded ${env.type}: ${env.title || env.slug}`);
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

  // Home: the project's REAL artefacts (from /artefacts/index.json), searchable.
  // Falls back to the sample gallery when there are none (e.g. a static export).
  async function showHome() {
    markNav("home");
    let idx;
    try { idx = await getJSON("/artefacts/index.json"); } catch (_e) { return showGallery(); }
    const items = (idx && idx.artefacts) || [];
    if (!items.length) return showGallery();
    const list = el("div", { class: "home-list" });
    const draw = (q) => list.replaceChildren(...items
      .filter((a) => !q || `${a.title} ${a.slug} ${a.type} ${a.status}`.toLowerCase().includes(q))
      .map((a) => el("a", { class: "home-card", href: `#${a.type}/${a.slug}` },
        el("span", { class: "badge", style: `--accent:var(--type-${a.type})` }, a.type),
        el("span", { class: "home-title" }, a.title || a.slug),
        el("span", { class: "home-meta" }, `${a.status || ""} · ${a.updated || ""}`))));
    const input = el("input", { class: "home-search", type: "search", placeholder: "Filter artefacts…", "aria-label": "Filter artefacts" });
    input.addEventListener("input", () => draw(input.value.trim().toLowerCase()));
    draw("");
    mount([
      el("section", { class: "gallery-hero" }, el("h1", null, "Artefacts"),
        el("p", null, "Every artefact in this project, newest conventions first. Filter, then open one — or browse the template gallery.")),
      el("section", { class: "panel" }, input, list),
      el("p", { class: "dag-meta", style: "text-align:center;margin-top:16px" },
        el("a", { href: "#gallery", style: "color:var(--fg-dim)" }, "browse the template gallery ›")),
    ]);
    setSource(`${items.length} artefacts`);
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
      const body = (HF.renderers[type](env)).filter(Boolean);
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
    if (!hash || hash === "home") return showHome();      // real artefacts (falls back to gallery)
    if (hash === "gallery") return showGallery();          // template gallery (samples)
    const [a, b] = hash.split("/");
    if (a === "sample" && b) { markNav(b); return showSample(b); }
    if (TYPES.includes(a) && b) { markNav(a); return showArtefact(a, b); }
    return showHome();
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
