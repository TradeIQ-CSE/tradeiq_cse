#!/bin/bash
# Production counterpart to init.sql, which hardcodes the local-dev passwords.
#
# Run once by the postgres docker-entrypoint on first boot (empty data volume),
# INSTEAD OF init.sql — docker-compose.prod.yml mounts this in its place. The
# passwords arrive as environment variables so no real credential is ever
# written into a file in this repository.
#
# Because it only runs against an empty volume, changing a password in
# .env.production later has no effect on an existing database. Rotate with
# `ALTER USER market_data WITH PASSWORD '...'` and update .env.production to
# match, or destroy the volume and let this run again.
set -euo pipefail

for var in MARKET_DATA_DB_PASSWORD AUTH_DB_PASSWORD ML_DB_PASSWORD; do
  if [ -z "${!var:-}" ]; then
    echo "init.prod.sh: $var is empty; refusing to create a user without a password" >&2
    exit 1
  fi
done

# --set + quote_literal keeps the password out of the shell-expanded SQL text,
# so a password containing a quote cannot break out of the statement.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" \
  -v market_data_pw="$MARKET_DATA_DB_PASSWORD" \
  -v auth_pw="$AUTH_DB_PASSWORD" \
  -v ml_pw="$ML_DB_PASSWORD" <<'SQL'
-- One database with a dedicated user per service, so each service can only
-- ever touch its own. PostgreSQL grants CONNECT to PUBLIC by default; revoking
-- it is what actually enforces that.
CREATE USER market_data WITH PASSWORD :'market_data_pw';
CREATE DATABASE market_data OWNER market_data;
REVOKE CONNECT ON DATABASE market_data FROM PUBLIC;

CREATE USER auth WITH PASSWORD :'auth_pw';
CREATE DATABASE auth OWNER auth;
REVOKE CONNECT ON DATABASE auth FROM PUBLIC;

CREATE USER ml WITH PASSWORD :'ml_pw';
CREATE DATABASE ml OWNER ml;
REVOKE CONNECT ON DATABASE ml FROM PUBLIC;
SQL
