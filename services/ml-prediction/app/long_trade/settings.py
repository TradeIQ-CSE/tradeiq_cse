"""The job's configuration, read from ML_* environment variables once at start-up."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from urllib.parse import urlsplit, urlunsplit

import httpx

from .configs import DEFAULT_GRID, GridError, GridPoint, parse_grid

DEFAULT_MIN_HISTORY_BARS = 400
DEFAULT_HTTP_TIMEOUT_SECONDS = 30.0
LOG_LEVELS = ("DEBUG", "INFO", "WARNING", "ERROR")


class SettingsError(ValueError):
    """A required variable is missing or a value is malformed."""


@dataclass(frozen=True)
class Settings:
    database_url: str
    market_trading_api_url: str
    # Explicit stock list; None means every security with enough history.
    symbols: tuple[str, ...] | None
    min_history_bars: int
    # Rolling training window in calendar days; None means all history.
    train_lookback_days: int | None
    grid: tuple[GridPoint, ...]
    n_jobs: int
    http_timeout_seconds: float
    log_level: str

    def public_summary(self) -> dict:
        """What ml.long_trade_runs.settings records: the effective run
        configuration, with nothing that could carry a credential."""
        return {
            "market_trading_api_url": _without_userinfo(self.market_trading_api_url),
            "symbols": list(self.symbols) if self.symbols is not None else None,
            "min_history_bars": self.min_history_bars,
            "train_lookback_days": self.train_lookback_days,
            "grid": [point.config_key for point in self.grid],
            "n_jobs": self.n_jobs,
            "http_timeout_seconds": self.http_timeout_seconds,
        }


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    env = os.environ if env is None else env
    try:
        grid_raw = _optional(env, "ML_LONG_TRADE_GRID")
        grid = parse_grid(grid_raw) if grid_raw is not None else DEFAULT_GRID
    except GridError as exc:
        raise SettingsError(str(exc)) from exc

    symbols_raw = _optional(env, "ML_LONG_TRADE_SYMBOLS")
    symbols = None
    if symbols_raw is not None:
        # Symbols are matched case-insensitively by market-trading but always
        # returned uppercase; normalising here keeps the stored rows canonical.
        names = (s.strip().upper() for s in symbols_raw.split(","))
        symbols = tuple(dict.fromkeys(name for name in names if name))
        if not symbols:
            raise SettingsError("ML_LONG_TRADE_SYMBOLS is set but names no symbol")

    log_level = (_optional(env, "ML_LONG_TRADE_LOG_LEVEL") or "INFO").upper()
    if log_level not in LOG_LEVELS:
        raise SettingsError(f"ML_LONG_TRADE_LOG_LEVEL must be one of {', '.join(LOG_LEVELS)}")

    lookback = _optional_int(env, "ML_LONG_TRADE_TRAIN_LOOKBACK_DAYS", minimum=1)
    timeout_raw = _optional(env, "ML_LONG_TRADE_HTTP_TIMEOUT_SECONDS")
    try:
        timeout = float(timeout_raw) if timeout_raw is not None else DEFAULT_HTTP_TIMEOUT_SECONDS
    except ValueError as exc:
        raise SettingsError("ML_LONG_TRADE_HTTP_TIMEOUT_SECONDS must be a number") from exc
    if timeout <= 0:
        raise SettingsError("ML_LONG_TRADE_HTTP_TIMEOUT_SECONDS must be positive")

    return Settings(
        database_url=_required(env, "ML_DATABASE_URL"),
        market_trading_api_url=_market_trading_api_url(env),
        symbols=symbols,
        min_history_bars=(
            _optional_int(env, "ML_LONG_TRADE_MIN_HISTORY_BARS", minimum=1)
            or DEFAULT_MIN_HISTORY_BARS
        ),
        train_lookback_days=lookback,
        grid=grid,
        n_jobs=_optional_int(env, "ML_LONG_TRADE_N_JOBS", minimum=1) or 1,
        http_timeout_seconds=timeout,
        log_level=log_level,
    )


def _market_trading_api_url(env: Mapping[str, str]) -> str:
    """Reject invalid API addresses before opening a database run or HTTP client."""
    value = _required(env, "ML_MARKET_TRADING_API_URL").rstrip("/")
    try:
        # Use the same parser as public_summary to reject malformed IPv6 and ports.
        parts = urlsplit(value)
        port = parts.port
        url = httpx.URL(value)
        valid = url.scheme in ("http", "https") and bool(url.host)
        valid = valid and (port is None or 1 <= port <= 65535)
    except (ValueError, httpx.InvalidURL) as exc:
        raise SettingsError("ML_MARKET_TRADING_API_URL must be a valid HTTP(S) URL") from exc
    if not valid:
        raise SettingsError("ML_MARKET_TRADING_API_URL must be a valid HTTP(S) URL")
    return value


def _optional(env: Mapping[str, str], name: str) -> str | None:
    # Compose passes an unset optional variable through as "", so empty and
    # absent have to mean the same thing.
    value = env.get(name, "").strip()
    return value or None


def _required(env: Mapping[str, str], name: str) -> str:
    value = _optional(env, name)
    if value is None:
        raise SettingsError(f"{name} is required")
    return value


def _optional_int(env: Mapping[str, str], name: str, *, minimum: int) -> int | None:
    raw = _optional(env, name)
    if raw is None:
        return None
    try:
        value = int(raw)
    except ValueError as exc:
        raise SettingsError(f"{name} must be an integer") from exc
    if value < minimum:
        raise SettingsError(f"{name} must be at least {minimum}")
    return value


def _without_userinfo(url: str) -> str:
    parts = urlsplit(url)
    host = parts.hostname or ""
    netloc = f"{host}:{parts.port}" if parts.port else host
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))
