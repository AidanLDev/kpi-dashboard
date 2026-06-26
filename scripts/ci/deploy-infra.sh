#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/ci/load-env.sh
source "$SCRIPT_DIR/load-env.sh"

INFRA_DIRS="infrastructure/ api/"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LAST_DEPLOYED_COMMIT_FILE="$REPO_ROOT/.last-infra-deploy"

cd "$REPO_ROOT"

# Determine base commit to diff against
if [[ -f "$LAST_DEPLOYED_COMMIT_FILE" ]]; then
  BASE=$(cat "$LAST_DEPLOYED_COMMIT_FILE")
  echo "=== Checking for infrastructure changes since $BASE ==="
else
  BASE="HEAD~1"
  echo "=== No previous deploy recorded, diffing against HEAD~1 ==="
fi

CHANGED=$(git diff --name-only "$BASE" HEAD -- $INFRA_DIRS 2>/dev/null || true)

if [[ -z "$CHANGED" ]]; then
  echo "=== No infrastructure changes detected, skipping CDK deploy ==="
  exit 0
fi

echo "=== Infrastructure changes detected ==="
echo "$CHANGED"
echo ""

# pnpm on /mnt/c/ (NTFS) installs Windows binaries even from WSL, which breaks
# esbuild bundling. Copy source to a WSL-native temp dir and build there.
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

echo "=== Copying source to WSL build dir ==="
rsync -a --exclude=node_modules --exclude=cdk.out "$REPO_ROOT/api/" "$BUILD_DIR/api/"
rsync -a --exclude=node_modules --exclude=cdk.out "$REPO_ROOT/infrastructure/" "$BUILD_DIR/infrastructure/"

echo "=== Installing dependencies ==="
cd "$BUILD_DIR/api"
pnpm install --frozen-lockfile

cd "$BUILD_DIR/infrastructure"
pnpm install --frozen-lockfile

echo "=== Running CDK deploy ==="
npx cdk deploy --require-approval never

git -C "$REPO_ROOT" rev-parse HEAD > "$LAST_DEPLOYED_COMMIT_FILE"
echo "=== Infrastructure deployed ==="
