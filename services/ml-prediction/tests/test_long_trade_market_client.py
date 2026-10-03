from datetime import date

import httpx
import pytest

from app.long_trade.market_client import (
    MarketTradingClient,
    MarketTradingError,
    MarketTradingUnavailable,
    MarketTradingUnreachable,
    Security,
    SecurityNotFound,
)


def make_client(handler, sleeps=None):
    return MarketTradingClient(
        "http://market-trading:3001/",
        transport=httpx.MockTransport(handler),
        sleep=(sleeps.append if sleeps is not None else lambda _: None),
    )


def test_list_securities_follows_pagination():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(dict(request.url.params))
        page = int(request.url.params["page"])
        size = 200 if page < 3 else 50
        rows = [
            {"symbol": f"S{page}-{i}.N0000", "data_from": "2017-01-02", "data_to": "2025-12-31"}
            for i in range(size)
        ]
        rows[0]["data_from"] = rows[0]["data_to"] = None
        return httpx.Response(200, json={"data": rows, "meta": {"page": page, "total": 450}})

    with make_client(handler) as client:
        securities = client.list_securities()

    assert len(securities) == 450
    assert [p["page"] for p in seen] == ["1", "2", "3"]
    assert {p["page_size"] for p in seen} == {"200"}
    assert securities[0] == Security("S1-0.N0000", None, None)
    assert securities[1] == Security("S1-1.N0000", date(2017, 1, 2), date(2025, 12, 31))


def test_list_securities_stops_on_an_empty_page():
    def handler(request: httpx.Request) -> httpx.Response:
        page = int(request.url.params["page"])
        rows = [{"symbol": "A.N0000", "data_from": None, "data_to": None}] if page == 1 else []
        return httpx.Response(200, json={"data": rows, "meta": {"total": 999}})

    with make_client(handler) as client:
        assert len(client.list_securities()) == 1


def test_daily_bars_always_sends_from():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        bars = [
            {"date": "2017-01-02", "open": None, "high": 1.5, "low": 1, "close": "1.2", "volume": 9}
        ]
        return httpx.Response(200, json={"data": {"symbol": "COMB.N0000", "bars": bars}})

    with make_client(handler) as client:
        bars = client.daily_bars("COMB.N0000", from_date=date(2017, 1, 2))

    assert bars[0]["close"] == "1.2"
    (request,) = seen
    assert request.url.path == "/securities/COMB.N0000/ohlcv"
    assert dict(request.url.params) == {"timeframe": "daily", "from": "2017-01-02"}


def test_unknown_symbol_raises_security_not_found():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": {"code": "SECURITY_NOT_FOUND"}})

    with make_client(handler) as client, pytest.raises(SecurityNotFound):
        client.daily_bars("NOPE.N0000", from_date=date(2017, 1, 2))


def test_5xx_is_retried_with_backoff():
    responses = iter([httpx.Response(503), httpx.Response(502)])
    sleeps = []

    def handler(request: httpx.Request) -> httpx.Response:
        return next(responses, httpx.Response(200, json={"data": {"bars": []}}))

    with make_client(handler, sleeps) as client:
        assert client.daily_bars("COMB.N0000", from_date=date(2017, 1, 2)) == []
    assert sleeps == [1.0, 2.0]


def test_persistent_5xx_fails_that_request_only():
    sleeps = []
    with make_client(lambda request: httpx.Response(500), sleeps) as client:
        with pytest.raises(MarketTradingUnavailable) as caught:
            client.daily_bars("COMB.N0000", from_date=date(2017, 1, 2))
    assert not isinstance(caught.value, MarketTradingUnreachable)
    assert sleeps == [1.0, 2.0, 4.0]


def test_connection_failure_is_unreachable():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    with make_client(handler) as client, pytest.raises(MarketTradingUnreachable):
        client.list_securities()


def test_other_4xx_is_not_retried():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(400, json={"error": {"code": "VALIDATION_FAILED"}})

    with make_client(handler) as client, pytest.raises(MarketTradingError):
        client.daily_bars("COMB.N0000", from_date=date(2017, 1, 2))
    assert len(calls) == 1
