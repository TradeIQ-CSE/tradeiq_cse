# Migrations — identity-auth (`auth` database)

TypeORM migrations for this service live here. `1786358400000-InitialSchema.ts`
creates the `auth` schema (10 tables) per the mentor-reviewed schema v2
(verified against ERD v2).

```sh
pnpm --filter @tradeiq/identity-auth run migration:create migrations/<Name>
pnpm --filter @tradeiq/identity-auth run migration:run
pnpm --filter @tradeiq/identity-auth run migration:revert
```

Data source config: `src/db/data-source.ts`. Connection string comes from
`AUTH_DATABASE_URL`. In Docker, migrations run automatically via the one-shot
`identity-auth-migrate` compose service before `identity-auth` starts.
