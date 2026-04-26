#!/usr/bin/env bash
# Build the ToraSEO skill ZIP locally.
#
# Output: toraseo-skill-<version>.zip in the current directory.
# The ZIP contains a top-level "toraseo/" folder with SKILL.md
# at its root — the structure Claude Desktop expects.
#
# Use this to test the ZIP locally before pushing a git tag. CI
# (.github/workflows/release-skill.yml) does the same thing
# automatically on every "v*" tag.
#
# Usage:
#   ./scripts/build-skill.sh              # uses "dev" as version suffix
#   ./scripts/build-skill.sh v0.1.0       # uses provided version

set -euo pipefail

VERSION="${1:-dev}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_DIR="$ROOT_DIR/skill"
STAGING_DIR="$(mktemp -d)"
OUTPUT_ZIP="$ROOT_DIR/toraseo-skill-${VERSION}.zip"

trap 'rm -rf "$STAGING_DIR"' EXIT

# Sanity: SKILL.md must exist with required frontmatter
if [ ! -f "$SKILL_DIR/SKILL.md" ]; then
  echo "ERROR: $SKILL_DIR/SKILL.md not found" >&2
  exit 1
fi

if ! grep -q "^name:" "$SKILL_DIR/SKILL.md"; then
  echo "ERROR: SKILL.md is missing 'name:' frontmatter field" >&2
  exit 1
fi

if ! grep -q "^description:" "$SKILL_DIR/SKILL.md"; then
  echo "ERROR: SKILL.md is missing 'description:' frontmatter field" >&2
  exit 1
fi

# Stage skill/ contents under a top-level "toraseo/" folder.
# The folder name must match the "name:" field in frontmatter so
# Claude Desktop discovers the skill correctly.
mkdir -p "$STAGING_DIR/toraseo"
cp -r "$SKILL_DIR/." "$STAGING_DIR/toraseo/"

# Zip it up
(
  cd "$STAGING_DIR"
  zip -r "$OUTPUT_ZIP" toraseo > /dev/null
)

echo "Built: $OUTPUT_ZIP"
echo
echo "Contents:"
unzip -l "$OUTPUT_ZIP"
