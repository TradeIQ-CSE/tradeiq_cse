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
│   ├── market-trading/      NestJS. Market data, OHLCV, public dev API, backtesting, paper trading.
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
│   ├── api/                 API contracts: endpoint catalogue + structured error envelope.
│   └── adr/                 Architecture Decision Records (D1–D7 resolutions).
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
- `*-migrate` — one-shot jobs that apply each service's schema migrations
  (TypeORM for the Nest services, Alembic for `ml-prediction`); API services
  only start after their migrations complete
- `market-data-seed` — one-shot job that seeds `market_data` from a cse-dataset
  bundle (sectors → securities → trading calendar → daily prices → indices),
  right after the market_data migrations. With no bundle configured it loads a
  small bundled sample so markets data is always queryable on a fresh `up`.
  The seed is idempotent — see [`pipeline/data-ingestion/README.md`](./pipeline/data-ingestion/README.md)
  for the bundle contract and how to load the full 2017–2025 dataset
- `market-trading`, `identity-auth`, `ml-prediction` — the three API services
- `frontend` — the React SPA

The `data-ingestion` job itself is **not** part of the default `up` — it's a
one-off/scheduled job, run with:

```sh
docker compose run --rm data-ingestion
```

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

For the Python services, from each service directory:

```sh
cd services/ml-prediction   # or pipeline/data-ingestion
uv sync
uv run ruff check .
uv run pytest
```

## Databases & migrations

Each service owns its schema via an initial migration. On `docker compose up`, one-shot
`*-migrate` jobs apply pending migrations and each API service starts only after its own
migrations complete successfully. The same migrations run in CI against a fresh database.

- `market-trading` / `identity-auth`: TypeORM migrations (`typeorm-ts-node-commonjs`), config in
  `services/<service>/src/db/data-source.ts`.
- `ml-prediction`: Alembic migrations, config in `services/ml-prediction/alembic.ini`.

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

## Branching & commits

- Branch naming: `username/tiq-N-short-title`
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
