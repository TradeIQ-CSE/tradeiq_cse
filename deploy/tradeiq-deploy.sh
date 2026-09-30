#!/usr/bin/env bash
# Pull-based deploy. Run by tradeiq-deploy.timer every few minutes.
#
# The server reaches out; CI never reaches in. That is the whole point: port 22
# stays closed to everything except a known address, there is no deploy key in
# GitHub secrets to leak, and a compromised CI account cannot open a shell here.
# The cost is latency — a merge takes a few minutes to appear rather than being
# pushed the instant the build finishes.
#
# Both halves of a deploy are pulled: the git checkout (compose file, nginx
# config, this script) and the images GHCR holds for the tracked branch.
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/tradeiq}
BRANCH=${DEPLOY_BRANCH:-dev}
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
NGINX_STATE_FILE="$APP_DIR/.deploy/nginx-config.sha256"

cd "$APP_DIR"

# .env.production is gitignored, so a hard reset cannot destroy the secrets.
# Reset rather than pull: the checkout must match the branch exactly, and a
# local edit made while debugging should not block the next deploy.
git fetch --quiet origin "$BRANCH"
git reset --quiet --hard "origin/$BRANCH"

$COMPOSE pull --quiet

# Compose does not detect changed file contents. Git can replace a bind-mounted
# config inode, so a plain reload may still read the old file. Recreate only
# nginx when the checked-out candidate differs from the last validated deploy.
nginx_digest="$({ find deploy/nginx -type f -print0; printf 'docker-compose.prod.yml\0'; } | sort -z | xargs -0 sha256sum | sha256sum | cut -d ' ' -f 1)"
previous_nginx_digest="$(cat "$NGINX_STATE_FILE" 2>/dev/null || true)"
if [[ "$nginx_digest" != "$previous_nginx_digest" ]]; then
  # A one-off container sees the NEW mounts without replacing the serving
  # nginx or publishing ports. Select the same candidate as the entrypoint.
  $COMPOSE run --rm --no-deps --entrypoint /bin/sh nginx -ec '
    if [ -f /etc/letsencrypt/live/tradeiqcse.tech/fullchain.pem ]; then
      cp /etc/nginx/available/tls.conf /etc/nginx/conf.d/default.conf
    else
      cp /etc/nginx/available/bootstrap.conf /etc/nginx/conf.d/default.conf
    fi
    nginx -t
  '
  # After accepting a different candidate, any failed rollout must force
  # another refresh next time, including a rollback to the old digest.
  rm -f "$NGINX_STATE_FILE"
fi

# No "has anything changed?" check. `up -d` already recreates only the
# containers whose image or configuration actually moved, and leaves the rest
# running, so guarding it bought nothing.
#
# An earlier version compared `compose images` before and after the pull. That
# reports the image IDs of the RUNNING containers, which by definition do not
# change until `up -d` runs, so the comparison always said "no change" and a
# freshly built image was never deployed. It failed silently, reporting success.
#
# --remove-orphans so a service deleted from the compose file actually stops.
$COMPOSE up -d --remove-orphans

if [[ "$nginx_digest" != "$previous_nginx_digest" ]]; then
  $COMPOSE up -d --no-deps --force-recreate nginx
fi
$COMPOSE exec -T nginx nginx -t
# Node is already in the frontend image; the production host needs no Node
# installation. Run from there against the canonical externally served URL.
$COMPOSE exec -T frontend node --input-type=module < scripts/public-api-smoke.mjs
if [[ "$nginx_digest" != "$previous_nginx_digest" ]]; then
  mkdir -p "$(dirname "$NGINX_STATE_FILE")"
  printf '%s\n' "$nginx_digest" > "$NGINX_STATE_FILE.tmp"
  mv "$NGINX_STATE_FILE.tmp" "$NGINX_STATE_FILE"
fi

# Images pile up fast on a 30 GiB disk: every deploy leaves the previous five
# behind. Keep a week so a rollback can still find them locally.
docker image prune --force --filter "until=168h" >/dev/null

echo "deployed $(git rev-parse --short HEAD) on $BRANCH"
