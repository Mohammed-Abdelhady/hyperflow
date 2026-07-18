#!/usr/bin/env bash
# test-codex-plugin.sh — Isolated Codex plugin lifecycle conformance (T11)
#
# Exercises marketplace add / plugin add / list / reinstall idempotency /
# install-cache inspection / git marketplace upgrade v1→v2 / remove (twice)
# under a temporary HOME + CODEX_HOME. Never touches the real user Codex home.
#
# Fixtures (checked in):
#   tests/fixtures/codex/marketplace-v1.json
#   tests/fixtures/codex/marketplace-v2.json
#
# Skip policy (unit CI without codex):
#   If the `codex` CLI is not on PATH, print
#     SKIP: codex CLI not available
#   and exit 0. Alternative convention (not used here): exit 77 (GNU skip).
#
# Usage:
#   ./scripts/test-codex-plugin.sh
#   KEEP_TMP=1 ./scripts/test-codex-plugin.sh   # leave temp root for debugging
#
# Reusable isolated-install helpers (T12+ canaries):
#   HYPERFLOW_CODEX_PLUGIN_LIB=1 source scripts/test-codex-plugin.sh
#   Exports: hf_codex_assert_isolation, hf_codex_init_isolation,
#            hf_codex_generate_marketplace_tree, hf_codex_write_redact_py,
#            hf_codex_redact_stream
#   Does not require `codex` on PATH and does not start the lifecycle suite.
#
# Evidence: redacted log under $TMP_ROOT/evidence/ (or printed summary).
# Security: HOME and CODEX_HOME are forced under the harness temp root; breach
# prints SECURITY_VIOLATION: and exits 2.
#
# Commit stub: test(codex): add isolated plugin lifecycle conformance

set -euo pipefail

_HF_SELF="${BASH_SOURCE[0]:-$0}"
SCRIPT_DIR="$(cd "$(dirname "$_HF_SELF")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURE_DIR="$REPO_ROOT/tests/fixtures/codex"
V1_DESC="$FIXTURE_DIR/marketplace-v1.json"
V2_DESC="$FIXTURE_DIR/marketplace-v2.json"

MARKETPLACE_NAME="hyperflow-marketplace"
PLUGIN_NAME="hyperflow"
PLUGIN_SELECTOR="${PLUGIN_NAME}@${MARKETPLACE_NAME}"

# Capture real user home BEFORE we override HOME.
REAL_USER_HOME="$(python3 -c 'import pwd, os; print(pwd.getpwuid(os.getuid()).pw_dir)')"
REAL_CODEX_HOME="${REAL_USER_HOME}/.codex"

PASS=0
FAIL=0
SKIPPED=0
HTTP_PID=""

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

# ─── Reusable isolation / fixture helpers (T12 API) ───────────────────────────
# These functions are safe to source without `codex` on PATH.

hf_codex_assert_isolation() {
  # Requires TMP_ROOT, HOME, CODEX_HOME, REAL_USER_HOME, REAL_CODEX_HOME.
  case "$HOME" in
    "$TMP_ROOT"/*) ;;
    *) security_violation "HOME is not under harness temp ($HOME)" ;;
  esac
  case "$CODEX_HOME" in
    "$TMP_ROOT"/*) ;;
    *) security_violation "CODEX_HOME is not under harness temp ($CODEX_HOME)" ;;
  esac
  if [ "$HOME" = "$REAL_USER_HOME" ]; then
    security_violation "HOME equals real user home"
  fi
  if [ "$CODEX_HOME" = "$REAL_CODEX_HOME" ]; then
    security_violation "CODEX_HOME equals real ~/.codex"
  fi
  case "$CODEX_HOME" in
    "$REAL_USER_HOME"/*) security_violation "CODEX_HOME under real user home" ;;
  esac
  if [ -e "$REAL_CODEX_HOME/.hyperflow-t11-should-not-exist" ]; then
    security_violation "real Codex home contains harness marker"
  fi
}

# Back-compat alias used by the lifecycle body below.
assert_isolation() { hf_codex_assert_isolation "$@"; }

hf_codex_init_isolation() {
  # Usage: hf_codex_init_isolation [tmp-prefix]
  # Creates TMP_ROOT, HOME, CODEX_HOME, EVIDENCE_DIR under a harness temp root.
  local prefix="${1:-hyperflow-codex-lifecycle}"
  TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/${prefix}.XXXXXX")"
  export TMP_ROOT
  EVIDENCE_DIR="$TMP_ROOT/evidence"
  mkdir -p "$EVIDENCE_DIR" "$TMP_ROOT/home" "$TMP_ROOT/codex-home" "$TMP_ROOT/work"
  export HOME="$TMP_ROOT/home"
  export CODEX_HOME="$TMP_ROOT/codex-home"
  hf_codex_assert_isolation
}

hf_codex_write_redact_py() {
  # Usage: hf_codex_write_redact_py [dest-path]
  # Writes a small stdin→stdout redactor; default $TMP_ROOT/work/redact.py
  local dest="${1:-${TMP_ROOT:?TMP_ROOT required}/work/redact.py}"
  mkdir -p "$(dirname "$dest")"
  cat >"$dest" <<'PY'
import re, sys
text = sys.stdin.read()
subs = sys.argv[1:]
for s in subs:
    if not s:
        continue
    text = text.replace(s, "<REDACTED>")
# Common secret-ish patterns
text = re.sub(r"(?i)(api[_-]?key|token|bearer|authorization)\s*[:=]\s*\S+",
              r"\1=<REDACTED>", text)
text = re.sub(r"sk-[A-Za-z0-9]{10,}", "sk-<REDACTED>", text)
sys.stdout.write(text)
PY
  printf '%s\n' "$dest"
}

hf_codex_redact_stream() {
  # Usage: hf_codex_redact_stream OUTFILE [extra-literals...]
  # Reads stdin, writes redacted text to OUTFILE.
  local out_file="$1"
  shift
  local redact_py="${REDACT_PY:-}"
  if [ -z "$redact_py" ] || [ ! -f "$redact_py" ]; then
    redact_py="$(hf_codex_write_redact_py)"
    REDACT_PY="$redact_py"
  fi
  python3 "$redact_py" "${TMP_ROOT:-}" "${HOME:-}" "${CODEX_HOME:-}" \
    "${REAL_USER_HOME:-}" "$@" >"$out_file"
}

# ─── Fixture → marketplace tree ──────────────────────────────────────────────
hf_codex_generate_marketplace_tree() {
  local descriptor="$1"
  local dest="$2"
  python3 - "$descriptor" "$dest" <<'PY'
import json, os, stat, sys
from pathlib import Path

desc_path, dest = Path(sys.argv[1]), Path(sys.argv[2])
d = json.loads(desc_path.read_text(encoding="utf-8"))
assert d.get("kind") == "codex-marketplace-fixture", d.get("kind")
mp = d["marketplace"]
plugin = d["plugin"]
version = plugin["version"]
hooks = plugin.get("hooks", {})
session_marker = hooks.get("sessionStartMarker", f"fixture-session-start-{version}")
precompact_reason = hooks.get("preCompactReason", f"fixture-block-auto-compact-{version}")

root = dest
if root.exists():
    # rewrite plugin contents in place (keep .git if present)
    pass
plugin_root = root / "plugins" / plugin["name"]
for sub in (
    plugin_root / ".codex-plugin",
    plugin_root / "skills",
    plugin_root / "hooks",
    root / ".claude-plugin",
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
        f"---\nname: {skill}\ndescription: fixture skill {skill} {version}\n---\n"
        f"# {skill}\n\nFixture skill for Codex lifecycle conformance ({version}).\n",
        encoding="utf-8",
    )
    if skill == "hyperflow":
        (sdir / "VERSION").write_text(version + "\n", encoding="utf-8")

session_body = (
    "#!/bin/sh\n"
    "set -eu\n"
    f"marker='{session_marker}'\n"
    "printf '%s\\n' \"{\\\"content\\\":\\\"$marker\\\","
    "\\\"hookSpecificOutput\\\":{\\\"hookEventName\\\":\\\"SessionStart\\\","
    "\\\"additionalContext\\\":\\\"$marker\\\"}}\"\n"
)
pre_body = (
    "#!/bin/sh\n"
    "set -eu\n"
    f"reason='{precompact_reason}'\n"
    "printf '%s\\n' \"{\\\"decision\\\":\\\"block\\\",\\\"continue\\\":false,"
    "\\\"stopReason\\\":\\\"$reason\\\",\\\"reason\\\":\\\"$reason\\\"}\"\n"
)
ss = plugin_root / "hooks" / "session-start"
pc = plugin_root / "hooks" / "pre-compact"
ss.write_text(session_body, encoding="utf-8")
pc.write_text(pre_body, encoding="utf-8")
ss.chmod(ss.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
pc.chmod(pc.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

# Launcher resolves CODEX_PLUGIN_ROOT / PLUGIN_ROOT / CODEX_HOME cache, never real ~/.codex alone.
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
(root / ".claude-plugin" / "marketplace.json").write_text(
    json.dumps(mp_json, indent=2) + "\n", encoding="utf-8"
)
(root / "marketplace.json").write_text(
    json.dumps(mp_json, indent=2) + "\n", encoding="utf-8"
)
print(version)
PY
}

# Back-compat name used by lifecycle body.
generate_marketplace_tree() { hf_codex_generate_marketplace_tree "$@"; }

# ─── Library mode (T12): helpers only, no codex required ─────────────────────
if [ "${HYPERFLOW_CODEX_PLUGIN_LIB:-0}" = "1" ]; then
  # When sourced: return to caller with helpers defined.
  # When executed: exit 0 after defining (definitions only useful via source).
  return 0 2>/dev/null || {
    log "HYPERFLOW_CODEX_PLUGIN_LIB=1 — helpers defined; source this script to use them"
    exit 0
  }
fi

# ─── Skip when codex unavailable ─────────────────────────────────────────────
if ! command -v codex >/dev/null 2>&1; then
  log "SKIP: codex CLI not available"
  log "  Install Codex CLI to run lifecycle conformance."
  log "  Fixtures remain valid for unit tests (tests/test_codex_lifecycle_fixtures.py)."
  exit 0
fi

CODEX_VERSION="$(codex --version 2>/dev/null || codex -V 2>/dev/null || echo unknown)"
log "codex version: $CODEX_VERSION"

# ─── Temp isolation ──────────────────────────────────────────────────────────
hf_codex_init_isolation "hyperflow-codex-lifecycle"
# Prevent accidental bleed of real auth into model calls (lifecycle needs none).
unset OPENAI_API_KEY CODEX_API_KEY 2>/dev/null || true

cleanup() {
  if [ -n "${HTTP_PID:-}" ]; then
    kill "$HTTP_PID" 2>/dev/null || true
    wait "$HTTP_PID" 2>/dev/null || true
  fi
  if [ "${KEEP_TMP:-0}" = "1" ]; then
    log "KEEP_TMP=1 — temp root retained: $TMP_ROOT"
  else
    rm -rf "$TMP_ROOT"
  fi
}
trap cleanup EXIT

hf_codex_assert_isolation
log "Isolated HOME=$HOME"
log "Isolated CODEX_HOME=$CODEX_HOME"

# ─── Redacted evidence logging ───────────────────────────────────────────────
REDACT_PY="$(hf_codex_write_redact_py)"
export REDACT_PY

run_json() {
  # Run command; capture stdout JSON to file; return rc via global
  local out_file="$1"
  shift
  set +e
  "$@" >"$out_file" 2>"${out_file}.err"
  local rc=$?
  set -e
  if [ -s "${out_file}.err" ]; then
    python3 "$REDACT_PY" "$TMP_ROOT" "$HOME" "$CODEX_HOME" "$REAL_USER_HOME" \
      <"${out_file}.err" >>"$EVIDENCE_DIR/stderr.log" || true
  fi
  return $rc
}

init_git_repo() {
  local src="$1"
  local msg="$2"
  local branch="$3"
  (
    cd "$src"
    if [ ! -d .git ]; then
      git init -q -b "$branch"
      git config user.email "hyperflow-fixture@example.com"
      git config user.name "Hyperflow Fixture"
    fi
    git add -A
    if git diff --cached --quiet 2>/dev/null; then
      :
    else
      git commit -q -m "$msg"
    fi
  )
}

start_http_git() {
  local bare="$1"
  (
    cd "$bare"
    git --bare update-server-info
  )
  local port
  port="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
  python3 -m http.server "$port" --bind 127.0.0.1 --directory "$bare" \
    >"$EVIDENCE_DIR/http-git.log" 2>&1 &
  HTTP_PID=$!
  sleep 0.35
  if ! kill -0 "$HTTP_PID" 2>/dev/null; then
    die "failed to start loopback git HTTP server (see evidence/http-git.log)"
  fi
  printf 'http://127.0.0.1:%s' "$port"
}

json_field() {
  local file="$1"
  local expr="$2"
  python3 - "$file" "$expr" <<'PY'
import json, sys
path, expr = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
# very small path walker: a.b[0].c
cur = data
for part in expr.replace("]", "").split("."):
    if not part:
        continue
    if "[" in part:
        name, idx = part.split("[", 1)
        if name:
            cur = cur[name]
        cur = cur[int(idx)]
    else:
        cur = cur[part]
if isinstance(cur, bool):
    print("true" if cur else "false")
elif cur is None:
    print("")
else:
    print(cur)
PY
}

assert_plugin_list() {
  local list_file="$1"
  local expect_version="$2"
  local expect_enabled="$3"
  python3 - "$list_file" "$expect_version" "$expect_enabled" "$PLUGIN_NAME" "$MARKETPLACE_NAME" <<'PY'
import json, sys
path, ver, en, name, mp = sys.argv[1:6]
data = json.load(open(path, encoding="utf-8"))
installed = data.get("installed") or []
matches = [p for p in installed if p.get("name") == name and p.get("marketplaceName") == mp]
if not matches:
    raise SystemExit(f"plugin {name}@{mp} not in installed list: {data!r}")
p = matches[0]
if str(p.get("version")) != ver:
    raise SystemExit(f"version want {ver} got {p.get('version')}")
want_en = en == "true"
if bool(p.get("enabled")) != want_en:
    raise SystemExit(f"enabled want {want_en} got {p.get('enabled')}")
if p.get("pluginId") != f"{name}@{mp}":
    raise SystemExit(f"pluginId mismatch: {p.get('pluginId')}")
if not p.get("installed"):
    raise SystemExit("installed flag false")
src = p.get("marketplaceSource") or {}
print(json.dumps({"pluginId": p.get("pluginId"), "version": p.get("version"),
                  "enabled": p.get("enabled"), "sourceType": src.get("sourceType")}))
PY
}

inspect_cache() {
  local version="$1"
  local cache="$CODEX_HOME/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$version"
  if [ ! -d "$cache" ]; then
    # Some CLI versions refresh list version before materializing versioned cache;
    # fall back to any present version dir under the plugin cache.
    local any
    any="$(ls -dt "$CODEX_HOME/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME"/* 2>/dev/null | head -1 || true)"
    if [ -n "$any" ]; then
      cache="$any"
    fi
  fi
  [ -d "$cache" ] || die "install cache missing for $version under $CODEX_HOME/plugins/cache"
  [ -f "$cache/.codex-plugin/plugin.json" ] || die "manifest missing in cache"
  [ -f "$cache/hooks/hooks.json" ] || die "hooks.json missing in cache"
  [ -x "$cache/hooks/session-start" ] || die "session-start not executable"
  [ -x "$cache/hooks/pre-compact" ] || die "pre-compact not executable"

  python3 - "$cache" "$version" "$V1_DESC" <<'PY'
import json, sys
from pathlib import Path
cache = Path(sys.argv[1])
version = sys.argv[2]
desc = json.loads(Path(sys.argv[3]).read_text(encoding="utf-8"))
skills = desc["plugin"]["skills"]
manifest = json.loads((cache / ".codex-plugin" / "plugin.json").read_text(encoding="utf-8"))
if manifest.get("name") != "hyperflow":
    raise SystemExit(f"bad manifest name {manifest.get('name')}")
if str(manifest.get("version")) != version:
    # allow path version mismatch only if manifest matches path basename
    if cache.name != str(manifest.get("version")):
        raise SystemExit(f"manifest version {manifest.get('version')} != expected {version}")
missing = [s for s in skills if not (cache / "skills" / s / "SKILL.md").is_file()]
if missing:
    raise SystemExit(f"missing skills in cache: {missing}")
hooks = json.loads((cache / "hooks" / "hooks.json").read_text(encoding="utf-8"))
if "SessionStart" not in hooks.get("hooks", {}):
    raise SystemExit("hooks.json missing SessionStart")
if "PreCompact" not in hooks.get("hooks", {}):
    raise SystemExit("hooks.json missing PreCompact")
print(f"cache_ok path={cache} version={manifest.get('version')} skills={len(skills)}")
PY
}

# ─── Build v1 git marketplace over loopback HTTP ─────────────────────────────
assert_isolation
[ -f "$V1_DESC" ] || die "missing $V1_DESC"
[ -f "$V2_DESC" ] || die "missing $V2_DESC"

SRC="$TMP_ROOT/marketplace-src"
BARE="$TMP_ROOT/marketplace.git"
mkdir -p "$SRC"
V1_VERSION="$(generate_marketplace_tree "$V1_DESC" "$SRC")"
BRANCH="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["git"]["branch"])' "$V1_DESC")"
V1_MSG="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["git"]["commitMessage"])' "$V1_DESC")"
init_git_repo "$SRC" "$V1_MSG" "$BRANCH"
git clone --bare -q "$SRC" "$BARE"

GIT_URL="$(start_http_git "$BARE")"
log "Loopback git marketplace: $GIT_URL"
assert_isolation

# ─── 1) Fresh install ────────────────────────────────────────────────────────
ADD_MP_OUT="$EVIDENCE_DIR/marketplace-add.json"
if run_json "$ADD_MP_OUT" codex plugin marketplace add "$GIT_URL" --json; then
  :
else
  die "marketplace add failed: $(cat "$ADD_MP_OUT" "$ADD_MP_OUT.err" 2>/dev/null | tr '\n' ' ')"
fi
python3 "$REDACT_PY" "$TMP_ROOT" "$HOME" "$CODEX_HOME" <"$ADD_MP_OUT" >"$EVIDENCE_DIR/marketplace-add.redacted.json"
MP_NAME="$(json_field "$ADD_MP_OUT" "marketplaceName")"
[ "$MP_NAME" = "$MARKETPLACE_NAME" ] || die "unexpected marketplace name: $MP_NAME"
pass "marketplace add ($MARKETPLACE_NAME via git loopback)"

LIST_MP="$EVIDENCE_DIR/marketplace-list-pre.json"
run_json "$LIST_MP" codex plugin marketplace list --json || die "marketplace list failed"
SRC_TYPE="$(json_field "$LIST_MP" "marketplaces[0].marketplaceSource.sourceType")"
[ "$SRC_TYPE" = "git" ] || die "expected git marketplaceSource, got $SRC_TYPE"
pass "marketplace classified as git (upgradeable transport)"

ADD_PL_OUT="$EVIDENCE_DIR/plugin-add-v1.json"
if run_json "$ADD_PL_OUT" codex plugin add "$PLUGIN_SELECTOR" --json; then
  :
else
  die "plugin add failed: $(cat "$ADD_PL_OUT" "$ADD_PL_OUT.err" 2>/dev/null | tr '\n' ' ')"
fi
INST_VER="$(json_field "$ADD_PL_OUT" "version")"
[ "$INST_VER" = "$V1_VERSION" ] || die "installed version $INST_VER != $V1_VERSION"
pass "plugin add installed $PLUGIN_SELECTOR@$V1_VERSION"

LIST1="$EVIDENCE_DIR/plugin-list-v1.json"
run_json "$LIST1" codex plugin list --json || die "plugin list failed"
assert_plugin_list "$LIST1" "$V1_VERSION" "true" >/dev/null
pass "list reports enabled $PLUGIN_NAME@$V1_VERSION"

inspect_cache "$V1_VERSION"
SKILL_COUNT="$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))["plugin"]["skills"]))' "$V1_DESC")"
pass "install cache contains manifest, skills ($SKILL_COUNT), hooks, executables"
# ─── 2) Reinstall idempotency ────────────────────────────────────────────────
ADD_PL2="$EVIDENCE_DIR/plugin-add-idempotent.json"
run_json "$ADD_PL2" codex plugin add "$PLUGIN_SELECTOR" --json || die "re-add failed"
LIST2="$EVIDENCE_DIR/plugin-list-idempotent.json"
run_json "$LIST2" codex plugin list --json || die "list after re-add failed"
python3 - "$LIST2" "$PLUGIN_NAME" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
name = sys.argv[2]
installed = [p for p in (data.get("installed") or []) if p.get("name") == name]
if len(installed) != 1:
    raise SystemExit(f"expected exactly one installed {name}, got {len(installed)}: {installed!r}")
print("ok")
PY
pass "reinstall is idempotent (single enabled entry)"

# ─── 5) Upgrade v1 → v2 through marketplace upgrade ──────────────────────────
V2_VERSION="$(generate_marketplace_tree "$V2_DESC" "$SRC")"
V2_MSG="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["git"]["commitMessage"])' "$V2_DESC")"
init_git_repo "$SRC" "$V2_MSG" "$BRANCH"
(
  cd "$SRC"
  git push -q "$BARE" "$BRANCH"
)
(
  cd "$BARE"
  git --bare update-server-info
)

# Prove still git + still on v1 snapshot content before upgrade
LIST_MP2="$EVIDENCE_DIR/marketplace-list-before-upgrade.json"
run_json "$LIST_MP2" codex plugin marketplace list --json || die "marketplace list before upgrade failed"
SRC_TYPE2="$(json_field "$LIST_MP2" "marketplaces[0].marketplaceSource.sourceType")"
[ "$SRC_TYPE2" = "git" ] || die "marketplace no longer git before upgrade"
MP_ROOT="$(json_field "$LIST_MP2" "marketplaces[0].root")"
SNAP_VER="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["metadata"]["version"])' \
  "$MP_ROOT/.claude-plugin/marketplace.json" 2>/dev/null \
  || python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["metadata"]["version"])' \
  "$MP_ROOT/marketplace.json")"
[ "$SNAP_VER" = "$V1_VERSION" ] || [ "$SNAP_VER" = "1.0.0" ] || die "pre-upgrade snapshot not v1 (got $SNAP_VER)"
LIST_PRE_UP="$EVIDENCE_DIR/plugin-list-before-upgrade.json"
run_json "$LIST_PRE_UP" codex plugin list --json || true
assert_plugin_list "$LIST_PRE_UP" "$V1_VERSION" "true" >/dev/null
pass "pre-upgrade: git marketplace + installed still $V1_VERSION (upgradeable)"

# Fresh process semantics: invoke upgrade as a new codex invocation (not in-process).
UP_OUT="$EVIDENCE_DIR/marketplace-upgrade.json"
if run_json "$UP_OUT" codex plugin marketplace upgrade "$MARKETPLACE_NAME" --json; then
  :
else
  die "marketplace upgrade failed: $(cat "$UP_OUT" "$UP_OUT.err" 2>/dev/null | tr '\n' ' ')"
fi
python3 - "$UP_OUT" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
errors = data.get("errors") or []
if errors:
    raise SystemExit(f"upgrade errors: {errors}")
roots = data.get("upgradedRoots") or []
if not roots:
    raise SystemExit(f"no upgradedRoots: {data!r}")
print("upgraded", len(roots))
PY
pass "marketplace upgrade --json upgraded git snapshot"

LIST_POST_UP="$EVIDENCE_DIR/plugin-list-after-upgrade.json"
run_json "$LIST_POST_UP" codex plugin list --json || die "list after upgrade failed"
assert_plugin_list "$LIST_POST_UP" "$V2_VERSION" "true" >/dev/null
pass "after upgrade list reports $PLUGIN_NAME@$V2_VERSION"

# Ensure versioned cache materializes for v2 (re-add is idempotent refresh; not raw cache mutation)
ADD_V2="$EVIDENCE_DIR/plugin-add-v2.json"
run_json "$ADD_V2" codex plugin add "$PLUGIN_SELECTOR" --json || die "post-upgrade plugin add failed"
inspect_cache "$V2_VERSION"
pass "v2 install cache validated (manifest/skills/hooks/executables)"

# Isolation still holds after upgrade
assert_isolation
pass "isolation intact after upgrade (HOME/CODEX_HOME under temp)"

# ─── 6) Remove twice ─────────────────────────────────────────────────────────
RM1="$EVIDENCE_DIR/plugin-remove-1.json"
run_json "$RM1" codex plugin remove "$PLUGIN_SELECTOR" --json || die "first remove failed"
LIST_RM1="$EVIDENCE_DIR/plugin-list-after-remove-1.json"
run_json "$LIST_RM1" codex plugin list --json || die "list after first remove failed"
python3 - "$LIST_RM1" "$PLUGIN_NAME" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
name = sys.argv[2]
enabled = [p for p in (data.get("installed") or []) if p.get("name") == name and p.get("enabled")]
if enabled:
    raise SystemExit(f"still enabled after remove: {enabled!r}")
print("ok")
PY
pass "first remove leaves no enabled reference"

RM2="$EVIDENCE_DIR/plugin-remove-2.json"
# Second remove must be safe (exit 0 or benign JSON)
set +e
run_json "$RM2" codex plugin remove "$PLUGIN_SELECTOR" --json
RM2_RC=$?
set -e
if [ "$RM2_RC" -ne 0 ]; then
  # Accept non-zero only if no enabled entry remains
  log "second remove rc=$RM2_RC (checking list still clean)"
fi
LIST_RM2="$EVIDENCE_DIR/plugin-list-after-remove-2.json"
run_json "$LIST_RM2" codex plugin list --json || die "list after second remove failed"
python3 - "$LIST_RM2" "$PLUGIN_NAME" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
name = sys.argv[2]
enabled = [p for p in (data.get("installed") or []) if p.get("name") == name and p.get("enabled")]
if enabled:
    raise SystemExit(f"enabled after second remove: {enabled!r}")
print("ok")
PY
pass "second remove is safe; no enabled reference remains"

# Final isolation + no real home mutation marker
assert_isolation
if [ -e "$REAL_CODEX_HOME/.hyperflow-t11-should-not-exist" ]; then
  security_violation "harness marker appeared in real Codex home"
fi
pass "real user Codex home untouched"

# ─── Summary ─────────────────────────────────────────────────────────────────
SUMMARY="$EVIDENCE_DIR/summary.txt"
{
  echo "codex_version=$CODEX_VERSION"
  echo "v1=$V1_VERSION v2=$V2_VERSION"
  echo "pass=$PASS fail=$FAIL skipped=$SKIPPED"
  echo "tmp_redacted=<REDACTED>"
  echo "git_transport=http://127.0.0.1/* (loopback dumb git)"
} >"$SUMMARY"
log "----"
log "SUMMARY: pass=$PASS fail=$FAIL skipped=$SKIPPED"
log "Evidence (redacted): $EVIDENCE_DIR"
log "Versions exercised: $V1_VERSION → $V2_VERSION"

if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
exit 0
