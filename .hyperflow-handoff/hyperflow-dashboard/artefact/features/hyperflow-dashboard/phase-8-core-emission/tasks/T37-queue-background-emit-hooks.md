# T37 — queue-commit + background emit hooks

## Status

| Field       | Value              |
|-------------|--------------------|
| Status      | pending            |
| Complexity  | l                  |
| Depends on  | T35 (emit helper + ADR vocabulary) |
| Specialist  | backend-reviewer   |

## Task

Wire two of the three core emit touchpoints: `scripts/queue-commit.sh` appends a `commit-queued` event after each successfully queued commit, and `skills/background/SKILL.md` gains emit instructions at its registry write points (launch, completion, cancel, prune) plus the `Bash(bash:*)` tool allowance those instructions need.

## Why

Spec §2c names three emitters feeding Mission Control; T36 covers dispatch, this task covers the other two (E2 background registry writes, E3 queue-commit.sh). Without them, deferred-commit chains and background-agent lifecycles are invisible to the dashboard's live feed and replay timeline — the exact sequences markdown artefacts cannot capture (spec §3B.6).

## Scope

**IN:**
- `scripts/queue-commit.sh` — one existence-guarded emit call on the successful-queue path.
- `skills/background/SKILL.md` — a new `## Event emission` section covering all four registry write points, inline emit instructions in the `cancel` and `prune` subcommand details, and `Bash(bash:*)` appended to `allowed-tools`.

**OUT:**
- `skills/dispatch/SKILL.md` — T36.
- `scripts/flush-commits.sh` — the spec §5 core-touched table lists only `queue-commit.sh`; flush emission is not in v1 scope.
- `skills/hyperflow/background-agents.md` — the doctrine reference is not in the §5 table; the launch/completion contract is documented in background/SKILL.md's new section instead.
- No reformatting of existing lines — every edit is a pure insertion (new lines, new section, one appended token in `allowed-tools`); existing step text, numbering, tables, exit codes, and output strings stay byte-identical. Anything the 18 existing skills parse is untouched.
- No new required behavior for old plugin versions — when `scripts/emit-event.sh` is absent, both files behave exactly as today; the emit instructions are conditional by construction.
- Emission failure never blocks a chain — every emit call is existence-guarded and failure-swallowed; `queue-commit.sh`'s exit codes (0/2/3/4) and the background skill's flows are unreachable by any emit outcome.

## Files in scope

**Read**
- `skills/hyperflow/events.md` (T35) — the `type` vocabulary (`commit-queued`, `bg-launch`, `bg-complete`, `bg-cancel`, `bg-prune`) and the helper invocation shape; use its names verbatim.
- `.hyperflow/specs/hyperflow-dashboard.md:210-213` — §2c emitters E2/E3; `:316` — §3B.6 hook-point list; `:592-593` — §5 rows for these two files.

**Modify**
- `scripts/queue-commit.sh` — single insertion point: after the manifest-append python3 heredoc closes (the `PY` terminator at line 101) and before the final success line `echo "queue-commit: queued $SHA on $STAGING_BRANCH …"` (line 103). Resolve `emit-event.sh` as a sibling of this script via its own directory (the `BASH_SOURCE` pattern bump-version.sh uses at line 5 — never `$PWD`, never an env var); if that file exists, invoke it with the project root, `$CHAIN_ID`, skill `dispatch`, type `commit-queued`, and a `detail` carrying the short SHA plus the message head (mirroring the existing echo's `head -c 60` framing at line 103); terminate the whole guarded call with `|| true` so no outcome can trip `set -euo pipefail` (line 16). No emit on the no-op path (lines 78-81) and no emit on the hook-rejection path (lines 83-87) — nothing was queued there.
- `skills/background/SKILL.md` —
  - frontmatter `allowed-tools` (line 6, currently `Read, Write, Edit, Bash(ls:*), Bash(cat:*), Bash(rm:*), Bash(find:*), Glob, Grep`): append `Bash(bash:*)` to the list; change nothing else in the frontmatter.
  - `### cancel <id>` (lines 66-72): insert one new numbered step between step 3 ("Update registry entry: `status: cancelled`, `cancelled_at: <now>`.") and the current step 4 ("Print `Cancelled <id> — <purpose>`."): emit type `bg-cancel` via `scripts/emit-event.sh` when that script exists, with the agent id in the `agent` field. Renumber only the following "Print" step; its text stays identical.
  - `### prune` (lines 78-80): after the sentence ending "…are pruned)." and before the "Print: `Pruned N …`" sentence, insert the emit instruction: type `bg-prune`, pruned count in `detail`, same existence guard.
  - New `## Event emission` section, inserted between the end of `## Subcommand Details` (after the prune paragraph, line 80) and `## Flow` (line 82): documents that every registry write point emits one line via `bash $PLUGIN_ROOT/scripts/emit-event.sh` — **launch** (`bg-launch`, written by the skill that registers a `run_in_background` dispatch; the Overview at lines 89-91 already establishes that other skills maintain the registry) and **completion** (`bg-complete`, on the registry status flip at collection) are emitted by those maintaining skills under this same contract; **cancel** (`bg-cancel`) and **prune** (`bg-prune`) are emitted here. States the three invariants: emit only when the script exists, never let an emit failure alter a subcommand's outcome, and take field names/types from `skills/hyperflow/events.md`.

## Acceptance criteria

- [ ] Hook points emit only when `scripts/emit-event.sh` exists — with that file removed, `queue-commit.sh` runs byte-identically to today (same stdout/stderr, same exit code, same commits, no `events.ndjson`); backward-safe by construction.
- [ ] A failed emit (read-only `events.ndjson`, missing python3, any helper failure) never changes `queue-commit.sh`'s exit code, output lines, staging commit, or manifest contents.
- [ ] `queue-commit.sh`'s existing behavior is bit-for-bit preserved on its no-op (exit 0) and hook-rejection (exit 4) paths — no event is emitted on either.
- [ ] `skills/background/SKILL.md` diffs show insertions only: `allowed-tools` gains exactly `Bash(bash:*)`, cancel gains one step, prune gains one sentence-level instruction, and one new `## Event emission` section exists; every pre-existing line is unchanged.
- [ ] All emitted/instructed `type` names exist verbatim in `skills/hyperflow/events.md` — no invented vocabulary.
- [ ] `python3 scripts/validate-plugin.py` still reports PASSED (frontmatter still parses; `name`/`description` untouched).

## Test cases

1. **Integration (queue path):** temp git repo with `.hyperflow/`, one staged-able file → run `bash scripts/queue-commit.sh <root> test-chain "feat: x" <file>` → the staging branch gains the commit and the manifest updates exactly as before, AND `.hyperflow/events.ndjson` gains one line; validate that line against `dashboard/src/shared/schemas/event-line.ts` via a node/tsx one-liner (`type` = `commit-queued`, `chain` = `test-chain`).
2. **Backward-safe:** same temp repo with `scripts/emit-event.sh` temporarily moved aside → run queue-commit.sh → exit 0, commit queued, manifest updated, no `events.ndjson`, stdout/stderr identical to the pre-change script's output.
3. **Emit-failure isolation:** pre-create `events.ndjson` as root-owned/`chmod 444` → queue-commit.sh still exits 0 and queues the commit.
4. **No-op path:** run against an unchanged file → the existing "no changes to commit" message, exit 0, and NO event line appended.
5. **SKILL.md integrity:** `python3 scripts/validate-plugin.py` → PASSED; grep confirms `Bash(bash:*)` in the frontmatter and `emit-event.sh` referenced at the cancel step, the prune detail, and the `## Event emission` section; `git diff` on the file shows zero deleted lines.

E2E: N/A — no browser surface at this layer; composed-loop coverage lands in T40/T41.

## Related context

- `scripts/queue-commit.sh:16` — `set -euo pipefail`; `:78-81` — no-op exit path; `:83-87` — hook-rejection exit 4; `:91-101` — manifest-append heredoc (insertion anchor is after its `PY` terminator); `:103` — success echo (emit lands before it).
- `scripts/bump-version.sh:5` — the `SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"` sibling-resolution pattern to reuse.
- `skills/background/SKILL.md:6` — `allowed-tools` (no `Bash(bash:*)` today); `:66-72` — cancel steps (registry update at `:69`, print at `:70`); `:78-80` — prune; `:82` — `## Flow` heading (section insertion boundary); `:89-91` — Overview establishing that other skills maintain the registry (why launch/completion are contract prose here, not steps).
- `.hyperflow/specs/hyperflow-dashboard.md:210-213` (§2c E2/E3), `:316` (§3B.6 hook points), `:592-593` (§5 rows).
- `skills/hyperflow/events.md` (T35) — vocabulary + invocation shape.
- Sibling briefs: T35 (defines everything this consumes), T36 (the dispatch touchpoint, roster-only).

## Gotchas

- **`set -euo pipefail` + guard chains:** in queue-commit.sh, a bare `[ -f "$EMIT" ] && bash "$EMIT" …` statement returns non-zero when the file is absent — and `set -e` (line 16) kills the whole script right there. Every emit line must terminate in `|| true`. This is the single most likely way this task breaks a chain.
- **The frontmatter half is easy to miss:** without `Bash(bash:*)` in background/SKILL.md's `allowed-tools`, the emit instructions in cancel/prune are un-executable — the skill would document a call it cannot make. The tool addition is load-bearing, not cosmetic.
- **Sibling resolution, not cwd:** queue-commit.sh is invoked as `bash $PLUGIN_ROOT/scripts/queue-commit.sh` from arbitrary working directories; `emit-event.sh` must be found relative to `BASH_SOURCE`, never `$PWD` and never an env var the caller might not export.
- **No events from failure paths:** emitting `commit-queued` when the commit was rejected (exit 4) or skipped (no-op) poisons Chain Replay with commits that never existed. Emit strictly after the manifest append succeeds.
- **`detail` carries arbitrary commit messages** — quotes, newlines, unicode. Pass it as one argv to emit-event.sh and let the helper's `json.dumps` escape it (T35 contract); never pre-quote or truncate beyond the `head -c 60` framing.
- **Insertions only in SKILL.md:** other tooling and users anchor on this skill's step text and tables (the 18-skill parse surface rule). Do not rewrap paragraphs, do not renumber anything except the one step that must follow the new cancel step, do not touch the `version:` frontmatter field.
- **Never fail the session posture:** both files run inside live chains; the review bar for this task is "could any code path here make a previously green run red?" — the answer must be provably no.
