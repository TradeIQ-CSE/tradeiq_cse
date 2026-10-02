import numpy as np
import pandas as pd

from app.long_trade.labels import LABEL_COLUMN, add_labels, labelled_rows, triple_barrier_labels

PT, SL = 0.015, 0.005  # barriers at 101.5 and 99.5 for an entry of 100


def label_first_bar(next_highs, next_lows, horizon=3):
    """Label bar 0 (close 100) against the bars that follow it."""
    n = horizon + 1
    close = np.full(n, 100.0)
    high = np.array([100.0, *next_highs, *([100.0] * (n - 1 - len(next_highs)))])
    low = np.array([100.0, *next_lows, *([100.0] * (n - 1 - len(next_lows)))])
    return int(triple_barrier_labels(close, high, low, PT, SL, horizon)[0])


def test_take_profit_first_is_1():
    assert label_first_bar([100.2, 101.6], [99.9, 99.9]) == 1


def test_stop_loss_first_is_0():
    assert label_first_bar([100.2, 101.6], [99.4, 99.9]) == 0


def test_neither_barrier_within_horizon_is_0():
    assert label_first_bar([101.0, 101.4, 101.4], [99.6, 99.6, 99.6]) == 0


def test_take_profit_after_horizon_is_0():
    # The take profit is only reached on bar 3, one past a horizon of 2.
    close = np.full(5, 100.0)
    high = np.array([100.0, 100.0, 100.0, 102.0, 100.0])
    low = np.full(5, 99.9)
    assert triple_barrier_labels(close, high, low, PT, SL, 2)[0] == 0


def test_bar_touching_both_barriers_counts_as_take_profit():
    # Daily bars cannot say which barrier came first intraday; the notebook
    # checks the high first, and parity keeps that.
    assert label_first_bar([102.0], [99.0]) == 1


def test_last_horizon_rows_are_unlabelled_and_dropped():
    n, horizon = 12, 3
    rising = 100 * 1.02 ** np.arange(n)
    frame = pd.DataFrame({"close": rising, "high": rising * 1.001, "low": rising * 0.999})
    labelled = add_labels(frame, PT, SL, horizon)

    assert labelled[LABEL_COLUMN].iloc[: n - horizon].eq(1).all()
    assert labelled[LABEL_COLUMN].iloc[n - horizon :].eq(0).all()
    clean = labelled_rows(labelled, horizon)
    assert list(clean.index) == list(range(n - horizon))
