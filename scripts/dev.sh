#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
cd "$repo_root"
if [[ ! -f .env ]]; then
  echo 'Create the local configuration first: cp .env.example .env' >&2
  exit 1
fi
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != 20 ]]; then
  echo 'Node.js 20 is required. Select the version in .node-version, then retry.' >&2
  exit 1
fi
command -v pnpm >/dev/null || { echo 'pnpm 9.15.0 is required.' >&2; exit 1; }
docker compose up --detach --wait db redis
exec node "$script_dir/dev.mjs"
