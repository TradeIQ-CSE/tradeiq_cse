# Migrations — identity-auth (`auth` database)

TypeORM migrations for this service live here. `1786358400000-InitialSchema.ts`
creates the `auth` schema per the mentor-reviewed schema v2 (verified against
ERD v2).

Migrations run **automatically at service startup** (`migrationsRun: true` in
`src/app.module.ts`) — the app applies pending migrations against
`AUTH_DATABASE_URL` before it accepts traffic, both locally and in Docker.

The TypeORM CLI remains available for authoring and manual runs:

```sh
./scripts/run.sh identity-auth migration:create src/db/migrations/<Name>
./scripts/run.sh identity-auth migration:run
./scripts/run.sh identity-auth migration:revert
```

CLI config: `src/db/data-source.ts` (loads the service `.env` via dotenv).
Connection string comes from `AUTH_DATABASE_URL`.
