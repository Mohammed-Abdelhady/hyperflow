# Output Style Guide

Every Hyperflow output follows this visual language. Print text exactly as shown — same symbols, same alignment, same structure.

## Symbol Palette

| Symbol | Use |
|---|---|
| `⚡` | Banner, agent dispatch labels, cache status |
| `✓` | Success (gates passed, analysis cached, tasks complete) |
| `✗` | Failure (gates failed, blocked) |
| `▸` | Secondary info lines (links, hints, footnotes) |
| `•` | Bullet points in lists |
| `→` | Mapping / transition (skill listings, flow arrows) |
| `─` | Horizontal rules and box separators |
| `·` | Progress dots (running····· done) |
| `│├└` | Tree connectors in dispatch diagrams |

## 1. Session Banner

```
⚡ Hyperflow v1.11.1
  Thinking: Opus 4.7  |  Worker: Sonnet 4.6
```

Two lines. Version on first. Models indented on second. Always printed at session start.

## 2. Update Notification

```
⚡ Hyperflow update available: v1.11.1 → v1.12.0
  ▸ run: claude plugin update hyperflow@hyperflow-marketplace
```

Only when a newer version exists. `▸` prefix for the install hint.

## 3. Analysis Cache Status

### Fresh (skip)
```
✓ Analysis cache fresh — skipping
```

### Partial refresh
```
⚡ Refreshing: profile.md, dependencies.md
```

### Full analysis
```
⚡ Analyzing project · 6 searchers in parallel
✓ .hyperflow/ cached · no incomplete tasks
```

### Incomplete tasks found
```
⚡ Incomplete tasks from prior session:
  • implement-auth.md (3/5 sub-tasks done)
  • fix-login-bug.md (1/3 sub-tasks done)
```

## 4. Agent Dispatch Labels

Every agent dispatch gets a label BEFORE the Agent tool call. Format:

```
⚡ [Role] Short description of what this agent will do
```

### Parallel dispatch (2+ agents in same batch)

When dispatching multiple agents in parallel, show the parallel bracket:

```
⚡ [Searcher]      Analyze existing auth patterns       ─┐
⚡ [Implementer]   Write middleware + route guards       ├─ parallel
⚡ [Writer]        Generate test suite for auth          ─┘
```

Rules:
- Role is left-padded to 15 chars for alignment
- Description is left-padded to 40 chars
- `─┐` on first, `├─ parallel` on middle, `─┘` on last
- Single agent dispatch: just `⚡ [Role] Description` (no bracket)

## 5. Agent Progress

After dispatching, show a running indicator when waiting:

```
  running······  done
```

Not required — use only when the wait is notable (3+ agents, complex task).

## 6. Quality Gates

Single line, all gates on one row:

```
[gates]  lint ✓  typecheck ✓  tests ✓  build ✓
```

On failure:

```
[gates]  lint ✓  typecheck ✗  tests —  build —
  ▸ typecheck: 3 errors in src/auth/middleware.ts
```

`✗` for failed gate, `—` for skipped (downstream of failure). `▸` for error detail.

## 7. Usage Summary

Printed after every completed task. Exact format:

```
── Usage ─────────────────────────────────────────
Thinking  (Opus 4.7  )   3 agents    48.1k tokens
Worker    (Sonnet 4.6)   8 agents   186.0k tokens
Total                   11 agents   234.1k tokens
──────────────────────────────────────────────────
```

Rules:
- Top/bottom rules are `──` repeated to ~50 chars
- Model names in parens, padded to 10 chars
- Agent counts right-aligned in 3-char column
- Token counts right-aligned in 7-char column, formatted as `Xk` or `X.Xk`
- `Total` row is bold (in markdown: just the word, no special markup — monospace context handles it)
- Breakdown in parens after tokens is optional for detail: `(3 reviewers: 38.4k, 1 final: 13.7k)`

## 8. Section Headers

Lowercase bracketed labels for section context:

```
[layers]
[skills]
[detection]
[memory]
[gates]
[capabilities]
```

Use sparingly — only when outputting structured multi-line blocks (memory listings, gate results, skill listings).

## 9. Memory Output

```
[memory]  location: .hyperflow/memory/
  #1  [hot]   auth uses JWT RS256, not HS256     (tags: auth,security)
  #2  [hot]   zod is project-wide validation     (tags: validation,zod)
  #3  [warm]  Postgres uses UTC timestamps       (tags: db,conventions)
```

Entry number in yellow-tier prefix. Tier in brackets. Tags in parens at end.

## 10. Task File Status

When creating/updating task files:

```
⚡ Task: implement-auth (3 sub-tasks)
  • Write auth middleware          → pending
  • Add route guards               → pending  
  • Generate test suite            → pending
```

After completion:

```
✓ Task complete: implement-auth (3/3)
```

## 11. Security Violations

```
✗ SECURITY_VIOLATION: hardcoded API key in src/config.ts:42
  ▸ Pipeline halted — review required
```

## 12. Blocked Resources

```
✗ BLOCKED: worker attempted to read .env
  ▸ File is in security blocklist
```

## Formatting Rules

1. **No prose between outputs.** Status lines only. No "I'm now going to..." or "Let me...".
2. **Alignment matters.** Pad roles, model names, and counts for columnar alignment.
3. **One blank line** between different output sections (e.g., between agent labels and gates).
4. **No trailing summaries.** The usage block IS the summary. Don't add "Done! I completed X."
5. **Symbols are mandatory.** Never write "Analysis cache fresh" without the `✓` prefix. Never write agent labels without `⚡`.
