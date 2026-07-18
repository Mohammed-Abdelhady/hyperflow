# Auto-routing & sticky mode

Layer 1 detail referenced from [DOCTRINE.md](DOCTRINE.md) § Layer 1. DOCTRINE keeps the summary; this file holds the full state table, intent-verb taxonomy, activation/upgrade rules, bypass matrix, routing-announcement format, and banned patterns.

## Auto-routing (always on by default · two tiers)

The orchestrator auto-routes user messages to the appropriate chain-starter based on **intent detection** by default — the user does NOT need to mention "hyperflow" or run `/hyperflow:sticky on` first. Sticky mode is now an *expansion* of this default (full task-shaped routing) or an *opt-out* (no auto-routing at all).

**Three states** (stored in `.hyperflow/.sticky`, project-scoped):

| State | Trigger | Behavior |
|---|---|---|
| `auto` (default) | `.sticky` absent OR `state: auto` | **Intent-detection routing** — messages containing chain-starter intent verbs auto-route. Pure conversation passes through. |
| `on` | `/hyperflow:sticky on` | **Full sticky** — every task-shaped message routes, even without explicit intent verbs |
| `off` | `/hyperflow:sticky off` | **All auto-routing disabled** — only explicit `/hyperflow:*` slash commands trigger chains |

**Intent verb taxonomy (Tier 1 — `auto` mode, the default):**

Scan every user message for these verbs/phrases. If matched, route immediately. Verbs win over the message's overall shape — a one-word "debug" routes to trace even though it's barely a "task".

| Intent class | Verbs / phrases that trigger | Route to |
|---|---|---|
| Design exploration | `brainstorm`, `design`, `explore`, `let's think about`, `what if`, `should we`, `how should`, `unsure about`, `not sure how to` | `/hyperflow:plan` |
| Scope / plan | `scope`, `decompose`, `plan out`, `break down`, `create a plan`, `task graph`, `decompose into batches` | `/hyperflow:plan` |
| Big-task workflow | `big task`, `large migration`, `repo-wide audit`, `run a workflow`, `dynamic workflow`, `high-confidence verification` | `/hyperflow:workflow` in Claude Code v2.1.154+, Codex, and OpenCode; otherwise `/hyperflow:plan` |
| Implementation | `build`, `implement`, `add`, `create`, `make a`, `refactor`, `write the`, `wire up`, `extract`, `inline` | Inspect first → deterministic inline-fast when proven safe; otherwise `/hyperflow:plan` |
| Debugging / fix | `debug`, `fix it`, `fix`, `solve`, `troubleshoot`, `investigate`, `root-cause`, `why is`, `X is broken`, `Y fails`, `Z throws`, stack trace pasted | `/hyperflow:trace` |
| Review / audit | `audit`, `review`, `check for issues`, `look for bugs`, `any problems`, `code review`, `security check`, `scan the diff` | `/hyperflow:audit` |
| Shipping | `ship`, `push`, `release`, `deploy`, `let's deploy`, `ready to ship`, `cut a release`, `merge to main` | `/hyperflow:deploy` |
| Setup | `scaffold`, `setup hyperflow`, `init the project`, `analyze the project`, `set up the cache` | `/hyperflow:scaffold` |
| Memory | `show memory`, `search memory`, `compact memory`, `what does hyperflow remember`, `add to memory`, `clear memory` | `/hyperflow:cache` |
| Status / progress | `status`, `progress`, `what's running`, `how much done`, `eta` | `/hyperflow:status` |
| Background agents | `list background`, `what's in background`, `cancel background`, `show background` | `/hyperflow:background` |

Verb-matching is case-insensitive and word-boundary-aware. A verb selects a candidate workflow, not its weight: map the affected surface, then run `scripts/route-task.py`. Explicit Hyperflow commands always keep their requested workflow.

**Tier 2 — `state: on` (full sticky):** every task-shaped user message routes, even without an intent verb. Useful when the user is in a sustained build session and wants every message — even short ones like "the dashboard component" — interpreted as work. Uses the message-shape heuristic from the original sticky contract (verb-led → plan; etc.).

**Activation:**

1. Explicit toggle — user runs `/hyperflow:sticky on` or `/hyperflow:sticky off` to set state.
2. Implicit upgrade — user mentions "hyperflow" in any non-slash-command message AND `.hyperflow/.sticky` does not yet exist OR contains `state: auto`. The orchestrator upgrades to `state: on` and prints `Sticky mode: ON (upgraded from auto, activated by mention). Disable with /hyperflow:sticky off.`

Intent-detection routing is the floor — the user gets it without any opt-in. Sticky `on` raises the ceiling (more aggressive routing). Sticky `off` lowers the floor (no auto-routing).

**Bypass / pass-through (apply in ALL states):**

| Pattern | Effect |
|---|---|
| Message starts with `/` | Honor the slash command as-is — no routing |
| Message contains "without hyperflow" / "skip hyperflow" / "don't route" / "just answer" | No routing for that message |
| Chat-shaped: questions about prior output, "yes"/"no"/"ok"/"thanks", short clarifications, gate answers | No routing — respond directly |
| Empty intent: no verb matches AND message-shape isn't task-shaped (e.g. "hmm" / "the search bar I mean") | No routing — respond directly |

**Routing announcement:** print ONE short line before invoking the routed skill — `Routing to /hyperflow:<skill> (intent: <verb>) …` or `Routing to /hyperflow:<skill> (sticky mode) …`. Do NOT ask the user to confirm the routing (invented gate per rule 8). The Step 0 session-strategy question still fires inside the routed skill.

**Banned patterns (apply in ALL states):**

- Asking "should I route this to hyperflow?" — invented gate
- Routing chat-shaped messages — answering a question doesn't fire a chain
- Routing messages that start with `/` — those are explicit commands, honor them
- Skipping Step 0 session-strategy inside the routed skill — sticky controls routing, not gates
- Echoing the routing decision as a paragraph — one short line is enough
- Silently downgrading from `on` to `auto` or `auto` to `off` because "this message felt different" — only `/hyperflow:sticky <state>` changes state

**Disable:** only `/hyperflow:sticky off`. Once off, even intent verbs do NOT auto-route — the user is back to explicit `/hyperflow:*` invocations.
