# TradeIQ CSE

CSE (Colombo Stock Exchange) strategy backtesting, paper-trading, and portfolio-analytics platform.

> **Status:** skeleton only. No business logic or endpoints are implemented yet.
> Every service exposes a static `/health` stub; databases start empty but are
> migrated to the schema-v2 layout automatically on `docker compose up`.

## Layout

```
.
├── frontend/                React (Vite + TS) SPA — investor-facing client. Routing stub only.
│                            A separate admin UI may be added later as its own app.
├── services/
│   ├── market-trading/      NestJS. Market data, OHLCV, execution quotes, public API, backtesting.
│   │                        Owns the `market_data` Postgres database.
│   ├── identity-auth/       NestJS. Auth, users, portfolios, orders, fills, lots, cash.
│   │                        Owns the `auth` Postgres database.
│   └── ml-prediction/       Python (FastAPI). Batch PPO directional predictions.
│                            Owns the `ml` Postgres database.
├── pipeline/
│   └── data-ingestion/      Python. Scheduled (not resident) job: fetches, normalises, and
│                            validates CSE end-of-day data. Run on demand, not always-on.
├── docker/
│   └── db/init.sql          Creates one database + dedicated user per service inside the
│                            single shared Postgres instance (first boot only).
├── docs/
│   ├── api/                 API contracts: market data, paper trading + structured errors.
│   └── adr/                 Architecture Decision Records.
├── docker-compose.yml       Brings up the shared Postgres instance, the 3 services, and the frontend.
└── .github/workflows/       CI: install, lint, typecheck, build, test on every PR.
```

### Architecture rules (locked)

- Three deployable API microservices (`market-trading`, `identity-auth`, `ml-prediction`) plus one
  scheduled pipeline job (`data-ingestion`).
- **Each service owns its own database exclusively.** All databases live in a single shared
  Postgres instance (see `docker/db/init.sql`), but there is no cross-service database
  access — services only ever talk to each other over REST.
- **Each service owns its own environment.** Every service has its own `.env.example`;
  one service's secrets are never visible to another.
- The only ML in the system is the PPO prediction service in `ml-prediction`. No LLM/AI-text
  features anywhere else.

## Prerequisites

- [Node.js 20 LTS](https://nodejs.org/)
- [pnpm](https://pnpm.io/) (`corepack enable` will pick up the version pinned in `package.json`)
- [uv](https://docs.astral.sh/uv/) for the Python services (`ml-prediction`, `data-ingestion`)
- [Docker](https://www.docker.com/) + Docker Compose

## Running everything locally

```sh
cp .env.example .env   # compose-level values only; .env is gitignored
docker compose up
```

This starts:

- `db` — a single Postgres instance hosting one database per service
  (`market_data`, `auth`, `ml`), created by `docker/db/init.sql` on first boot
- `market-trading`, `identity-auth` — the Nest API services. Each applies its
  own TypeORM migrations at startup (`migrationsRun: true`) before accepting
  traffic, so the schema is always up to date on a fresh `up`. `identity-auth`
  calls `market-trading` over REST (`MARKET_TRADING_URL`) to price paper
  orders; it never connects to `market_data` itself
- `ml-prediction-migrate` — one-shot job applying the Alembic migrations;
  `ml-prediction` starts only after it completes
- `market-data-seed` — one-shot job that seeds `market_data` from a cse-dataset
  bundle (sectors → securities → trading calendar → daily prices → indices),
  once `market-trading` is healthy (i.e. its startup migrations have finished).
  With no bundle configured it loads a small bundled sample; note the sample
  lands a few seconds after `market-trading` starts serving. The seed is
  idempotent — see [`pipeline/data-ingestion/README.md`](./pipeline/data-ingestion/README.md)
  for the bundle contract and how to load the full 2017–2025 dataset
- `ml-prediction` — the ML inference API
- `frontend` — the React SPA

The `data-ingestion` job itself is **not** part of the default `up` — it's a
one-off/scheduled job, run with:

```sh
docker compose run --rm data-ingestion
```

## API contracts

- [Market-data endpoint catalogue](./docs/api/endpoint-catalogue-v0.md)
- [Paper-trading v1 contract](./docs/api/paper-trading-v1.md)
- [Structured error envelope](./docs/api/error-envelope.md)
- [Architecture decisions](./docs/adr/)

## Local (non-Docker) development

Install JS/TS dependencies once at the repo root:

```sh
pnpm install
```

Then, from the repo root, workspace scripts fan out to every package:

```sh
pnpm dev         # run all services/apps in dev mode (parallel)
pnpm build       # build all workspaces
pnpm lint        # lint all workspaces
pnpm typecheck   # typecheck all workspaces
pnpm test        # run tests in all workspaces
```

Note: `pnpm test` runs unit tests only. `pnpm test:e2e` in a Nest service boots
the full application — including the database connection and startup
migrations — so it needs a reachable Postgres (e.g. `docker compose up db`)
and the service's `.env` in place.

For the Python services, from each service directory:

```sh
cd services/ml-prediction   # or pipeline/data-ingestion
uv sync
uv run ruff check .
uv run pytest
```

## Databases & migrations

Each service owns its schema via migrations. The same migrations run in CI
against a fresh database.

- `market-trading` / `identity-auth`: TypeORM migrations in
  `services/<service>/src/db/migrations/`, applied automatically at app startup
  (`migrationsRun: true` — the app migrates its own database before serving
  traffic, in Docker and locally). The TypeORM CLI
  (`migration:create` / `migration:run` / `migration:revert`, config in
  `services/<service>/src/db/data-source.ts`) remains for authoring and manual
  runs.
- `ml-prediction`: Alembic migrations, config in `services/ml-prediction/alembic.ini`,
  applied by the one-shot `ml-prediction-migrate` compose job.

## Environment variables

**Each service owns its own environment.** Every service/app has its own `.env.example`
next to its code — copy it to `.env` (gitignored) inside that service's directory when
running outside Docker:

- [`services/market-trading/.env.example`](./services/market-trading/.env.example)
- [`services/identity-auth/.env.example`](./services/identity-auth/.env.example)
- [`services/ml-prediction/.env.example`](./services/ml-prediction/.env.example)
- [`pipeline/data-ingestion/.env.example`](./pipeline/data-ingestion/.env.example)
- [`frontend/.env.example`](./frontend/.env.example)

The root [`.env.example`](./.env.example) is read **by docker-compose only** and holds just
what compose needs to wire containers together (Postgres superuser, published ports). Compose
injects only the variables each service needs, so one service's secrets are never visible to
another. Nothing is hardcoded — every connection string, port, and secret is read from the
environment.

Inside the Nest services, env access goes through `@nestjs/config` only:
`src/config/` holds namespaced `registerAs` factories (`app`, `database`, plus
`auth` and `marketTrading` in identity-auth) and `env.validation.ts`, which fails fast at boot if a
required variable is missing or malformed. Application code never reads
`process.env` directly — inject `ConfigService` and use the namespaced keys
(e.g. `config.getOrThrow('database.url')`). When adding a new variable, update
the service's `.env.example`, `src/config/env.validation.ts`, and the matching
`registerAs` factory together.

## Branching & commits

- Branch naming: `username/tiq-N-short-title`
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
