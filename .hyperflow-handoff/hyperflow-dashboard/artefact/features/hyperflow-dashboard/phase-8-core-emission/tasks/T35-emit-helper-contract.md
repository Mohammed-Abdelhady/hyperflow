# T35 — Emit helper + public contract ADR

## Status

| Field       | Value              |
|-------------|--------------------|
| Status      | pending            |
| Complexity  | m                  |
| Depends on  | T2 (phase-1-foundations — shared event-line Zod schema) |
| Specialist  | backend-reviewer, api-reviewer |

## Task

Create the shared append helper `scripts/emit-event.sh` — writes exactly one O_APPEND single-line JSON event to `.hyperflow/events.ndjson`, is a silent no-op when no `.hyperflow/` exists, and exits 0 unconditionally — plus the public-contract ADR `skills/hyperflow/events.md` documenting the line schema, the `v`-gate rule, the additive-only evolution rules, the emit touchpoint list, and the initial event-`type` vocabulary.

## Why

Markdown artefacts capture state; NDJSON captures sequence (spec §3B.6). The dashboard's Mission Control feed, Chain Replay, and token analytics all tail this one file (spec §2c). The three hook points (T36 dispatch, T37 queue-commit + background) and the dashboard tailer are both consumers of the contract this task defines — the spec's ADR flags call the line schema "Public cross-repo contract; hardest to reverse". Nothing in Batch 2 can start until the helper interface and type vocabulary exist.

## Scope

**IN:**
- `scripts/emit-event.sh` — new file, the only writer-side mechanism.
- `skills/hyperflow/events.md` — new reference file, the ADR governing the contract.

**OUT:**
- The hook-point edits themselves — `skills/dispatch/SKILL.md` is T36, `scripts/queue-commit.sh` + `skills/background/SKILL.md` are T37.
- Release plumbing (`bump-version.sh`, `validate-plugin.py`, `.gitignore`) — T38.
- The dashboard-side tailer, Zod schema, and SSE plumbing — phase-1 (schema) and phase-3 (tailer); this task consumes the schema, never defines wire shapes.
- Log rotation — explicitly deferred past v1 (spec §3B.6 trade-offs); the ADR notes the format tolerates it later, nothing more.
- No reformatting of existing lines anywhere — this task creates two new files and modifies zero existing ones.
- No new required behavior for old plugin versions — a project without `.hyperflow/` gets nothing created, and the dashboard's markdown-only fallback (spec §2c version-skew path) stays the fully supported degradation.
- Emission failure never blocks a chain — the helper's contract is exit 0 always; no caller may ever need error handling around it.

## Files in scope

**Read**
- `.hyperflow/specs/hyperflow-dashboard.md:206-224` — §2(c) events path: "append one NDJSON line, O_APPEND, single write"; tailer, torn-line, and markdown-only-fallback semantics the writer side must respect.
- `.hyperflow/specs/hyperflow-dashboard.md:315-318` — §3B decision 6: the line shape `{v:1, ts, chain, skill, type, batch?, task?, status?, agent?, tokens?, detail?}`, the `v` generation gate, additive-only evolution, ADR-before-ship rule, the three hook points.
- `dashboard/src/shared/schemas/event-line.ts` (phase-1 T2) — the Zod wire truth; every line this helper emits must `.parse()` clean against it.
- `scripts/queue-commit.sh` — repo bash conventions to mirror: `set -euo pipefail` at line 16, python3-heredoc JSON construction at lines 48-58 and 91-101, UTC timestamps via `date -u +%Y-%m-%dT%H:%M:%SZ` at lines 47 and 98.

**Create**
- `scripts/emit-event.sh` — invocation shape: `emit-event.sh <project-root> <chain-id> <skill> <type> [key=value …]`. The script fills `v` (integer 1) and `ts` (UTC ISO-8601, same `date -u` format queue-commit.sh uses) itself; `chain`, `skill`, `type` come from the positional args; optional `key=value` pairs are restricted to the schema's optional fields (`batch`, `task`, `status`, `agent`, `tokens`, `detail`) — `batch` and `tokens` serialize as JSON numbers, the rest as strings; unknown keys are dropped silently. The JSON object is built with python3 stdlib (`json.dumps` — repo convention, never hand-interpolated), rendered as one compact line, and appended to `<project-root>/.hyperflow/events.ndjson` with a single O_APPEND write of the complete newline-terminated line (shell `>>` redirection of one `printf`, or a python `open(…, "a")` with one `write()` — either way exactly one write syscall carrying line plus `\n`). When `<project-root>/.hyperflow/` does not exist as a directory: exit 0 immediately, print nothing, create nothing — never `mkdir`. Any other failure (bad args, unwritable file, python3 missing): exit 0, no output. Header comment documents the never-fail contract and the deliberate deviation from the repo's `set -e` convention. Example of the one line it appends:
  `{"v":1,"ts":"2026-07-12T14:03:11Z","chain":"chain-1752329000","skill":"dispatch","type":"task-status","batch":2,"task":"T7","status":"done","agent":"implementer","tokens":18400}`
- `skills/hyperflow/events.md` — the ADR, structured as: (1) purpose — one file, `.hyperflow/events.ndjson`, one JSON object per line, append-only, crash-safe (a torn final line is skipped by readers, never corrupts history); (2) line-schema field table — each of `v, ts, chain, skill, type, batch?, task?, status?, agent?, tokens?, detail?` with type, required/optional, and meaning, matching the shared Zod schema exactly; (3) the `v`-gate rule — `v` marks the schema generation, readers gate on it, unknown `v` is handled as an opaque raw event (best-effort known-field mapping), never an error; (4) additive-only evolution rules — new event `type`s allowed, new OPTIONAL fields allowed, never remove/rename/retype a field or make an optional field required, and every schema change lands in this file first (ADR-gated, spec §3B.6); (5) touchpoint list — dispatch Step 2d status updates, background registry writes (launch/completion/cancel/prune), `scripts/queue-commit.sh`; (6) the initial `type` vocabulary covering those touchpoints (e.g. `task-status`, `commit-queued`, `bg-launch`, `bg-complete`, `bg-cancel`, `bg-prune`) — T36/T37 use these names verbatim, and the dashboard treats unknown types as displayable-raw; (7) emitter rules — one O_APPEND write per event, silent no-op without `.hyperflow/`, exit 0 always, emission may never fail or slow a caller; (8) consumer rules — tolerant reader, unknown fields ignored, absence of the file means markdown-only fidelity (spec §2c fallback), file shrink below a stored offset means re-read from zero.

## Acceptance criteria

- [ ] Appending twice concurrently yields two intact lines — O_APPEND atomicity holds for lines under PIPE_BUF length; verified by the concurrency test below with zero interleaved/corrupt lines.
- [ ] Missing `.hyperflow/` under the given root → silent exit 0: no file created, no directory created, empty stdout and stderr.
- [ ] Exit code is 0 on every invocation path — valid emit, missing root, zero args, unwritable target — verified by explicit tests.
- [ ] An emitted line with all optional fields populated `.parse()`s clean against `dashboard/src/shared/schemas/event-line.ts`; `batch` and `tokens` arrive as JSON numbers, not strings.
- [ ] The emitted line is exactly one line: compact JSON, no pretty-printing, single trailing `\n`, no partial writes.
- [ ] `skills/hyperflow/events.md` contains all eight ADR sections above, and its field table matches the shared Zod schema field-for-field.
- [ ] Additive-only holds: `git status` shows exactly two new files and zero modified files.
- [ ] `python3 scripts/validate-plugin.py` still reports PASSED (events.md is a reference file beside DOCTRINE.md et al., not a `SKILL.md` — no features.json registration applies).

## Test cases

1. **Integration (happy path):** in a temp tree containing `.hyperflow/`, run the helper once with `chain`/`skill`/`type` plus every optional `key=value`; assert `events.ndjson` has exactly one line, then validate that line against the shared Zod schema via a node one-liner from `dashboard/` (e.g. `npx tsx -e` importing `src/shared/schemas/event-line.ts` and calling `.parse(JSON.parse(line))`).
2. **Integration (concurrency):** fire 50 invocations in parallel (`&` + `wait`) into the same temp tree; assert `wc -l` is exactly 50 and every individual line JSON-parses — no torn or interleaved lines.
3. **Silent no-op:** run against a temp dir with NO `.hyperflow/`; assert exit 0, no `events.ndjson` anywhere, no `.hyperflow/` created, empty output.
4. **Never-fail:** (a) zero arguments → exit 0; (b) `.hyperflow/` present but `chmod 555` (read-only) → exit 0, caller unaffected.
5. **Torn-tail append:** manually append a truncated half-line (no `\n`) to `events.ndjson`, then run the helper; assert it appends its complete line after the torn one without attempting repair (the reader-side skip contract, spec §2c, handles the torn line).
6. **Plugin validation:** `python3 scripts/validate-plugin.py` → PASSED on the resulting tree.

E2E: N/A — no browser surface at this layer; composed-loop coverage lands in T40/T41.

## Related context

- `.hyperflow/specs/hyperflow-dashboard.md:210-213` — §2c: emit points E1-E3 append "one NDJSON line, O_APPEND, single write".
- `.hyperflow/specs/hyperflow-dashboard.md:224` — truncation/rotation + additive-only ADR-governed evolution.
- `.hyperflow/specs/hyperflow-dashboard.md:237` — ADR flags: "events.ndjson line schema + versioning … Public cross-repo contract; hardest to reverse".
- `.hyperflow/specs/hyperflow-dashboard.md:594` and `:598` — §5 core-touched rows for `scripts/emit-event.sh` (NEW) and `skills/hyperflow/events.md` (NEW).
- `scripts/queue-commit.sh:16` — `set -euo pipefail` convention; `:47-58` and `:91-101` — python3-heredoc JSON construction; `:98` — the `date -u +%Y-%m-%dT%H:%M:%SZ` timestamp format to reuse.
- `skills/dispatch/SKILL.md:211` — the Step 2d "Update the task file's `## Status` block" bullet that T36 hooks; it is this helper's first caller.
- `.gitignore:7` — `.hyperflow/` is git-ignored, so `events.ndjson` never reaches version control; no ignore entry is needed for it.
- Sibling briefs: T37 (queue-commit + background hooks consume the vocabulary), T38 (release plumbing, disjoint files).

## Gotchas

- **`set -e` vs never-fail:** the repo convention is `set -euo pipefail` (queue-commit.sh:16, bump-version.sh:3), but this script's contract is exit-0-always. Deviate deliberately — drop `-e` with explicit guards, or trap errors to exit 0 — and say so in the header comment, or a reviewer will "fix" it back and reintroduce the failure mode the contract forbids.
- **One write syscall:** build the complete line (JSON + `\n`) first, then write once. Writing the JSON and the newline as two operations can interleave under concurrent emitters and produce torn lines the tailer must then skip.
- **Never `mkdir .hyperflow/`:** creating the tree inside a non-hyperflow project is precisely the side effect the silent-no-op rule exists to prevent — old-plugin and non-hyperflow projects must be byte-identical after a stray invocation.
- **`tokens` and `batch` are numbers:** naive stringification of every `key=value` pair emits `"tokens":"18400"` and fails the shared Zod schema. Type coercion belongs in the helper, once.
- **Escaping is `json.dumps`'s job:** `detail` will carry commit messages and arbitrary prose from callers — quotes, backslashes, newlines. Never hand-interpolate values into a JSON template string; queue-commit.sh's python3-heredoc pattern is the model. Stay stdlib-only — the repo's python scripts take no pip dependencies (see validate-plugin.py's explicit zero-dependency comments).
- **The vocabulary is forever:** type names chosen in events.md bind T36, T37, AND every future dashboard release under additive-only rules. Name events after what happened (`task-status`, `commit-queued`), never after a skill's internal step numbering, which can change.
- **Never fail the session posture:** callers run under `set -euo pipefail` in per-sub-task commit paths; a non-zero exit here fails a chain mid-batch. Exit 0 is not a nicety — it is the contract.
