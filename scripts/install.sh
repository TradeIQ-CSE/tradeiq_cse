#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for directory in frontend services/market-trading services/identity-auth; do
  pnpm --dir "$repo_root/$directory" install --frozen-lockfile "$@"
done
for directory in services/ml-prediction pipeline/data-ingestion; do
  uv sync --project "$repo_root/$directory" --frozen --all-groups
done
