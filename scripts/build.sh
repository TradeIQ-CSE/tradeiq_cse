#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for directory in frontend services/market-trading services/identity-auth; do
  pnpm --dir "$repo_root/$directory" run build
done
