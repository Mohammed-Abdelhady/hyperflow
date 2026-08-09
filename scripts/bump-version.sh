#!/usr/bin/env bash
# Stamp a prepared release version. This helper never commits, tags, or pushes.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ "${HYPERFLOW_RELEASE_PREPARE:-0}" != "1" ]; then
  printf 'Error: use scripts/release.sh; direct version stamping is disabled.\n' >&2
  exit 1
fi

VERSION="${1:-}"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  printf 'Usage: scripts/bump-version.sh X.Y.Z\n' >&2
  exit 1
fi

if sed --version >/dev/null 2>&1; then
  SED_IN_PLACE=(-i)
else
  SED_IN_PLACE=(-i '')
fi

replace() {
  local expression="$1" file="$2"
  [ -f "$file" ] || return
  sed "${SED_IN_PLACE[@]}" "$expression" "$file"
}

for file in \
  "$ROOT/package.json" \
  "$ROOT/.claude-plugin/plugin.json" \
  "$ROOT/.claude-plugin/marketplace.json" \
  "$ROOT/.codex-plugin/plugin.json"; do
  [ -f "$file" ] || { printf 'Error: missing manifest: %s\n' "$file" >&2; exit 1; }
  replace 's/"version": "[0-9][0-9.]*"/"version": "'"$VERSION"'"/g' "$file"
done

printf '%s\n' "$VERSION" > "$ROOT/skills/hyperflow/VERSION"
for skill in hyperflow plan dispatch trace audit deploy handoff; do
  replace 's/^version: [0-9][0-9.]*/version: '"$VERSION"'/' "$ROOT/skills/$skill/SKILL.md"
done

for file in "$ROOT/AGENTS.md" "$ROOT/CLAUDE.md"; do
  replace 's/hyperflow:doctrine:start version=[0-9][0-9.]*/hyperflow:doctrine:start version='"$VERSION"'/' "$file"
done

replace 's/<code>v[0-9][0-9.]*<\/code>/<code>v'"$VERSION"'<\/code>/g' "$ROOT/README.md"
replace 's/\[!\[version v[0-9][0-9.]*\]/[![version v'"$VERSION"']/' "$ROOT/README.md"
replace 's/badge\/version-v[0-9][0-9.]*-blueviolet/badge\/version-v'"$VERSION"'-blueviolet/g' "$ROOT/README.md"

node - "$VERSION" "$ROOT/CHANGELOG.md" <<'NODE'
const [version, path] = process.argv.slice(2);
const fs = require("node:fs");
const source = fs.readFileSync(path, "utf8");
const marker = "## [Unreleased]\n";
if (!source.includes(marker)) throw new Error("CHANGELOG.md is missing [Unreleased]");
const date = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path, source.replace(marker, `${marker}\n## [${version}] — ${date}\n`));
NODE

printf 'Stamped Hyperflow %s. No commit, tag, or push was created.\n' "$VERSION"
