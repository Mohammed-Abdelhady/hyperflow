---
description: Hyperflow project setup — create the .hyperflow/ cache + memory and install the /hyperflow* slash commands into .agent/workflows/
---

Run **hyperflow project setup**. Follow the **hyperflow-scaffold** skill. Idempotent — only create what's missing.

1. Create `.hyperflow/` (memory/{decisions,learnings,pitfalls,patterns}.md + tasks/ specs/ audits/).
2. Write `.hyperflow/{profile,architecture,conventions}.md` from reading the repo.
3. Copy the seven `hyperflow*` workflow files into `<repo>/.agent/workflows/` so `/hyperflow*` resolves.
4. Print what was created. Do NOT start the chain.

Arguments: $ARGS
