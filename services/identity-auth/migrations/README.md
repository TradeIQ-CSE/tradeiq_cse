# Migrations — identity-auth (`auth` database)

TypeORM migrations for this service live here. None have been written yet — the
`auth` database comes up empty.

```sh
pnpm --filter @tradeiq/identity-auth run migration:create migrations/<Name>
pnpm --filter @tradeiq/identity-auth run migration:run
pnpm --filter @tradeiq/identity-auth run migration:revert
```

Data source config: `src/db/data-source.ts`. Connection string comes from
`AUTH_DATABASE_URL`.
