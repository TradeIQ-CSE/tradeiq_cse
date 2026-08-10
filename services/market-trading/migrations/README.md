# Migrations — market-trading (`market_data` database)

TypeORM migrations for this service live here. `1786358400000-InitialSchema.ts`
creates the `market_data` schema (15 tables) per the mentor-reviewed schema v2
(verified against ERD v2).

```sh
pnpm --filter @tradeiq/market-trading run migration:create migrations/<Name>
pnpm --filter @tradeiq/market-trading run migration:run
pnpm --filter @tradeiq/market-trading run migration:revert
```

Data source config: `src/db/data-source.ts`. Connection string comes from
`MARKET_DATA_DATABASE_URL`. In Docker, migrations run automatically via the
one-shot `market-trading-migrate` compose service before `market-trading`
starts.
