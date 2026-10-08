"""Test-window evaluation, ported from the research notebook so the job reports
the same numbers the research did: the decision rule, the classification
report and the simplified profit simulation."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import pandas as pd
from sklearn.metrics import classification_report

from .labels import LABEL_COLUMN

# Signal a long trade only when the ensemble's top class beats the runner-up by
# at least this much. With two classes that means P(long) >= 0.65.
CONFIDENCE_MARGIN = 0.3

# The notebook's simulation capital. Only scales profit_dollars-style numbers;
# returns are reported as fractions of it.
STARTING_CAPITAL = 1000

TARGET_NAMES = ["No Profit", "Profit"]


def convert_prob_to_action(probabilities: np.ndarray, prob_margin: float) -> list[int]:
    """The notebook's ``convert_prob_to_action``, unchanged: the top class when
    it leads the second by ``prob_margin``, else class 0 (no trade)."""
    actions = []
    for probability_instance in probabilities:
        top_idx = int(np.argmax(probability_instance))
        sorted_probs = np.sort(probability_instance)
        if sorted_probs[-1] - sorted_probs[-2] >= prob_margin:
            actions.append(top_idx)
        else:
            actions.append(0)
    return actions


def classification_metrics(y_true: Sequence[int], y_pred: Sequence[int]) -> dict:
    # zero_division=0 is what the notebook's default ("warn") also returns; it
    # just does not print a warning into the job's log for every quiet window.
    return classification_report(
        y_true,
        y_pred,
        labels=[0, 1],
        target_names=TARGET_NAMES,
        output_dict=True,
        zero_division=0,
    )


def simulate_profit(
    frame: pd.DataFrame,
    test_df: pd.DataFrame,
    y_pred: Sequence[int],
    pt: float,
    sl: float,
    horizon: int,
    starting_capital: float = STARTING_CAPITAL,
) -> dict:
    """The notebook's profit tracker, as a pure function returning its summary.

    A simplified simulation, not a backtest: equal position sizing, no
    compounding, no fees or slippage, at most ``num_shares`` positions open at
    once (priced off the first test bar). A winning label earns +pt and
    anything else is charged -sl. ``frame`` is the labelled, windowed frame
    with its 0..n-1 index intact; ``test_df`` is a slice of it, so its index
    holds positions into ``frame``.
    """
    close = frame["close"].to_numpy()
    high = frame["high"].to_numpy()
    low = frame["low"].to_numpy()

    def exit_position(entry_position: int) -> int:
        # Mirrors the label loop: the first bar that touches a barrier, else
        # the bar the horizon runs out on.
        entry = close[entry_position]
        pt_price = entry * (1 + pt)
        sl_price = entry * (1 - sl)
        for j in range(entry_position + 1, min(entry_position + 1 + horizon, len(close))):
            if high[j] >= pt_price or low[j] <= sl_price:
                return j
        return min(entry_position + horizon, len(close) - 1)

    test_positions = test_df.index.to_numpy()
    labels = test_df[LABEL_COLUMN].to_numpy()

    first_test_price = close[test_positions[0]]
    num_shares = max(1, int(np.floor(starting_capital / first_test_price)))
    capital_per_share = starting_capital / num_shares

    profits = []
    wins = 0
    skipped_no_capital = 0
    open_exit_positions: list[int] = []

    for idx, signal in enumerate(y_pred):
        if signal != 1:
            continue
        entry_position = test_positions[idx]
        open_exit_positions = [p for p in open_exit_positions if p > entry_position]
        if len(open_exit_positions) >= num_shares:
            skipped_no_capital += 1
            continue

        won = labels[idx] == 1
        open_exit_positions.append(exit_position(entry_position))
        wins += int(won)
        profits.append(capital_per_share * (pt if won else -sl))

    trades_taken = len(profits)
    # sum() over a list, as pandas' Series.sum() did in the notebook, so the
    # floating-point order of addition is the same.
    total_profit = float(pd.Series(profits, dtype="float64").sum())
    return {
        "trades_taken": trades_taken,
        "wins": wins,
        "losses": trades_taken - wins,
        "win_rate": (wins / trades_taken) if trades_taken > 0 else 0,
        "total_return_pct": total_profit / starting_capital,
        "starting_capital": starting_capital,
        "final_capital": starting_capital + total_profit,
        "num_shares": num_shares,
        "trades_skipped_no_capital": skipped_no_capital,
    }
