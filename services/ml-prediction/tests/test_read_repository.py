"""Saved-result selection and HTTP responses against disposable PostgreSQL.

CI requires these tests after migrations. Fixtures only remove their own model,
runs and unique security symbol; they never truncate application tables.
"""

import json
import os
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError

from alembic import command
from app.main import create_app
from app.read_repository import PRESENTATION_DEFAULT, ReadRepository
from tests.api_helpers import key_env, token

OTHER_CONFIG = "pt0.01_sl0.005_H24_T30"


class SavedResults:
    def __init__(self, engine, model_id, symbol):
        self.engine, self.model_id, self.symbol = engine, model_id, symbol
        self.clock = datetime.now(UTC) + timedelta(days=1)

    def run(self, status="succeeded", *, grid=None, complete=True, model_id=None):
        self.clock += timedelta(minutes=1)
        run_id = uuid4()
        completed_at = self.clock if status != "running" and complete else None
        with self.engine.begin() as conn:
            conn.execute(
                text("""
                INSERT INTO ml.long_trade_runs
                    (run_id, model_id, status, started_at, completed_at, data_as_of,
                     symbols_requested, models_trained, models_skipped, models_failed, settings)
                VALUES (:id, :model, :status, :started, :completed, '2026-10-07',
                        288, 3, 2, 1, CAST(:settings AS jsonb))
            """),
                {
                    "id": run_id,
                    "model": model_id or self.model_id,
                    "status": status,
                    "started": self.clock - timedelta(seconds=30),
                    "completed": completed_at,
                    "settings": json.dumps(
                        {
                            "grid": grid or [PRESENTATION_DEFAULT, OTHER_CONFIG],
                            "market_trading_api_url": "http://private-internal:3001",
                            "source": "/private/model/path",
                        }
                    ),
                },
            )
        return run_id

    def prediction(
        self,
        run_id,
        *,
        day="2025-12-31",
        key=PRESENTATION_DEFAULT,
        symbol=None,
        probability=0.65,
        signal=False,
    ):
        from app.read_repository import configuration

        config = configuration(key)
        with self.engine.begin() as conn:
            conn.execute(
                text("""
                INSERT INTO ml.long_trade_predictions
                    (prediction_id, run_id, symbol, config_key, take_profit_pct, stop_loss_pct,
                     horizon_bars, test_days, train_from, train_to, data_as_of, train_rows,
                     test_rows, positive_rate, prob_long, is_long_signal,
                     confidence_margin, metrics)
                VALUES (:id, :run, :symbol, :key, :pt, :sl, :h, :t, '2017-01-01', :day, :day,
                        1000, 30, .4, :prob, :signal, .3, '{"source":"private-model-detail"}')
                ON CONFLICT (symbol, config_key, data_as_of) DO UPDATE SET
                    run_id=EXCLUDED.run_id, prob_long=EXCLUDED.prob_long,
                    is_long_signal=EXCLUDED.is_long_signal
            """),
                {
                    "id": uuid4(),
                    "run": run_id,
                    "symbol": symbol or self.symbol,
                    "key": key,
                    "pt": config.take_profit_pct,
                    "sl": config.stop_loss_pct,
                    "h": config.horizon_bars,
                    "t": config.test_days,
                    "day": date.fromisoformat(day),
                    "prob": probability,
                    "signal": signal,
                },
            )


@pytest.fixture
def saved(monkeypatch):
    url = os.environ.get("ML_TEST_DATABASE_URL")
    if not url:
        if os.environ.get("ML_REQUIRE_DB_TESTS") == "1":
            pytest.fail("ML_TEST_DATABASE_URL is unset")
        pytest.skip("ML_TEST_DATABASE_URL is unset")
    root = Path(__file__).resolve().parent.parent
    monkeypatch.setenv("ML_DATABASE_URL", url)
    monkeypatch.chdir(root)
    command.upgrade(Config(str(root / "alembic.ini")), "head")
    engine = create_engine(url)
    model_id = uuid4()
    with engine.begin() as conn:
        conn.execute(
            text("""
            INSERT INTO ml.models (model_id, name, version, metrics)
            VALUES (:id, 'long-trade-ensemble', :version, '{"source":"private-details"}')
        """),
            {"id": model_id, "version": "test-" + uuid4().hex[:20]},
        )
    repo = ReadRepository(url)
    try:
        yield SavedResults(engine, model_id, "T" + uuid4().hex[:12].upper() + ".N0000"), repo
    finally:
        repo.dispose()
        with engine.begin() as conn:
            conn.execute(
                text("DELETE FROM ml.long_trade_runs WHERE model_id = :id"), {"id": model_id}
            )
            conn.execute(text("DELETE FROM ml.models WHERE model_id = :id"), {"id": model_id})
        engine.dispose()


def test_partial_results_use_own_date_and_saved_signal(saved, signing_key):
    rows, repo = saved
    completed = rows.run("partial")
    rows.prediction(completed, probability=0.65, signal=False)
    rows.prediction(completed, key=OTHER_CONFIG, probability=0.3)
    running = rows.run("running")
    rows.prediction(running, day="2026-10-07", probability=0.9, signal=True)
    with TestClient(create_app(key_env(signing_key), repository=repo)) as client:
        client.headers["Authorization"] = "Bearer " + token(signing_key)
        response = client.get(f"/predictions/{rows.symbol}")
        assert response.status_code == 200
        value = response.json()["data"]["prediction"]
        assert value["data_as_of"] == "2025-12-31"
        assert value["prob_long"] == 0.65
        assert value["is_long_signal"] is False  # rounded probability must not change the flag
        assert value["batch"]["status"] == "partial"
        assert value["batch"]["data_as_of"] == "2026-10-07"
        assert value["generated_at"] == value["batch"]["completed_at"]
        assert isinstance(value["configuration"]["take_profit_pct"], float)
        assert "private" not in response.text
        assert "train_rows" not in response.text and "metrics" not in response.text
        catalog = client.get("/predictions/configurations").json()["data"]
        assert len(catalog["configurations"]) == 2
        assert catalog["default_config_key"] == PRESENTATION_DEFAULT
        status = client.get("/predictions/status").json()["data"]
        assert status["latest_run"]["run_id"] == str(running)
        assert status["latest_completed_run"]["run_id"] == str(completed)
        assert "settings" not in json.dumps(status)
        selected = client.get(f"/predictions/{rows.symbol}?config_key={OTHER_CONFIG}").json()[
            "data"
        ]
        assert selected["prediction"]["prob_long"] == 0.3
        absent = client.get("/predictions/UNKNOWN.N0000").json()["data"]
        assert absent["availability"] == "no_prediction" and absent["prediction"] is None
        unsupported = client.get(f"/predictions/{rows.symbol}?config_key=pt0.02_sl0.01_H48_T30")
        assert unsupported.status_code == 400


@pytest.mark.parametrize(
    "status,complete",
    [("running", True), ("failed", True), ("succeeded", False), ("partial", False)],
)
def test_unfinished_or_failed_upserts_fall_back_to_earlier_day(saved, status, complete):
    rows, repo = saved
    first = rows.run()
    rows.prediction(first, day="2025-12-30", probability=0.4)
    rows.prediction(first, probability=0.6)
    new = rows.run(status, complete=complete)
    rows.prediction(new, probability=0.9)
    with repo.snapshot() as reader:
        value = reader.prediction(rows.symbol, PRESENTATION_DEFAULT, rows.model_id)
        assert value.data_as_of == date(2025, 12, 30)
        assert value.prob_long == 0.4
        assert reader.latest_run(completed=True)["run_id"] == first


def test_same_day_upsert_becomes_visible_after_completion(saved):
    rows, repo = saved
    first = rows.run()
    rows.prediction(first)
    newer = rows.run("running")
    rows.prediction(newer, probability=0.9, signal=True)
    with repo.snapshot() as reader:
        assert reader.prediction(rows.symbol, PRESENTATION_DEFAULT, rows.model_id) is None
    with rows.engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE ml.long_trade_runs SET status='succeeded', completed_at=now() "
                "WHERE run_id=:id"
            ),
            {"id": newer},
        )
    with repo.snapshot() as reader:
        value = reader.prediction(rows.symbol, PRESENTATION_DEFAULT, rows.model_id)
        assert value.batch.run_id == newer and value.prob_long == 0.9
        assert value.generated_at == value.batch.completed_at


def test_earlier_model_versions_do_not_fill_missing_current_results(saved, signing_key):
    rows, repo = saved
    previous = rows.run()
    rows.prediction(previous)
    current_model = uuid4()
    with rows.engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO ml.models (model_id, name, version) "
                "VALUES (:id, 'long-trade-ensemble', :version)"
            ),
            {"id": current_model, "version": "test-" + uuid4().hex[:20]},
        )
    try:
        rows.run(model_id=current_model)
        with TestClient(create_app(key_env(signing_key), repository=repo)) as client:
            client.headers["Authorization"] = "Bearer " + token(signing_key)
            data = client.get(f"/predictions/{rows.symbol}").json()["data"]
            assert data["prediction"] is None and data["availability"] == "no_prediction"
    finally:
        with rows.engine.begin() as conn:
            conn.execute(
                text("DELETE FROM ml.long_trade_runs WHERE model_id=:id"), {"id": current_model}
            )
            conn.execute(text("DELETE FROM ml.models WHERE model_id=:id"), {"id": current_model})


def test_catalog_uses_saved_override_and_fallback_default(saved, signing_key):
    rows, repo = saved
    rows.run(grid=[OTHER_CONFIG])
    with TestClient(create_app(key_env(signing_key), repository=repo)) as client:
        client.headers["Authorization"] = "Bearer " + token(signing_key)
        catalog = client.get("/predictions/configurations").json()["data"]
        assert catalog["default_config_key"] == OTHER_CONFIG
        assert len(catalog["configurations"]) == 1
        value = client.get(f"/predictions/{rows.symbol}").json()["data"]
        assert value["config_key"] == OTHER_CONFIG and value["availability"] == "no_prediction"


def test_snapshot_rejects_writes_and_recovers_after_rollback(saved):
    rows, repo = saved
    with pytest.raises(DBAPIError, match="read-only"):
        with repo.snapshot() as reader:
            assert reader.conn.execute(text("SHOW transaction_read_only")).scalar_one() == "on"
            reader.conn.execute(
                text("DELETE FROM ml.models WHERE model_id=:id"), {"id": rows.model_id}
            )
    # The next request still works after a rejected write rolls the transaction back.
    with repo.snapshot() as reader:
        assert (
            reader.conn.execute(
                text("SELECT count(*) FROM ml.models WHERE model_id=:id"), {"id": rows.model_id}
            ).scalar_one()
            == 1
        )


def test_request_snapshot_is_consistent_while_batch_is_completed(saved):
    rows, repo = saved
    first = rows.run()
    with repo.snapshot() as reader:
        assert reader.latest_run(completed=True)["run_id"] == first
        new = rows.run("partial")
        assert reader.latest_run(completed=True)["run_id"] == first
    with repo.snapshot() as reader:
        assert reader.latest_run(completed=True)["run_id"] == new
