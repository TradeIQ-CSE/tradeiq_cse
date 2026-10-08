import json
import logging
import uuid
from datetime import date

import httpx
from sqlalchemy.exc import OperationalError

from app.long_trade import main as job
from app.long_trade.market_client import (
    MarketTradingClient,
    MarketTradingUnavailable,
    MarketTradingUnreachable,
    Security,
    SecurityNotFound,
)
from app.long_trade.repository import RunCounts

from .conftest import random_walk_bars

GRID = {
    "take_profit_pct": [0.015],
    "stop_loss_pct": [0.005, 0.01],
    "horizon_bars": [24],
    "test_days": [30],
}
ENV = {
    "ML_DATABASE_URL": "postgresql://ml:db-secret@db:5432/ml",
    "ML_MARKET_TRADING_API_URL": "http://market-trading:3001",
    "ML_LONG_TRADE_GRID": json.dumps(GRID),
}
GOOD_BARS = random_walk_bars(500)
SHORT_BARS = random_walk_bars(150, seed=3)


class FakeClient:
    def __init__(self, bars_by_symbol=None, securities=None, list_error=None):
        self.bars_by_symbol = bars_by_symbol or {}
        self.securities = securities or []
        self.list_error = list_error
        self.fetched = []
        self.closed = False

    def list_securities(self):
        if self.list_error:
            raise self.list_error
        return self.securities

    def daily_bars(self, symbol, *, from_date, to_date=None):
        self.fetched.append((symbol, from_date))
        value = self.bars_by_symbol[symbol]
        if isinstance(value, Exception):
            raise value
        return value

    def close(self):
        self.closed = True


class FakeRepository:
    def __init__(self, *, fail_on_register=False, fail_on_save=False):
        self.fail_on_register = fail_on_register
        self.fail_on_save = fail_on_save
        self.saved = []
        self.settings = None
        self.finished = None

    def register_model(self, definition):
        if self.fail_on_register:
            raise OperationalError("SELECT 1", {}, Exception("could not connect to server"))
        self.definition = definition
        return uuid.uuid4()

    def start_run(self, model_id, settings, symbols_requested):
        self.settings = settings
        return uuid.uuid4()

    def set_symbols_requested(self, run_id, symbols_requested):
        pass

    def save(self, run_id, result):
        if self.fail_on_save:
            raise OperationalError("INSERT", {}, Exception("server closed the connection"))
        self.saved.append(result)

    def finish_run(self, run_id, *, status, data_as_of, counts):
        self.finished = (status, data_as_of, counts)


def run(env_extra=None, **kwargs):
    return job.main({**ENV, **(env_extra or {})}, **kwargs)


def test_one_failing_stock_does_not_stop_the_others(caplog):
    caplog.set_level(logging.INFO, logger="app.long_trade")
    client = FakeClient(
        {
            "MISSING.N0000": SecurityNotFound("MISSING.N0000"),
            "FLAKY.N0000": MarketTradingUnavailable("GET failed after 4 attempts: HTTP 500"),
            "SHORT.N0000": SHORT_BARS,
            "GOOD.N0000": GOOD_BARS,
        }
    )
    repository = FakeRepository()

    code = run(
        {"ML_LONG_TRADE_SYMBOLS": "MISSING.N0000,FLAKY.N0000,SHORT.N0000,GOOD.N0000"},
        client=client,
        repository=repository,
    )

    assert code == job.EXIT_OK
    assert [r.symbol for r in repository.saved] == ["GOOD.N0000", "GOOD.N0000"]
    status, data_as_of, counts = repository.finished
    assert status == "partial"
    assert data_as_of == date.fromisoformat(GOOD_BARS[-1]["date"])
    # Every configuration of every stock lands in exactly one bucket.
    assert counts == RunCounts(symbols_requested=4, models_trained=2, models_skipped=2,
                               models_failed=4)  # fmt: skip
    assert client.closed
    # Explicit symbols have no known coverage, so `from` is still sent.
    assert {from_date for _, from_date in client.fetched} == {job.HISTORY_START}

    trained = [r.getMessage() for r in caplog.records if r.getMessage().startswith("Trained")]
    assert len(trained) == 2
    assert trained[0].startswith(
        f"Trained long-trade model symbol=GOOD.N0000 config=pt0.015_sl0.005_H24_T30 "
        f"data_as_of={GOOD_BARS[-1]['date']} train={GOOD_BARS[0]['date']}..{GOOD_BARS[-1]['date']}"
    )
    for field in ("train_rows=", "test_rows=30", "positive_rate=", "prob_long=",
                  "is_long_signal=", "test_profit_precision=", "duration="):  # fmt: skip
        assert field in trained[0]
    assert any("Skipping MISSING.N0000" in r.getMessage() for r in caplog.records)
    assert any("models_trained=2" in r.getMessage() for r in caplog.records)


def test_recorded_settings_hold_no_secret():
    repository = FakeRepository()
    run(
        {"ML_LONG_TRADE_SYMBOLS": "GOOD.N0000"},
        client=FakeClient({"GOOD.N0000": GOOD_BARS}),
        repository=repository,
    )
    assert "db-secret" not in json.dumps(repository.settings)
    assert repository.finished[0] == "succeeded"


def test_nothing_trained_exits_non_zero():
    repository = FakeRepository()
    code = run(
        {"ML_LONG_TRADE_SYMBOLS": "SHORT.N0000"},
        client=FakeClient({"SHORT.N0000": SHORT_BARS}),
        repository=repository,
    )
    assert code == job.EXIT_NOTHING_TRAINED
    assert repository.finished[0] == "failed"
    assert repository.finished[2].models_skipped == 2


def test_universe_selects_only_securities_with_enough_recent_history():
    client = FakeClient(
        {"GOOD.N0000": GOOD_BARS},
        securities=[
            Security("GOOD.N0000", date(2022, 1, 3), date(2023, 11, 30)),
            Security("NOPRICES.N0000", None, None),
            Security("DELISTED.N0000", date(2017, 1, 2), date(2023, 6, 30)),
            Security("YOUNG.N0000", date(2023, 6, 1), date(2023, 11, 30)),
        ],
    )
    repository = FakeRepository()

    assert run(client=client, repository=repository) == job.EXIT_OK
    assert client.fetched == [("GOOD.N0000", date(2022, 1, 3))]
    assert repository.finished[2].symbols_requested == 1


def test_unreachable_market_trading_exits_non_zero():
    repository = FakeRepository()
    client = FakeClient(list_error=MarketTradingUnreachable("connection refused"))

    assert run(client=client, repository=repository) == job.EXIT_UNAVAILABLE
    assert repository.finished[0] == "failed"


def test_market_trading_lost_mid_run_stops_the_run():
    client = FakeClient(
        {
            "GOOD.N0000": GOOD_BARS,
            "GONE.N0000": MarketTradingUnreachable("connection refused"),
            "LATER.N0000": GOOD_BARS,
        }
    )
    repository = FakeRepository()

    code = run(
        {"ML_LONG_TRADE_SYMBOLS": "GOOD.N0000,GONE.N0000,LATER.N0000"},
        client=client,
        repository=repository,
    )

    assert code == job.EXIT_UNAVAILABLE
    assert [symbol for symbol, _ in client.fetched] == ["GOOD.N0000", "GONE.N0000"]
    assert repository.finished[0] == "failed"
    assert repository.finished[2].models_trained == 2


def test_invalid_configuration_exits_2():
    assert job.main({"ML_MARKET_TRADING_API_URL": "http://x"}) == job.EXIT_CONFIG
    assert job.main({**ENV, "ML_LONG_TRADE_GRID": "{"}) == job.EXIT_CONFIG


def test_database_unavailable_exits_non_zero(caplog):
    code = run(client=FakeClient(), repository=FakeRepository(fail_on_register=True))

    assert code == job.EXIT_UNAVAILABLE
    assert "db-secret" not in caplog.text


def test_database_lost_mid_run_exits_non_zero():
    repository = FakeRepository(fail_on_save=True)
    code = run(
        {"ML_LONG_TRADE_SYMBOLS": "GOOD.N0000"},
        client=FakeClient({"GOOD.N0000": GOOD_BARS}),
        repository=repository,
    )
    assert code == job.EXIT_UNAVAILABLE
    assert repository.finished[0] == "failed"


def test_invalid_api_url_exits_2_before_creating_a_run():
    repository = FakeRepository()
    assert (
        run({"ML_MARKET_TRADING_API_URL": "http://host:api/"}, repository=repository)
        == job.EXIT_CONFIG
    )
    assert repository.settings is None
    assert not hasattr(repository, "definition")


def test_malformed_universe_response_finishes_the_run_as_failed():
    client = MarketTradingClient(
        "http://market-trading:3001",
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json=[])),
    )
    repository = FakeRepository()
    assert run(client=client, repository=repository) == job.EXIT_UNAVAILABLE
    assert repository.finished[0] == "failed"


def test_malformed_stock_response_does_not_stop_a_later_stock():
    def handler(request):
        body = {"data": []} if "BAD.N0000" in request.url.path else {"data": {"bars": SHORT_BARS}}
        return httpx.Response(200, json=body)

    client = MarketTradingClient(
        "http://market-trading:3001", transport=httpx.MockTransport(handler)
    )
    repository = FakeRepository()
    assert (
        run(
            {"ML_LONG_TRADE_SYMBOLS": "BAD.N0000,SHORT.N0000"}, client=client, repository=repository
        )
        == job.EXIT_NOTHING_TRAINED
    )
    counts = repository.finished[2]
    assert counts.models_failed == 2
    assert counts.models_skipped == 2
