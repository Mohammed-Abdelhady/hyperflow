---
description: Hyperflow auto-routing mode — set on (all task messages route) / auto (intent-verb messages route, default) / off (only explicit /hyperflow* commands)
---

Run **hyperflow auto-routing mode**. Follow the **hyperflow-sticky** skill.

1. Read the requested mode (on / auto / off).
2. Write it to `.hyperflow/.sticky-mode`.
3. Print the new mode. This only changes routing — it never runs work.

Arguments: $ARGS
