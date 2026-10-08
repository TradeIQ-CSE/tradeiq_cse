"""Function 01: the stocks to run the prediction for."""

from __future__ import annotations

import logging
from collections import Counter
from datetime import timedelta

import numpy as np

from .market_client import MarketTradingClient, Security
from .settings import Settings

log = logging.getLogger(__name__)

# A security with no price in this many calendar days before the market's
# latest session is suspended or delisted, not merely illiquid; a prediction
# "entering at its last close" would describe a trade nobody can place.
STALE_AFTER_DAYS = 30


def load_symbols(settings: Settings, client: MarketTradingClient) -> list[Security]:
    """ML_LONG_TRADE_SYMBOLS exactly when set; otherwise every security whose
    coverage could hold ML_LONG_TRADE_MIN_HISTORY_BARS bars.

    The coverage check here is a cheap upper bound (weekdays between
    ``data_from`` and ``data_to``; illiquid stocks skip sessions). The exact
    bar count is checked again once a stock's bars are fetched.
    """
    if settings.symbols is not None:
        log.info("Selected %d symbols from ML_LONG_TRADE_SYMBOLS", len(settings.symbols))
        return [Security(symbol) for symbol in settings.symbols]

    securities = client.list_securities()
    latest = max((s.data_to for s in securities if s.data_to is not None), default=None)
    selected: list[Security] = []
    skipped: Counter[str] = Counter()

    for security in securities:
        if security.data_from is None or security.data_to is None:
            skipped["no price history"] += 1
        elif latest is not None and security.data_to < latest - timedelta(days=STALE_AFTER_DAYS):
            skipped[f"no price in the {STALE_AFTER_DAYS} days before {latest}"] += 1
        elif _max_sessions(security) < settings.min_history_bars:
            skipped[f"under {settings.min_history_bars} bars of history"] += 1
        else:
            selected.append(security)

    reasons = ", ".join(f"{count} {reason}" for reason, count in skipped.most_common()) or "none"
    log.info("Selected %d of %d securities (skipped: %s)", len(selected), len(securities), reasons)
    return selected


def _max_sessions(security: Security) -> int:
    assert security.data_from is not None and security.data_to is not None
    return int(np.busday_count(security.data_from, security.data_to + timedelta(days=1)))
