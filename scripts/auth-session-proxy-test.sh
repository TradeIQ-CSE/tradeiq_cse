#!/usr/bin/env bash
# Test the deployed auth prefix with a real TLS nginx and curl's cookie jar.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
proxy_project="tradeiq-auth-cookie-$$"
proxy_port="${AUTH_SESSION_PROXY_TEST_PORT:-55988}"
fixture_dir="$(mktemp -d)"
cleanup() {
  docker rm -f "$proxy_project-nginx" "$proxy_project-fixture" >/dev/null 2>&1 || true
  docker network rm "$proxy_project" >/dev/null 2>&1 || true
  rm -rf "$fixture_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$fixture_dir/key.pem" \
  -out "$fixture_dir/cert.pem" -days 1 -subj '/CN=localhost' >/dev/null 2>&1
cat > "$fixture_dir/server.conf" <<'NGINX'
server {
    listen 443 ssl;
    server_name localhost;
    ssl_certificate /fixtures/cert.pem;
    ssl_certificate_key /fixtures/key.pem;
    include /etc/nginx/common.conf;
}
NGINX
docker network create "$proxy_project" >/dev/null
docker run --detach --name "$proxy_project-fixture" --network "$proxy_project" \
  --network-alias identity-auth --network-alias market-trading --network-alias frontend \
  --mount "type=bind,src=$repo_root,dst=/work,readonly" --workdir /work \
  node:22-alpine node scripts/auth-session-proxy-fixture.mjs >/dev/null
docker run --detach --name "$proxy_project-nginx" --network "$proxy_project" \
  --publish "127.0.0.1:$proxy_port:443" \
  --mount "type=bind,src=$fixture_dir,dst=/fixtures,readonly" \
  --mount "type=bind,src=$fixture_dir/server.conf,dst=/etc/nginx/conf.d/default.conf,readonly" \
  --mount "type=bind,src=$repo_root/deploy/nginx/common.conf,dst=/etc/nginx/common.conf,readonly" \
  --mount "type=bind,src=$repo_root/deploy/nginx/cache.conf,dst=/etc/nginx/conf.d/cache.conf,readonly" \
  --mount "type=bind,src=$repo_root/deploy/nginx/rate-limit.conf,dst=/etc/nginx/conf.d/rate-limit.conf,readonly" \
  --mount "type=bind,src=$repo_root/deploy/nginx/proxy_params,dst=/etc/nginx/proxy_params,readonly" \
  nginx:1.29-alpine >/dev/null
docker exec "$proxy_project-nginx" nginx -t
base="https://localhost:$proxy_port"
for attempt in {1..30}; do
  if curl --silent --insecure --fail "$base/markets" >/dev/null; then break; fi
  sleep 1
done
request() {
  local status
  status="$(curl --silent --show-error --insecure --request "$1" \
    --cookie "$fixture_dir/cookies" --cookie-jar "$fixture_dir/cookies" \
    --dump-header "$fixture_dir/headers" --output "$fixture_dir/body" \
    --write-out '%{http_code}' "$base$2")"
  [[ "$status" == "$3" ]] || { echo "$1 $2: expected $3, got $status" >&2; exit 1; }
}
check_cookie() {
  # Login, signup AND rotation must preserve every security attribute.
  rg_cookie='[Ss]et-[Cc]ookie: refresh_token=.*[Pp]ath=/api/auth/auth;.*HttpOnly;.*Secure;.*SameSite=Lax'
  grep -Eq "$rg_cookie" "$fixture_dir/headers" || { echo 'Cookie scope or security attributes incorrect' >&2; exit 1; }
}
for entry in login signup; do
  request POST "/api/auth/auth/$entry" 200
  check_cookie
  request POST /api/auth/auth/refresh 200
  check_cookie
  request POST /api/auth/auth/refresh 200
  check_cookie
  # Cookie must not go to frontend routes or the market service.
  request GET /markets 200
  request GET /api/market/securities 200
  request POST /api/auth/auth/logout 200
  grep -Eq '[Pp]ath=/api/auth/auth;' "$fixture_dir/headers"
  if grep -q refresh_token "$fixture_dir/cookies"; then
    echo "Logout left a refresh cookie in the browser jar" >&2; exit 1
  fi
  request POST /api/auth/auth/refresh 401
  echo "PASS: $entry, repeated rotation, cookie isolation, logout and rejected restore"
done
echo 'Auth session nginx cookie regression: PASS'
