"""Persistence into the ``ml`` schema (alembic 0002_long_trade_predictions).

SQLAlchemy Core with plain SQL, like the migrations. Each write commits on its
own, so a run killed half-way (OOM, a deploy) keeps every prediction it
already made; its ml.long_trade_runs row simply stays ``running``.
"""

from __future__ import annotations

import json
import math
import uuid
from dataclasses import dataclass
from datetime import date

import numpy as np
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from .model import LongTradeResult

# Bump when the features, labels, models or decision rule change, so stored
# predictions stay attributable to the model that made them.
MODEL_NAME = "long-trade-ensemble"
MODEL_VERSION = "1.0.0"
MODEL_ALGORITHM = "logreg+xgboost (avg)"


@dataclass(frozen=True)
class RunCounts:
    symbols_requested: int
    models_trained: int
    models_skipped: int
    models_failed: int


class LongTradeRepository:
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    @classmethod
    def connect(cls, database_url: str) -> LongTradeRepository:
        """Connects eagerly, so an unreachable database fails the run before
        any model is trained rather than after the first one."""
        engine = create_engine(database_url, pool_pre_ping=True, pool_size=1, max_overflow=0)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return cls(engine)

    def dispose(self) -> None:
        self._engine.dispose()

    def register_model(self, definition: dict) -> uuid.UUID:
        """Upsert this model's row in ml.models; idempotent on (name, version).
        trained_at moves with every run, because every run retrains."""
        with self._engine.begin() as conn:
            model_id = conn.execute(
                text(
                    """
                    INSERT INTO ml.models (model_id, name, version, algorithm, trained_at, metrics)
                    VALUES (CAST(:model_id AS uuid), :name, :version, :algorithm, now(),
                            CAST(:metrics AS jsonb))
                    ON CONFLICT (name, version) DO UPDATE SET
                        algorithm = EXCLUDED.algorithm,
                        trained_at = EXCLUDED.trained_at,
                        metrics = EXCLUDED.metrics
                    RETURNING model_id
                    """
                ),
                {
                    "model_id": str(uuid.uuid4()),
                    "name": MODEL_NAME,
                    "version": MODEL_VERSION,
                    "algorithm": MODEL_ALGORITHM,
                    "metrics": _to_json(definition),
                },
            ).scalar_one()
        return uuid.UUID(str(model_id))

    def start_run(self, model_id: uuid.UUID, settings: dict, symbols_requested: int) -> uuid.UUID:
        run_id = uuid.uuid4()
        with self._engine.begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO ml.long_trade_runs
                        (run_id, model_id, started_at, status, symbols_requested, settings)
                    VALUES (CAST(:run_id AS uuid), CAST(:model_id AS uuid), now(), 'running',
                            :symbols_requested, CAST(:settings AS jsonb))
                    """
                ),
                {
                    "run_id": str(run_id),
                    "model_id": str(model_id),
                    "symbols_requested": symbols_requested,
                    "settings": _to_json(settings),
                },
            )
        return run_id

    def set_symbols_requested(self, run_id: uuid.UUID, symbols_requested: int) -> None:
        with self._engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE ml.long_trade_runs SET symbols_requested = :n "
                    "WHERE run_id = CAST(:run_id AS uuid)"
                ),
                {"run_id": str(run_id), "n": symbols_requested},
            )

    def save(self, run_id: uuid.UUID, result: LongTradeResult) -> None:
        """Upsert on (symbol, config_key, data_as_of): re-running the job for
        the same market day replaces that day's rows instead of adding more,
        so a retry or a manual re-run is always safe."""
        config = result.config
        with self._engine.begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO ml.long_trade_predictions (
                        prediction_id, run_id, symbol, config_key,
                        take_profit_pct, stop_loss_pct, horizon_bars, test_days,
                        train_from, train_to, data_as_of, train_rows, test_rows,
                        positive_rate, prob_long, is_long_signal, confidence_margin, metrics
                    ) VALUES (
                        CAST(:prediction_id AS uuid), CAST(:run_id AS uuid), :symbol, :config_key,
                        :take_profit_pct, :stop_loss_pct, :horizon_bars, :test_days,
                        :train_from, :train_to, :data_as_of, :train_rows, :test_rows,
                        :positive_rate, :prob_long, :is_long_signal, :confidence_margin,
                        CAST(:metrics AS jsonb)
                    )
                    ON CONFLICT (symbol, config_key, data_as_of) DO UPDATE SET
                        run_id = EXCLUDED.run_id,
                        take_profit_pct = EXCLUDED.take_profit_pct,
                        stop_loss_pct = EXCLUDED.stop_loss_pct,
                        horizon_bars = EXCLUDED.horizon_bars,
                        test_days = EXCLUDED.test_days,
                        train_from = EXCLUDED.train_from,
                        train_to = EXCLUDED.train_to,
                        train_rows = EXCLUDED.train_rows,
                        test_rows = EXCLUDED.test_rows,
                        positive_rate = EXCLUDED.positive_rate,
                        prob_long = EXCLUDED.prob_long,
                        is_long_signal = EXCLUDED.is_long_signal,
                        confidence_margin = EXCLUDED.confidence_margin,
                        metrics = EXCLUDED.metrics
                    """
                ),
                {
                    "prediction_id": str(uuid.uuid4()),
                    "run_id": str(run_id),
                    "symbol": result.symbol,
                    "config_key": config.config_key,
                    "take_profit_pct": config.take_profit_pct,
                    "stop_loss_pct": config.stop_loss_pct,
                    "horizon_bars": config.horizon_bars,
                    "test_days": config.test_days,
                    "train_from": config.train_from,
                    "train_to": config.train_to,
                    "data_as_of": result.data_as_of,
                    "train_rows": result.train_rows,
                    "test_rows": result.test_rows,
                    "positive_rate": result.positive_rate,
                    "prob_long": result.prob_long,
                    "is_long_signal": result.is_long_signal,
                    "confidence_margin": result.confidence_margin,
                    "metrics": _to_json(result.metrics),
                },
            )

    def finish_run(
        self, run_id: uuid.UUID, *, status: str, data_as_of: date | None, counts: RunCounts
    ) -> None:
        with self._engine.begin() as conn:
            conn.execute(
                text(
                    """
                    UPDATE ml.long_trade_runs SET
                        status = :status,
                        completed_at = now(),
                        data_as_of = :data_as_of,
                        symbols_requested = :symbols_requested,
                        models_trained = :models_trained,
                        models_skipped = :models_skipped,
                        models_failed = :models_failed
                    WHERE run_id = CAST(:run_id AS uuid)
                    """
                ),
                {
                    "run_id": str(run_id),
                    "status": status,
                    "data_as_of": data_as_of,
                    "symbols_requested": counts.symbols_requested,
                    "models_trained": counts.models_trained,
                    "models_skipped": counts.models_skipped,
                    "models_failed": counts.models_failed,
                },
            )


def _to_json(value: object) -> str:
    # jsonb rejects NaN and json cannot serialise numpy scalars; sklearn's
    # report and pandas both hand back numpy types.
    return json.dumps(_plain(value), allow_nan=False)


def _plain(value: object) -> object:
    if isinstance(value, dict):
        return {str(k): _plain(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_plain(v) for v in value]
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, date):
        return value.isoformat()
    return value
