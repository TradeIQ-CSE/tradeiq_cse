#!/usr/bin/env bash

set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

run_id="${GITHUB_RUN_ID:-local}"
run_attempt="${GITHUB_RUN_ATTEMPT:-$$}"
smoke_project="${SMOKE_PROJECT_NAME:-tradeiq-smoke-${run_id}-${run_attempt}}"
smoke_keep_stack="${SMOKE_KEEP_STACK:-0}"
smoke_log_dir="${SMOKE_LOG_DIR:-${TMPDIR:-/tmp}/tradeiq-smoke-logs/${smoke_project}}"

smoke_db_port="${SMOKE_DB_PORT:-55432}"
smoke_market_port="${SMOKE_MARKET_PORT:-53001}"
smoke_auth_port="${SMOKE_AUTH_PORT:-53002}"
smoke_ml_port="${SMOKE_ML_PORT:-58001}"
smoke_frontend_port="${SMOKE_FRONTEND_PORT:-55173}"

fail() {
  echo "compose smoke: $*" >&2
  exit 1
}

if [[ ! "$smoke_project" =~ ^tradeiq-smoke-[a-z0-9][a-z0-9-]*$ ]]; then
  fail "SMOKE_PROJECT_NAME must start with tradeiq-smoke- and contain only lowercase letters, numbers, and hyphens"
fi

if [[ "$smoke_keep_stack" != "0" && "$smoke_keep_stack" != "1" ]]; then
  fail "SMOKE_KEEP_STACK must be 0 or 1"
fi

validate_port() {
  local name="$1"
  local value="$2"
  if [[ ! "$value" =~ ^[0-9]+$ ]] || ((value < 1 || value > 65535)); then
    fail "$name must be an integer from 1 to 65535"
  fi
}

validate_port SMOKE_DB_PORT "$smoke_db_port"
validate_port SMOKE_MARKET_PORT "$smoke_market_port"
validate_port SMOKE_AUTH_PORT "$smoke_auth_port"
validate_port SMOKE_ML_PORT "$smoke_ml_port"
validate_port SMOKE_FRONTEND_PORT "$smoke_frontend_port"

seen_ports=()
for port in \
  "$smoke_db_port" \
  "$smoke_market_port" \
  "$smoke_auth_port" \
  "$smoke_ml_port" \
  "$smoke_frontend_port"; do
  for seen_port in "${seen_ports[@]:-}"; do
    if [[ "$seen_port" == "$port" ]]; then
      fail "smoke host ports must be distinct; $port is configured more than once"
    fi
  done
  seen_ports+=("$port")
done

mkdir -p "$smoke_log_dir"

export NODE_ENV=test
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=changeme
export DB_PORT=5432
export MARKET_TRADING_PORT=3001
export IDENTITY_AUTH_PORT=3002
export ML_PREDICTION_PORT=8001
export FRONTEND_PORT=5173
export SMOKE_DB_PORT="$smoke_db_port"
export SMOKE_MARKET_PORT="$smoke_market_port"
export SMOKE_AUTH_PORT="$smoke_auth_port"
export SMOKE_ML_PORT="$smoke_ml_port"
export SMOKE_FRONTEND_PORT="$smoke_frontend_port"
export MARKET_INGESTION_TOKEN=smoke-only-market-ingestion-token-123456
# The published development pair. The smoke stack runs with NODE_ENV
# unset, so the production-only rejection does not apply, and using the
# committed pair keeps this script from carrying key material of its own.
export AUTH_JWT_PRIVATE_KEY="$(grep '^AUTH_JWT_PRIVATE_KEY=' "$repo_root/.env.example" | cut -d= -f2-)"
export AUTH_JWT_PUBLIC_KEYS="$(grep '^AUTH_JWT_PUBLIC_KEYS=' "$repo_root/.env.example" | cut -d= -f2-)"
export AUTH_EMAIL_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
export AUTH_REFRESH_COOKIE_SECURE=false
export MARKET_TRADING_CORS_ORIGINS="http://localhost:${smoke_frontend_port}"
export IDENTITY_AUTH_CORS_ORIGINS="http://localhost:${smoke_frontend_port}"
export CSE_SEED_DATA_DIR=
export CSE_DATA_SOURCE_URL=
export VITE_MARKET_TRADING_API_URL="http://localhost:${smoke_market_port}"
export VITE_IDENTITY_AUTH_API_URL="http://localhost:${smoke_auth_port}"
export SMOKE_IMAGE_TAG="$smoke_project"
export SMOKE_MARKET_URL="http://localhost:${smoke_market_port}"
export SMOKE_AUTH_URL="http://localhost:${smoke_auth_port}"
export SMOKE_ML_URL="http://localhost:${smoke_ml_port}"
export SMOKE_FRONTEND_URL="http://localhost:${smoke_frontend_port}"

compose_args=(
  --project-directory "$repo_root"
  --project-name "$smoke_project"
  --file "$repo_root/docker-compose.yml"
  --file "$repo_root/docker-compose.smoke.yml"
)

compose() {
  docker compose "${compose_args[@]}" "$@"
}

capture_diagnostics() {
  echo "compose smoke: capturing diagnostics in $smoke_log_dir" >&2
  compose ps --all >"$smoke_log_dir/compose-ps.txt" 2>&1 || true
  compose logs --no-color --timestamps 2>&1 \
    | sed $'s/\033\[[0-9;]*m//g' >"$smoke_log_dir/compose.log" || true
  if [[ -s "$smoke_log_dir/compose-ps.txt" ]]; then
    cat "$smoke_log_dir/compose-ps.txt" >&2
  fi
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  set +e

  if ((status != 0)); then
    capture_diagnostics
  fi

  if [[ "$smoke_keep_stack" == "1" ]]; then
    echo "compose smoke: keeping project $smoke_project for inspection" >&2
  else
    compose down --volumes --remove-orphans --rmi local --timeout 10 \
      >"$smoke_log_dir/compose-down.log" 2>&1
    if [[ $? -ne 0 ]]; then
      echo "compose smoke: cleanup failed; see $smoke_log_dir/compose-down.log" >&2
      if ((status == 0)); then
        status=1
      fi
    fi
    docker image rm \
      "tradeiq-smoke/market-trading:${SMOKE_IMAGE_TAG}" \
      "tradeiq-smoke/identity-auth:${SMOKE_IMAGE_TAG}" \
      "tradeiq-smoke/ml-prediction:${SMOKE_IMAGE_TAG}" \
      >>"$smoke_log_dir/compose-down.log" 2>&1 || true
  fi

  exit "$status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

wait_for_completed_job() {
  local service="$1"
  local timeout_seconds="${2:-300}"
  local container_id
  local state
  local exit_code
  local deadline=$((SECONDS + timeout_seconds))

  container_id="$(compose ps --all --quiet "$service")"
  if [[ -z "$container_id" ]]; then
    fail "$service container was not created"
  fi

  while ((SECONDS < deadline)); do
    state="$(docker inspect --format '{{.State.Status}}' "$container_id" 2>/dev/null || true)"
    case "$state" in
      exited)
        exit_code="$(docker inspect --format '{{.State.ExitCode}}' "$container_id")"
        if [[ "$exit_code" != "0" ]]; then
          fail "$service exited with code $exit_code"
        fi
        echo "compose smoke: $service completed successfully"
        return
        ;;
      dead)
        fail "$service entered the dead state"
        ;;
      created | running | restarting | paused | "")
        sleep 2
        ;;
      *)
        fail "$service entered unexpected state $state"
        ;;
    esac
  done

  fail "$service did not complete within ${timeout_seconds}s"
}

command -v docker >/dev/null 2>&1 || fail "Docker is required"
command -v node >/dev/null 2>&1 || fail "Node.js 20 is required"
docker info >/dev/null 2>&1 || fail "Docker Engine is not reachable"

compose_version="$(docker compose version --short 2>/dev/null)" || \
  fail "Docker Compose 2.24.4 or later is required"
compose_version="${compose_version#v}"
if [[ ! "$compose_version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+) ]]; then
  fail "Docker Compose 2.24.4 or later is required; found $compose_version"
fi
compose_major="${BASH_REMATCH[1]}"
compose_minor="${BASH_REMATCH[2]}"
compose_patch="${BASH_REMATCH[3]}"
if ((compose_major < 2)) || \
  ((compose_major == 2 && compose_minor < 24)) || \
  ((compose_major == 2 && compose_minor == 24 && compose_patch < 4)); then
  fail "Docker Compose 2.24.4 or later is required; found $compose_version"
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$node_major" != "20" ]]; then
  fail "Node.js 20 is required; found $(node --version)"
fi

if [[ -n "$(compose ps --all --quiet)" ]]; then
  fail "Compose project $smoke_project already exists; choose another SMOKE_PROJECT_NAME or remove that exact smoke project"
fi

compose config --quiet

echo "compose smoke: starting isolated project $smoke_project"
echo "compose smoke: logs: $smoke_log_dir"
compose up --detach --build --remove-orphans 2>&1 | tee "$smoke_log_dir/compose-up.log"

wait_for_completed_job ml-prediction-migrate
wait_for_completed_job market-data-seed

node "$repo_root/scripts/compose-smoke.mjs" 2>&1 | tee "$smoke_log_dir/journey.log"

echo "compose smoke: PASS"
