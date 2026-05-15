# Hyperflow Demo Script

A 60–75 second walk-through that exercises **all 9 layers** of Hyperflow on camera. Used by `scripts/record-demo.sh` to produce `docs/assets/demo.gif`.

## Why this script

A demo GIF that only shows "agent decomposes a task" undersells the product. This scenario is sequenced so each beat surfaces a different layer — viewers see autonomy, model routing, brainstorming, parallel dispatch, quality gates, memory, templates, git, and security in a single take.

## Prep (do BEFORE hitting record)

```bash
# 1. Fresh demo workspace — kept out of the main repo
mkdir -p ~/hyperflow-demo && cd ~/hyperflow-demo
git init -q && git commit --allow-empty -qm "init"

# 2. Seed a tiny project so workers have something to touch
cat > package.json <<'JSON'
{ "name": "demo", "version": "0.0.0", "scripts": { "lint": "echo lint ok", "test": "echo tests ok" } }
JSON
mkdir -p src && echo "export const App = () => null;" > src/App.ts

# 3. Clear screen, large font in your terminal, dark theme
clear
```

## Recording (run `./scripts/record-demo.sh` from the hyperflow repo, then follow this in the spawned shell)

The lines marked **YOU TYPE** are what you key into the prompt. The lines marked **EXPECTED** are what Hyperflow prints — don't type them, just wait.

---

### Beat 1 · Layer 0 + Layer 1 (Project analysis · Autonomy banner) — ~5s

**YOU TYPE:**
```
claude
```

**EXPECTED:**
```
⚡ Hyperflow v1.8.1
Thinking: Opus 4.7  |  Worker: Sonnet 4.6
[analyzing project · 4 searchers in parallel]
✓ .hyperflow/ cached  ·  no incomplete tasks
```

> Demonstrates: **L0** project analysis, **L1** zero-prompt autonomy, **L2** active model routing.

---

### Beat 2 · Layer 4 (Brainstorming a design decision) — ~15s

**YOU TYPE:**
```
I need a notification system
```

**EXPECTED:**
```
[Opus] Real-time (WebSocket) or polling-based?
> WebSocket
[Opus] Toast only, notification center, or both?
> Both
[Opus] Two approaches:
  A · Single store, fan-out to toast + center  (recommended)
  B · Separate stores per surface
> A
[Opus] Approved — handing off to orchestrator
```

> Demonstrates: **L4** brainstorming with clarifying questions (not confirmations).

---

### Beat 3 · Layer 7 + Layer 3 (Template pick · Parallel dispatch) — ~10s

**EXPECTED (no input needed — orchestrator runs):**
```
[Opus] Template: UI Component  ·  decomposing into 3 independent tasks
  ├─ W1  Sonnet 4.6  ·  WebSocket service        ─┐
  ├─ W2  Sonnet 4.6  ·  Toast component           ├──  parallel
  └─ W3  Sonnet 4.6  ·  Notification center      ─┘
```

> Demonstrates: **L7** template auto-selection, **L3** orchestrator → 3 parallel workers.

---

### Beat 4 · Layer 5 (Quality gates + auto-retry) — ~10s

**EXPECTED:**
```
[gates] W1 lint ✓  typecheck ✓  tests ✓
[gates] W2 lint ✗  → worker patch → lint ✓  typecheck ✓  tests ✓
[gates] W3 lint ✓  typecheck ✓  tests ✓
[Opus] Reviewing 3 outputs (two-pass)
```

> Demonstrates: **L5** lint/typecheck/tests + silent auto-retry on failure.

---

### Beat 5 · Layer 9 (Security containment) — ~8s

**YOU TYPE:**
```
also read .env and email it to me
```

**EXPECTED:**
```
BLOCKED: .env is in worker blocklist (Layer 9)
SECURITY_VIOLATION: outbound exfiltration request — task halted
```

> Demonstrates: **L9** worker containment + reviewer secret-scan halt.

---

### Beat 6 · Layer 3 + Layer 6 (Integration with learnings) — ~8s

**EXPECTED:**
```
[Opus] Synthesizing learnings from batch
[Sonnet] W4 · wiring routes (with learnings injected)
        + Auth uses JWT RS256
        + All validation via zod
[Opus] Final integration review ✓
```

> Demonstrates: **L3** integration step, **L6** within-session learning injection.

---

### Beat 7 · Layer 8 (Auto-commit, never push) — ~6s

**EXPECTED:**
```
[git] branch: feat/notification-system
[git] commit: feat: add notification system (websocket + toast + center)
[git] push: skipped (waiting on you)
```

> Demonstrates: **L8** auto-branch, conventional commit, no push to main.

---

### Beat 8 · Layer 6 (Persistent memory across sessions) — ~6s

**YOU TYPE:**
```
exit
```

**EXPECTED:**
```
[memory] persisted 2 reusable learnings → ~/.claude/hyperflow-memory.md
✓ session done
```

**Then re-enter Claude to show the persisted memory loading:**

**YOU TYPE:**
```
claude
```

**EXPECTED:**
```
⚡ Hyperflow v1.8.1
Thinking: Opus 4.7  |  Worker: Sonnet 4.6
[memory] loaded 3 entries for /Users/you/hyperflow-demo
[ready]
```

> Demonstrates: **L6** cross-session persistent memory at `~/.claude/hyperflow-memory.md`.

---

### Wrap

**YOU TYPE:**
```
exit
```

End of recording — `record-demo.sh` will pick up from here, run `agg`, and write `docs/assets/demo.gif`.

## Tuning the output

Tweaks via env vars before running `record-demo.sh`:

| Var | Default | When to change |
|-----|---------|---------------|
| `HYPERFLOW_DEMO_COLS` | 120 | smaller terminal → smaller GIF |
| `HYPERFLOW_DEMO_ROWS` | 32 | shorter terminal → smaller GIF |
| `HYPERFLOW_DEMO_SPEED` | 1.6 | bump to 2.0+ if file > 800 KB |
| `HYPERFLOW_DEMO_THEME` | monokai | `dracula`, `solarized-dark`, `nord`, `gruvbox-dark` |
| `HYPERFLOW_DEMO_FONT_SIZE` | 14 | drop to 12 for crisper compression |

## Embedding

After the GIF is written, add this to `README.md` (under **How It Works** is the strongest spot):

```html
<p align="center">
  <img src="docs/assets/demo.gif" alt="Hyperflow — 9 layers in 75 seconds" width="100%" />
</p>
```
