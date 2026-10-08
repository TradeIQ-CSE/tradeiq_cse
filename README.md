# TradeIQ CSE

TradeIQ helps users explore Colombo Stock Exchange data, test trading rules on
historical prices and practise trades with virtual money. The application includes
market charts, authentication, backtesting, portfolios, paper orders and a public
read-only developer API. Market data is end-of-day; paper orders do not reach an exchange.

## Repository layout

```text
frontend/                     React, Vite and TypeScript application
services/market-trading/       Market data, backtesting, paper trading and developer API
services/identity-auth/        Accounts, authentication and sessions
services/ml-prediction/        ML API scaffold and database migrations
pipeline/data-ingestion/      Historical dataset release importer
scripts/                      Local startup, checks and integration smoke tests
docker/db/                    Local database bootstrap
config/nginx/                 Shared HTTP routing, cache and rate-limit rules
.github/workflows/            CI checks and image publishing
docs/api/                     API and behaviour contracts
docs/adr/                     Architecture decisions
docs/ops/                     Deployment instructions
docker-compose.yml            Local assembled application
.env.example                  Single configuration example
```

Each JavaScript application has its own `package.json`, `pnpm-lock.yaml` and
`node_modules`. Each Python application has its own `pyproject.toml`, `uv.lock`
and virtual environment. No dependency installation is needed at the repository root.

Production Compose, secrets, TLS settings and deployment helpers are owned by
the server under `/opt/tradeiq`. They are not part of this application checkout.
The VM runs published images without a source checkout or local builds.

## Requirements

- Node.js 20 (the local version is recorded in `.node-version`). With fnm: `fnm use`.
- pnpm 9.15.0: `corepack enable && corepack prepare pnpm@9.15.0 --activate`.
- uv and Python 3.11 or 3.12 for Python services.
- Docker with Compose 2.24.4 or later.

## Local development with hot reload

From this directory:

```sh
cp .env.example .env
./scripts/install.sh
./scripts/dev.sh
```

`install.sh` installs each application's locked dependencies. `dev.sh` starts
PostgreSQL and Redis, waits for them to become ready, then launches Vite and the
two Nest services in watch mode. The frontend is at `http://localhost:5173`;
market-trading is at port 3001 and identity-auth at port 3002.

Ctrl+C stops the development watchers. PostgreSQL and Redis remain available,
and their saved data is retained. To stop these containers:

```sh
docker compose stop db redis
```

An empty database needs historical data before market charts and backtests can
show results. After the market API starts and applies its migrations, import the
bundled sample or the release configured in `CSE_DATASET_ARTIFACT`:

```sh
./scripts/run.sh data-ingestion python -m data_ingestion.release_import
```

The importer preserves a larger existing dataset when the bundled sample is
selected. [Importer documentation](pipeline/data-ingestion/README.md) explains
release validation and replacement rules.

## Individual application commands

JavaScript commands can run directly inside their application directory:

```sh
cd frontend
pnpm run dev
```

Nest startup and migration commands load only their own settings from the root
`.env`. The frontend loads root public `VITE_` settings. For Python commands or
a consistent root entry point, use the service-aware launcher:

```sh
./scripts/run.sh market-trading migration:run
./scripts/run.sh identity-auth test:e2e --runInBand
./scripts/run.sh ml-prediction alembic upgrade head
./scripts/run.sh ml-prediction uvicorn app.main:app --reload --port 8001
./scripts/run.sh data-ingestion python -m data_ingestion.release_import --artifact /path/to/release.zip
```

`run.sh` forwards arguments and the command's exit status. It gives the selected
service its configuration without exporting other services' credentials.

## Run the assembled application in Docker

```sh
cp .env.example .env  # when the local file does not exist yet
docker compose up --detach --build
```

Compose builds our applications from their own directories; PostgreSQL and Redis
use upstream images. This serves a compiled frontend. For source hot reload, use
`./scripts/dev.sh` as described above. Database migrations and the sample/release
import run on startup. Use `docker compose stop` to stop containers while retaining data.

Each build context has its own `.dockerignore`. Backend images contain compiled
code and production dependencies; Python images contain the installed application
and runtime dependencies from `uv.lock`. The ML image also includes Alembic
migration files. Build tools, local environment files and tests stay outside the
runtime images. The frontend contains the static bundle and its small server,
whose dependencies are locked in `frontend/server/package-lock.json`.

To build one image independently:

```sh
docker build -t tradeiq-market-local ./services/market-trading
```

The image-publishing workflow uses the same service directories. The server
selects all application image digests from one completed GitHub release.

## Checks

```sh
./scripts/build.sh
./scripts/test.sh
./scripts/check.sh
bash scripts/compose-smoke.sh
bash scripts/public-api-proxy-test.sh
bash scripts/auth-session-proxy-test.sh
```

`check.sh` runs local tool regressions, JavaScript lint/type/build/unit checks,
the generated API-reference check, and Python lint/unit tests. Database-backed
integration tests run separately against disposable fixtures in CI and the
Compose smoke test.

The Compose smoke test uses a separate `tradeiq-smoke-*` project, database volume
and ports: 55432, 53001, 53002, 58001 and 55173. It checks migrations, imports,
authentication, cookie rotation, markets and paper orders, then removes only its
own stack. Existing local and production data are not used. To change a port:

```sh
SMOKE_MARKET_PORT=54001 bash scripts/compose-smoke.sh
```

Failure logs are under the system temporary directory in
`tradeiq-smoke-logs/<project-name>`. `SMOKE_KEEP_STACK=1` retains the disposable
stack for inspection; the command prints its project name.

## Configuration and migrations

The root [`.env.example`](.env.example) is the single tracked example. Local
`.env` and existing server `.env.production` files remain untracked. Exported
variables override the local file. Services running with `NODE_ENV=production`
use injected settings and do not load the local file.

Native database URLs use localhost; Compose supplies container-network URLs.
When changing local ports, update the native connection URLs, browser origins
and public frontend URLs together. Only `VITE_` settings enter the browser bundle.
The example RSA pair is for local development and is rejected in production.
Existing deployment signing and email-encryption keys must remain unchanged.

Nest services apply their own pending TypeORM migrations at startup. The ML
schema uses the separate Alembic migration job. Database schema changes are new
migration files, rather than edits to an applied migration.

## API and delivery documentation

- [Market endpoint catalogue](docs/api/endpoint-catalogue-v0.md)
- [Backtesting strategies](docs/api/backtesting-strategies.md)
- [Data coverage](docs/api/data-coverage.md)
- [Paper trading](docs/api/paper-trading-v1.md)
- [Public developer API](docs/api/public-api-v1.md)
- [Reference maintenance](docs/api/reference-maintenance.md)
- [Architecture decisions](docs/adr/)
- [Current deployment](docs/ops/deployment.md)

CI installs and checks applications independently. On pushes to `dev`, publishing
first runs the complete CI workflow, then builds all five images and records their
digests in a completed GitHub release. See [Image releases](docs/ops/releases.md)
for failure handling and rollback records. The VM timer checks completed release
metadata and deploys the recorded image digests without fetching source code. Recurring data
collection runs in the separate `cse-dataset` repository and delivers through the ingestion API.

### Supported backtesting period

New guest previews and saved backtests currently support dates through **31 December 2025**, inclusive. The market-trading `BACKTEST_MAX_DATE` setting controls this temporary product limit; the website reads `GET /api/v1/backtests/policy` for calendars, suggested dates, and validation. If policy loading fails, it uses a conservative December 2025 fallback while the backend always validates its configured limit.

To extend the period, import and verify the additional historical prices first, then raise `BACKTEST_MAX_DATE` to the supported YYYY-MM-DD date and restart/redeploy market-trading. Existing prices, saved results, paper trading, Markets charts, and developer data APIs are unchanged. Existing results beyond the new limit retain their original calculations; a new run or saving an old preview requires supported dates. No engine change, frontend date edit, or migration is required.
