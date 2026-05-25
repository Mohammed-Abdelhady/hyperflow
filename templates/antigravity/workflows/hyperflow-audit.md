---
description: Hyperflow code review — multi-level (L1-L5) review of the diff/commit/PR, findings written to .hyperflow/audits/, then a fix-gate
---

Run the **hyperflow audit phase**. Follow the **hyperflow-audit** skill. Default scope: `git diff HEAD` + staged.

1. Resolve scope; read changed files + immediate dependencies.
2. Review at the right level (default L2; elevate to L3 when the diff touches auth/data/money/external input — security scan mandatory at L3+). Grade findings `[Critical]/[Important]/[Suggestion]/[Praise]` with `file:line` + a concrete fix.
3. Write the report to `.hyperflow/audits/<YYYY-MM-DD-HHmm>-<scope>.md`; print a one-line summary pointing at it.
4. Fix-gate (AskUserQuestion, only if Critical/Important): `Fix all (Recommended) / Critical+Important / Critical only / No`. On a fix choice, route via `/hyperflow-scope` → `/hyperflow-dispatch`. `SECURITY_VIOLATION` → surface immediately, no gate.

Request / arguments: $ARGS
