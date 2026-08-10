"""Pure parsing and validation helpers for the cse-dataset seed bundle.

No database or network access here — everything is unit-testable in isolation.
The seed bundle mirrors the canonical artifacts produced by the cse-dataset
repo (https://github.com/TradeIQ-CSE/cse-dataset):

- ``company_metadata.csv``  — canonical company metadata (symbol, company_name, sector, ...)
- ``daily_ohlcv.csv`` / ``.parquet`` — canonical accepted OHLCV rows (ohlcv.schema.json)
- ``indices.csv``           — canonical indices family rows (date, index_name, close)
- ``sectors.csv``           — optional GICS reference (gics_code, sector_name)
"""

from __future__ import annotations

import csv
import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

# uuid5 namespace for every deterministic seed identifier. Never change this
# once real data has been seeded, or re-runs will stop being idempotent.
SEED_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "https://github.com/TradeIQ-CSE/tradeiq_cse/seed")

#: Deterministic ingestion_runs row used by the seed (trigger_type='backfill').
SEED_RUN_ID = uuid.uuid5(SEED_NAMESPACE, "ingestion-run:cse-dataset-2017-2025")

#: Index name normalisation -> (index_code, display name). cse-dataset emits
#: free-form index_name values; schema v2 keys on a stable index_code.
INDEX_ALIASES: dict[str, tuple[str, str]] = {
    "ASPI": ("ASPI", "All Share Price Index"),
    "SL20": ("SL20", "S&P Sri Lanka 20"),
}


@dataclass(frozen=True)
class SectorRow:
    gics_code: str
    sector_name: str


@dataclass(frozen=True)
class SecurityRow:
    symbol: str
    company_name: str
    sector_name: str | None
    shares_outstanding: int | None
    listed_date: date | None


@dataclass(frozen=True)
class PriceRow:
    symbol: str
    trade_date: date
    open: Decimal | None
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int


@dataclass(frozen=True)
class IndexValueRow:
    index_code: str
    index_name: str
    trade_date: date
    value: Decimal


def security_id(symbol: str) -> uuid.UUID:
    return uuid.uuid5(SEED_NAMESPACE, f"security:{symbol}")


def sector_id(gics_code: str) -> uuid.UUID:
    return uuid.uuid5(SEED_NAMESPACE, f"sector:{gics_code}")


def index_value_id(index_code: str, trade_date: date) -> uuid.UUID:
    return uuid.uuid5(SEED_NAMESPACE, f"index-value:{index_code}:{trade_date.isoformat()}")


def quarantine_id(symbol: str, trade_date: date | None, check: str) -> uuid.UUID:
    day = trade_date.isoformat() if trade_date else "unknown-date"
    return uuid.uuid5(SEED_NAMESPACE, f"quarantine:{symbol}:{day}:{check}")


def parse_date(value: object) -> date | None:
    """Parse an ISO date (the canonical cse-dataset format). None/'' -> None."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return datetime.strptime(text[:10], "%Y-%m-%d").date()


def parse_decimal(value: object) -> Decimal | None:
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if not text or text.lower() in {"nan", "none", "null", "-"}:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def parse_int(value: object) -> int | None:
    dec = parse_decimal(value)
    return int(dec) if dec is not None else None


def normalise_index_name(raw_name: str) -> tuple[str, str]:
    """Map a free-form cse-dataset index name to a stable (code, name) pair."""
    upper = raw_name.strip().upper()
    for alias, (code, display) in INDEX_ALIASES.items():
        if alias in upper:
            return code, display
    code = upper.replace(" ", "_")[:20]
    return code, raw_name.strip()


def in_window(day: date, start: date, end: date) -> bool:
    return start <= day <= end


def ohlc_violations(row: PriceRow) -> list[str]:
    """Checks mirroring market_data.daily_prices constraints (high/low/close/open)."""
    violations: list[str] = []
    if row.high < row.low:
        violations.append("high_below_low")
    if row.high < row.close:
        violations.append("high_below_close")
    if row.low > row.close:
        violations.append("low_above_close")
    if row.open is not None and (row.open > row.high or row.open < row.low):
        violations.append("open_outside_high_low")
    if row.volume < 0:
        violations.append("negative_volume")
    return violations


def read_sectors(path: Path) -> list[SectorRow]:
    rows: list[SectorRow] = []
    with path.open(newline="", encoding="utf-8") as fh:
        for raw in csv.DictReader(fh):
            code = (raw.get("gics_code") or "").strip()
            name = (raw.get("sector_name") or "").strip()
            if code and name:
                rows.append(SectorRow(gics_code=code, sector_name=name))
    return rows


def read_securities(path: Path) -> list[SecurityRow]:
    """Read canonical company_metadata.csv rows."""
    rows: list[SecurityRow] = []
    with path.open(newline="", encoding="utf-8") as fh:
        for raw in csv.DictReader(fh):
            symbol = (raw.get("symbol") or "").strip()
            name = (raw.get("company_name") or "").strip()
            if not symbol or not name:
                continue
            sector = (raw.get("sector") or "").strip()
            rows.append(
                SecurityRow(
                    symbol=symbol,
                    company_name=name,
                    sector_name=sector or None,
                    shares_outstanding=parse_int(raw.get("shares_outstanding")),
                    listed_date=parse_date(raw.get("listing_date")),
                )
            )
    return rows


def iter_raw_rows(path: Path) -> Iterator[dict]:
    """Yield canonical rows from a .csv or .parquet seed file."""
    if path.suffix == ".parquet":
        import pyarrow.parquet as pq  # imported lazily: only needed for parquet bundles

        table = pq.read_table(path)
        yield from table.to_pylist()
        return
    with path.open(newline="", encoding="utf-8") as fh:
        yield from csv.DictReader(fh)


def to_price_row(raw: dict) -> PriceRow | None:
    """Convert a canonical OHLCV row; None when symbol/date are unusable.

    Canonical schema (cse-dataset data/schemas/ohlcv.schema.json):
    date, symbol, open, high, low, close, volume, turnover, trades, source, ...
    turnover/trades have no schema-v2 column and are intentionally dropped.
    """
    symbol = str(raw.get("symbol") or "").strip()
    trade_date = parse_date(raw.get("date"))
    if not symbol or trade_date is None:
        return None
    high = parse_decimal(raw.get("high"))
    low = parse_decimal(raw.get("low"))
    close = parse_decimal(raw.get("close"))
    if high is None or low is None or close is None:
        return None
    return PriceRow(
        symbol=symbol,
        trade_date=trade_date,
        open=parse_decimal(raw.get("open")),
        high=high,
        low=low,
        close=close,
        volume=parse_int(raw.get("volume")) or 0,
    )


def to_index_value_row(raw: dict) -> IndexValueRow | None:
    """Convert a canonical indices row (date, index_name, close)."""
    name = str(raw.get("index_name") or "").strip()
    trade_date = parse_date(raw.get("date"))
    value = parse_decimal(raw.get("close"))
    if not name or trade_date is None or value is None:
        return None
    code, display = normalise_index_name(name)
    return IndexValueRow(index_code=code, index_name=display, trade_date=trade_date, value=value)
