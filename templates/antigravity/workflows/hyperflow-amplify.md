---
description: Hyperflow prompt amplifier — rewrite a rough prompt into the single strongest version (domain-aware, rubric-scored), then offer to run it
---

Run the **hyperflow prompt amplifier**. Follow the **hyperflow-amplify** skill. Amplify never writes code — it produces a better prompt.

1. Detect the prompt's domain(s); read project rules (`AGENTS.md`, `~/.gemini/AGENTS.md`, `.hyperflow/memory/*`); note the gaps.
2. Rewrite into one strong version: role · task · Context · Constraints (domain standards + project rules) · Output · Out-of-scope. Economy is a constraint — never inflate a one-liner.
3. Score against the 8-dim rubric (intent, context, scope, structure, domain doctrine, output spec, guardrails, economy); revise once if any < 4.
4. Print the amplified prompt in one fenced block + a short rationale.
5. Handoff gate (AskUserQuestion): Send to /hyperflow-spec (Recommended) · /hyperflow-scope · /hyperflow-dispatch · Copy only.

Prompt to amplify: $ARGS
