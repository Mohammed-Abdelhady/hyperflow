---
description: Hyperflow two-session handoff — list / status / pickup / review / complete a committed .hyperflow-handoff/<slug>/ package (plan in one session, build in another, review back)
---

Manage a **two-session handoff**. One session plans (`session=two`), a second session in another environment builds,
and the first reviews. Packages live at `.hyperflow-handoff/<slug>/` (committed, so they travel via git). `STATUS`
(`planned → built → reviewed`) tells you which side you are on.

Subcommand from `$ARGS` (default `list`):

- **`list`** — `git pull` first, then list every `.hyperflow-handoff/*/` (skip `.archive/`): slug · STATUS · `on_complete` · age.
- **`status [<slug>]`** — print the `HANDOFF.md` manifest + STATUS; when `built`, also the `COMPLETION.md` diff range.
- **`pickup <slug>`** — build side. Run `/hyperflow-dispatch <slug>`: copy `artefact/` into `.hyperflow/` (scaffold first if the cache is missing), build the batches, write `COMPLETION.md` + `STATUS=built`, commit + push, then deploy or stop for review per `on_complete`.
- **`review <slug>`** — planning side. Require `STATUS=built`; read the `COMPLETION.md` diff range `<base>..<head>`; run `/hyperflow-audit <base>..<head>` over exactly the build's commits; then the deploy gate. Set `STATUS=reviewed`.
- **`complete <slug>`** — set `STATUS=reviewed` and archive to `.hyperflow-handoff/.archive/<slug>/`; commit.

**Antigravity note:** single agent — no sub-agent dispatch, no model tiers. On a `pickup`, do each batch yourself and
self-review (L1 syntax → L2 spec/naming/edges → L3 integration/security) before committing. On a `review`, audit the
diff range yourself. Never edit the build's commits — fixes flow through audit → scope → dispatch. Per-task
conventional commits; no AI attribution; never `--no-verify`, never force-push to main.

Request / arguments: $ARGS
