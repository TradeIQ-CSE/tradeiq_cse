# Migrations — ml-prediction (`ml` database)

Alembic migrations for this service live here. `versions/0001_initial.py`
creates the `ml` schema (3 tables) per the mentor-reviewed schema v2
(verified against ERD v2).

```sh
cd services/ml-prediction
uv run alembic revision -m "<message>"
uv run alembic upgrade head
uv run alembic downgrade -1
```

Config: `alembic.ini` / `env.py`. Connection string comes from `ML_DATABASE_URL`.
In Docker, migrations run automatically via the one-shot `ml-prediction-migrate`
compose service before `ml-prediction` starts.
