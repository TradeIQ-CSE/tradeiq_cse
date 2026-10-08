"""Train, evaluate and predict for one (stock, configuration).

The research notebook only evaluated: train on a window, score the held-out
end of it. Production also has to answer for today, so each configuration is
trained twice:

1. Evaluate - exactly the notebook: fit on the labelled rows minus the last
   ``test_days`` and score those. This yields the stored metrics.
2. Predict - refit the same ensemble on every labelled row, then score the most
   recent bar (``data_as_of``). That bar has no label yet, which is the point:
   ``prob_long`` is the probability that, entering at its close, price reaches
   +pt before -sl within H trading days.
"""

from __future__ import annotations

import time
import warnings
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression
from xgboost import XGBClassifier

from .configs import DEFAULT_GRID, TrainingConfig
from .evaluation import (
    CONFIDENCE_MARGIN,
    classification_metrics,
    convert_prob_to_action,
    simulate_profit,
)
from .features import FEATURE_COLUMNS, RESEARCH_FEATURE_COLUMNS
from .labels import LABEL_COLUMN, add_labels, labelled_rows

RANDOM_STATE = 42

RESEARCH_SOURCE = "trading-wizard@321fa67 machine_learning/long-trade-predictor.ipynb"

# Below this the evaluation fit is noise, and a 30-bar test window would be a
# large share of the data. Coverage filtering (ML_LONG_TRADE_MIN_HISTORY_BARS)
# normally keeps stocks well clear of it.
MIN_TRAIN_ROWS = 100


class ModelSkipped(Exception):
    """This configuration cannot be trained on this stock's data. Expected for
    short or one-sided histories; logged and counted, never fatal."""


@dataclass(frozen=True)
class LongTradeResult:
    symbol: str
    config: TrainingConfig
    data_as_of: date
    # Evaluation split sizes. The prediction model is fitted on both together.
    train_rows: int
    test_rows: int
    # Share of label-1 rows across every labelled row (the prediction model's
    # training set).
    positive_rate: float
    prob_long: float
    is_long_signal: bool
    confidence_margin: float
    metrics: dict
    duration_seconds: float

    @property
    def test_profit_precision(self) -> float:
        return float(self.metrics["classification_report"]["Profit"]["precision"])


@dataclass(frozen=True)
class FittedEnsemble:
    logreg: LogisticRegression
    xgb: XGBClassifier
    logreg_converged: bool

    def predict_proba(self, x: pd.DataFrame) -> np.ndarray:
        return (self.logreg.predict_proba(x) + self.xgb.predict_proba(x)) / 2


def fit_ensemble(x: pd.DataFrame, y: pd.Series, *, n_jobs: int = 1) -> FittedEnsemble:
    """The notebook's two models, fitted on the same rows.

    The notebook calls the logistic regression ``rf``; it is not a random
    forest. Neither model is scaled or tuned, as in the research.
    """
    positives = int(y.sum())
    logreg = LogisticRegression(class_weight="balanced", random_state=RANDOM_STATE)
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always", ConvergenceWarning)
        logreg.fit(x, y)
    converged = not any(issubclass(w.category, ConvergenceWarning) for w in caught)

    xgb = XGBClassifier(
        n_jobs=n_jobs,
        verbosity=0,
        objective="binary:logistic",
        eval_metric="aucpr",
        scale_pos_weight=(len(y) - positives) / positives,
        random_state=RANDOM_STATE,
    )
    xgb.fit(x, y)
    return FittedEnsemble(logreg, xgb, converged)


def model_definition() -> dict:
    """What ml.models.metrics records about this model version."""
    return {
        "source": RESEARCH_SOURCE,
        "label": "triple-barrier, take profit checked before stop loss",
        "features": list(FEATURE_COLUMNS),
        "dropped_research_features": [
            c for c in RESEARCH_FEATURE_COLUMNS if c not in FEATURE_COLUMNS
        ],
        "default_grid": [point.config_key for point in DEFAULT_GRID],
        "confidence_margin": CONFIDENCE_MARGIN,
        "min_train_rows": MIN_TRAIN_ROWS,
        "random_state": RANDOM_STATE,
    }


def _check_trainable(y: pd.Series, what: str) -> None:
    if len(y) < MIN_TRAIN_ROWS:
        raise ModelSkipped(f"{what} has {len(y)} rows, fewer than {MIN_TRAIN_ROWS}")
    classes = y.nunique()
    if classes < 2:
        raise ModelSkipped(f"{what} has a single label class ({int(y.iloc[0])})")


def train_and_predict(
    symbol: str,
    features: pd.DataFrame,
    config: TrainingConfig,
    *,
    n_jobs: int = 1,
    feature_columns: Sequence[str] = FEATURE_COLUMNS,
) -> LongTradeResult:
    """``features`` is build_feature_frame's output for ``config``'s window.

    ``feature_columns`` exists for the research parity check, which needs the
    notebook's full best_40; production always uses FEATURE_COLUMNS.
    """
    started = time.perf_counter()
    columns = list(feature_columns)
    if features.empty:
        raise ModelSkipped("no bars in the training window")

    pt, sl, horizon = config.take_profit_pct, config.stop_loss_pct, config.horizon_bars
    labelled = add_labels(features, pt, sl, horizon)
    clean = labelled_rows(labelled, horizon)

    # --- 1. Evaluate (the notebook) -------------------------------------
    if len(clean) <= config.test_days:
        raise ModelSkipped(
            f"{len(clean)} labelled rows after dropna, not more than test_days={config.test_days}"
        )
    train_df = clean[: -config.test_days]
    test_df = clean[-config.test_days :]
    y_train = train_df[LABEL_COLUMN].astype(int)
    _check_trainable(y_train, "evaluation train set")

    evaluation_model = fit_ensemble(train_df[columns], y_train, n_jobs=n_jobs)
    test_proba = evaluation_model.predict_proba(test_df[columns])
    y_pred = convert_prob_to_action(test_proba, CONFIDENCE_MARGIN)
    y_test = test_df[LABEL_COLUMN].astype(int)

    metrics = {
        "classification_report": classification_metrics(y_test, y_pred),
        "profit": simulate_profit(labelled, test_df, y_pred, pt, sl, horizon),
        "evaluation": {
            "train_from": train_df["date"].iloc[0].isoformat(),
            "train_to": train_df["date"].iloc[-1].isoformat(),
            "test_from": test_df["date"].iloc[0].isoformat(),
            "test_to": test_df["date"].iloc[-1].isoformat(),
            "logreg_converged": evaluation_model.logreg_converged,
        },
    }

    # --- 2. Predict the most recent bar ---------------------------------
    latest = labelled.iloc[[-1]]
    if latest[columns].isna().any(axis=None):
        raise ModelSkipped(f"the latest bar ({latest['date'].iloc[0]}) has missing features")

    y_all = clean[LABEL_COLUMN].astype(int)
    _check_trainable(y_all, "prediction train set")
    prediction_model = fit_ensemble(clean[columns], y_all, n_jobs=n_jobs)
    latest_proba = prediction_model.predict_proba(latest[columns])
    metrics["prediction"] = {"logreg_converged": prediction_model.logreg_converged}

    return LongTradeResult(
        symbol=symbol,
        config=config,
        data_as_of=latest["date"].iloc[0],
        train_rows=len(train_df),
        test_rows=len(test_df),
        positive_rate=float(y_all.mean()),
        prob_long=float(latest_proba[0, 1]),
        is_long_signal=convert_prob_to_action(latest_proba, CONFIDENCE_MARGIN)[0] == 1,
        confidence_margin=CONFIDENCE_MARGIN,
        metrics=metrics,
        duration_seconds=time.perf_counter() - started,
    )
