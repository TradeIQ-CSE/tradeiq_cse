#!/usr/bin/env bash
# Actual repository nginx routes, with strict service fixtures and a SPA fallback.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
proxy_project="tradeiq-reference-proxy-$$"
proxy_port="${PUBLIC_API_PROXY_TEST_PORT:-55987}"
cleanup() {
  docker rm -f "$proxy_project-nginx" "$proxy_project-fixture" >/dev/null 2>&1 || true
  docker network rm "$proxy_project" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cd "$repo_root"
docker network create "$proxy_project" >/dev/null
docker run --detach --name "$proxy_project-fixture" --network "$proxy_project" \
  --network-alias market-trading --network-alias frontend \
  --mount "type=bind,src=$repo_root,dst=/work,readonly" --workdir /work \
  node:22-alpine node scripts/public-api-proxy-fixture.mjs >/dev/null
docker run --detach --name "$proxy_project-nginx" --network "$proxy_project" \
  --publish "127.0.0.1:$proxy_port:80" \
  --mount "type=bind,src=$repo_root/deploy/nginx/bootstrap.conf,dst=/etc/nginx/conf.d/default.conf,readonly" \
  --mount "type=bind,src=$repo_root/deploy/nginx/common.conf,dst=/etc/nginx/common.conf,readonly" \
  --mount "type=bind,src=$repo_root/deploy/nginx/cache.conf,dst=/etc/nginx/conf.d/cache.conf,readonly" \
  --mount "type=bind,src=$repo_root/deploy/nginx/rate-limit.conf,dst=/etc/nginx/conf.d/rate-limit.conf,readonly" \
  --mount "type=bind,src=$repo_root/deploy/nginx/proxy_params,dst=/etc/nginx/proxy_params,readonly" \
  nginx:1.29-alpine >/dev/null
docker exec "$proxy_project-nginx" nginx -t
node scripts/public-api-smoke.mjs "http://127.0.0.1:$proxy_port/api/public/v1"
node --input-type=module -e "const r = await fetch('http://127.0.0.1:$proxy_port/developers/reference'); if (!(await r.text()).includes('SPA fallback')) process.exit(1);"
# Deliberately wrong prefix proves a SPA 200 cannot pass the acceptance probe.
if node scripts/public-api-smoke.mjs "http://127.0.0.1:$proxy_port/incorrect/public/v1"; then
  echo 'Proxy regression check incorrectly accepted SPA fallback' >&2
  exit 1
fi
echo 'Public API nginx routing regression: PASS (SPA fallback rejected)'
