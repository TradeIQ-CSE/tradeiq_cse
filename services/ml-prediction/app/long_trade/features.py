"""Platform bars -> the frame the research notebook worked on, and its features.

trading-wizard trained on CSV files with columns
``open_time, open, high, low, close, volume, trades_count, tbba_volume``. The
platform's daily bars (GET /securities/{symbol}/ohlcv) differ in three ways,
each handled here and recorded in docs/adr/0011-long-trade-batch-predictor.md:

1. No ``tbba_volume``. In every trading-wizard CSV it is exactly ``volume / 2``,
   so it is synthesised the same way. No selected feature depends on it.
2. No ``trades_count``. ``trades_sma12`` is one of the research's best_40
   features, so it is dropped: production trains on the other 39. The engine
   still reads ``trades_count`` unconditionally, so it gets a constant
   placeholder. That only feeds columns that are never features (guarded by
   TRADES_DERIVED_COLUMNS and a test).
3. ``open`` may be null. It is filled with the previous bar's close (the first
   bar falls back to its own close); left as NaN, the wick and body features
   would turn NaN and the notebook's ``dropna()`` would silently drop the bar.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import UTC, date, datetime

import pandas as pd

from .indicator_engine import IndicatorEngine

# The research notebook's best_40, verbatim and in its order.
RESEARCH_FEATURE_COLUMNS: tuple[str, ...] = (
    "atr_28_pct", "atr_14_pct", "trades_sma12", "rv_12", "realized_vol_20", "ema_200_norm",
    "realized_vol_10", "vwap_normalised", "bb_bandwidth", "volatility_compression_50",
    "ema_21_50_spread_z", "atr_zscore_100", "vol_of_vol_20", "adx", "price_trend_ratio_50",
    "bb_bandwidth_z", "rolling_high_20_dist", "ema_9_21_spread_z", "realized_vol_ratio",
    "chop_14", "rolling_low_20_dist", "trend_persistence_10", "macd_normalised",
    "rsi_28_normalized", "rsi_regime_z", "range_pct", "-DI", "macd_hist_normalised",
    "ema_50_norm", "+DI", "sma_diff_norm", "range_position_60", "ema_50_slope_norm",
    "fib_50_dist_60", "di_spread", "roc_10", "ema_diff_norm", "stoch_rsi_14",
    "lower_wick_pct", "upper_wick_pct",
)  # fmt: skip

# Every engine column computed from trades_count, which the platform does not
# have. None of these may ever be a production feature.
TRADES_DERIVED_COLUMNS = frozenset(
    {"trades_count", "avg_trade_size", "trade_size_ratio", "trades_sma12", "trades_ratio"}
)

# Every engine column computed from tbba_volume. It is synthesised as
# volume / 2, which makes these constants: also never features.
TBBA_DERIVED_COLUMNS = frozenset(
    {
        "tbba_volume",
        "buy_volume_ratio",
        "volume_delta",
        "volume_delta_ratio",
        "ofi_zscore_50",
        "volume_pressure_score",
    }
)

# best_40 without the one trades-derived column: 39 features.
FEATURE_COLUMNS: tuple[str, ...] = tuple(
    column for column in RESEARCH_FEATURE_COLUMNS if column not in TRADES_DERIVED_COLUMNS
)

# Any constant non-NaN value works: it only feeds the trades-derived columns
# above. It must not be NaN, because the notebook's dropna() runs over EVERY
# column and would then drop every row. 1 keeps those columns finite and their
# NaN warm-up (at most 50 bars) inside the ~120 bars the slowest feature
# indicators already need, so the rows dropna() keeps are unchanged.
PLACEHOLDER_TRADES_COUNT = 1.0

# The columns the notebook's frame holds before indicators. Nothing else may be
# carried in (adjusted_close, say): dropna() would drop rows on its nulls.
BAR_COLUMNS = ("open_time", "open", "high", "low", "close", "volume", "trades_count", "tbba_volume")


def bars_to_frame(bars: Iterable[Mapping]) -> pd.DataFrame:
    """Platform daily bars -> the research CSV's columns, ascending by date."""
    records = list(bars)
    if not records:
        return pd.DataFrame(columns=list(BAR_COLUMNS))

    frame = pd.DataFrame.from_records(records)
    dates = [_as_date(value) for value in frame["date"]]
    out = pd.DataFrame(
        {
            # UTC midnight in epoch ms, the CSVs' convention, so the ported
            # notebook code below runs unchanged.
            "open_time": [_utc_midnight_ms(day) for day in dates],
            # Numbers may arrive as JSON numbers or as numeric strings.
            "open": pd.to_numeric(frame["open"], errors="coerce").astype("float64"),
            "high": pd.to_numeric(frame["high"], errors="raise").astype("float64"),
            "low": pd.to_numeric(frame["low"], errors="raise").astype("float64"),
            "close": pd.to_numeric(frame["close"], errors="raise").astype("float64"),
            "volume": pd.to_numeric(frame["volume"], errors="raise").astype("float64"),
        }
    )
    out = out.sort_values("open_time", kind="stable").reset_index(drop=True)

    previous_close = out["close"].shift(1).fillna(out["close"])
    out["open"] = out["open"].fillna(previous_close)
    out["trades_count"] = PLACEHOLDER_TRADES_COUNT
    out["tbba_volume"] = out["volume"] / 2
    return out[list(BAR_COLUMNS)]


def build_feature_frame(
    bars: pd.DataFrame, train_from: date | None, train_to: date | None
) -> pd.DataFrame:
    """The notebook's data loading, window slice and indicator cells, in order.

    Returns every engine column (not only FEATURE_COLUMNS): the notebook's
    dropna() runs over all of them, and parity depends on it.
    """
    df = bars.copy()
    df["dt"] = pd.to_datetime(df["open_time"], unit="ms", utc=True)
    df["date"] = df["dt"].dt.date
    df = df.sort_values("dt", ascending=True).reset_index(drop=True)

    if train_from is not None:
        df = df[df["dt"] >= pd.Timestamp(train_from, tz="UTC")]
    if train_to is not None:
        df = df[df["dt"] <= pd.Timestamp(train_to, tz="UTC")]
    df = df.reset_index(drop=True)

    return IndicatorEngine().add_all_indicators(df)


def bar_dates(bars: pd.DataFrame) -> tuple[date, date]:
    """The first and last session in a bars_to_frame frame."""
    days = pd.to_datetime(bars["open_time"], unit="ms", utc=True).dt.date
    return days.min(), days.max()


def _as_date(value: object) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _utc_midnight_ms(day: date) -> int:
    return int(datetime(day.year, day.month, day.day, tzinfo=UTC).timestamp() * 1000)
