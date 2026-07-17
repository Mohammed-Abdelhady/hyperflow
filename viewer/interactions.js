/* Hyperflow viewer — interactions: flip decision cards, scroll-reveal,
   pointer spotlight. All compositor-only (transform/opacity), reduced-motion
   aware (the CSS media query neutralises transitions/observers degrade to
   instant reveal). Extends window.HF. */
(function () {
  "use strict";
  const HF = window.HF, el = HF.el;
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function flip(card) { card.classList.toggle("flipped"); }

  function decisionCards(decisions) {
    return el("div", { class: "grid flipwrap reveal-group" }, ...decisions.map((d) => {
      const card = el("div", { class: "flip reveal", tabindex: "0", role: "button",
        "aria-label": `Decision: ${d.decision || ""}. Activate to see the trade-off.` },
        el("div", { class: "flip-inner" },
          el("div", { class: "flip-face" },
            el("h4", null, d.decision || ""),
            el("p", null, d.rationale || ""),
            d.tradeoff && el("span", { class: "flip-hint" }, "flip for trade-off")),
          el("div", { class: "flip-face flip-back" },
            el("h4", null, "Trade-off"),
            el("p", null, d.tradeoff || "None recorded."),
            el("span", { class: "flip-hint" }, "back"))));
      card.addEventListener("click", () => flip(card));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(card); }
      });
      return card;
    }));
  }

  // Reveal .reveal elements as they enter the viewport (once).
  let observer = null;
  function ensureObserver() {
    if (observer || reduce || !("IntersectionObserver" in window)) return observer;
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add("in"); observer.unobserve(entry.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    return observer;
  }

  function armReveals(root) {
    const targets = root.querySelectorAll(".reveal");
    if (reduce || !("IntersectionObserver" in window)) {
      targets.forEach((t) => t.classList.add("in"));
      return;
    }
    const obs = ensureObserver();
    let i = 0;
    targets.forEach((t) => {
      t.style.setProperty("--reveal-i", (i++ % 8));
      obs.observe(t);
    });
  }

  // Pointer-tracked spotlight: sets --mx/--my on the card for a radial highlight.
  function armSpotlight(root) {
    if (reduce) return;
    root.querySelectorAll(".spotlight").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    });
  }

  HF.decisionCards = decisionCards;
  HF.armReveals = armReveals;
  HF.armSpotlight = armSpotlight;
})();
