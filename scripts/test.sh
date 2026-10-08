#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
node --test scripts/local-tools.test.mjs scripts/public-api-smoke.test.mjs scripts/release-manifest.test.mjs
bash scripts/publish-release.test.sh
pnpm --dir frontend run test
for directory in services/market-trading services/identity-auth; do
  pnpm --dir "$directory" run test --runInBand
done
for directory in services/ml-prediction pipeline/data-ingestion; do
  (cd "$directory" && uv run --frozen --all-groups pytest)
done
