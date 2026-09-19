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
# config, this script) and the images GHCR holds for the tracked branch. Either
# changing is reason enough to re-apply.
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/tradeiq}
BRANCH=${DEPLOY_BRANCH:-dev}
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"

cd "$APP_DIR"

# .env.production is gitignored, so a hard reset cannot destroy the secrets.
# Reset rather than pull: the checkout must match the branch exactly, and a
# local edit made while debugging should not block the next deploy.
commit_before=$(git rev-parse HEAD)
git fetch --quiet origin "$BRANCH"
git reset --quiet --hard "origin/$BRANCH"
commit_after=$(git rev-parse HEAD)

images_before=$($COMPOSE images --quiet | sort | md5sum)
$COMPOSE pull --quiet
images_after=$($COMPOSE images --quiet | sort | md5sum)

# A config-only change (nginx, compose, this script) ships no new image but must
# still be applied, so the commit is checked as well as the image digests.
if [ "$commit_before" = "$commit_after" ] &&
   [ "$images_before" = "$images_after" ] &&
   [ "${FORCE:-}" != "1" ]; then
  echo "no changes; nothing to do"
  exit 0
fi

# --remove-orphans so a service deleted from the compose file actually stops.
$COMPOSE up -d --remove-orphans

# nginx resolves its upstreams once at start-up. Replacing a service container
# gives it a new address on the Compose network, and without this reload nginx
# keeps proxying to the dead one — a deploy that "succeeds" into 502s.
$COMPOSE exec -T nginx nginx -s reload 2>/dev/null \
  || echo "warning: could not reload nginx; is it running?"

# Images pile up fast on a 30 GiB disk: every deploy leaves the previous five
# behind. Keep a week so a rollback can still find them locally.
docker image prune --force --filter "until=168h" >/dev/null

echo "deployed $(git rev-parse --short HEAD) on $BRANCH"
