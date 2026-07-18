#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Files ─────────────────────────────────────────────────────────────────────
PACKAGE_JSON="$ROOT/package.json"
CHANGELOG="$ROOT/CHANGELOG.md"
README="$ROOT/README.md"
REPO_URL="https://github.com/Mohammed-Abdelhady/hyperflow"
CERTIFY="$SCRIPT_DIR/certify-codex.sh"

# ── Detect BSD vs GNU sed ─────────────────────────────────────────────────────
if sed --version >/dev/null 2>&1; then
  SED_INPLACE=(-i)
else
  SED_INPLACE=(-i '')
fi

# ── Parse args: phases, dry-run, force, bump type ─────────────────────────────
# Two-phase Codex certification protocol (T14):
#   precheck  → zero mutation; required certificates must pass
#   prepare   → local release commit + annotated tag only (default after precheck)
#   candidate → push temporary release-candidate/* branch for remote CI
#   finalize  → after remote candidate PASS; push release commit + stable tag
FORCE_RELEASE=false
DRY_RUN=false
PRECHECK_ONLY=false
REQUESTED_TYPE=""
PHASE="prepare"   # prepare | candidate | finalize | precheck
PHASE_VERSION=""  # required for candidate/finalize when not preparing

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force|-f) FORCE_RELEASE=true; shift ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --precheck)
      PRECHECK_ONLY=true
      PHASE="precheck"
      shift
      ;;
    --phase)
      PHASE="${2:-}"
      if [[ -z "$PHASE" ]]; then
        echo "Error: --phase requires prepare|candidate|finalize|precheck" >&2
        exit 1
      fi
      shift 2
      ;;
    --version)
      PHASE_VERSION="${2:-}"
      shift 2
      ;;
    major|minor|patch) REQUESTED_TYPE="$1"; shift ;;
    -h|--help)
      cat <<'USAGE'
Usage: ./scripts/release.sh [options] [major|minor|patch]

Codex certification protocol (required before any version mutation):
  1. precheck   — certify-codex.sh; tree must stay unchanged on fail
  2. prepare    — write release commit + local annotated tag (no push)
  3. candidate  — push release-candidate/vX.Y.Z for remote CI certification
  4. finalize   — after remote candidate PASS: push commit + stable tag,
                  then read-only exact-tag smoke before announcement

Options:
  major|minor|patch   force a specific bump type (otherwise auto-detected)
  --force, -f         bump even when commits since last tag are only
                      docs/chore/style/test/build/ci (no release-worthy changes)
  --dry-run           run precheck + version plan only; never mutates the tree
  --precheck          run certificate precheck only (alias: --phase precheck)
  --phase <name>      prepare (default) | candidate | finalize | precheck
  --version X.Y.Z     required for --phase candidate|finalize

Environment:
  HYPERFLOW_CERTIFY_ALLOW_PREVIEW=1  soft-fail uncertified Codex lanes (preview
                                     only — never for a public stable release)

Auto-detection rules (strict Conventional Commits):
  BREAKING CHANGE / type!:  → major
  feat:                     → minor
  fix: / perf: / refactor:  → patch
  docs: / chore: / style:   → NO RELEASE (exit cleanly; use --force to override)
  test: / build: / ci:      → NO RELEASE (exit cleanly; use --force to override)

Dry-run proof: on certification failure the working tree, HEAD, and tags are
unchanged. See RELEASING.md for the support matrix and fix-forward recovery.
USAGE
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Try '$0 --help'" >&2
      exit 1
      ;;
  esac
done

case "$PHASE" in
  prepare|candidate|finalize|precheck) ;;
  *)
    echo "Error: unknown --phase '$PHASE' (want prepare|candidate|finalize|precheck)" >&2
    exit 1
    ;;
esac

# ── Certificate precheck (zero mutation) ──────────────────────────────────────
run_cert_precheck() {
  local mode="${1:-precheck}"
  if [[ ! -x "$CERTIFY" && ! -f "$CERTIFY" ]]; then
    echo -e "${RED}Error: missing $CERTIFY — cannot release without Codex certification gate.${RESET}" >&2
    exit 1
  fi
  echo -e "${CYAN}▸${RESET} Codex certification ${mode}"
  if ! bash "$CERTIFY" "--${mode}"; then
    echo ""
    echo -e "${RED}${BOLD}Certification blocked release mutation.${RESET}"
    echo -e "  Working tree was not modified by the certifier."
    echo -e "  Fix certificates or (preview only) set HYPERFLOW_CERTIFY_ALLOW_PREVIEW=1."
    echo -e "  Details: ./scripts/certify-codex.sh --status"
    echo -e "  Protocol: RELEASING.md § Codex certification"
    return 1
  fi
  return 0
}

# ── Candidate / finalize helpers (no version mutation) ────────────────────────
phase_candidate() {
  local ver="$1"
  if [[ -z "$ver" ]]; then
    echo "Error: --phase candidate requires --version X.Y.Z" >&2
    exit 1
  fi
  if ! git rev-parse "v${ver}" >/dev/null 2>&1; then
    echo "Error: local tag v${ver} not found — run prepare first" >&2
    exit 1
  fi
  local branch="release-candidate/v${ver}"
  local sha
  sha="$(git rev-parse "v${ver}^{}")"
  echo -e "${CYAN}▸${RESET} candidate branch for v${ver} @ ${sha}"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}dry-run:${RESET} would create/update branch ${branch} at ${sha} and push"
    run_cert_precheck candidate || exit 1
    exit 0
  fi
  # Point branch at the prepared release commit (the tag target)
  git branch -f "$branch" "$sha"
  echo -e "${GREEN}Local branch ${branch} → ${sha}${RESET}"
  echo ""
  echo -e "${CYAN}Push candidate for remote certification (does NOT publish the stable tag):${RESET}"
  echo -e "  git push -u origin ${branch}"
  echo ""
  echo -e "${CYAN}After .github/workflows/release-certification.yml is green:${RESET}"
  echo -e "  $0 --phase finalize --version ${ver}"
  echo ""
  echo -e "${YELLOW}Do not push tag v${ver} until candidate certification passes.${RESET}"
}

phase_finalize() {
  local ver="$1"
  if [[ -z "$ver" ]]; then
    echo "Error: --phase finalize requires --version X.Y.Z" >&2
    exit 1
  fi
  if ! git rev-parse "v${ver}" >/dev/null 2>&1; then
    echo "Error: local tag v${ver} not found" >&2
    exit 1
  fi
  echo -e "${CYAN}▸${RESET} finalize gate for v${ver} (re-check certificates)"
  HYPERFLOW_EXPECT_VERSION="$ver" \
    HYPERFLOW_EXPECT_COMMIT="$(git rev-parse "v${ver}^{}")" \
    run_cert_precheck precheck || exit 1

  if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}dry-run:${RESET} would push release commit + tag v${ver} after candidate PASS"
    exit 0
  fi

  echo ""
  echo -e "${GREEN}${BOLD}Certificates OK — publish stable ref (maintainer action):${RESET}"
  echo -e "  git push origin HEAD"
  echo -e "  git push origin v${ver}"
  echo ""
  echo -e "${CYAN}After the tag is on the remote, exact-tag smoke runs via${RESET}"
  echo -e "  .github/workflows/release-certification.yml (stable-tag job)."
  echo -e "${CYAN}On smoke failure: halt announcement; fix-forward only (never retag).${RESET}"
  echo -e "See RELEASING.md § Fix-forward recovery."
}

if [[ "$PHASE" == "candidate" ]]; then
  phase_candidate "$PHASE_VERSION"
  exit 0
fi
if [[ "$PHASE" == "finalize" ]]; then
  phase_finalize "$PHASE_VERSION"
  exit 0
fi

# Standalone precheck: zero mutation, no version planning required
if [[ "$PRECHECK_ONLY" == "true" || "$PHASE" == "precheck" ]]; then
  TREE_BEFORE="$(git status --porcelain; git rev-parse HEAD 2>/dev/null || true; git tag -l)"
  if ! run_cert_precheck precheck; then
    TREE_AFTER="$(git status --porcelain; git rev-parse HEAD 2>/dev/null || true; git tag -l)"
    if [[ "$TREE_BEFORE" != "$TREE_AFTER" ]]; then
      echo -e "${RED}SECURITY_VIOLATION: tree mutated during failed certification precheck${RESET}" >&2
      exit 2
    fi
    echo -e "${GREEN}Proof: working tree, HEAD, and tags unchanged after failed precheck.${RESET}"
    exit 1
  fi
  echo -e "${GREEN}Precheck PASS — no files mutated.${RESET}"
  exit 0
fi

# ── Parse current version from package.json (no jq) ──────────────────────────
CURRENT_VERSION=$(grep '"version"' "$PACKAGE_JSON" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
if [[ -z "$CURRENT_VERSION" ]]; then
  echo "Error: could not parse version from $PACKAGE_JSON"
  exit 1
fi

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# ── Find last tag ─────────────────────────────────────────────────────────────
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

# ── Collect commits since last tag ───────────────────────────────────────────
if [[ -n "$LAST_TAG" ]]; then
  COMMITS=$(git log "${LAST_TAG}..HEAD" --oneline --no-decorate 2>/dev/null || echo "")
else
  COMMITS=$(git log --oneline --no-decorate 2>/dev/null || echo "")
fi

if [[ -z "$COMMITS" ]]; then
  # Still run precheck so dry-run/failure proof works even with an empty range
  if [[ "$DRY_RUN" == "true" ]]; then
    TREE_BEFORE="$(git status --porcelain; git rev-parse HEAD 2>/dev/null || true; git tag -l)"
    run_cert_precheck precheck || {
      TREE_AFTER="$(git status --porcelain; git rev-parse HEAD 2>/dev/null || true; git tag -l)"
      if [[ "$TREE_BEFORE" != "$TREE_AFTER" ]]; then
        echo -e "${RED}SECURITY_VIOLATION: tree mutated during failed certification precheck${RESET}" >&2
        exit 2
      fi
      echo -e "${GREEN}Proof: working tree, HEAD, and tags unchanged after failed precheck.${RESET}"
      exit 1
    }
    echo -e "${YELLOW}Nothing to release — no commits since ${LAST_TAG:-beginning}.${RESET}"
    echo -e "${GREEN}Dry-run: tree unchanged.${RESET}"
    exit 0
  fi
  echo -e "${YELLOW}Nothing to release — no commits since ${LAST_TAG:-beginning}.${RESET}"
  exit 0
fi

# ── Classify commits into release-worthy tiers ──────────────────────────────
HAS_BREAKING=false
HAS_FEAT=false
HAS_FIX=false
while IFS= read -r line; do
  msg="${line#* }"
  if echo "$msg" | grep -qiE '(BREAKING[[:space:]]CHANGE|^[a-z]+(\([^)]*\))?!:)'; then
    HAS_BREAKING=true
  elif echo "$msg" | grep -qE '^feat(\([^)]*\))?:'; then
    HAS_FEAT=true
  elif echo "$msg" | grep -qE '^(fix|perf|refactor|revert)(\([^)]*\))?:'; then
    HAS_FIX=true
  fi
done <<< "$COMMITS"

HAS_RELEASE_WORTHY=false
if [[ "$HAS_BREAKING" == "true" || "$HAS_FEAT" == "true" || "$HAS_FIX" == "true" ]]; then
  HAS_RELEASE_WORTHY=true
fi

# ── Refuse to bump on docs/chore-only commits unless --force ────────────────
if [[ "$HAS_RELEASE_WORTHY" == "false" && "$FORCE_RELEASE" == "false" ]]; then
  if [[ "$DRY_RUN" == "true" ]]; then
    TREE_BEFORE="$(git status --porcelain; git rev-parse HEAD 2>/dev/null || true; git tag -l)"
    if ! run_cert_precheck precheck; then
      TREE_AFTER="$(git status --porcelain; git rev-parse HEAD 2>/dev/null || true; git tag -l)"
      if [[ "$TREE_BEFORE" != "$TREE_AFTER" ]]; then
        echo -e "${RED}SECURITY_VIOLATION: tree mutated during failed certification precheck${RESET}" >&2
        exit 2
      fi
      echo -e "${GREEN}Proof: working tree, HEAD, and tags unchanged after failed precheck.${RESET}"
      exit 1
    fi
    echo -e "${YELLOW}Nothing release-worthy — dry-run would not bump (use --force). Tree unchanged.${RESET}"
    exit 0
  fi
  echo -e "${YELLOW}Nothing release-worthy — all commits since ${LAST_TAG:-beginning} are docs/chore/style/test/build/ci.${RESET}"
  echo -e "${CYAN}Push without releasing:${RESET}   git push"
  echo -e "${CYAN}Release anyway:${RESET}           $0 --force ${REQUESTED_TYPE:-patch}"
  exit 0
fi

# ── Determine bump type ──────────────────────────────────────────────────────
if [[ -n "$REQUESTED_TYPE" ]]; then
  BUMP_TYPE="$REQUESTED_TYPE"
elif [[ "$HAS_BREAKING" == "true" ]]; then
  BUMP_TYPE="major"
elif [[ "$HAS_FEAT" == "true" ]]; then
  BUMP_TYPE="minor"
else
  BUMP_TYPE="patch"
fi

if [[ "$HAS_RELEASE_WORTHY" == "false" && "$FORCE_RELEASE" == "true" ]]; then
  echo -e "${YELLOW}--force: bumping ${BUMP_TYPE} despite only docs/chore commits.${RESET}"
fi

# ── Calculate new version ─────────────────────────────────────────────────────
case "$BUMP_TYPE" in
  major) NEW_MAJOR=$((MAJOR + 1)); NEW_MINOR=0; NEW_PATCH=0 ;;
  minor) NEW_MAJOR=$MAJOR; NEW_MINOR=$((MINOR + 1)); NEW_PATCH=0 ;;
  patch) NEW_MAJOR=$MAJOR; NEW_MINOR=$MINOR; NEW_PATCH=$((PATCH + 1)) ;;
esac
NEW_VERSION="${NEW_MAJOR}.${NEW_MINOR}.${NEW_PATCH}"

# ── Check idempotency — tag already exists? ───────────────────────────────────
if [[ -n "${NEW_VERSION:-}" ]] && git rev-parse "v${NEW_VERSION}" >/dev/null 2>&1; then
  if [[ "$PRECHECK_ONLY" != "true" && "$DRY_RUN" != "true" && "$PHASE" != "precheck" ]]; then
    echo -e "${YELLOW}Nothing to release — tag v${NEW_VERSION} already exists.${RESET}"
    exit 0
  fi
fi

# ── Snapshot for dry-run / failure non-mutation proof ─────────────────────────
snapshot_tree() {
  git status --porcelain
  git rev-parse HEAD 2>/dev/null || true
  git tag -l
}

TREE_BEFORE="$(snapshot_tree)"

# ── PRECHECK before any mutation (T14 hard-stop) ──────────────────────────────
if ! run_cert_precheck precheck; then
  TREE_AFTER="$(snapshot_tree)"
  if [[ "$TREE_BEFORE" != "$TREE_AFTER" ]]; then
    echo -e "${RED}SECURITY_VIOLATION: tree mutated during failed certification precheck${RESET}" >&2
    exit 2
  fi
  echo -e "${GREEN}Proof: working tree, HEAD, and tags unchanged after failed precheck.${RESET}"
  exit 1
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo ""
  echo -e "${GREEN}${BOLD}Dry-run plan${RESET}"
  echo -e "  current:  v${CURRENT_VERSION}"
  echo -e "  next:     v${NEW_VERSION}  (${BUMP_TYPE})"
  echo -e "  commits:  $(echo "$COMMITS" | wc -l | tr -d ' ')"
  echo -e "  mutation: none (dry-run)"
  echo -e "  next steps after a real prepare:"
  echo -e "    1. $0 --phase candidate --version ${NEW_VERSION}"
  echo -e "    2. wait for release-certification.yml on release-candidate/v${NEW_VERSION}"
  echo -e "    3. $0 --phase finalize --version ${NEW_VERSION}"
  TREE_AFTER="$(snapshot_tree)"
  if [[ "$TREE_BEFORE" != "$TREE_AFTER" ]]; then
    echo -e "${RED}SECURITY_VIOLATION: dry-run mutated the tree${RESET}" >&2
    exit 2
  fi
  echo -e "${GREEN}Proof: tree unchanged after dry-run.${RESET}"
  exit 0
fi

# ── README staleness check (warn-only, never blocks) ─────────────────────────
# If commits since the last tag contain anything other than chore/docs(internal)/
# release commits and README.md hasn't been touched since the last tag, surface
# a warning so the contributor remembers to keep the README in sync.
if [ -n "$LAST_TAG" ]; then
  README_CHANGED_SINCE_TAG=$(git diff --name-only "$LAST_TAG"...HEAD -- README.md 2>/dev/null)

  # Count commits since last tag that are NOT release/chore/internal-docs.
  FEATURE_COMMITS=$(git log "$LAST_TAG"..HEAD --pretty=format:"%s" 2>/dev/null \
    | grep -Ev '^(chore\(release\)|chore: release|docs\(internal\))' \
    | grep -cE '^(feat|fix|perf|refactor|revert)(\(|:)' || true)

  if [ -z "$README_CHANGED_SINCE_TAG" ] && [ "$FEATURE_COMMITS" -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}⚠  README STALE${RESET} — README.md was not modified since ${LAST_TAG}, but ${FEATURE_COMMITS} feature/fix commit(s) landed."
    echo -e "   Consider updating README.md so users see the new behavior on the project landing page."
    echo -e "   Continuing in 3 seconds — press Ctrl+C to abort and update the README first."
    sleep 3
    echo ""
  fi
fi

TODAY=$(date +%Y-%m-%d)

# ── Parse commits into categories ────────────────────────────────────────────
declare -a ADDED=()
declare -a FIXED=()
declare -a CHANGED=()

# Helper: strip prefix and scope, capitalize
clean_msg() {
  local raw="$1"
  # Remove conventional commit prefix: type(scope): or type!: or type:
  local body
  body=$(echo "$raw" | sed 's/^[a-zA-Z]*([^)]*)[!]*:[[:space:]]*//' | sed 's/^[a-zA-Z]*[!]*:[[:space:]]*//')
  # Capitalize first letter
  echo "$(echo "${body:0:1}" | tr '[:lower:]' '[:upper:]')${body:1}"
}

while IFS= read -r line; do
  # Strip short SHA prefix (format: "abc1234 message")
  msg="${line#* }"
  if echo "$msg" | grep -qE '^feat(\([^)]*\))?[!]?:'; then
    ADDED+=("$(clean_msg "$msg")")
  elif echo "$msg" | grep -qE '^fix(\([^)]*\))?[!]?:'; then
    FIXED+=("$(clean_msg "$msg")")
  elif echo "$msg" | grep -qE '^(refactor|perf|docs|chore|style|test)(\([^)]*\))?[!]?:'; then
    CHANGED+=("$(clean_msg "$msg")")
  fi
done <<< "$COMMITS"

# ── Build CHANGELOG section ───────────────────────────────────────────────────
SECTION="## [${NEW_VERSION}] — ${TODAY}"$'\n'

if [[ ${#ADDED[@]} -gt 0 ]]; then
  SECTION+=$'\n'"### Added"$'\n'
  for entry in "${ADDED[@]}"; do
    SECTION+="- ${entry}"$'\n'
  done
fi

if [[ ${#FIXED[@]} -gt 0 ]]; then
  SECTION+=$'\n'"### Fixed"$'\n'
  for entry in "${FIXED[@]}"; do
    SECTION+="- ${entry}"$'\n'
  done
fi

if [[ ${#CHANGED[@]} -gt 0 ]]; then
  SECTION+=$'\n'"### Changed"$'\n'
  for entry in "${CHANGED[@]}"; do
    SECTION+="- ${entry}"$'\n'
  done
fi

# ── Insert section into CHANGELOG.md using awk ────────────────────────────────
# Strategy: stream CHANGELOG line by line; insert new section after "## [Unreleased]" line
TMPFILE=$(mktemp)
INSERTED=0
while IFS= read -r line; do
  printf '%s\n' "$line" >> "$TMPFILE"
  if [[ "$INSERTED" -eq 0 && "$line" == "## [Unreleased]" ]]; then
    printf '\n' >> "$TMPFILE"
    printf '%s\n' "$SECTION" >> "$TMPFILE"
    INSERTED=1
  fi
done < "$CHANGELOG"

mv "$TMPFILE" "$CHANGELOG"

# ── Update compare links at bottom of CHANGELOG ──────────────────────────────
# The [Unreleased] link should now point from new version to HEAD
# We also need to add a new version compare link

# Update [Unreleased] link
sed "${SED_INPLACE[@]}" \
  "s|^\[Unreleased\]:.*|\[Unreleased\]: ${REPO_URL}/compare/v${NEW_VERSION}...HEAD|" \
  "$CHANGELOG"

# Insert new version compare link after [Unreleased] link
# Determine the compare/releases line for new version
if [[ -n "$LAST_TAG" ]]; then
  NEW_VERSION_LINK="[${NEW_VERSION}]: ${REPO_URL}/compare/${LAST_TAG}...v${NEW_VERSION}"
else
  NEW_VERSION_LINK="[${NEW_VERSION}]: ${REPO_URL}/releases/tag/v${NEW_VERSION}"
fi

# Insert new version link after the [Unreleased] line at bottom using awk
TMPFILE2=$(mktemp)
LINK_INSERTED=0
while IFS= read -r line; do
  printf '%s\n' "$line" >> "$TMPFILE2"
  if [[ "$LINK_INSERTED" -eq 0 ]] && echo "$line" | grep -qE '^\[Unreleased\]:'; then
    printf '%s\n' "$NEW_VERSION_LINK" >> "$TMPFILE2"
    LINK_INSERTED=1
  fi
done < "$CHANGELOG"

mv "$TMPFILE2" "$CHANGELOG"

# ── Bump versions in all manifest files (prepare phase only — no publish) ────
HYPERFLOW_RELEASE_PHASE=prepare \
  "$SCRIPT_DIR/bump-version.sh" "$NEW_VERSION"

# ── Regenerate the portable doctrine template from DOCTRINE.md ────────────────
# templates/claude-md-doctrine.md is a generated artefact derived from
# skills/hyperflow/DOCTRINE.md. Regenerate it *before* the auto-bridge refresh
# below so a doctrine edit propagates into the dogfood CLAUDE.md block in the same
# release commit. Failure is a warning, never a release blocker.
if command -v python3 >/dev/null 2>&1 && [[ -f "$SCRIPT_DIR/generate-portable-doctrine.py" ]]; then
  echo -e "${CYAN}▸${RESET} regenerating portable doctrine template"
  if ! python3 "$SCRIPT_DIR/generate-portable-doctrine.py"; then
    echo -e "${YELLOW}⚠${RESET} portable doctrine regeneration failed; continuing — run 'python3 scripts/generate-portable-doctrine.py' manually and commit"
  fi
fi

# ── Refresh the dogfood doctrine block in CLAUDE.md (advisory) ───────────────
# This repo is both plugin root and project root — auto-bridge re-stamps the
# managed hyperflow:doctrine block with the just-bumped version + body-sha so
# the dogfood embed rides the release commit and can never lag behind a tag.
# Failure is a warning, never a release blocker.
if command -v python3 >/dev/null 2>&1 && [[ -f "$SCRIPT_DIR/auto-bridge.py" ]]; then
  echo -e "${CYAN}▸${RESET} refreshing CLAUDE.md doctrine block"
  mkdir -p "$ROOT/.hyperflow"  # gitignored; auto-bridge no-ops without it
  if ! python3 "$SCRIPT_DIR/auto-bridge.py" "$ROOT" "$ROOT" --force; then
    echo -e "${YELLOW}⚠${RESET} doctrine block refresh failed; continuing — run 'python3 scripts/auto-bridge.py . .' manually and commit"
  fi
else
  echo -e "${YELLOW}⚠${RESET} python3 or auto-bridge.py unavailable — skipping CLAUDE.md doctrine refresh"
fi

# ── Regenerate hero.svg + demo.cast/gif ──────────────────────────────────────
HAS_PYTHON3=0
if command -v python3 >/dev/null 2>&1; then HAS_PYTHON3=1; fi

# Sync features.json version with the new release version
if [[ -f "$ROOT/config/features.json" && "$HAS_PYTHON3" == "1" ]]; then
  if ! python3 - "$ROOT/config/features.json" "$NEW_VERSION" <<'PYEOF'
import json, sys
path, version = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = json.load(f)
data["version"] = version
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PYEOF
  then
    echo -e "${YELLOW}⚠${RESET} features.json version sync failed; continuing"
  fi
elif [[ -f "$ROOT/config/features.json" ]]; then
  echo -e "${YELLOW}⚠${RESET} python3 not found — skipping features.json sync and generators"
fi

# Generate hero.svg (pure Python, stdlib only)
if [[ "$HAS_PYTHON3" == "1" && -f "$SCRIPT_DIR/generate-hero.py" ]]; then
  echo -e "${CYAN}▸${RESET} regenerating hero.svg"
  python3 "$SCRIPT_DIR/generate-hero.py" --version "$NEW_VERSION" || {
    echo -e "${YELLOW}⚠${RESET} hero regeneration failed; continuing"
  }
fi

# Generate og-image.png + touch/favicon rasters (requires Pillow)
if [[ "$HAS_PYTHON3" == "1" && -f "$SCRIPT_DIR/generate-og.py" ]]; then
  echo -e "${CYAN}▸${RESET} regenerating og-image.png and icons"
  python3 "$SCRIPT_DIR/generate-og.py" --version "$NEW_VERSION" || {
    echo -e "${YELLOW}⚠${RESET} og-image regeneration failed (Pillow missing?); continuing"
  }
fi

# Generate demo.cast + demo.gif (requires agg for gif)
if [[ -x "$SCRIPT_DIR/generate-demo.sh" || -f "$SCRIPT_DIR/generate-demo.sh" ]]; then
  if command -v agg >/dev/null 2>&1; then
    echo -e "${CYAN}▸${RESET} regenerating demo.cast and demo.gif"
    bash "$SCRIPT_DIR/generate-demo.sh" || {
      echo -e "${YELLOW}⚠${RESET} demo regeneration failed; continuing without it"
    }
  else
    # Even without agg, regenerate the cast (still useful)
    if [[ -f "$SCRIPT_DIR/generate-demo-cast.py" ]]; then
      echo -e "${CYAN}▸${RESET} regenerating demo.cast (skipping gif — 'agg' not installed)"
      python3 "$SCRIPT_DIR/generate-demo-cast.py" --output "$ROOT/docs/assets/demo.cast" || true
    fi
    echo -e "${YELLOW}⚠${RESET} install agg to also regenerate demo.gif: cargo install --locked agg  |  brew install agg"
  fi
fi

# Generate whats-new.cast + whats-new.gif (showcases just this release's changes)
if [[ "$HAS_PYTHON3" == "1" && -f "$SCRIPT_DIR/generate-whats-new-cast.py" ]]; then
  WHATS_NEW_ARGS=(--version "$NEW_VERSION")
  if [[ -n "$LAST_TAG" ]]; then
    WHATS_NEW_ARGS+=(--from "$LAST_TAG")
  fi
  if command -v agg >/dev/null 2>&1; then
    echo -e "${CYAN}▸${RESET} regenerating whats-new.cast and whats-new.gif"
    bash "$SCRIPT_DIR/generate-whats-new.sh" "${WHATS_NEW_ARGS[@]}" || {
      echo -e "${YELLOW}⚠${RESET} whats-new regeneration failed; continuing"
    }
  else
    echo -e "${CYAN}▸${RESET} regenerating whats-new.cast (skipping gif — 'agg' not installed)"
    python3 "$SCRIPT_DIR/generate-whats-new-cast.py" \
      --output "$ROOT/docs/assets/whats-new.cast" \
      "${WHATS_NEW_ARGS[@]}" || true
  fi
fi

# ── Stage all changed files ───────────────────────────────────────────────────
git add \
  "$CHANGELOG" \
  "$PACKAGE_JSON" \
  "$ROOT/.claude-plugin/plugin.json" \
  "$ROOT/.claude-plugin/marketplace.json" \
  "$ROOT/.codex-plugin/plugin.json" \
  "$README" \
  "$ROOT/skills/hyperflow/VERSION" \
  "$ROOT/templates/claude-md-doctrine.md" \
  "$ROOT/docs/index.html" \
  "$ROOT/docs/installation.html" \
  "$ROOT/docs/orchestration.html" \
  "$ROOT/docs/404.html" \
  "$ROOT/docs/sitemap.xml"

# Optional generated artifacts — add if they exist (some require external tools)
# CLAUDE.md rides along for the doctrine-block refresh above (no-op when fresh).
for optional in \
  "$ROOT/CLAUDE.md" \
  "$ROOT/config/features.json" \
  "$ROOT/docs/assets/hero.svg" \
  "$ROOT/docs/assets/hero-vertical.svg" \
  "$ROOT/docs/assets/og-image.png" \
  "$ROOT/docs/assets/apple-touch-icon.png" \
  "$ROOT/docs/assets/favicon-32.png" \
  "$ROOT/docs/assets/demo.cast" \
  "$ROOT/docs/assets/demo.gif" \
  "$ROOT/docs/assets/demo.mp4" \
  "$ROOT/docs/assets/demo-poster.png" \
  "$ROOT/docs/assets/whats-new.cast" \
  "$ROOT/docs/assets/whats-new.gif"; do
  [[ -f "$optional" ]] && git add "$optional"
done

# ── Commit and local annotated tag only (no remote publish) ───────────────────
git commit -m "chore(release): v${NEW_VERSION}"
git tag -a "v${NEW_VERSION}" -m "v${NEW_VERSION}"

# ── Downstream-dependents check (advisory, never blocks the release) ─────────
# Mirrors the README-staleness style above: surface the state, keep going.
# The registry and remediation steps live in RELEASING.md §3; the script skips
# itself cleanly (exit 0) when gh or the network is unavailable.
if [[ -x "$SCRIPT_DIR/verify-downstreams.sh" ]]; then
  echo ""
  echo -e "${CYAN}▸${RESET} verifying downstream dependents (advisory)"
  if ! "$SCRIPT_DIR/verify-downstreams.sh"; then
    echo ""
    echo -e "${YELLOW}⚠  DOWNSTREAMS STALE${RESET} — see the table above; remediation steps live in RELEASING.md §3."
    echo -e "   The release is not blocked — sync the dependents after candidate certification."
  fi
fi

# ── Summary (prepare complete — candidate still required) ─────────────────────
COMMIT_COUNT=$(echo "$COMMITS" | wc -l | tr -d ' ')

echo ""
echo -e "${GREEN}${BOLD}Prepared local release v${NEW_VERSION}${RESET}"
echo -e "  ${CURRENT_VERSION} → ${NEW_VERSION}  (${BUMP_TYPE} bump)"
echo -e "  ${COMMIT_COUNT} commit(s) included"
echo -e "  local tag v${NEW_VERSION} created (not pushed)"
if [[ ${#ADDED[@]} -gt 0 ]]; then
  echo -e "  Added:   ${#ADDED[@]} entr$([ ${#ADDED[@]} -eq 1 ] && echo y || echo ies)"
fi
if [[ ${#FIXED[@]} -gt 0 ]]; then
  echo -e "  Fixed:   ${#FIXED[@]} entr$([ ${#FIXED[@]} -eq 1 ] && echo y || echo ies)"
fi
if [[ ${#CHANGED[@]} -gt 0 ]]; then
  echo -e "  Changed: ${#CHANGED[@]} entr$([ ${#CHANGED[@]} -eq 1 ] && echo y || echo ies)"
fi
echo ""
echo -e "${CYAN}Next — remote candidate certification (required before stable tag):${RESET}"
echo -e "  $0 --phase candidate --version ${NEW_VERSION}"
echo -e "  git push -u origin release-candidate/v${NEW_VERSION}"
echo -e "  # wait for .github/workflows/release-certification.yml"
echo -e "  $0 --phase finalize --version ${NEW_VERSION}"
echo -e "  git push origin HEAD && git push origin v${NEW_VERSION}"
echo ""
echo -e "${YELLOW}Do not push the stable tag until the candidate workflow is green.${RESET}"
echo -e "On post-push smoke failure: halt announcement; fix-forward only (RELEASING.md)."
echo ""
