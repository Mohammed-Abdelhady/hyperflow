---
description: Hyperflow orchestration — apply the doctrine and route the request to the right phase (spec/scope/dispatch/audit/trace/deploy)
---

Apply the **hyperflow doctrine** to this request, then route by intent.

Load and follow the **hyperflow** skill (the full doctrine). In short:

**Autonomy** — no "should I?" confirmations; execute. Ask via AskUserQuestion only for *what/which/where* ambiguities, and only AFTER reading the code. Minimal output, no hedging. Binary gates carry no `(Recommended)` marker; 3+-option gates do.

**Route by the first matching verb** in the request (run the matching workflow):
- "enhance/improve/rewrite this prompt" → `/hyperflow-amplify`
- brainstorm / design / explore / "should we" → `/hyperflow-spec`
- scope / decompose / "plan out" / "break down" → `/hyperflow-scope`
- build / implement / add / refactor / "wire up" → `/hyperflow-dispatch`
- debug / fix / "why is X failing" / stack trace → `/hyperflow-trace`
- audit / review / "check for issues" → `/hyperflow-audit`
- ship / push / release / deploy → `/hyperflow-deploy`

Utility workflows: `/hyperflow-scaffold` (set up `.hyperflow/` + slash commands) · `/hyperflow-status` (read-only progress) · `/hyperflow-cache` (memory CRUD) · `/hyperflow-sticky` (auto-routing mode) · `/hyperflow-handoff` (two-session build pickup / review).

**Session strategy:** at the start of a chain, ask one session (run it all here) or two sessions (plan here, build elsewhere). In two-session mode this Antigravity session is typically the **build** side — pick up a committed `.hyperflow-handoff/<slug>/` package with `/hyperflow-dispatch <slug>` (or `/hyperflow-handoff pickup <slug>`), build it, then deploy or hand the diff back for review.

**Always:** per-task conventional commits (respect commitlint); plans/specs/audits live as files under `.hyperflow/` (never long chat); no AI attribution in commits/docs; honor the security blocklist (`.env*`, keys, `~/.ssh`, no `rm -rf`, no force-push to main, no `--no-verify`).

**Antigravity note:** single agent — no sub-agent dispatch, no model tiers. Do each batch yourself and self-review (L1 syntax → L2 spec/naming/edges → L3 integration/security) before committing.

Request / arguments: $ARGS
