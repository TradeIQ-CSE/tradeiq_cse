"""Read completed results using a bounded, read-only database transaction."""

import re
from contextlib import contextmanager

from sqlalchemy import create_engine, text

from app.api_models import BatchSummary, Configuration, Prediction

PRESENTATION_DEFAULT = "pt0.015_sl0.0075_H36_T30"
CONFIG_PATTERN = re.compile(r"pt(0\.\d{1,4})_sl(0\.\d{1,4})_H([1-9]\d{0,9})_T([1-9]\d{0,9})\Z")
MODEL_NAME = "long-trade-ensemble"
RUN_COLUMNS = """r.run_id, r.status, r.started_at, r.completed_at, r.data_as_of,
    r.symbols_requested, r.models_trained, r.models_skipped, r.models_failed"""


def configuration(key: str) -> Configuration:
    match = CONFIG_PATTERN.fullmatch(key)
    if not match:
        raise ValueError("Invalid configuration key")
    pt, sl, horizon, test = match.groups()
    return Configuration(
        config_key=key,
        take_profit_pct=float(pt),
        stop_loss_pct=float(sl),
        horizon_bars=int(horizon),
        test_days=int(test),
    )


class ReadRepository:
    def __init__(self, database_url: str):
        self.engine = create_engine(
            database_url,
            pool_size=2,
            max_overflow=0,
            pool_timeout=5,
            pool_pre_ping=True,
            connect_args={"connect_timeout": 5, "options": "-c statement_timeout=5000"},
        )

    @contextmanager
    def snapshot(self):
        # A request's catalog, batch and prediction must describe one DB snapshot.
        with (
            self.engine.connect().execution_options(
                isolation_level="REPEATABLE READ",
                postgresql_readonly=True,
            ) as conn,
            conn.begin(),
        ):
            yield ReadSnapshot(conn)

    def dispose(self):
        self.engine.dispose()


class ReadSnapshot:
    def __init__(self, conn):
        self.conn = conn

    def latest_run(self, *, completed: bool):
        condition = (
            "AND r.status IN ('succeeded', 'partial') AND r.completed_at IS NOT NULL"
            if completed
            else ""
        )
        ordering = "r.completed_at DESC, " if completed else ""
        return (
            self.conn.execute(
                text(f"""
            SELECT {RUN_COLUMNS}, r.model_id, r.settings, m.version
            FROM ml.long_trade_runs r JOIN ml.models m USING (model_id)
            WHERE m.name = :name {condition}
            ORDER BY {ordering}r.started_at DESC, r.run_id DESC LIMIT 1
        """),
                {"name": MODEL_NAME},
            )
            .mappings()
            .first()
        )

    def catalog(self, run) -> list[Configuration]:
        if run is None:
            return []
        # The batch's saved grid is authoritative, including operator overrides.
        keys = run["settings"].get("grid", [])
        if not isinstance(keys, list) or not keys or not all(isinstance(k, str) for k in keys):
            raise ValueError("Completed batch has no configuration catalog")
        return [configuration(key) for key in sorted(set(keys))]

    def prediction(self, symbol: str, key: str, model_id) -> Prediction | None:
        row = (
            self.conn.execute(
                text(f"""
            SELECT p.prediction_id, p.symbol, p.config_key, p.take_profit_pct,
                   p.stop_loss_pct, p.horizon_bars, p.test_days, p.prob_long,
                   p.is_long_signal, p.confidence_margin, p.data_as_of AS prediction_date,
                   {RUN_COLUMNS}, m.version
            FROM ml.long_trade_predictions p
            JOIN ml.long_trade_runs r USING (run_id) JOIN ml.models m USING (model_id)
            WHERE p.symbol = :symbol AND p.config_key = :key AND r.model_id = :model_id
              AND r.status IN ('succeeded', 'partial') AND r.completed_at IS NOT NULL
            ORDER BY p.data_as_of DESC, r.completed_at DESC, p.prediction_id DESC LIMIT 1
        """),
                {"symbol": symbol, "key": key, "model_id": model_id},
            )
            .mappings()
            .first()
        )
        if row is None:
            return None
        return Prediction(
            prediction_id=row["prediction_id"],
            symbol=row["symbol"],
            configuration=Configuration(**{name: row[name] for name in Configuration.model_fields}),
            prob_long=row["prob_long"],
            is_long_signal=row["is_long_signal"],
            confidence_margin=row["confidence_margin"],
            data_as_of=row["prediction_date"],
            generated_at=row["completed_at"],
            model_version=row["version"],
            batch=batch_summary(row),
        )


def batch_summary(row) -> BatchSummary | None:
    return (
        BatchSummary(**{name: row[name] for name in BatchSummary.model_fields})
        if row is not None
        else None
    )


def default_key(catalog: list[Configuration]) -> str | None:
    keys = [item.config_key for item in catalog]
    return PRESENTATION_DEFAULT if PRESENTATION_DEFAULT in keys else next(iter(keys), None)
