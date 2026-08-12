# Migrations — market-trading (`market_data` database)

TypeORM migrations for this service live here. `1786358400000-InitialSchema.ts`
creates the `market_data` schema (15 tables) per the mentor-reviewed schema v2
(verified against ERD v2).

Migrations run **automatically at service startup** (`migrationsRun: true` in
`src/app.module.ts`) — the app applies pending migrations against
`MARKET_DATA_DATABASE_URL` before it accepts traffic, both locally and in
Docker.

The TypeORM CLI remains available for authoring and manual runs:

```sh
pnpm --filter @tradeiq/market-trading run migration:create src/db/migrations/<Name>
pnpm --filter @tradeiq/market-trading run migration:run
pnpm --filter @tradeiq/market-trading run migration:revert
```

CLI config: `src/db/data-source.ts` (loads the service `.env` via dotenv).
Connection string comes from `MARKET_DATA_DATABASE_URL`.
