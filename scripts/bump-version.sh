#!/usr/bin/env bash
# bump-version.sh — local manifest version preparation only (T14)
#
# Mutates checked-in version strings for a prepared release. Does NOT:
#   - create or push git tags
#   - push branches or commits
#   - publish to marketplaces or package registries
#   - skip Codex certification (release.sh runs precheck before invoking this)
#
# Intended caller: scripts/release.sh after certificate precheck passes, with
#   HYPERFLOW_RELEASE_PHASE=prepare
#
# Direct use (maintenance only):
#   HYPERFLOW_BUMP_ALLOW_DIRECT=1 ./scripts/bump-version.sh X.Y.Z

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PACKAGE_JSON="$ROOT/package.json"
PLUGIN_JSON="$ROOT/.claude-plugin/plugin.json"
CODEX_PLUGIN_JSON="$ROOT/.codex-plugin/plugin.json"
MARKETPLACE_JSON="$ROOT/.claude-plugin/marketplace.json"
README_MD="$ROOT/README.md"
SKILL_VERSION="$ROOT/skills/hyperflow/VERSION"

# ── Publication guard ─────────────────────────────────────────────────────────
# Refuse silent direct bumps that could look like a published release without
# going through release.sh precheck + candidate protocol.
PHASE="${HYPERFLOW_RELEASE_PHASE:-}"
if [[ "$PHASE" == "finalize" || "$PHASE" == "candidate" || "$PHASE" == "publish" ]]; then
  echo "Error: bump-version.sh must not run during phase='$PHASE' (no premature publication)." >&2
  exit 1
fi
if [[ "$PHASE" != "prepare" && "${HYPERFLOW_BUMP_ALLOW_DIRECT:-}" != "1" ]]; then
  echo "Error: bump-version.sh is prepare-only and never publishes." >&2
  echo "  Prefer: ./scripts/release.sh  (runs Codex precheck, then sets" >&2
  echo "           HYPERFLOW_RELEASE_PHASE=prepare before calling this script)" >&2
  echo "  Direct: HYPERFLOW_BUMP_ALLOW_DIRECT=1 $0 <new-version>" >&2
  echo "  Never: tag, push, or marketplace publish from this script." >&2
  exit 1
fi

# Validate argument
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <new-version>"
  echo "Example: $0 1.2.0"
  echo "Requires HYPERFLOW_RELEASE_PHASE=prepare or HYPERFLOW_BUMP_ALLOW_DIRECT=1"
  exit 1
fi

NEW_VERSION="$1"

if [[ ! "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must be semver format X.Y.Z (got: $NEW_VERSION)"
  exit 1
fi

DOCS_HTML=("$ROOT/docs/index.html" "$ROOT/docs/installation.html" "$ROOT/docs/orchestration.html" "$ROOT/docs/404.html")
SITEMAP_XML="$ROOT/docs/sitemap.xml"

# Verify all files exist
for FILE in "$PACKAGE_JSON" "$PLUGIN_JSON" "$CODEX_PLUGIN_JSON" "$MARKETPLACE_JSON" "$README_MD" "${DOCS_HTML[@]}" "$SITEMAP_XML"; do
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

# Update docs site — footer versions, index JSON-LD, sitemap lastmod
for HTML in "${DOCS_HTML[@]}"; do
  sed "${SED_INPLACE[@]}" 's/footer-version">v[0-9.]*</footer-version">v'"$NEW_VERSION"'</' "$HTML"
done
sed "${SED_INPLACE[@]}" 's/"softwareVersion": "[0-9.]*"/"softwareVersion": "'"$NEW_VERSION"'"/' "$ROOT/docs/index.html"
TODAY="$(date +%Y-%m-%d)"
sed "${SED_INPLACE[@]}" 's|<lastmod>[0-9-]*</lastmod>|<lastmod>'"$TODAY"'</lastmod>|g' "$SITEMAP_XML"
echo "Updated docs site (4 footers, JSON-LD, sitemap lastmod)"

echo "Version prepared at $NEW_VERSION (11 files) — local only; not tagged/pushed/published"
echo "Publication requires: candidate branch certification → finalize → git push of tag"
