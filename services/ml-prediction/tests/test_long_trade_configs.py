import json
from datetime import date

import pytest

from app.long_trade.configs import DEFAULT_GRID, GridError, get_training_configs, parse_grid
from app.long_trade.settings import SettingsError, load_settings

BASE_ENV = {
    "ML_DATABASE_URL": "postgresql://ml:secret@db:5432/ml",
    "ML_MARKET_TRADING_API_URL": "http://market-trading:3001/",
}


def test_default_grid_is_the_committed_research_grid():
    keys = [point.config_key for point in DEFAULT_GRID]

    assert len(DEFAULT_GRID) == 27
    assert len(set(keys)) == 27
    assert keys[0] == "pt0.01_sl0.005_H24_T30"
    assert "pt0.015_sl0.0075_H36_T30" in keys
    assert keys[-1] == "pt0.02_sl0.01_H48_T30"
    assert {p.test_days for p in DEFAULT_GRID} == {30}


def test_training_configs_cover_all_history_by_default():
    configs = get_training_configs(
        "COMB.N0000", DEFAULT_GRID, first_bar=date(2017, 1, 2), last_bar=date(2025, 12, 31)
    )

    assert len(configs) == 27
    assert {(c.train_from, c.train_to) for c in configs} == {(date(2017, 1, 2), date(2025, 12, 31))}


def test_training_configs_with_a_rolling_window():
    (config, *_) = get_training_configs(
        "COMB.N0000",
        DEFAULT_GRID,
        first_bar=date(2017, 1, 2),
        last_bar=date(2025, 12, 31),
        lookback_days=365,
    )
    assert (config.train_from, config.train_to) == (date(2024, 12, 31), date(2025, 12, 31))


def test_grid_override_expands_every_combination():
    grid = parse_grid(
        json.dumps(
            {
                "take_profit_pct": [0.01, 0.02],
                "stop_loss_pct": [0.0075],
                "horizon_bars": [12, 24],
                "test_days": [20],
            }
        )
    )
    assert [p.config_key for p in grid] == [
        "pt0.01_sl0.0075_H12_T20",
        "pt0.01_sl0.0075_H24_T20",
        "pt0.02_sl0.0075_H12_T20",
        "pt0.02_sl0.0075_H24_T20",
    ]


VALID = {
    "take_profit_pct": [0.01],
    "stop_loss_pct": [0.005],
    "horizon_bars": [24],
    "test_days": [30],
}


@pytest.mark.parametrize(
    "raw",
    [
        "not json",
        "[0.01]",
        json.dumps({**VALID, "unexpected": [1]}),
        json.dumps({k: v for k, v in VALID.items() if k != "test_days"}),
        json.dumps({**VALID, "take_profit_pct": []}),
        json.dumps({**VALID, "take_profit_pct": 0.01}),
        json.dumps({**VALID, "take_profit_pct": [0.01, 0.01]}),
        json.dumps({**VALID, "take_profit_pct": [1.5]}),
        json.dumps({**VALID, "stop_loss_pct": [0]}),
        json.dumps({**VALID, "stop_loss_pct": ["0.005"]}),
        json.dumps({**VALID, "stop_loss_pct": [0.00125]}),
        json.dumps({**VALID, "horizon_bars": [0]}),
        json.dumps({**VALID, "horizon_bars": [24.0]}),
        json.dumps({**VALID, "test_days": [True]}),
    ],
)
def test_invalid_grid_fails_fast(raw):
    with pytest.raises(GridError):
        parse_grid(raw)
    with pytest.raises(SettingsError):
        load_settings({**BASE_ENV, "ML_LONG_TRADE_GRID": raw})


def test_settings_defaults():
    settings = load_settings(BASE_ENV)

    assert settings.market_trading_api_url == "http://market-trading:3001"
    assert settings.symbols is None
    assert settings.grid == DEFAULT_GRID
    assert settings.min_history_bars == 400
    assert settings.train_lookback_days is None
    assert settings.n_jobs == 1


def test_symbols_are_normalised_and_empty_values_mean_unset():
    settings = load_settings(
        {
            **BASE_ENV,
            "ML_LONG_TRADE_SYMBOLS": " comb.n0000, JKH.N0000,,COMB.N0000 ",
            # Compose passes unset optional variables through as "".
            "ML_LONG_TRADE_GRID": "",
            "ML_LONG_TRADE_TRAIN_LOOKBACK_DAYS": "",
        }
    )
    assert settings.symbols == ("COMB.N0000", "JKH.N0000")
    assert settings.grid == DEFAULT_GRID
    assert settings.train_lookback_days is None


@pytest.mark.parametrize(
    "env",
    [
        {"ML_MARKET_TRADING_API_URL": "http://market-trading:3001"},
        {"ML_DATABASE_URL": "postgresql://ml@db/ml"},
        {**BASE_ENV, "ML_LONG_TRADE_N_JOBS": "0"},
        {**BASE_ENV, "ML_LONG_TRADE_MIN_HISTORY_BARS": "many"},
        {**BASE_ENV, "ML_LONG_TRADE_HTTP_TIMEOUT_SECONDS": "-1"},
        {**BASE_ENV, "ML_LONG_TRADE_LOG_LEVEL": "LOUD"},
        {**BASE_ENV, "ML_LONG_TRADE_SYMBOLS": " , "},
    ],
)
def test_invalid_settings_fail_fast(env):
    with pytest.raises(SettingsError):
        load_settings(env)


def test_recorded_settings_carry_no_credentials():
    settings = load_settings(
        {
            "ML_DATABASE_URL": "postgresql://ml:db-password@db:5432/ml",
            "ML_MARKET_TRADING_API_URL": "http://user:api-password@market-trading:3001",
        }
    )
    recorded = json.dumps(settings.public_summary())

    assert "password" not in recorded
    assert "postgresql" not in recorded
    assert settings.public_summary()["market_trading_api_url"] == "http://market-trading:3001"


@pytest.mark.parametrize(
    "url",
    [
        "http://host:api/",
        "http://[bad",
        "not a url",
        "://invalid",
        "http:///",
        "ftp://market-trading:3001",
        "http://host:65536",
        "http://host:0",
    ],
)
def test_invalid_market_api_url_is_a_configuration_error(url):
    with pytest.raises(SettingsError, match="ML_MARKET_TRADING_API_URL"):
        load_settings({**BASE_ENV, "ML_MARKET_TRADING_API_URL": url})


@pytest.mark.parametrize("url", ["http://market-trading:3001", "https://example.test/api/market"])
def test_valid_market_api_url_preserves_its_path(url):
    settings = load_settings({**BASE_ENV, "ML_MARKET_TRADING_API_URL": url + "/"})
    assert settings.market_trading_api_url == url
