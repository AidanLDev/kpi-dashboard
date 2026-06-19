#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/ci/load-env.sh
source "$SCRIPT_DIR/load-env.sh"

: "${SITE_BUCKET_NAME:?SITE_BUCKET_NAME must be set}"
: "${CLOUDFRONT_DISTRIBUTION_ID:?CLOUDFRONT_DISTRIBUTION_ID must be set}"
: "${AWS_REGION:?AWS_REGION must be set}"

REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# pnpm can't install on /mnt/c/ (NTFS rename restrictions in WSL).
# Copy source to a WSL-native temp dir, build there, then sync output back.
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

echo "=== Copying source to WSL build dir ==="
rsync -a --exclude=node_modules --exclude=.next --exclude=out "$REPO_ROOT/web/" "$BUILD_DIR/"

echo "=== Building frontend ==="
cd "$BUILD_DIR"
pnpm install --frozen-lockfile
pnpm run build

echo "=== Syncing to S3 ==="
aws s3 sync "$BUILD_DIR/out/" "s3://${SITE_BUCKET_NAME}" --delete

echo "=== Invalidating CloudFront ==="
aws cloudfront create-invalidation \
  --distribution-id "${CLOUDFRONT_DISTRIBUTION_ID}" \
  --paths "/*"

echo "=== Frontend deployed ==="
