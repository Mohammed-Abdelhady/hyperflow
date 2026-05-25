---
description: Hyperflow debugging — systematic root-cause analysis (5 Whys + hypothesis testing) before any patch; never blind-patch symptoms
---

Run the **hyperflow root-cause phase**. Follow the **hyperflow-trace** skill.

1. Reproduce / locate: read the error or failing test; pin the exact line and observed-vs-expected.
2. 5 Whys: trace the causal chain back to the true cause, not a symptom.
3. Hypotheses: list 2-4 plausible causes; for each, a cheap test that confirms/rules it out; run them to narrow down.
4. Confirm the root cause with evidence — never patch on a guess.
5. Fix the root cause minimally; add/adjust a test that would have caught it.
6. Verify (re-run failing case + suite), self-review (L1-L3), commit `fix(<scope>): <root cause>`.

If still unclear after testing, surface findings + unknowns — don't ship a speculative patch.

Request / arguments: $ARGS
