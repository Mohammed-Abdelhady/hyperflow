# Plan approval gates

These gates apply to the plan flow. Load this reference before entering the first gate and keep the exact formats below.

| Gate | When | Format |
|---|---|---|
| Smart questions | Step 5, design path | `structured_question` (prefer `AskUserQuestion`) — 0–5 material questions, scaled by ambiguity |
| Synthesis + approach | Step 6, after batched review | `structured_question` — confirm synthesis · pick approach |
| Design section approval | Step 7, one combined gate | `structured_question` — approve all / revise §N |
| **Build location** | Step 12, after the task file is written — **ALWAYS** | `structured_question` — this session / another session / stop (+ handoff: review / deploy when another session) |

The build-location gate fires on **every** run (it is the only thing that ever starts a build); the design-phase gates fire at most once each and are skipped on the bounce path. Plan asks **no startup gates** — the session/build decision and the operational choices (commit cadence · branch · push) are no longer front-loaded. When the user picks "this session," `dispatch` fires its own operational gate (its Step 0.5) before building. Markers follow DOCTRINE rule 8: multi-option/named-workflow choices carry `(Recommended)`; binary action gates (Approve/Revise) carry none.

**Structured-input absence:** when `structured_question` has no host UI, render the exact **Hyperflow Question** chat block ([runtime-contract.md](../../hyperflow/runtime-contract.md)), optionally write a pending-gate checkpoint under `.hyperflow/`, and **end the turn**. Never silently pick the recommended option. Never start a build without the build-location answer.
