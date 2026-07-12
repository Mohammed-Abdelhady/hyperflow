#!/usr/bin/env bash
# emit-event.sh — append one O_APPEND NDJSON event line to .hyperflow/events.ndjson.
#
# Public contract: skills/hyperflow/events.md
#
# Usage:
#   emit-event.sh <project-root> <chain-id> <skill> <type> [key=value ...]
#
# Optional key=value pairs (unknown keys dropped silently):
#   batch, task, status, agent, tokens, detail
#   tokens → JSON number; batch/task/status/agent/detail → strings
#   (batch is a string on the wire — matches dashboard event-line schema)
#
# NEVER-FAIL CONTRACT (deliberate deviation from repo set -e convention):
#   This helper always exits 0. Callers run under set -euo pipefail on
#   commit paths; a non-zero exit here would fail a live chain mid-batch.
#   Missing .hyperflow/, bad args, missing python3, unwritable target —
#   all exit 0 with no stdout/stderr and no side effects beyond a best-
#   effort single append when possible.
#
# Silent no-op when <project-root>/.hyperflow/ is not a directory.
# Never creates .hyperflow/. Never mkdir.

# No set -e — never-fail contract.
set +e

if [ "$#" -lt 4 ]; then
  exit 0
fi

PROJECT_ROOT="$1"
CHAIN_ID="$2"
SKILL="$3"
TYPE="$4"
shift 4

HYPERFLOW_DIR="$PROJECT_ROOT/.hyperflow"
if [ ! -d "$HYPERFLOW_DIR" ]; then
  exit 0
fi

EVENTS_FILE="$HYPERFLOW_DIR/events.ndjson"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)" || exit 0

python3 - "$EVENTS_FILE" "$TS" "$CHAIN_ID" "$SKILL" "$TYPE" "$@" <<'PY' 2>/dev/null || exit 0
import json
import sys

ALLOWED = frozenset({"batch", "task", "status", "agent", "tokens", "detail"})
NUMBER_KEYS = frozenset({"tokens"})

if len(sys.argv) < 6:
    sys.exit(0)

path, ts, chain, skill, typ = sys.argv[1:6]
event = {
    "v": 1,
    "ts": ts,
    "chain": chain,
    "skill": skill,
    "type": typ,
}

for pair in sys.argv[6:]:
    if "=" not in pair:
        continue
    key, _, raw = pair.partition("=")
    if key not in ALLOWED:
        continue
    if key in NUMBER_KEYS:
        try:
            if raw.strip() == "":
                continue
            num = float(raw)
            event[key] = int(num) if num.is_integer() else num
        except ValueError:
            continue
    else:
        event[key] = raw

line = json.dumps(event, separators=(",", ":"), ensure_ascii=False) + "\n"
# Single O_APPEND write of the complete newline-terminated line
try:
    with open(path, "a", encoding="utf-8") as f:
        f.write(line)
except OSError:
    pass
sys.exit(0)
PY

exit 0
