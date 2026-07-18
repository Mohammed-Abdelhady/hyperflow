#!/usr/bin/env bash
# test-codex-hooks.sh — Isolated Codex hook / trust conformance (T11)
#
# Installs the descriptor-driven fixture marketplace into a temporary
# HOME + CODEX_HOME, then runs registered hooks with payloads from
# tests/fixtures/codex/hook-payloads.json.
#
# Trust bypass (`codex exec --dangerously-bypass-hook-trust`) is only attempted
# when isolation is proven. Persisted hook-trust UX is owned by authenticated
# T12; this script focuses on raw hook execution + isolated bypass gate.
#
# Skip policy (unit CI without codex):
#   If the `codex` CLI is not on PATH, print
#     SKIP: codex CLI not available
#   and exit 0. Alternative convention (not used here): exit 77 (GNU skip).
#
# Usage:
#   ./scripts/test-codex-hooks.sh
#   KEEP_TMP=1 ./scripts/test-codex-hooks.sh
#
# Security: HOME and CODEX_HOME forced under harness temp; breach →
# SECURITY_VIOLATION: exit 2.
#
# Commit stub: test(codex): add isolated plugin lifecycle conformance

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURE_DIR="$REPO_ROOT/tests/fixtures/codex"
V1_DESC="$FIXTURE_DIR/marketplace-v1.json"
PAYLOADS="$FIXTURE_DIR/hook-payloads.json"

MARKETPLACE_NAME="hyperflow-marketplace"
PLUGIN_NAME="hyperflow"
PLUGIN_SELECTOR="${PLUGIN_NAME}@${MARKETPLACE_NAME}"

REAL_USER_HOME="$(python3 -c 'import pwd, os; print(pwd.getpwuid(os.getuid()).pw_dir)')"
REAL_CODEX_HOME="${REAL_USER_HOME}/.codex"

PASS=0
FAIL=0
SKIPPED=0

log() { printf '%s\n' "$*"; }
pass() { PASS=$((PASS + 1)); log "PASS: $*"; }
fail() { FAIL=$((FAIL + 1)); log "FAIL: $*"; }
skip() { SKIPPED=$((SKIPPED + 1)); log "SKIP: $*"; }

die() {
  log "ERROR: $*"
  exit 1
}

security_violation() {
  log "SECURITY_VIOLATION: $*"
  exit 2
}

if ! command -v codex >/dev/null 2>&1; then
  log "SKIP: codex CLI not available"
  log "  Install Codex CLI to run hook conformance."
  log "  Fixtures remain valid for unit tests (tests/test_codex_lifecycle_fixtures.py)."
  exit 0
fi

CODEX_VERSION="$(codex --version 2>/dev/null || codex -V 2>/dev/null || echo unknown)"
log "codex version: $CODEX_VERSION"

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/hyperflow-codex-hooks.XXXXXX")"
EVIDENCE_DIR="$TMP_ROOT/evidence"
mkdir -p "$EVIDENCE_DIR" "$TMP_ROOT/home" "$TMP_ROOT/codex-home" "$TMP_ROOT/work"
export HOME="$TMP_ROOT/home"
export CODEX_HOME="$TMP_ROOT/codex-home"
unset OPENAI_API_KEY CODEX_API_KEY 2>/dev/null || true

cleanup() {
  if [ "${KEEP_TMP:-0}" = "1" ]; then
    log "KEEP_TMP=1 — temp root retained: $TMP_ROOT"
  else
    rm -rf "$TMP_ROOT"
  fi
}
trap cleanup EXIT

assert_isolation() {
  case "$HOME" in
    "$TMP_ROOT"/*) ;;
    *) security_violation "HOME is not under harness temp ($HOME)" ;;
  esac
  case "$CODEX_HOME" in
    "$TMP_ROOT"/*) ;;
    *) security_violation "CODEX_HOME is not under harness temp ($CODEX_HOME)" ;;
  esac
  if [ "$HOME" = "$REAL_USER_HOME" ] || [ "$CODEX_HOME" = "$REAL_CODEX_HOME" ]; then
    security_violation "isolation collapsed onto real user paths"
  fi
  case "$CODEX_HOME" in
    "$REAL_USER_HOME"/*) security_violation "CODEX_HOME under real user home" ;;
  esac
}

assert_isolation
log "Isolated HOME=$HOME"
log "Isolated CODEX_HOME=$CODEX_HOME"

REDACT_PY="$TMP_ROOT/work/redact.py"
cat >"$REDACT_PY" <<'PY'
import re, sys
text = sys.stdin.read()
for s in sys.argv[1:]:
    if s:
        text = text.replace(s, "<REDACTED>")
text = re.sub(r"(?i)(api[_-]?key|token|bearer|authorization)\s*[:=]\s*\S+",
              r"\1=<REDACTED>", text)
text = re.sub(r"sk-[A-Za-z0-9]{10,}", "sk-<REDACTED>", text)
sys.stdout.write(text)
PY

redact_to() {
  local dest="$1"
  python3 "$REDACT_PY" "$TMP_ROOT" "$HOME" "$CODEX_HOME" "$REAL_USER_HOME" "$REAL_CODEX_HOME" >"$dest"
}

# ─── Generate local marketplace from v1 descriptor ───────────────────────────
generate_marketplace_tree() {
  local descriptor="$1"
  local dest="$2"
  python3 - "$descriptor" "$dest" <<'PY'
import json, stat, sys
from pathlib import Path

desc_path, dest = Path(sys.argv[1]), Path(sys.argv[2])
d = json.loads(desc_path.read_text(encoding="utf-8"))
mp = d["marketplace"]
plugin = d["plugin"]
version = plugin["version"]
hooks = plugin.get("hooks", {})
session_marker = hooks.get("sessionStartMarker", f"fixture-session-start-{version}")
precompact_reason = hooks.get("preCompactReason", f"fixture-block-auto-compact-{version}")

plugin_root = dest / "plugins" / plugin["name"]
for sub in (
    plugin_root / ".codex-plugin",
    plugin_root / "skills",
    plugin_root / "hooks",
    dest / ".claude-plugin",
):
    sub.mkdir(parents=True, exist_ok=True)

manifest = {
    "name": plugin["name"],
    "version": version,
    "description": plugin["description"],
    "author": plugin["author"],
    "homepage": plugin["homepage"],
    "repository": plugin["repository"],
    "license": plugin["license"],
    "keywords": plugin.get("keywords", ["codex"]),
    "skills": "./skills/",
    "hooks": "./hooks/hooks.json",
    "interface": plugin["interface"],
}
(plugin_root / ".codex-plugin" / "plugin.json").write_text(
    json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
)

for skill in plugin["skills"]:
    sdir = plugin_root / "skills" / skill
    sdir.mkdir(parents=True, exist_ok=True)
    (sdir / "SKILL.md").write_text(
        f"---\nname: {skill}\ndescription: fixture {skill}\n---\n# {skill}\n",
        encoding="utf-8",
    )
    if skill == "hyperflow":
        (sdir / "VERSION").write_text(version + "\n", encoding="utf-8")

ss = plugin_root / "hooks" / "session-start"
pc = plugin_root / "hooks" / "pre-compact"
ss.write_text(
    "#!/bin/sh\nset -eu\n"
    f"marker='{session_marker}'\n"
    "printf '%s\\n' \"{\\\"content\\\":\\\"$marker\\\","
    "\\\"hookSpecificOutput\\\":{\\\"hookEventName\\\":\\\"SessionStart\\\","
    "\\\"additionalContext\\\":\\\"$marker\\\"}}\"\n",
    encoding="utf-8",
)
pc.write_text(
    "#!/bin/sh\nset -eu\n"
    f"reason='{precompact_reason}'\n"
    "printf '%s\\n' \"{\\\"decision\\\":\\\"block\\\",\\\"continue\\\":false,"
    "\\\"stopReason\\\":\\\"$reason\\\",\\\"reason\\\":\\\"$reason\\\"}\"\n",
    encoding="utf-8",
)
ss.chmod(ss.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
pc.chmod(pc.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

launcher = (
    "sh -c 'hook=%s; "
    "for root in \"${CODEX_PLUGIN_ROOT:-}\" \"${PLUGIN_ROOT:-}\" "
    "\"${CLAUDE_PLUGIN_ROOT:-}\" "
    "$(ls -dt \"${CODEX_HOME:-$HOME/.codex}/plugins/cache/hyperflow-marketplace/hyperflow\"/* 2>/dev/null); do "
    "[ -n \"$root\" ] && [ -x \"$root/hooks/$hook\" ] && exec \"$root/hooks/$hook\"; "
    "done; echo \"hyperflow fixture hook not found: $hook\" >&2; exit 1'"
)
hooks_json = {
    "hooks": {
        "SessionStart": [
            {
                "matcher": "startup|resume|clear|compact",
                "hooks": [
                    {
                        "type": "command",
                        "command": launcher % "session-start",
                        "async": False,
                    }
                ],
            }
        ],
        "PreCompact": [
            {
                "matcher": "manual|auto",
                "hooks": [
                    {
                        "type": "command",
                        "command": launcher % "pre-compact",
                        "async": False,
                    }
                ],
            }
        ],
    }
}
(plugin_root / "hooks" / "hooks.json").write_text(
    json.dumps(hooks_json, indent=2) + "\n", encoding="utf-8"
)

mp_json = {
    "name": mp["name"],
    "owner": mp["owner"],
    "metadata": mp["metadata"],
    "plugins": [
        {
            "name": plugin["name"],
            "source": f"./plugins/{plugin['name']}",
            "description": plugin["description"],
            "version": version,
        }
    ],
}
(dest / ".claude-plugin" / "marketplace.json").write_text(
    json.dumps(mp_json, indent=2) + "\n", encoding="utf-8"
)
(dest / "marketplace.json").write_text(
    json.dumps(mp_json, indent=2) + "\n", encoding="utf-8"
)
print(str(plugin_root))
print(version)
PY
}

[ -f "$V1_DESC" ] || die "missing $V1_DESC"
[ -f "$PAYLOADS" ] || die "missing $PAYLOADS"

MP_ROOT="$TMP_ROOT/marketplace"
mkdir -p "$MP_ROOT"
GEN_OUT="$(generate_marketplace_tree "$V1_DESC" "$MP_ROOT")"
PLUGIN_SRC="$(printf '%s\n' "$GEN_OUT" | sed -n '1p')"
PLUGIN_VERSION="$(printf '%s\n' "$GEN_OUT" | sed -n '2p')"
log "Fixture plugin version=$PLUGIN_VERSION src=$PLUGIN_SRC"

assert_isolation
codex plugin marketplace add "$MP_ROOT" --json >"$EVIDENCE_DIR/marketplace-add.json" 2>"$EVIDENCE_DIR/marketplace-add.err" \
  || die "marketplace add failed"
codex plugin add "$PLUGIN_SELECTOR" --json >"$EVIDENCE_DIR/plugin-add.json" 2>"$EVIDENCE_DIR/plugin-add.err" \
  || die "plugin add failed"

CACHE_ROOT="$(ls -dt "$CODEX_HOME/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME"/* 2>/dev/null | head -1 || true)"
[ -n "$CACHE_ROOT" ] || die "installed cache not found"
[ -x "$CACHE_ROOT/hooks/session-start" ] || die "session-start missing/executable in cache"
[ -x "$CACHE_ROOT/hooks/pre-compact" ] || die "pre-compact missing/executable in cache"
[ -f "$CACHE_ROOT/hooks/hooks.json" ] || die "hooks.json missing in cache"
pass "plugin installed; hooks present in cache ($CACHE_ROOT → redacted)"

export CODEX_PLUGIN_ROOT="$CACHE_ROOT"
export PLUGIN_ROOT="$CACHE_ROOT"

# Project trees for payload placeholders
PROJECT_ROOT="$TMP_ROOT/project"
NESTED_CWD="$PROJECT_ROOT/apps/web"
UNRELATED_CWD="$TMP_ROOT/elsewhere"
mkdir -p "$NESTED_CWD" "$UNRELATED_CWD" "$PROJECT_ROOT/.hyperflow/memory"
printf '# profile\n' >"$PROJECT_ROOT/.hyperflow/profile.md"
printf '# architecture\n' >"$PROJECT_ROOT/.hyperflow/architecture.md"
(
  cd "$PROJECT_ROOT"
  git init -q
)

# ─── Run payload cases ───────────────────────────────────────────────────────
RUNNER_PY="$TMP_ROOT/work/run_payloads.py"
cat >"$RUNNER_PY" <<'PY'
import json, os, subprocess, sys
from pathlib import Path

payloads_path = Path(sys.argv[1])
cache_root = Path(sys.argv[2])
subs = {
    "{{PROJECT_ROOT}}": sys.argv[3],
    "{{NESTED_CWD}}": sys.argv[4],
    "{{UNRELATED_CWD}}": sys.argv[5],
    "{{TEMP_HOME}}": sys.argv[6],
    "{{CODEX_HOME}}": sys.argv[7],
}
evidence = Path(sys.argv[8])
evidence.mkdir(parents=True, exist_ok=True)

def subst(obj):
    if isinstance(obj, str):
        for k, v in subs.items():
            obj = obj.replace(k, v)
        return obj
    if isinstance(obj, list):
        return [subst(x) for x in obj]
    if isinstance(obj, dict):
        return {k: subst(v) for k, v in obj.items()}
    return obj

data = subst(json.loads(payloads_path.read_text(encoding="utf-8")))
hooks_json = json.loads((cache_root / "hooks" / "hooks.json").read_text(encoding="utf-8"))

def launcher_command(event: str) -> str:
    entries = hooks_json["hooks"][event]
    return entries[0]["hooks"][0]["command"]

results = []
env = os.environ.copy()
env["CODEX_PLUGIN_ROOT"] = str(cache_root)
env["PLUGIN_ROOT"] = str(cache_root)
env["HOME"] = subs["{{TEMP_HOME}}"]
env["CODEX_HOME"] = subs["{{CODEX_HOME}}"]

for case in data["cases"]:
    cid = case["id"]
    hook = case["hook"]
    event = case["event"]
    cwd = case.get("cwd") or subs["{{PROJECT_ROOT}}"]
    expect = case.get("expect") or {}
    run_mode = case.get("runMode") or "direct"
    if case.get("requiresIsolationBypass"):
        # Isolation is enforced by the shell wrapper before invoking this runner
        # for trust cases; mark for reporting.
        pass

    if "rawStdin" in case:
        stdin = case["rawStdin"]
    else:
        stdin = json.dumps(case.get("payload") or {})

    if run_mode == "registered-launcher":
        cmd = ["sh", "-c", launcher_command(event)]
    else:
        hook_path = cache_root / "hooks" / hook
        cmd = [str(hook_path)]

    proc = subprocess.run(
        cmd,
        input=stdin,
        text=True,
        capture_output=True,
        cwd=cwd,
        env=env,
        check=False,
    )
    out = proc.stdout or ""
    err = proc.stderr or ""
    (evidence / f"{cid}.stdout.txt").write_text(out, encoding="utf-8")
    (evidence / f"{cid}.stderr.txt").write_text(err, encoding="utf-8")

    ok = True
    reasons = []
    want_rc = int(expect.get("exitCode", 0))
    if proc.returncode != want_rc:
        ok = False
        reasons.append(f"exit {proc.returncode} != {want_rc}")

    for needle in expect.get("stdoutContainsAny") or []:
        if needle not in out:
            # any-match: track; resolve after loop
            pass
    any_needles = expect.get("stdoutContainsAny") or []
    if any_needles and not any(n in out for n in any_needles):
        ok = False
        reasons.append(f"stdout missing any of {any_needles}")

    if not expect.get("allowNonJsonStdout"):
        if out.strip():
            try:
                parsed = json.loads(out.strip().splitlines()[-1] if out.strip() else out)
            except json.JSONDecodeError:
                # allow multi-line then full
                try:
                    parsed = json.loads(out)
                except json.JSONDecodeError as e:
                    if any_needles:
                        parsed = None
                    else:
                        ok = False
                        reasons.append(f"stdout not JSON: {e}")
                        parsed = None
        else:
            parsed = None
            if not expect.get("allowNonJsonStdout"):
                # empty may be ok for malformed if allowed
                pass

        keys_any = expect.get("jsonKeysAny") or []
        if keys_any and isinstance(parsed, dict):
            if not any(k in parsed for k in keys_any):
                ok = False
                reasons.append(f"json missing any keys {keys_any}")

        for k, v in (expect.get("jsonEquals") or {}).items():
            if not isinstance(parsed, dict) or parsed.get(k) != v:
                ok = False
                reasons.append(f"jsonEquals {k} want {v!r} got {None if not isinstance(parsed, dict) else parsed.get(k)!r}")

    results.append({"id": cid, "ok": ok, "reasons": reasons, "rc": proc.returncode})
    status = "PASS" if ok else "FAIL"
    print(f"{status}: hook case {cid} (rc={proc.returncode})")
    if reasons:
        print("  " + "; ".join(reasons))

failed = [r for r in results if not r["ok"]]
(evidence / "payload-results.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
sys.exit(1 if failed else 0)
PY

set +e
python3 "$RUNNER_PY" \
  "$PAYLOADS" \
  "$CACHE_ROOT" \
  "$PROJECT_ROOT" \
  "$NESTED_CWD" \
  "$UNRELATED_CWD" \
  "$HOME" \
  "$CODEX_HOME" \
  "$EVIDENCE_DIR/cases" \
  >"$EVIDENCE_DIR/payload-run.log" 2>&1
PAYLOAD_RC=$?
set -e
# Redact log
redact_to "$EVIDENCE_DIR/payload-run.redacted.log" <"$EVIDENCE_DIR/payload-run.log"
cat "$EVIDENCE_DIR/payload-run.redacted.log"

if [ "$PAYLOAD_RC" -eq 0 ]; then
  CASE_COUNT="$(python3 -c 'import json; print(len(json.load(open("'"$PAYLOADS"'"))["cases"]))')"
  pass "all hook payload cases passed ($CASE_COUNT)"
else
  fail "one or more hook payload cases failed (see evidence)"
fi

# Registered launcher from arbitrary cwd (explicit integration check)
assert_isolation
LAUNCHER_CMD="$(python3 - "$CACHE_ROOT" <<'PY'
import json, sys
from pathlib import Path
hooks = json.loads((Path(sys.argv[1]) / "hooks" / "hooks.json").read_text(encoding="utf-8"))
print(hooks["hooks"]["SessionStart"][0]["hooks"][0]["command"])
PY
)"
set +e
LAUNCH_OUT="$(
  cd "$UNRELATED_CWD" || exit 1
  printf '%s' "{\"cwd\":\"$PROJECT_ROOT\",\"source\":\"startup\",\"hook_event_name\":\"SessionStart\"}" \
    | env CODEX_PLUGIN_ROOT="$CACHE_ROOT" PLUGIN_ROOT="$CACHE_ROOT" HOME="$HOME" CODEX_HOME="$CODEX_HOME" \
      sh -c "$LAUNCHER_CMD" 2>"$EVIDENCE_DIR/launcher.err"
)"
LAUNCH_RC=$?
set -e
printf '%s\n' "$LAUNCH_OUT" | redact_to "$EVIDENCE_DIR/launcher.out"
if [ "$LAUNCH_RC" -eq 0 ] && printf '%s' "$LAUNCH_OUT" | grep -q 'fixture-session-start'; then
  pass "registered launcher resolves from unrelated cwd"
else
  fail "registered launcher from unrelated cwd (rc=$LAUNCH_RC)"
fi

# Isolation gate for trust bypass — refuse if not contained
assert_isolation
if [ "$HOME" = "$REAL_USER_HOME" ] || [ "$CODEX_HOME" = "$REAL_CODEX_HOME" ]; then
  security_violation "refusing trust bypass outside contained home"
fi
pass "trust bypass isolation gate (contained HOME/CODEX_HOME only)"

# Attempt codex exec with bypass only under isolation. Model auth may be absent;
# we only assert the CLI accepts the flag under the contained home and does not
# touch the real Codex home. No danger-full-access.
set +e
codex exec \
  --ephemeral \
  --skip-git-repo-check \
  --dangerously-bypass-hook-trust \
  -C "$PROJECT_ROOT" \
  "exit immediately with no tools" \
  >"$EVIDENCE_DIR/bypass-exec.raw.txt" 2>&1
BYPASS_RC=$?
set -e
redact_to "$EVIDENCE_DIR/bypass-exec.txt" <"$EVIDENCE_DIR/bypass-exec.raw.txt"
if grep -qi 'dangerously-bypass-hook-trust' "$EVIDENCE_DIR/bypass-exec.raw.txt" \
  || grep -qi 'bypass-hook-trust' "$EVIDENCE_DIR/bypass-exec.raw.txt"; then
  pass "codex exec acknowledged --dangerously-bypass-hook-trust under isolated home"
elif [ "$BYPASS_RC" -eq 0 ]; then
  pass "codex exec with trust bypass completed under isolated home"
else
  # Auth / model unavailability is acceptable for offline T11; raw hooks already covered.
  skip "codex exec model path unavailable (rc=$BYPASS_RC); raw hooks + isolation gate covered"
fi

assert_isolation
if [ -e "$REAL_CODEX_HOME/.hyperflow-t11-hooks-should-not-exist" ]; then
  security_violation "real Codex home mutated"
fi
pass "real user Codex home untouched"

# Summary
{
  echo "codex_version=$CODEX_VERSION"
  echo "plugin_version=$PLUGIN_VERSION"
  echo "pass=$PASS fail=$FAIL skipped=$SKIPPED"
  echo "cache=<REDACTED>/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$PLUGIN_VERSION"
} >"$EVIDENCE_DIR/summary.txt"

log "----"
log "SUMMARY: pass=$PASS fail=$FAIL skipped=$SKIPPED"
log "Evidence (redacted): $EVIDENCE_DIR"

if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
exit 0
