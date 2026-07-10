#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PACKAGE_JSON="$ROOT/package.json"
PLUGIN_JSON="$ROOT/.claude-plugin/plugin.json"
CODEX_PLUGIN_JSON="$ROOT/.codex-plugin/plugin.json"
MARKETPLACE_JSON="$ROOT/.claude-plugin/marketplace.json"
README_MD="$ROOT/README.md"
SKILL_VERSION="$ROOT/skills/hyperflow/VERSION"

# Validate argument
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <new-version>"
  echo "Example: $0 1.2.0"
  exit 1
fi

NEW_VERSION="$1"

if [[ ! "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must be semver format X.Y.Z (got: $NEW_VERSION)"
  exit 1
fi

# Verify all files exist
for FILE in "$PACKAGE_JSON" "$PLUGIN_JSON" "$CODEX_PLUGIN_JSON" "$MARKETPLACE_JSON" "$README_MD"; do
  if [[ ! -f "$FILE" ]]; then
    echo "Error: file not found: $FILE"
    exit 1
  fi
done

# Detect sed in-place flag (BSD vs GNU)
if sed --version >/dev/null 2>&1; then
  SED_INPLACE=(-i)
else
  SED_INPLACE=(-i '')
fi

# Update package.json
sed "${SED_INPLACE[@]}" 's/"version": "[^"]*"/"version": "'"$NEW_VERSION"'"/' "$PACKAGE_JSON"
echo "Updated $PACKAGE_JSON"

# Update plugin.json
sed "${SED_INPLACE[@]}" 's/"version": "[^"]*"/"version": "'"$NEW_VERSION"'"/' "$PLUGIN_JSON"
echo "Updated $PLUGIN_JSON"

# Update Codex plugin.json
sed "${SED_INPLACE[@]}" 's/"version": "[^"]*"/"version": "'"$NEW_VERSION"'"/' "$CODEX_PLUGIN_JSON"
echo "Updated $CODEX_PLUGIN_JSON"

# Update marketplace.json (both occurrences)
sed "${SED_INPLACE[@]}" 's/"version": "[^"]*"/"version": "'"$NEW_VERSION"'"/g' "$MARKETPLACE_JSON"
echo "Updated $MARKETPLACE_JSON (2 occurrences)"

# Update README.md version badge
sed "${SED_INPLACE[@]}" 's/<code>v[^<]*<\/code>/<code>v'"$NEW_VERSION"'<\/code>/' "$README_MD"
sed "${SED_INPLACE[@]}" 's|badge/version-v[^-]*-blueviolet|badge/version-v'"$NEW_VERSION"'-blueviolet|' "$README_MD"
sed "${SED_INPLACE[@]}" 's/alt="version v[^"]*"/alt="version v'"$NEW_VERSION"'"/' "$README_MD"
echo "Updated $README_MD"

# Update skill VERSION file
echo "$NEW_VERSION" > "$SKILL_VERSION"
echo "Updated $SKILL_VERSION"

echo "Version bumped to $NEW_VERSION (6 files)"
