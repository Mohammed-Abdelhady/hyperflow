---
description: Hyperflow status — read-only one-screen view of in-flight tasks, progress, spec/audit counts, and memory size
---

Run **hyperflow status** (read-only). Follow the **hyperflow-status** skill.

1. Read `.hyperflow/tasks/*.md` and report each status block (progress, sub-tasks done/total, branch).
2. Count specs, audits, and memory entries.
3. Print a compact summary. If `.hyperflow/` is absent, suggest /hyperflow-scaffold. Never modify anything.

Arguments: $ARGS
