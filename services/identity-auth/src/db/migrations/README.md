# Migrations — identity-auth (`auth` database)

TypeORM migrations for this service live here. `1786358400000-InitialSchema.ts`
creates the `auth` schema per the mentor-reviewed schema v2 (verified against
ERD v2).

Migrations run **automatically at service startup** (`migrationsRun: true` in
`src/app.module.ts`) — the app applies pending migrations against
`AUTH_DATABASE_URL` before it accepts traffic, both locally and in Docker.

The TypeORM CLI remains available for authoring and manual runs:

```sh
pnpm --filter @tradeiq/identity-auth run migration:create src/db/migrations/<Name>
pnpm --filter @tradeiq/identity-auth run migration:run
pnpm --filter @tradeiq/identity-auth run migration:revert
```

CLI config: `src/db/data-source.ts` (loads the service `.env` via dotenv).
Connection string comes from `AUTH_DATABASE_URL`.
