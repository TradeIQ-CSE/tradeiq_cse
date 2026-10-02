from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
import pytest


def random_walk_bars(n: int = 600, *, seed: int = 7, start: str = "2022-01-03") -> list[dict]:
    """Platform-shaped daily bars (GET /securities/{symbol}/ohlcv) on a seeded
    random walk, one per weekday."""
    rng = np.random.default_rng(seed)
    close = 100 * np.exp(np.cumsum(rng.normal(0, 0.012, n)))
    open_ = close * (1 + rng.normal(0, 0.004, n))
    high = np.maximum(open_, close) * (1 + rng.uniform(0, 0.01, n))
    low = np.minimum(open_, close) * (1 - rng.uniform(0, 0.01, n))
    volume = rng.integers(1_000, 100_000, n)
    days = pd.bdate_range(start, periods=n)
    return [
        {
            "date": day.date().isoformat(),
            "open": round(float(o), 4),
            "high": round(float(h), 4),
            "low": round(float(lo), 4),
            "close": round(float(c), 4),
            "adjusted_close": None,
            "volume": int(v),
        }
        for day, o, h, lo, c, v in zip(days, open_, high, low, close, volume, strict=True)
    ]


def steady_rise_bars(n: int = 400, start: str = "2022-01-03") -> list[dict]:
    """+2% every session with a tight range: every take-profit is hit on the
    next bar, so every label is 1."""
    days = pd.bdate_range(start, periods=n)
    bars = []
    for i, day in enumerate(days):
        close = 100 * 1.02**i
        bars.append(
            {
                "date": day.date().isoformat(),
                "open": close,
                "high": close * 1.001,
                "low": close * 0.999,
                "close": close,
                "adjusted_close": None,
                "volume": 10_000,
            }
        )
    return bars


@pytest.fixture(scope="session")
def synthetic_bars() -> list[dict]:
    return random_walk_bars()


@pytest.fixture(scope="session")
def synthetic_window(synthetic_bars) -> tuple[date, date]:
    return date.fromisoformat(synthetic_bars[0]["date"]), date.fromisoformat(
        synthetic_bars[-1]["date"]
    )
