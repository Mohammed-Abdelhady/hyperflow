#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Files ─────────────────────────────────────────────────────────────────────
PACKAGE_JSON="$ROOT/package.json"
CHANGELOG="$ROOT/CHANGELOG.md"
README="$ROOT/README.md"
REPO_URL="https://github.com/Mohammed-Abdelhady/hyperflow"

# ── Detect BSD vs GNU sed ─────────────────────────────────────────────────────
if sed --version >/dev/null 2>&1; then
  SED_INPLACE=(-i)
else
  SED_INPLACE=(-i '')
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
  echo -e "${YELLOW}Nothing to release — no commits since ${LAST_TAG:-beginning}.${RESET}"
  exit 0
fi

# ── Determine bump type ───────────────────────────────────────────────────────
REQUESTED_TYPE="${1:-}"

if [[ -n "$REQUESTED_TYPE" ]]; then
  BUMP_TYPE="$REQUESTED_TYPE"
  if [[ "$BUMP_TYPE" != "major" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "patch" ]]; then
    echo "Usage: $0 [major|minor|patch]"
    exit 1
  fi
else
  # Auto-detect from commits
  BUMP_TYPE="patch"
  while IFS= read -r line; do
    # Strip leading hash + short SHA
    msg="${line#* }"
    # Check for breaking change marker
    if echo "$msg" | grep -qiE '(BREAKING[[:space:]]CHANGE|^[a-z]+(\([^)]*\))?!:)'; then
      BUMP_TYPE="major"
      break
    fi
    # feat -> minor (only upgrade, never downgrade)
    if [[ "$BUMP_TYPE" != "major" ]] && echo "$msg" | grep -qE '^feat(\([^)]*\))?:'; then
      BUMP_TYPE="minor"
    fi
    # fix / refactor / perf / docs / chore / style / test -> patch (already default)
  done <<< "$COMMITS"
fi

# ── Calculate new version ─────────────────────────────────────────────────────
case "$BUMP_TYPE" in
  major) NEW_MAJOR=$((MAJOR + 1)); NEW_MINOR=0; NEW_PATCH=0 ;;
  minor) NEW_MAJOR=$MAJOR; NEW_MINOR=$((MINOR + 1)); NEW_PATCH=0 ;;
  patch) NEW_MAJOR=$MAJOR; NEW_MINOR=$MINOR; NEW_PATCH=$((PATCH + 1)) ;;
esac
NEW_VERSION="${NEW_MAJOR}.${NEW_MINOR}.${NEW_PATCH}"

# ── Check idempotency — tag already exists? ───────────────────────────────────
if git rev-parse "v${NEW_VERSION}" >/dev/null 2>&1; then
  echo -e "${YELLOW}Nothing to release — tag v${NEW_VERSION} already exists.${RESET}"
  exit 0
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

# ── Bump versions in all manifest files ──────────────────────────────────────
"$SCRIPT_DIR/bump-version.sh" "$NEW_VERSION"

# ── Stage all changed files ───────────────────────────────────────────────────
git add \
  "$CHANGELOG" \
  "$PACKAGE_JSON" \
  "$ROOT/.claude-plugin/plugin.json" \
  "$ROOT/.claude-plugin/marketplace.json" \
  "$README"

# ── Commit and tag ────────────────────────────────────────────────────────────
git commit -m "chore(release): v${NEW_VERSION}"
git tag -a "v${NEW_VERSION}" -m "v${NEW_VERSION}"

# ── Summary ───────────────────────────────────────────────────────────────────
COMMIT_COUNT=$(echo "$COMMITS" | wc -l | tr -d ' ')

echo ""
echo -e "${GREEN}${BOLD}Released v${NEW_VERSION}${RESET}"
echo -e "  ${CURRENT_VERSION} → ${NEW_VERSION}  (${BUMP_TYPE} bump)"
echo -e "  ${COMMIT_COUNT} commit(s) included"
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
echo -e "${CYAN}Push when ready:${RESET}"
echo -e "  git push && git push --tags"
echo ""
