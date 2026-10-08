"""The long-trade batch job: one run trains every model and stores today's
predictions, then exits. Scheduled, never resident (ADR 0004, ADR 0011).

    python -m app.long_trade.main

Exit codes, for the scheduler:
    0  the run completed (individual models may still have been skipped)
    1  the run completed but trained nothing
    2  invalid configuration (an ML_* variable)
    3  a dependency is unavailable: the database or market-trading
"""

from __future__ import annotations

import gc
import logging
import resource
import sys
import time
from collections.abc import Mapping
from contextlib import closing
from dataclasses import dataclass
from datetime import date

import pandas as pd
from sqlalchemy.exc import SQLAlchemyError
from threadpoolctl import threadpool_limits

from .configs import TrainingConfig, get_training_configs
from .features import bar_dates, bars_to_frame, build_feature_frame
from .market_client import (
    MarketTradingClient,
    MarketTradingError,
    MarketTradingUnreachable,
    Security,
    SecurityNotFound,
)
from .model import LongTradeResult, ModelSkipped, model_definition, train_and_predict
from .repository import LongTradeRepository, RunCounts
from .settings import Settings, SettingsError, load_settings
from .universe import load_symbols

log = logging.getLogger("app.long_trade")

EXIT_OK = 0
EXIT_NOTHING_TRAINED = 1
EXIT_CONFIG = 2
EXIT_UNAVAILABLE = 3

# Earlier than any CSE history the platform holds. Sent as ``from`` when a
# symbol was named explicitly and its coverage is unknown, because the OHLCV
# endpoint's own default is only the last year.
HISTORY_START = date(1990, 1, 1)


def main(
    env: Mapping[str, str] | None = None,
    *,
    client: MarketTradingClient | None = None,
    repository: LongTradeRepository | None = None,
) -> int:
    started = time.monotonic()
    try:
        settings = load_settings(env)
    except SettingsError as exc:
        configure_logging("INFO")
        log.error("Invalid configuration: %s", exc)
        return EXIT_CONFIG
    configure_logging(settings.log_level)

    try:
        repository = repository or LongTradeRepository.connect(settings.database_url)
        model_id = repository.register_model(model_definition())
        run_id = repository.start_run(model_id, settings.public_summary(), symbols_requested=0)
    except SQLAlchemyError as exc:
        log.error("Database unavailable: %s", _first_line(exc))
        return EXIT_UNAVAILABLE

    client = client or MarketTradingClient(
        settings.market_trading_api_url, timeout=settings.http_timeout_seconds
    )
    tally = Tally(grid_size=len(settings.grid))
    log.info(
        "Long-trade run %s started: %d configurations per stock, n_jobs=%d",
        run_id, tally.grid_size, settings.n_jobs,
    )  # fmt: skip

    try:
        # BLAS (used by the logistic regression) would otherwise start a thread
        # per core on a box that also serves the website.
        with closing(client), threadpool_limits(limits=settings.n_jobs):
            securities = load_symbols(settings, client)  # function 01
            tally.stocks = len(securities)
            repository.set_symbols_requested(run_id, tally.stocks)

            for security in securities:
                bars = fetch_bars(security, settings, client, tally)
                if bars is None:
                    continue
                first_bar, last_bar = bar_dates(bars)
                configs = get_training_configs(  # function 02
                    security.symbol,
                    settings.grid,
                    first_bar=first_bar,
                    last_bar=last_bar,
                    lookback_days=settings.train_lookback_days,
                )
                features = FeatureCache(bars)
                for config in configs:
                    result = train_one(security.symbol, features, config, settings, tally)
                    if result is None:
                        continue
                    repository.save(run_id, result)
                    tally.record(result)
                    log_trained(result)

                # One stock at a time on a 2 GiB box: drop this stock's frames
                # before the next is fetched, not whenever the collector runs.
                del bars, features
                gc.collect()
    except MarketTradingError as exc:
        # Listing the universe failed, or market-trading became unreachable.
        log.error("market-trading unavailable, stopping the run: %s", exc)
        finish(repository, run_id, tally, status="failed")
        return EXIT_UNAVAILABLE
    except SQLAlchemyError as exc:
        log.error("Database error, stopping the run: %s", _first_line(exc))
        finish(repository, run_id, tally, status="failed")
        return EXIT_UNAVAILABLE

    finish(repository, run_id, tally, status=tally.status)
    log.info(
        "Long-trade run %s %s: stocks=%d models_trained=%d models_skipped=%d "
        "models_failed=%d data_as_of=%s elapsed=%.1fs peak_rss_mb=%.0f",
        run_id, tally.status, tally.stocks, tally.trained, tally.skipped, tally.failed,
        tally.data_as_of, time.monotonic() - started, peak_rss_mb(),
    )  # fmt: skip
    return EXIT_OK if tally.trained else EXIT_NOTHING_TRAINED


@dataclass
class Tally:
    """Every configuration of every selected stock ends up in exactly one of
    trained / skipped / failed, so they always sum to stocks x grid size."""

    grid_size: int
    stocks: int = 0
    trained: int = 0
    skipped: int = 0
    failed: int = 0
    data_as_of: date | None = None

    def record(self, result: LongTradeResult) -> None:
        self.trained += 1
        if self.data_as_of is None or result.data_as_of > self.data_as_of:
            self.data_as_of = result.data_as_of

    def counts(self) -> RunCounts:
        return RunCounts(self.stocks, self.trained, self.skipped, self.failed)

    @property
    def status(self) -> str:
        if self.trained == 0:
            return "failed"
        return "partial" if self.skipped or self.failed else "succeeded"


class FeatureCache:
    """Indicators depend only on the training window, which every
    configuration of a stock normally shares: compute them once per window."""

    def __init__(self, bars: pd.DataFrame) -> None:
        self._bars = bars
        self._frames: dict[tuple[date, date], pd.DataFrame] = {}

    def for_config(self, config: TrainingConfig) -> pd.DataFrame:
        window = (config.train_from, config.train_to)
        if window not in self._frames:
            self._frames[window] = build_feature_frame(self._bars, *window)
        return self._frames[window]


def fetch_bars(
    security: Security, settings: Settings, client: MarketTradingClient, tally: Tally
) -> pd.DataFrame | None:
    """A stock's bars, or None when it cannot be trained today (logged and
    counted against all of its configurations). Only an unreachable
    market-trading escapes, because every later stock would fail the same way."""
    symbol = security.symbol
    try:
        bars = bars_to_frame(
            client.daily_bars(symbol, from_date=security.data_from or HISTORY_START)
        )
    except MarketTradingUnreachable:
        raise
    except SecurityNotFound as exc:
        log.warning("Skipping %s: %s", symbol, exc)
        tally.failed += tally.grid_size
        return None
    except (MarketTradingError, ValueError, KeyError) as exc:
        log.warning("Skipping %s: could not load its bars (%s)", symbol, _first_line(exc))
        tally.failed += tally.grid_size
        return None

    if len(bars) < settings.min_history_bars:
        log.warning(
            "Skipping %s: %d bars of history, fewer than ML_LONG_TRADE_MIN_HISTORY_BARS=%d",
            symbol, len(bars), settings.min_history_bars,
        )  # fmt: skip
        tally.skipped += tally.grid_size
        return None
    return bars


def train_one(
    symbol: str, features: FeatureCache, config: TrainingConfig, settings: Settings, tally: Tally
) -> LongTradeResult | None:
    """Train one configuration and predict; None (logged and counted) when it
    is skipped or fails, so one bad model never stops the run."""
    try:
        return train_and_predict(
            symbol, features.for_config(config), config, n_jobs=settings.n_jobs
        )
    except ModelSkipped as exc:
        log.warning("Skipped %s %s: %s", symbol, config.config_key, exc)
        tally.skipped += 1
    except Exception:
        log.exception("Failed %s %s", symbol, config.config_key)
        tally.failed += 1
    return None


def log_trained(result: LongTradeResult) -> None:
    config = result.config
    log.info(
        "Trained long-trade model symbol=%s config=%s data_as_of=%s train=%s..%s "
        "train_rows=%d test_rows=%d positive_rate=%.3f prob_long=%.4f "
        "is_long_signal=%s test_profit_precision=%.3f duration=%.2fs",
        result.symbol, config.config_key, result.data_as_of, config.train_from, config.train_to,
        result.train_rows, result.test_rows, result.positive_rate, result.prob_long,
        str(result.is_long_signal).lower(), result.test_profit_precision,
        result.duration_seconds,
    )  # fmt: skip


def finish(repository: LongTradeRepository, run_id, tally: Tally, *, status: str) -> None:
    try:
        repository.finish_run(
            run_id, status=status, data_as_of=tally.data_as_of, counts=tally.counts()
        )
    except SQLAlchemyError as exc:
        log.error("Could not record the run's outcome: %s", _first_line(exc))


def configure_logging(level: str) -> None:
    # stdout, one line per event: Docker and journald collect it as-is.
    logging.basicConfig(stream=sys.stdout, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("app.long_trade").setLevel(level)
    # httpx logs every request at INFO; hundreds of them would bury the
    # per-model lines.
    logging.getLogger("httpx").setLevel(logging.WARNING)


def peak_rss_mb() -> float:
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    # Kilobytes on Linux, bytes on macOS.
    return peak / (1024 * 1024) if sys.platform == "darwin" else peak / 1024


def _first_line(exc: BaseException) -> str:
    # SQLAlchemy appends the full statement and its parameters to messages.
    message = str(exc).strip()
    return message.splitlines()[0] if message else type(exc).__name__


if __name__ == "__main__":
    sys.exit(main())
