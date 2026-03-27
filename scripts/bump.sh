#!/usr/bin/env bash
set -euo pipefail

BUMP="${1:-patch}"

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Usage: npm run bump -- [patch|minor|major]" >&2
  exit 1
fi

# Bump version in package.json (no git tag)
npm version "$BUMP" --no-git-tag-version --no-commit-hooks > /dev/null

# Read the new version
VERSION=$(node -p "require('./package.json').version")
DATE=$(date +%Y-%m-%d)

# Move [Unreleased] content into the new versioned section in CHANGELOG.md
sed -i "s/^## \[Unreleased\]/## [Unreleased]\n\n## [$VERSION] — $DATE/" CHANGELOG.md

echo "Bumped to $VERSION"
