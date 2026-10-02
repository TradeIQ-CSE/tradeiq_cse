# Migrations — ml-prediction (`ml` database)

Alembic migrations for this service live here. `versions/0001_initial.py`
creates the `ml` schema (3 tables) per schema v2 (verified against ERD v2).
`versions/0002_long_trade_predictions.py` adds `long_trade_runs` and
`long_trade_predictions` for the scheduled long-trade job (ADR 0011).

```sh
cd services/ml-prediction
uv run alembic revision -m "<message>"
uv run alembic upgrade head
uv run alembic downgrade -1
```

Config: `alembic.ini` / `env.py`. Connection string comes from `ML_DATABASE_URL`.
In Docker, migrations run automatically via the one-shot `ml-prediction-migrate`
compose service before `ml-prediction` starts.
