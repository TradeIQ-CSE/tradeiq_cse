"""Read-only client for market-trading's public market-data API.

ml-prediction owns only the ``ml`` database and its user cannot even connect to
``market_data``, so every price comes over REST (docs/api/endpoint-catalogue-v0.md
§3 and §5). Inside Compose the job calls market-trading directly on the private
network, not through nginx, so the edge rate limits do not apply.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from urllib.parse import quote

import httpx

log = logging.getLogger(__name__)

PAGE_SIZE = 200  # the endpoint's maximum
MAX_RETRIES = 3
BACKOFF_SECONDS = 1.0
RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


class MarketTradingError(Exception):
    """A request failed in a way specific to that request (bad response, 4xx)."""


class SecurityNotFound(MarketTradingError):
    def __init__(self, symbol: str) -> None:
        super().__init__(f"market-trading has no security {symbol!r} (404)")
        self.symbol = symbol


class MarketTradingUnavailable(MarketTradingError):
    """A request kept failing with a retryable status (5xx, 429) after retries.
    Possibly specific to one security, so it fails that stock, not the run."""


class MarketTradingUnreachable(MarketTradingUnavailable):
    """market-trading could not be reached at all after retries (connection
    refused, DNS, timeout). Every later request would fail the same way, so the
    run stops instead of retrying its way through the whole universe."""


@dataclass(frozen=True)
class Security:
    symbol: str
    # Coverage of the security's price history; None when unknown (an
    # explicitly requested symbol) or when it has no prices at all.
    data_from: date | None = None
    data_to: date | None = None


class MarketTradingClient:
    def __init__(
        self,
        base_url: str,
        *,
        timeout: float = 30.0,
        max_retries: int = MAX_RETRIES,
        backoff_seconds: float = BACKOFF_SECONDS,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._http = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=timeout,
            transport=transport,
            headers={"Accept": "application/json", "User-Agent": "tradeiq-ml-long-trade"},
        )
        self._max_retries = max_retries
        self._backoff_seconds = backoff_seconds
        self._sleep = sleep

    def __enter__(self) -> MarketTradingClient:
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    def close(self) -> None:
        self._http.close()

    def list_securities(self) -> list[Security]:
        """Every security, following ``meta.total`` across pages."""
        securities: list[Security] = []
        page = 1
        while True:
            body = self._get_json("/securities", {"page": page, "page_size": PAGE_SIZE})
            rows = body.get("data")
            meta = body.get("meta")
            total = meta.get("total") if isinstance(meta, dict) else None
            if (
                not isinstance(rows, list)
                or type(total) is not int
                or total < 0
                or not all(
                    isinstance(row, dict)
                    and isinstance(row.get("symbol"), str)
                    and bool(row["symbol"].strip())
                    for row in rows
                )
            ):
                raise MarketTradingError("GET /securities returned an unexpected shape")
            try:
                securities.extend(
                    Security(
                        symbol=row["symbol"],
                        data_from=_parse_date(row.get("data_from")),
                        data_to=_parse_date(row.get("data_to")),
                    )
                    for row in rows
                )
            except ValueError as exc:
                raise MarketTradingError("GET /securities returned invalid coverage dates") from exc
            # An empty page also ends it: out-of-range pages return 200 with
            # no data, so a total that shrank mid-walk cannot loop forever.
            if not rows or len(securities) >= total:
                return securities
            page += 1

    def daily_bars(
        self, symbol: str, *, from_date: date, to_date: date | None = None
    ) -> list[dict]:
        """Daily bars, ascending, exactly as served (no gap filling).

        ``from`` is always sent: the endpoint's default is only one year
        before ``to``, which would silently truncate the training history.
        """
        params = {"timeframe": "daily", "from": from_date.isoformat()}
        if to_date is not None:
            params["to"] = to_date.isoformat()
        body = self._get_json(f"/securities/{quote(symbol, safe='')}/ohlcv", params, symbol=symbol)
        data = body.get("data")
        bars = data.get("bars") if isinstance(data, dict) else None
        if not isinstance(bars, list) or not all(isinstance(bar, dict) for bar in bars):
            raise MarketTradingError(f"OHLCV for {symbol} returned an unexpected shape")
        return bars

    def _get_json(self, path: str, params: dict, *, symbol: str | None = None) -> dict:
        attempt = 0
        while True:
            unreachable = False
            try:
                response = self._http.get(path, params=params)
            except httpx.TransportError as exc:
                failure = f"{type(exc).__name__}: {exc}"
                unreachable = True
            else:
                if response.status_code == 404 and symbol is not None:
                    raise SecurityNotFound(symbol)
                if response.status_code not in RETRYABLE_STATUS:
                    if response.is_error:
                        raise MarketTradingError(
                            f"GET {path} returned {response.status_code}: {response.text[:200]}"
                        )
                    try:
                        body = response.json()
                    except ValueError as exc:
                        raise MarketTradingError(f"GET {path} returned invalid JSON") from exc
                    if not isinstance(body, dict):
                        raise MarketTradingError(f"GET {path} returned an unexpected shape")
                    return body
                failure = f"HTTP {response.status_code}"

            if attempt >= self._max_retries:
                error = MarketTradingUnreachable if unreachable else MarketTradingUnavailable
                raise error(f"GET {path} failed after {attempt + 1} attempts: {failure}")
            delay = self._backoff_seconds * 2**attempt
            log.warning("GET %s failed (%s); retrying in %.1fs", path, failure, delay)
            self._sleep(delay)
            attempt += 1


def _parse_date(value: object) -> date | None:
    if value in (None, ""):
        return None
    return date.fromisoformat(str(value)[:10])
