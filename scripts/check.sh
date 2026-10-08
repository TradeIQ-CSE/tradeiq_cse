#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
for directory in frontend services/market-trading services/identity-auth; do
  pnpm --dir "$directory" run lint
  pnpm --dir "$directory" run typecheck
done
./scripts/build.sh
./scripts/test.sh
pnpm --dir services/market-trading run api:reference:check
for directory in services/ml-prediction pipeline/data-ingestion; do
  (cd "$directory" && uv run --frozen --all-groups ruff check .)
done
