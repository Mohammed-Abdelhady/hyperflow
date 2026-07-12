# events.ndjson — Public Event Contract (ADR)

Append-only machine-readable event stream for sequence capture. Markdown artefacts capture **state**; this file captures **sequence** (Mission Control live feed, Chain Replay, token analytics). Public cross-repo contract — hardest to reverse.

**Path:** `<project-root>/.hyperflow/events.ndjson`  
**Writer:** `scripts/emit-event.sh`  
**Shape:** one JSON object per line, append-only, crash-safe (a torn final line is skipped by readers, never corrupts history).

---

## 1. Purpose

One file, one JSON object per line. Emitters append; the dashboard (and any future consumer) tails. When the file is absent — older plugin versions, non-hyperflow projects, events never written — consumers degrade to markdown-artefact-derived state only (reduced timeline fidelity, no replay). That degradation path is fully supported.

---

## 2. Line schema

Matches `dashboard/src/shared/schemas/event-line.ts` (v:1) field-for-field.

| Field    | Type    | Required | Meaning |
|----------|---------|----------|---------|
| `v`      | number (literal `1`) | required | Schema generation. Filled by the helper. |
| `ts`     | string  | required | UTC ISO-8601 timestamp (`YYYY-MM-DDTHH:MM:SSZ`). Filled by the helper. |
| `chain`  | string  | required | Chain id the event belongs to. |
| `skill`  | string  | required | Emitting skill or surface (`dispatch`, `background`, …). |
| `type`   | string  | required | Event vocabulary name (see §6). Unknown types are displayable-raw. |
| `batch`  | string  | optional | Batch id / number as string (e.g. `"2"`). |
| `task`   | string  | optional | Task id (e.g. `"T7"`). |
| `status` | string  | optional | Status label after the transition (e.g. `"done"`). |
| `agent`  | string  | optional | Agent id or role (e.g. `"implementer"`, `"bg-1718049600-…"`). |
| `tokens` | number  | optional | Token count associated with the event. JSON number, not string. |
| `detail` | unknown | optional | Free-form detail (commit message head, prune count, prose). Arbitrary JSON value. |

Example line:

```json
{"v":1,"ts":"2026-07-12T14:03:11Z","chain":"chain-1752329000","skill":"dispatch","type":"task-status","batch":"2","task":"T7","status":"done","agent":"implementer","tokens":18400}
```

---

## 3. `v`-gate rule

- `v` marks the schema generation.
- Readers **gate** on `v`:
  - `v === 1` → validate against the v1 field table (unknown *extra* fields tolerated / passthrough).
  - unknown or missing `v` → treat as an **opaque raw event** (best-effort known-field mapping for display ordering). **Never an error.**
- Writers always emit `v: 1` until a future ADR introduces a new generation.

---

## 4. Additive-only evolution rules

1. **New event `type`s** are allowed without a generation bump.
2. **New OPTIONAL fields** are allowed without a generation bump.
3. **Never** remove, rename, or retype an existing field.
4. **Never** make an optional field required.
5. **Every schema change lands in this file first** (ADR-gated) before any writer or reader ships the change.
6. Readers must ignore unknown fields and unknown types (displayable-raw).

---

## 5. Emit touchpoints

| # | Surface | When |
|---|---------|------|
| E1 | `skills/dispatch/SKILL.md` Step 2d | After each task-file `## Status` block / checkbox write |
| E2 | `skills/background/SKILL.md` + registry maintainers | Background registry writes: launch, completion, cancel, prune |
| E3 | `scripts/queue-commit.sh` | After each successfully queued deferred commit |

These three are the v1 emitters. Additional emitters require an update to this ADR.

---

## 6. Initial `type` vocabulary

| Type | Emitted by | Meaning |
|------|------------|---------|
| `task-status` | dispatch Step 2d | Task/status block updated after a sub-task commit |
| `commit-queued` | `queue-commit.sh` | A deferred commit was recorded on the staging branch |
| `bg-launch` | skill that registers a `run_in_background` dispatch | Background agent registered as running |
| `bg-complete` | skill that flips registry status on collection | Background agent completed |
| `bg-cancel` | `/hyperflow:background cancel` | Background agent cancelled |
| `bg-prune` | `/hyperflow:background prune` | Stale buffers / registry entries pruned |

T36/T37 (and any core emitter) use these names **verbatim**. The dashboard treats unknown types as displayable-raw, never as errors.

---

## 7. Emitter rules

1. **One O_APPEND write per event** — build the complete line (compact JSON + `\n`) first, then write once. No pretty-printing, no multi-write JSON+newline pairs (interleaving risk under concurrent emitters).
2. **Silent no-op without `.hyperflow/`** — if `<project-root>/.hyperflow/` is not a directory: exit 0, print nothing, create nothing. Never `mkdir`.
3. **Exit 0 always** — valid emit, missing root, bad args, unwritable target, missing python3. Emission may never fail or slow a caller. Callers under `set -e` must still treat a missing helper as a no-op (`[ -f emit-event.sh ] && bash … || true`).
4. **Helper invocation:**
   ```bash
   bash scripts/emit-event.sh <project-root> <chain-id> <skill> <type> [key=value ...]
   ```
   Optional keys: `batch=`, `task=`, `status=`, `agent=`, `tokens=`, `detail=`. Unknown keys are dropped. `tokens` serializes as a JSON number; other optionals as strings (`detail` remains a string from `key=value` form).
5. **No required behavior for old plugins** — absence of `scripts/emit-event.sh` is a silent no-op at every hook point.

---

## 8. Consumer rules

1. **Tolerant reader** — unknown fields ignored; unknown types displayable-raw; never throw on a single bad line.
2. **Torn trailing line** — hold a partial final line across reads; skip until a complete newline-terminated line arrives. Never attempt writer-side repair.
3. **Absence of the file** → markdown-only fidelity (Status blocks + checkbox flips). Supported degradation, not an error.
4. **File shrink below a stored offset** → re-read from zero and rebuild indexes (rotation / truncation detection).
5. **`v` gate** — as §3; opaque raw for unknown generations.

---

## Invocation reference

```bash
# After a status-block write (dispatch Step 2d)
bash "$PLUGIN_ROOT/scripts/emit-event.sh" \
  "$PROJECT_ROOT" "$CHAIN_ID" dispatch task-status \
  batch=2 task=T7 status=done agent=implementer tokens=18400

# After queue-commit success
bash "$SCRIPT_DIR/emit-event.sh" \
  "$PROJECT_ROOT" "$CHAIN_ID" dispatch commit-queued \
  detail="abc1234 feat: add emit helper"

# Background cancel
bash "$PLUGIN_ROOT/scripts/emit-event.sh" \
  "$PROJECT_ROOT" "$CHAIN_ID" background bg-cancel \
  agent=bg-1718049600-quality-gates-b2
```
