# Migrations — market-trading (`market_data` database)

TypeORM migrations for this service live here. None have been written yet — the
`market_data` database comes up empty.

```sh
pnpm --filter @tradeiq/market-trading run migration:create migrations/<Name>
pnpm --filter @tradeiq/market-trading run migration:run
pnpm --filter @tradeiq/market-trading run migration:revert
```

Data source config: `src/db/data-source.ts`. Connection string comes from
`MARKET_DATA_DATABASE_URL`.
