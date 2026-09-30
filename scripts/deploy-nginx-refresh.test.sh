#!/usr/bin/env bash
# Repository-only deployment-flow test. Git and Docker are replaced with fixtures.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
task_dir="$(mktemp -d)"
trap 'rm -rf "$task_dir"' EXIT
mkdir -p "$task_dir/bin" "$task_dir/app/deploy/nginx" "$task_dir/app/scripts"
printf 'fixture\n' > "$task_dir/app/deploy/nginx/common.conf"
printf 'fixture\n' > "$task_dir/app/docker-compose.prod.yml"
cp "$repo_root/scripts/public-api-smoke.mjs" "$task_dir/app/scripts/"
export DEPLOY_FIXTURE_LOG="$task_dir/log"
cat > "$task_dir/bin/git" <<'MOCK'
#!/usr/bin/env bash
[[ "$1" != rev-parse ]] || printf 'fixture-revision\n'
MOCK
cat > "$task_dir/bin/docker" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$DEPLOY_FIXTURE_LOG"
if [[ "$*" == *'run --rm --no-deps --entrypoint /bin/sh nginx'* && "${DEPLOY_FIXTURE_INVALID:-0}" == 1 ]]; then exit 1; fi
if [[ "$*" == *'exec -T frontend node'* ]]; then cat >/dev/null; [[ "${DEPLOY_FIXTURE_SMOKE_FAIL:-0}" != 1 ]] || exit 1; fi
MOCK
chmod +x "$task_dir/bin/"*
export PATH="$task_dir/bin:$PATH"
export APP_DIR="$task_dir/app"
bash "$repo_root/deploy/tradeiq-deploy.sh" >/dev/null
rg -q 'run --rm --no-deps --entrypoint /bin/sh nginx' "$DEPLOY_FIXTURE_LOG"
rg -q 'up -d --no-deps --force-recreate nginx' "$DEPLOY_FIXTURE_LOG"
first_digest="$(cat "$APP_DIR/.deploy/nginx-config.sha256")"
: > "$DEPLOY_FIXTURE_LOG"
bash "$repo_root/deploy/tradeiq-deploy.sh" >/dev/null
if rg -q 'force-recreate|run --rm' "$DEPLOY_FIXTURE_LOG"; then echo 'Unchanged config unnecessarily replaced nginx' >&2; exit 1; fi
rg -q 'exec -T frontend node' "$DEPLOY_FIXTURE_LOG"
printf 'changed fixture\n' > "$APP_DIR/deploy/nginx/common.conf"
: > "$DEPLOY_FIXTURE_LOG"
if DEPLOY_FIXTURE_INVALID=1 bash "$repo_root/deploy/tradeiq-deploy.sh" >/dev/null; then echo 'Invalid candidate was accepted' >&2; exit 1; fi
if rg -q 'up -d' "$DEPLOY_FIXTURE_LOG"; then echo 'Invalid candidate changed serving containers' >&2; exit 1; fi
[[ "$(cat "$APP_DIR/.deploy/nginx-config.sha256")" == "$first_digest" ]]
if DEPLOY_FIXTURE_SMOKE_FAIL=1 bash "$repo_root/deploy/tradeiq-deploy.sh" >/dev/null; then echo 'Failed smoke was accepted' >&2; exit 1; fi
[[ ! -f "$APP_DIR/.deploy/nginx-config.sha256" ]]
: > "$DEPLOY_FIXTURE_LOG"
bash "$repo_root/deploy/tradeiq-deploy.sh" >/dev/null
rg -q 'force-recreate' "$DEPLOY_FIXTURE_LOG"
echo 'Nginx deploy flow: PASS (changed-only recreation; invalid candidate rejected)'
