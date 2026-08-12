-- ---------------------------------------------------------------------------
-- TradeIQ CSE — local development database bootstrap.
-- Executed once by the postgres docker-entrypoint on first boot (empty data
-- volume). Creates one database with a dedicated user per service, so each
-- service can only ever touch its own database.
--
-- These are local-dev credentials only. Real deployments provision databases
-- and users outside of this file with their own secrets.
-- ---------------------------------------------------------------------------

-- By default PostgreSQL grants CONNECT on every database to PUBLIC; revoke it
-- so each service's user can only ever connect to its own database.
CREATE USER market_data WITH PASSWORD 'changeme';
CREATE DATABASE market_data OWNER market_data;
REVOKE CONNECT ON DATABASE market_data FROM PUBLIC;

CREATE USER auth WITH PASSWORD 'changeme';
CREATE DATABASE auth OWNER auth;
REVOKE CONNECT ON DATABASE auth FROM PUBLIC;

CREATE USER ml WITH PASSWORD 'changeme';
CREATE DATABASE ml OWNER ml;
REVOKE CONNECT ON DATABASE ml FROM PUBLIC;
