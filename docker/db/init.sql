-- Local database initialization; runs once against an empty data volume.
-- Development passwords only. Each service owns its database.

CREATE USER market_data WITH PASSWORD 'changeme';
CREATE DATABASE market_data OWNER market_data;
REVOKE CONNECT ON DATABASE market_data FROM PUBLIC;

CREATE USER auth WITH PASSWORD 'changeme';
CREATE DATABASE auth OWNER auth;
REVOKE CONNECT ON DATABASE auth FROM PUBLIC;

CREATE USER ml WITH PASSWORD 'changeme';
CREATE DATABASE ml OWNER ml;
REVOKE CONNECT ON DATABASE ml FROM PUBLIC;
