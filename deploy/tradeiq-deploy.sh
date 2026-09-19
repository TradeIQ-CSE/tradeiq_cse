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

cd "$APP_DIR"

# .env.production is gitignored, so a hard reset cannot destroy the secrets.
# Reset rather than pull: the checkout must match the branch exactly, and a
# local edit made while debugging should not block the next deploy.
git fetch --quiet origin "$BRANCH"
git reset --quiet --hard "origin/$BRANCH"

$COMPOSE pull --quiet

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

# Images pile up fast on a 30 GiB disk: every deploy leaves the previous five
# behind. Keep a week so a rollback can still find them locally.
docker image prune --force --filter "until=168h" >/dev/null

echo "deployed $(git rev-parse --short HEAD) on $BRANCH"
