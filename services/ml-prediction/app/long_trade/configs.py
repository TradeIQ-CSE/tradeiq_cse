"""Function 02: the training configurations to run for one stock.

A configuration is one triple-barrier question - "does price reach +pt before
-sl within H trading days?" - plus how much of the end of the history is held
out to evaluate the answer. Every configuration trains its own model.
"""

from __future__ import annotations

import itertools
import json
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

# The grid committed in trading-wizard's run_long_trade_predictor.py
# (commit 321fa67): 3 x 3 x 3 x 1 = 27 configurations per stock.
DEFAULT_TAKE_PROFIT_PCTS = (0.01, 0.015, 0.02)
DEFAULT_STOP_LOSS_PCTS = (0.005, 0.0075, 0.01)
DEFAULT_HORIZON_BARS = (24, 36, 48)
DEFAULT_TEST_DAYS = (30,)

GRID_KEYS = ("take_profit_pct", "stop_loss_pct", "horizon_bars", "test_days")


class GridError(ValueError):
    """ML_LONG_TRADE_GRID is not a valid grid."""


@dataclass(frozen=True)
class GridPoint:
    """A configuration before it is tied to a stock's training window."""

    take_profit_pct: float
    stop_loss_pct: float
    horizon_bars: int
    test_days: int

    @property
    def config_key(self) -> str:
        # Stable across runs, and the column re-runs upsert on, so it must only
        # ever change when the configuration does. :g keeps 0.0075 as 0.0075
        # and 0.01 as 0.01, matching how trading-wizard names its runs.
        return (
            f"pt{self.take_profit_pct:g}_sl{self.stop_loss_pct:g}"
            f"_H{self.horizon_bars}_T{self.test_days}"
        )


@dataclass(frozen=True)
class TrainingConfig(GridPoint):
    # Inclusive bounds of the bars the model sees. The notebook slices this
    # window BEFORE computing indicators, so the indicator warm-up comes out
    # of the window itself.
    train_from: date
    train_to: date


DEFAULT_GRID: tuple[GridPoint, ...] = tuple(
    GridPoint(pt, sl, h, t)
    for pt, sl, h, t in itertools.product(
        DEFAULT_TAKE_PROFIT_PCTS, DEFAULT_STOP_LOSS_PCTS, DEFAULT_HORIZON_BARS, DEFAULT_TEST_DAYS
    )
)


def parse_grid(raw: str) -> tuple[GridPoint, ...]:
    """Parse ML_LONG_TRADE_GRID.

    The same shape as trading-wizard's grid runner - one list per parameter,
    expanded to every combination:

        {"take_profit_pct": [0.01, 0.015], "stop_loss_pct": [0.005],
         "horizon_bars": [24, 36], "test_days": [30]}

    Strict on purpose: a typo in a scheduled job's env must fail the run at
    start-up, not silently train the wrong models every night.
    """
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise GridError(f"ML_LONG_TRADE_GRID is not valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise GridError("ML_LONG_TRADE_GRID must be a JSON object")

    unknown = sorted(set(data) - set(GRID_KEYS))
    missing = [key for key in GRID_KEYS if key not in data]
    if unknown:
        raise GridError(f"ML_LONG_TRADE_GRID has unknown keys: {', '.join(unknown)}")
    if missing:
        raise GridError(f"ML_LONG_TRADE_GRID is missing keys: {', '.join(missing)}")

    pts = _fractions(data["take_profit_pct"], "take_profit_pct")
    sls = _fractions(data["stop_loss_pct"], "stop_loss_pct")
    horizons = _positive_ints(data["horizon_bars"], "horizon_bars")
    test_days = _positive_ints(data["test_days"], "test_days")

    return tuple(
        GridPoint(pt, sl, h, t) for pt, sl, h, t in itertools.product(pts, sls, horizons, test_days)
    )


def _values(value: object, key: str) -> list:
    if not isinstance(value, list) or not value:
        raise GridError(f"ML_LONG_TRADE_GRID.{key} must be a non-empty list")
    if len(set(value)) != len(value):
        raise GridError(f"ML_LONG_TRADE_GRID.{key} has duplicate values")
    return value


def _fractions(value: object, key: str) -> list[float]:
    result = []
    for item in _values(value, key):
        # bool is an int subclass; true must not quietly become 1.0.
        if isinstance(item, bool) or not isinstance(item, int | float):
            raise GridError(f"ML_LONG_TRADE_GRID.{key} values must be numbers, got {item!r}")
        if not 0 < item < 1:
            raise GridError(f"ML_LONG_TRADE_GRID.{key} values must be between 0 and 1")
        # Stored as numeric(6,4). More decimals would be rounded on write, and
        # the stored row would no longer describe the model that produced it.
        try:
            exponent = Decimal(str(item)).as_tuple().exponent
        except InvalidOperation as exc:  # pragma: no cover - finite floats always convert
            raise GridError(f"ML_LONG_TRADE_GRID.{key} value {item!r} is not finite") from exc
        if isinstance(exponent, int) and exponent < -4:
            raise GridError(f"ML_LONG_TRADE_GRID.{key} values allow at most 4 decimal places")
        result.append(float(item))
    return result


def _positive_ints(value: object, key: str) -> list[int]:
    result = []
    for item in _values(value, key):
        if isinstance(item, bool) or not isinstance(item, int) or item < 1:
            raise GridError(f"ML_LONG_TRADE_GRID.{key} values must be positive integers")
        result.append(item)
    return result


def training_window(
    first_bar: date, last_bar: date, lookback_days: int | None
) -> tuple[date, date]:
    """All of the stock's history by default; the last N calendar days if set."""
    if lookback_days is None:
        return first_bar, last_bar
    return max(first_bar, last_bar - timedelta(days=lookback_days)), last_bar


def get_training_configs(
    symbol: str,
    grid: Sequence[GridPoint],
    *,
    first_bar: date,
    last_bar: date,
    lookback_days: int | None = None,
) -> list[TrainingConfig]:
    """Function 02. Every stock gets the same grid today; ``symbol`` is the
    place a per-stock grid would hook in."""
    train_from, train_to = training_window(first_bar, last_bar, lookback_days)
    return [
        TrainingConfig(
            take_profit_pct=point.take_profit_pct,
            stop_loss_pct=point.stop_loss_pct,
            horizon_bars=point.horizon_bars,
            test_days=point.test_days,
            train_from=train_from,
            train_to=train_to,
        )
        for point in grid
    ]
