#!/usr/bin/env bash
# Build the ToraSEO Codex Workflow Instructions ZIP locally.

set -euo pipefail

VERSION="${1:-dev}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/toraseo-codex-workflow"
OUTPUT_ZIP="$ROOT_DIR/toraseo-codex-workflow-${VERSION}.zip"

if [ ! -f "$PACKAGE_DIR/SKILL.md" ]; then
  echo "ERROR: $PACKAGE_DIR/SKILL.md not found" >&2
  exit 1
fi

rm -f "$OUTPUT_ZIP"

(
  cd "$ROOT_DIR"
  zip -r "$OUTPUT_ZIP" toraseo-codex-workflow > /dev/null
)

echo "Built: $OUTPUT_ZIP"
echo
echo "Contents:"
unzip -l "$OUTPUT_ZIP"
