# Doctrine Extensions — Layers 0, 0.5, 4, 5, 6, 7, 8

Long-form details for the doctrine layers that DOCTRINE.md summarises. Skills that need only the headline of a layer read DOCTRINE.md and stop; skills that need the full flow / fields / rules follow the pointer here.

DOCTRINE.md keeps the always-loaded core (Layer 1 Autonomy, Layer 2 Roles, Layer 3 Orchestrator Pattern, Layer 9 Security). Splitting saves the cost of re-reading the longer extension layers when only the core is needed.

Semantic host operations (`spawn`, `wait`, `structured_question`, `skill_continuation`, `edit`, `shell`, `web_research`, …) are defined in [runtime-contract.md](runtime-contract.md). Universal prose uses those names; product-tool strings appear only as scoped adapter examples.

---

## Layer 0: Project Analysis

On session start, the orchestrator decides whether analysis is needed. See [project-analysis.md](project-analysis.md) for file specs and staleness mapping.

### Session start flow

1. **Version check** — compare the installed Hyperflow version (from `VERSION` next to `SKILL.md`) against the latest published tag when the host can reach the public registry. If newer exists, print an update notice using the **install-mode updater** for this session (candidates from `config/providers.json` / provider refs — e.g. Claude marketplace: `claude plugin update hyperflow@hyperflow-marketplace`; Codex marketplace / source checkout: the matching upgrade path). Never invent an update command for an unknown install mode.
2. **Print version** — print:
   ```
   Hyperflow v<version>
   ```
3. **Smart analysis decision** — the orchestrator evaluates before dispatching anything:

   ```
   .hyperflow/ exists at project root?
       │
       NO → FULL ANALYSIS
       │    spawn 6 parallel searcher workers (profile, architecture,
       │    conventions, dependencies, testing, git-workflow)
       │    Generate all analysis files + .checksums
       │    Add .hyperflow/ to .gitignore if missing
       │
       YES → Read .hyperflow/.checksums
             │
             Compute current SHA256 of tracked config files (see project-analysis.md)
             │
             Compare each checksum
             │
             ├─ ALL FRESH → SKIP ANALYSIS
             │  Print "Analysis cache fresh — skipping"
             │  Load cached files directly (no agents dispatched)
             │
             ├─ SOME STALE → PARTIAL REFRESH
             │  Use staleness mapping (project-analysis.md) to identify affected files
             │  spawn searcher workers ONLY for stale analysis files
             │  Print "Refreshing — <comma-separated list of stale files>"
             │  Update .checksums with new hashes
             │
             └─ .checksums MISSING or CORRUPT → FULL ANALYSIS (same as NO path)
   ```

   When `spawn` is unavailable, run each searcher role as a **labelled inline worker** phase (still parallel in spirit only if the host serialises — never claim concurrent subagents). Collect via `wait` when present; otherwise same-turn completion. Searcher workers do **not** review their own analysis; the orchestrator owns acceptance of cache writes.

   **CRITICAL RULES:**
   - Do NOT spawn searcher workers if all checksums are fresh. Read cached `.hyperflow/` files directly.
   - Do NOT regenerate analysis files that aren't affected by the stale config. Use the staleness mapping.
   - The orchestrator makes this decision — never delegate staleness evaluation to a worker.
   - New config files appearing (not in `.checksums`) trigger refresh of their mapped analysis files only.
   - Config files being deleted (in `.checksums` but missing on disk) trigger refresh of their mapped analysis files.

4. **Incomplete tasks** — check `.hyperflow/tasks/` for files from previous sessions. If found, present summary and fire `structured_question` (continue vs start fresh). When structured input is unavailable: emit the exact Hyperflow Question chat block, persist a safe checkpoint if needed, and **end the turn** — never silent-default resume or discard.

### Worker injection

Inject relevant analysis into worker prompts under `## Project Context`:
- **Implementers** get conventions + architecture + relevant dependencies
- **Test writers** get testing + conventions
- **Searchers** get architecture
- **Reviewers** get everything

---

## Layer 0.5: Task Triage

Triage is the first step on every new-work request. A deterministic preflight resolves only high-confidence inline-fast work; everything else uses the focused Classifier call. Both paths emit `{ types[], complexity, risk, scope, ambiguity, flow, personas[] }` JSON that drives downstream decisions.

| Field | What it controls |
|-------|-----------------|
| `types[]` | Which personas are stitched (maps to personas-A/B priority order) |
| `flow` | Which flow profile Layer 3 executes (`fast`/`standard`/`deep`/`research`/`creative`/`scientific`) |
| `personas[]` | Ordered list injected into worker prompts |
| `ambiguity` | Brainstorm depth in Layer 4 (`0.0–0.2` → none, `0.2–0.5` → light, `0.5–0.8` → standard, `0.8–1.0` → deep). Questions fire only when an answer changes implementation. |
| `budget` | Hard token ceiling passed to the flow profile and budget guard |

See [task-triage.md](task-triage.md) for the full prompt template, JSON schema, field definitions, and worked examples.

**Classifier:** Triage is structured classification, not deep reasoning. It is skipped only when deterministic preflight returns `inline_fast`. Fallback chain on malformed JSON output: retry once → use safe defaults. Run the Classifier as a decision-agent consultation via `spawn` when available, otherwise a labelled inline decision phase — still on the **current session model**, never a separate model tier.

**Hard rule:** triage output is the contract for all downstream layers. If no triage was performed, the orchestrator is operating wrong.

---

## Layer 4: Adaptive Brainstorming

Every task receives grounded analysis, but questions are adaptive. Clear reversible work uses `none`; material ambiguity scales through light, standard, and deep. Structural gates remain unchanged.

| Ambiguity (0.0–1.0) | Depth | Behavior |
|---------------------|-------|----------|
| 0.0–0.2 | `none` | Silent grounded recap; no invented clarification |
| 0.2–0.5 | `light` | 0–2 questions whose answers change implementation |
| 0.5–0.8 | `standard` | **3 questions** + propose 2–3 alternatives with trade-offs |
| 0.8–1.0 | `deep` | **4–5 questions** + full 6-dimension analysis + section-by-section design approval |

**Question rule:** never ask what inspection already answered. `structured_question` is required only for unresolved material choices and the existing structural gates. When the structured UI is unavailable: Hyperflow Question chat block + **end turn** (see [runtime-contract.md](runtime-contract.md) / [chain-router.md](chain-router.md)). Never skip; never silently pick the recommended option.

Some types force a minimum depth: `creative` → `deep`; `architect`/`security`/`scientific` → `standard`. See [adaptive-brainstorming.md](adaptive-brainstorming.md) for depth overrides.

`structured_question` is mandatory when a resolved depth contains material unknowns. Banned: "Should I proceed?" Allowed: clarification of what to build, which approach, and scope boundaries.

See [adaptive-brainstorming.md](adaptive-brainstorming.md) for the full depth modes, question framework, and section-approval protocol.

**Hard rules:**
- Section-by-section approval required in `deep` mode
- Never propose only one alternative in `standard` or `deep`
- No code before design approval in `deep` mode

---

## Layer 5: Quality Gates

Automated checks after every worker review. See [quality-gates.md](quality-gates.md) for full details (light / standard / full tiers).

**Per-batch (always light):** lint + typecheck + tests on **affected files only** via `shell`. Full-project lint/test mid-batch on multi-batch work is a doctrine violation.

**Chain-end (dispatch Step 3.5):** when tier is `standard` or `full` (large / multi-batch / deep / scientific / `--thorough`), run **full** lint + typecheck + full test suite (+ build if present) **once** before Evidence. Light tier skips chain-end.

**Deploy:** independent full pre-push suite — never trust-skips because dispatch already passed.

Gate fails → worker fixes → re-run. Max 3 retries before escalating to a standalone review worker (`spawn` reviewer, or labelled inline reviewer when spawn is absent — still a separate role from the fixing worker).

---

## Layer 6: Project-Scoped Memory

Persist reusable learnings in `.hyperflow/memory/` so future sessions in the same project benefit from past discoveries. See [memory-system.md](memory-system.md) for full protocols.

**Storage:** `.hyperflow/memory/` at project root — multiple files by category (learnings, decisions, pitfalls, patterns, conventions) plus an index. Project-scoped by design — entries never leak across projects.

**Write:** After each batch, orchestrator extracts reusable patterns/gotchas/decisions, tags them, deduplicates against existing entries, and appends to the appropriate file. Apply the test: "Would a worker on this project benefit from knowing this in 2 weeks?"

**Read:** At session start the hook runs `scripts/memory-index.py`, which derives `.hyperflow/memory/index.md` + `.checksums` from the category files and injects the index, the hot entries (≤7 days), and `anti-patterns.md` into context. The orchestrator then queries warm entries (8–30 days) by the current task's inferred tags. Cold entries (30+ days) are compressed and archived. Worker prompts receive ONLY the subset matching their task's tags.

**The index is derived, never hand-written.** No chain step appends index rows — writers append to the category file and the next session start indexes it.

**Prune:** Entries contradicted by newer ones marked `[SUPERSEDED]` and removed after 7 days. Entries referencing deleted files are removed immediately. Entries unreferenced for 90 days are archived to `.hyperflow/memory/archive/YYYY-MM.md`.

Controls: `hyperflow: memory off` / `hyperflow: memory show <tag>` / `hyperflow: memory clear`

---

## Layer 7: Task Templates

Pre-built decomposition patterns. See [task-templates.md](task-templates.md) for all templates.

The orchestrator auto-selects: CRUD Feature, API Endpoint, UI Component, Database Migration, Refactor, Bug Fix. Templates are adapted to context — not rigid steps.

---

## Layer 8: Git Workflow

Automated branching and commits. See [git-workflow.md](git-workflow.md) for full details.

**Auto-commit:** On by default. Commits after each approved task with descriptive message.
**Branching:** Auto-creates feature branch if on main/master.
**No push:** Never pushes automatically — waits for user.
**Disable auto-commit:** "hyperflow: auto-commit off"
