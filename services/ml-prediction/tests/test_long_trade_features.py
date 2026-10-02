import numpy as np
import pytest

from app.long_trade.features import (
    BAR_COLUMNS,
    FEATURE_COLUMNS,
    RESEARCH_FEATURE_COLUMNS,
    TBBA_DERIVED_COLUMNS,
    TRADES_DERIVED_COLUMNS,
    bar_dates,
    bars_to_frame,
    build_feature_frame,
)

BARS = [
    # Deliberately out of order, with string numbers and a null open on the
    # first and a later bar.
    {"date": "2025-01-03", "open": None, "high": "12.5", "low": 11.5, "close": "12", "volume": 50},
    {"date": "2025-01-02", "open": None, "high": 11, "low": 9, "close": 10, "volume": "100"},
    {"date": "2025-01-06", "open": 12.2, "high": 13, "low": 12, "close": 12.8, "volume": 7},
]


def test_bars_to_frame_matches_the_research_csv_shape():
    frame = bars_to_frame(BARS)

    assert list(frame.columns) == list(BAR_COLUMNS)
    assert "adjusted_close" not in frame.columns
    assert frame["open_time"].tolist() == [1735776000000, 1735862400000, 1736121600000]
    assert all(dtype == np.float64 for dtype in frame.drop(columns="open_time").dtypes)


def test_null_open_is_the_previous_close_or_the_bars_own_close():
    frame = bars_to_frame(BARS)

    assert frame["open"].tolist() == [10.0, 10.0, 12.2]


def test_tbba_volume_is_half_the_volume_and_trades_is_a_placeholder():
    frame = bars_to_frame(BARS)

    assert frame["tbba_volume"].tolist() == [50.0, 25.0, 3.5]
    assert frame["trades_count"].notna().all()


def test_bar_dates():
    first, last = bar_dates(bars_to_frame(BARS))
    assert (first.isoformat(), last.isoformat()) == ("2025-01-02", "2025-01-06")


def test_no_bars_gives_an_empty_frame():
    assert bars_to_frame([]).empty


def test_feature_columns_are_best_40_without_trades():
    assert len(RESEARCH_FEATURE_COLUMNS) == 40
    assert len(FEATURE_COLUMNS) == 39
    assert "trades_sma12" not in FEATURE_COLUMNS
    assert TRADES_DERIVED_COLUMNS.isdisjoint(FEATURE_COLUMNS)
    assert TBBA_DERIVED_COLUMNS.isdisjoint(FEATURE_COLUMNS)
    assert list(FEATURE_COLUMNS) == [c for c in RESEARCH_FEATURE_COLUMNS if c != "trades_sma12"]


def test_engine_produces_every_feature_on_a_random_walk(synthetic_bars):
    features = build_feature_frame(bars_to_frame(synthetic_bars), None, None)

    assert set(FEATURE_COLUMNS) <= set(features.columns)
    complete = features.dropna()
    # The slowest feature indicators need ~120 bars; everything after is usable,
    # including the latest bar, which is the one production predicts.
    assert 450 <= len(complete) < len(features)
    assert complete.index[-1] == features.index[-1]


@pytest.mark.parametrize(
    ("column", "derived"),
    [("trades_count", TRADES_DERIVED_COLUMNS), ("tbba_volume", TBBA_DERIVED_COLUMNS)],
)
def test_synthesised_inputs_reach_no_feature_and_no_dropna_decision(
    synthetic_bars, column, derived
):
    """Whatever the platform fills trades_count / tbba_volume with cannot change
    a feature value or which rows the notebook's dropna() keeps."""
    bars = bars_to_frame(synthetic_bars)
    other = bars.copy()
    other[column] = np.random.default_rng(1).uniform(1, 500, len(bars))

    a = build_feature_frame(bars, None, None)
    b = build_feature_frame(other, None, None)

    changed = {c for c in a.columns if not a[c].equals(b[c])}
    assert changed <= derived, f"undeclared {column}-derived columns: {changed - derived}"
    assert a[list(FEATURE_COLUMNS)].equals(b[list(FEATURE_COLUMNS)])
    assert a.dropna().index.equals(b.dropna().index)


def test_training_window_is_sliced_before_indicators(synthetic_bars, synthetic_window):
    first, last = synthetic_window
    bars = bars_to_frame(synthetic_bars)
    from_date = bar_dates(bars.iloc[200:])[0]

    windowed = build_feature_frame(bars, from_date, last)

    assert windowed["date"].iloc[0] == from_date
    assert len(windowed) == len(bars) - 200
    # The warm-up is eaten out of the window itself, as in the notebook.
    assert windowed[list(FEATURE_COLUMNS)].iloc[0].isna().any()
