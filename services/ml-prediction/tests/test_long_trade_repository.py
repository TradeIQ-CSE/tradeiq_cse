"""The repository against a real ml database, with the Alembic migrations
applied. Skipped unless ML_TEST_DATABASE_URL is set (CI's migrations job sets
it, plus ML_REQUIRE_DB_TESTS=1 so a missing database fails instead of skips)."""

from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import date
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import text

from alembic import command
from app.long_trade.configs import TrainingConfig
from app.long_trade.model import LongTradeResult, model_definition
from app.long_trade.repository import MODEL_NAME, LongTradeRepository, RunCounts

TEST_DATABASE_URL = os.environ.get("ML_TEST_DATABASE_URL")
SYMBOL = "PYTEST.N0000"
SERVICE_ROOT = Path(__file__).resolve().parent.parent
# Every run these tests create carries it, so teardown removes exactly those.
MARKER = {"pytest": True}


@pytest.fixture
def repository(monkeypatch) -> Iterator[LongTradeRepository]:
    if not TEST_DATABASE_URL:
        if os.environ.get("ML_REQUIRE_DB_TESTS") == "1":
            pytest.fail("ML_TEST_DATABASE_URL is unset")
        pytest.skip("ML_TEST_DATABASE_URL is unset")

    # alembic/env.py reads ML_DATABASE_URL.
    monkeypatch.setenv("ML_DATABASE_URL", TEST_DATABASE_URL)
    monkeypatch.chdir(SERVICE_ROOT)
    command.upgrade(Config(str(SERVICE_ROOT / "alembic.ini")), "head")

    repo = LongTradeRepository.connect(TEST_DATABASE_URL)
    yield repo
    with repo._engine.begin() as conn:
        # Cascades to the predictions.
        conn.execute(text("DELETE FROM ml.long_trade_runs WHERE settings->>'pytest' = 'true'"))
    repo.dispose()


def result(prob_long: float, data_as_of: date = date(2025, 12, 31)) -> LongTradeResult:
    config = TrainingConfig(0.015, 0.0075, 24, 30, date(2017, 1, 2), data_as_of)
    return LongTradeResult(
        symbol=SYMBOL,
        config=config,
        data_as_of=data_as_of,
        train_rows=1800,
        test_rows=30,
        positive_rate=0.4321,
        prob_long=prob_long,
        is_long_signal=prob_long >= 0.65,
        confidence_margin=0.3,
        metrics={"classification_report": {"accuracy": 0.5}, "profit": {"trades_taken": 3}},
        duration_seconds=0.1,
    )


def predictions(repo: LongTradeRepository) -> list[tuple]:
    with repo._engine.connect() as conn:
        return conn.execute(
            text(
                "SELECT config_key, data_as_of, prob_long::float, is_long_signal, run_id,"
                "       take_profit_pct::float, stop_loss_pct::float, metrics->'profit'"
                " FROM ml.long_trade_predictions WHERE symbol = :s ORDER BY data_as_of"
            ),
            {"s": SYMBOL},
        ).all()


def test_rerunning_a_market_day_upserts_instead_of_duplicating(repository):
    model_id = repository.register_model(model_definition())
    assert repository.register_model(model_definition()) == model_id

    first_run = repository.start_run(model_id, MARKER, symbols_requested=1)
    repository.save(first_run, result(0.4))
    second_run = repository.start_run(model_id, MARKER, symbols_requested=1)
    repository.save(second_run, result(0.7))

    (row,) = predictions(repository)
    assert row[0] == "pt0.015_sl0.0075_H24_T30"
    assert (row[2], row[3]) == (0.7, True)
    assert str(row[4]) == str(second_run)
    assert (row[5], row[6]) == (0.015, 0.0075)
    assert row[7] == {"trades_taken": 3}

    # A new market day is a new row.
    repository.save(second_run, result(0.5, date(2026, 1, 2)))
    assert len(predictions(repository)) == 2

    repository.finish_run(
        second_run, status="succeeded", data_as_of=date(2026, 1, 2), counts=RunCounts(1, 2, 0, 0)
    )
    with repository._engine.connect() as conn:
        status, completed, as_of, trained, name = conn.execute(
            text(
                "SELECT r.status, r.completed_at IS NOT NULL, r.data_as_of, r.models_trained,"
                "       m.name"
                " FROM ml.long_trade_runs r JOIN ml.models m USING (model_id)"
                " WHERE r.run_id = :id"
            ),
            {"id": second_run},
        ).one()
    assert (status, completed, as_of, trained, name) == (
        "succeeded",
        True,
        date(2026, 1, 2),
        2,
        MODEL_NAME,
    )


def test_out_of_range_probability_is_rejected(repository):
    model_id = repository.register_model(model_definition())
    run_id = repository.start_run(model_id, MARKER, symbols_requested=1)
    with pytest.raises(Exception, match="long_trade_predictions_prob_chk"):
        repository.save(run_id, result(1.5))
