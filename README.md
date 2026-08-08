# TradeIQ CSE

CSE (Colombo Stock Exchange) strategy backtesting, paper-trading, and portfolio-analytics platform.

> **Status:** skeleton only. No business logic, endpoints, or database schemas are implemented yet.
> Every service exposes a static `/health` stub and every database comes up empty.

## Layout

```
.
├── apps/
│   └── web/                 React (Vite + TS) SPA — investor + admin views. Routing stub only.
├── services/
│   ├── market-trading/      NestJS. Market data, OHLCV, public dev API, backtesting, paper trading.
│   │                        Owns the `market_data` Postgres database.
│   ├── identity-auth/       NestJS. Auth, users, portfolios, orders, fills, lots, cash.
│   │                        Owns the `auth` Postgres database.
│   └── ml-prediction/       Python (FastAPI). Batch PPO directional predictions.
│                            Owns the `ml` Postgres database.
├── pipeline/
│   └── data-pipeline/       Python. Scheduled (not resident) job: fetches, normalises, and
│                            validates CSE end-of-day data. Run on demand, not always-on.
├── packages/
│   └── tsconfig/            Shared TypeScript config bases used by the Nest services and the web app.
├── docker-compose.yml       Brings up all databases, Redis, the 3 services, and the web app.
└── .github/workflows/       CI: install, lint, typecheck, build, test on every PR.
```

### Architecture rules (locked)

- Three deployable API microservices (`market-trading`, `identity-auth`, `ml-prediction`) plus one
  scheduled pipeline job (`data-pipeline`).
- **Each service owns its own database exclusively.** There is no shared database and no
  cross-service database access — services only ever talk to each other over REST.
- The only ML in the system is the PPO prediction service in `ml-prediction`. No LLM/AI-text
  features anywhere else.

## Prerequisites

- [Node.js 20 LTS](https://nodejs.org/)
- [pnpm](https://pnpm.io/) (`corepack enable` will pick up the version pinned in `package.json`)
- [uv](https://docs.astral.sh/uv/) for the Python services (`ml-prediction`, `data-pipeline`)
- [Docker](https://www.docker.com/) + Docker Compose

## Running everything locally

```sh
cp .env.example .env   # fill in local values; .env is gitignored
docker compose up
```

This starts:

- `market-data-db`, `auth-db`, `ml-db` — one Postgres instance per service, on separate ports
- `redis` — used only for rate limiting and reference-data caching
- `market-trading`, `identity-auth`, `ml-prediction` — the three API services
- `web` — the React SPA

The `data-pipeline` job is **not** part of the default `up` — it's a one-off/scheduled job, run with:

```sh
docker compose run --rm data-pipeline
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
cd services/ml-prediction   # or pipeline/data-pipeline
uv sync
uv run ruff check .
uv run pytest
```

## Databases & migrations

Each service has its own `migrations/` directory and migration tooling wired up, but **no
migrations have been written yet** — schemas will be added in a later pass. Databases come up
empty.

- `market-trading` / `identity-auth`: TypeORM migrations (`typeorm-ts-node-commonjs`), config in
  `services/<service>/src/db/data-source.ts`.
- `ml-prediction`: Alembic migrations, config in `services/ml-prediction/alembic.ini`.

## Environment variables

See [`.env.example`](./.env.example) for the full list of variables consumed across services.
Nothing is hardcoded — every connection string, port, and secret is read from the environment.

## Branching & commits

- Branch naming: `username/tiq-N-short-title`
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
