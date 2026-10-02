import numpy as np
import pytest

from app.long_trade.configs import DEFAULT_GRID, TrainingConfig, get_training_configs
from app.long_trade.evaluation import CONFIDENCE_MARGIN, convert_prob_to_action
from app.long_trade.features import bar_dates, bars_to_frame, build_feature_frame
from app.long_trade.model import ModelSkipped, train_and_predict

from .conftest import random_walk_bars, steady_rise_bars

# pt0.015_sl0.005_H24_T30, the notebook's own default.
POINT = next(p for p in DEFAULT_GRID if p.config_key == "pt0.015_sl0.005_H24_T30")


def config_for(frame) -> TrainingConfig:
    first, last = bar_dates(frame)
    (config,) = get_training_configs("TEST.N0000", [POINT], first_bar=first, last_bar=last)
    return config


@pytest.fixture(scope="module")
def trained(synthetic_bars):
    frame = bars_to_frame(synthetic_bars)
    config = config_for(frame)
    features = build_feature_frame(frame, config.train_from, config.train_to)
    return features, config, train_and_predict("TEST.N0000", features, config)


def test_predicts_a_probability_for_the_latest_bar(trained, synthetic_window):
    _, config, result = trained

    assert 0 <= result.prob_long <= 1
    assert result.data_as_of == synthetic_window[1]
    assert result.test_rows == config.test_days
    assert result.train_rows > 300
    assert 0 < result.positive_rate < 1
    assert result.confidence_margin == CONFIDENCE_MARGIN
    assert set(result.metrics) == {"classification_report", "profit", "evaluation", "prediction"}
    assert result.metrics["evaluation"]["test_to"] < result.data_as_of.isoformat()


def test_signal_follows_the_confidence_margin_rule(trained):
    _, _, result = trained
    p = result.prob_long
    assert result.is_long_signal == ((p - (1 - p)) >= CONFIDENCE_MARGIN)


def test_margin_rule_matches_the_notebook():
    probabilities = np.array([[0.35, 0.65], [0.36, 0.64], [0.9, 0.1], [0.5, 0.5], [0.1, 0.9]])
    # [0.9, 0.1] is confident but in "no profit", which is still no trade.
    assert convert_prob_to_action(probabilities, CONFIDENCE_MARGIN) == [1, 0, 0, 0, 1]


def test_training_is_deterministic(trained):
    features, config, first = trained
    second = train_and_predict("TEST.N0000", features, config)

    assert second.prob_long == first.prob_long
    assert second.is_long_signal == first.is_long_signal
    assert second.metrics == first.metrics


def test_too_little_history_is_skipped_not_crashed():
    frame = bars_to_frame(random_walk_bars(150))
    config = config_for(frame)
    features = build_feature_frame(frame, config.train_from, config.train_to)

    with pytest.raises(ModelSkipped, match="labelled rows"):
        train_and_predict("TEST.N0000", features, config)


def test_a_single_label_class_is_skipped_not_crashed():
    frame = bars_to_frame(steady_rise_bars())
    config = config_for(frame)
    features = build_feature_frame(frame, config.train_from, config.train_to)

    with pytest.raises(ModelSkipped, match="single label class"):
        train_and_predict("TEST.N0000", features, config)


def test_an_empty_window_is_skipped():
    frame = bars_to_frame(random_walk_bars(50))
    features = build_feature_frame(frame, None, None).iloc[0:0]
    with pytest.raises(ModelSkipped, match="no bars"):
        train_and_predict("TEST.N0000", features, config_for(frame))
