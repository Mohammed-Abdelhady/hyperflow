/* Hyperflow viewer — per-type render registry (HF.renderers). Split from
   app.js to stay under the source-size cap. Pure view builders over the
   HF component library + graph engine. */
(function () {
  "use strict";
  const HF = window.HF, el = HF.el;

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
      // Brief panel: clicking a task node reveals its brief (Phase-2 T3 seam).
      const briefPanel = el("div", { class: "brief-panel", tabindex: "-1", hidden: true });
      const onNode = (n) => {
        if (!n.brief && !(n.acceptance && n.acceptance.length)) {
          briefPanel.replaceChildren(el("p", { class: "dag-meta" }, `${n.tag || n.id}: no brief (trivial sub-task)`));
        } else {
          briefPanel.replaceChildren(
            el("h4", null, `${n.tag || n.id} — ${n.label}`),
            n.brief && el("pre", { class: "mermaid-src" }, n.brief),
            n.acceptance && n.acceptance.length && el("ul", null, ...n.acceptance.map((a) => el("li", null, a))));
        }
        briefPanel.hidden = false;
        briefPanel.focus();
      };
      return [
        HF.statusHead(env),
        HF.section("Goal", el("p", { class: "tldr" }, p.goal || ""), HF.progressRing(0, all.length)),
        p.scope && p.scope.length && HF.section("Scope at a glance", HF.scopeTable(p.scope)),
        p.batches && p.batches.length && HF.section("Execution graph",
          el("p", { class: "dag-meta", style: "margin:0 0 8px" }, "Click a task to see its brief."),
          HF.graph.render(HF.graph.fromBatches(p.batches), { onNode, ariaLabel: "execution dependency graph" }),
          briefPanel),
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
    // Telemetry / ROI dashboard — stat tiles + sparkline over the usage rollup.
    usage(env) {
      const p = env.payload || {}, t = p.totals || {}, r = p.ratios || {};
      const fmt = (n) => (n || 0).toLocaleString();
      const pct = (n) => Math.round((n || 0) * 100) + "%";
      const tiles = el("div", { class: "stat-grid" },
        HF.statTile("Tokens", fmt(t.tokens), `${t.agents || 0} agents`),
        HF.statTile("Tokens / commit", fmt(t.tokensPerCommit), "lower is leaner"),
        HF.statTile("Accepted commits", t.acceptedCommits || 0, "shipped"),
        ("cacheHit" in r) && HF.statTile("Cache hit", pct(r.cacheHit), "context reused", { tone: r.cacheHit >= 0.25 ? "good" : "warn" }),
        ("duplicateContext" in r) && HF.statTile("Duplicate context", pct(r.duplicateContext), "wasted", { tone: r.duplicateContext > 0.2 ? "warn" : "good" }),
        ("retryCost" in r) && HF.statTile("Retry cost", fmt(r.retryCost), "tokens on retries"));
      const out = [HF.statusHead(env), HF.section("ROI at a glance", tiles)];
      if (p.chains && p.chains.length) {
        out.push(HF.section("Tokens per chain",
          HF.sparkline(p.chains.map((c) => c.tokens || 0)),
          el("p", { class: "dag-meta", style: "margin-top:8px" }, p.chains.map((c) => `${c.id}: ${fmt(c.tokens)}`).join("  ·  "))));
      }
      if (p.phases && p.phases.length) {
        out.push(HF.section("By phase", HF.table(
          [{ label: "Phase" }, { label: "Agents", num: true }, { label: "Tokens", num: true }],
          p.phases.map((ph) => [ph.name, { text: ph.agents || 0, num: true }, { text: fmt(ph.tokens), num: true }]))));
      }
      return out;
    },
  };

  HF.renderers = render;
})();
