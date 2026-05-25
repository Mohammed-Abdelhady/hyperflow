---
description: Hyperflow design phase — research, ask, propose 2-3 approaches, design section-by-section into .hyperflow/specs/, then hand off to /hyperflow-scope
---

Run the **hyperflow design phase**. Follow the **hyperflow-spec** skill. Thinking, not building — no code until the design is approved.

1. Research the relevant code + `AGENTS.md` + `.hyperflow/memory/*`. Don't ask what the code answers.
2. Ask 2-5 clarifying questions (floor 2) via AskUserQuestion — only the *what/which/where* the code can't resolve.
3. Propose 2-3 approaches (pros/cons/fit); recommend one; let the user pick.
4. Write the design to `.hyperflow/specs/<slug>.md` (status table → TL;DR → Architecture → Data flow → Key decisions → Edge cases → File structure). Present it; gate `Approve / Revise <section>`.
5. On approval, hand off to `/hyperflow-scope`.

Request / arguments: $ARGS
