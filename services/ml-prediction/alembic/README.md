# Migrations — ml-prediction (`ml` database)

Alembic migrations for this service live here. None have been written yet — the
`ml` database comes up empty.

```sh
cd services/ml-prediction
uv run alembic revision -m "<message>"
uv run alembic upgrade head
uv run alembic downgrade -1
```

Config: `alembic.ini` / `env.py`. Connection string comes from `ML_DATABASE_URL`.
