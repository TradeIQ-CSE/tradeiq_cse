"""Triple-barrier labelling, ported from the research notebook's label cells."""

from __future__ import annotations

import numpy as np
import pandas as pd

LABEL_COLUMN = "tb_label"


def triple_barrier_labels(
    close: np.ndarray, high: np.ndarray, low: np.ndarray, pt: float, sl: float, horizon: int
) -> np.ndarray:
    """1 when a later bar's high reaches entry * (1 + pt) before a later bar's
    low reaches entry * (1 - sl), within ``horizon`` bars; 0 otherwise.

    Entry is each bar's close. On a bar that touches both barriers the take
    profit wins, because the notebook checks it first; daily bars cannot say
    which came first intraday, so this is kept for parity, not because it is
    right. The last ``horizon`` bars have no complete look-ahead and stay 0;
    callers must drop them (see labelled_rows).
    """
    labels = np.zeros(len(close), dtype=np.int8)
    for i in range(len(close) - horizon):
        entry = close[i]
        pt_price = entry * (1 + pt)
        sl_price = entry * (1 - sl)
        for j in range(i + 1, i + 1 + horizon):
            if high[j] >= pt_price:
                labels[i] = 1
                break
            if low[j] <= sl_price:
                break
    return labels


def add_labels(frame: pd.DataFrame, pt: float, sl: float, horizon: int) -> pd.DataFrame:
    labelled = frame.copy()
    labelled[LABEL_COLUMN] = triple_barrier_labels(
        frame["close"].to_numpy(),
        frame["high"].to_numpy(),
        frame["low"].to_numpy(),
        pt,
        sl,
        horizon,
    )
    return labelled


def labelled_rows(labelled: pd.DataFrame, horizon: int) -> pd.DataFrame:
    """The notebook's ``df.dropna()[:-H]``: rows with every column present,
    minus the last H, whose labels never saw a full horizon."""
    return labelled.dropna()[:-horizon]
