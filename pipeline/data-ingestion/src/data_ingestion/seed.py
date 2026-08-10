"""Seed market_data from a cse-dataset bundle, in FK order, idempotently.

Bundle resolution order (first match wins):

1. ``--seed-dir`` / ``CSE_SEED_DATA_DIR`` — local directory of canonical artifacts.
2. ``CSE_DATA_SOURCE_URL`` — http(s) URL to a .zip of the same artifacts.
3. The bundled sample fixture (``fixtures/sample``) so a fresh ``docker compose up``
   always yields queryable market data.

Expected bundle contents (canonical cse-dataset formats):

- ``company_metadata.csv``          (required) -> market_data.securities
- ``daily_ohlcv.csv`` / ``.parquet``(required) -> market_data.trading_calendar + daily_prices
- ``indices.csv``                   (optional) -> market_data.indices + index_values
- ``sectors.csv``                   (optional) -> market_data.sectors (GICS reference)

Usage: ``python -m data_ingestion.seed`` (see README for the full 2017-2025 load).
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import tempfile
import zipfile
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date
from pathlib import Path

import httpx
import psycopg

from data_ingestion.seed_data import (
    SEED_RUN_ID,
    IndexValueRow,
    PriceRow,
    SecurityRow,
    in_window,
    index_value_id,
    iter_raw_rows,
    ohlc_violations,
    parse_date,
    quarantine_id,
    read_sectors,
    read_securities,
    sector_id,
    security_id,
    to_index_value_row,
    to_price_row,
)

log = logging.getLogger("data_ingestion.seed")

DEFAULT_WINDOW_START = date(2017, 1, 1)
DEFAULT_WINDOW_END = date(2025, 12, 31)
BUNDLED_SAMPLE_DIR = Path(__file__).resolve().parent / "fixtures" / "sample"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed market_data from a cse-dataset bundle.")
    parser.add_argument("--seed-dir", default=os.environ.get("CSE_SEED_DATA_DIR") or None)
    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATA_INGESTION_MARKET_DATA_DATABASE_URL"),
        help="Defaults to env DATA_INGESTION_MARKET_DATA_DATABASE_URL.",
    )
    parser.add_argument("--from", dest="date_from", default=os.environ.get("SEED_DATE_FROM"))
    parser.add_argument("--to", dest="date_to", default=os.environ.get("SEED_DATE_TO"))
    return parser.parse_args(argv)


@contextmanager
def resolve_bundle(seed_dir: str | None) -> Iterator[Path]:
    """Yield the bundle directory, downloading/extracting the source zip if needed."""
    if seed_dir:
        path = Path(seed_dir)
        if not path.is_dir():
            raise SystemExit(f"seed dir not found: {path}")
        yield path
        return

    source_url = os.environ.get("CSE_DATA_SOURCE_URL") or ""
    if source_url:
        tmp = Path(tempfile.mkdtemp(prefix="cse-seed-"))
        try:
            archive = tmp / "bundle.zip"
            log.info("downloading seed bundle from %s", source_url)
            with httpx.stream("GET", source_url, follow_redirects=True, timeout=300) as resp:
                resp.raise_for_status()
                with archive.open("wb") as fh:
                    for chunk in resp.iter_bytes():
                        fh.write(chunk)
            with zipfile.ZipFile(archive) as zf:
                zf.extractall(tmp / "extracted")
            yield tmp / "extracted"
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        return

    log.info("no seed dir/URL configured; using bundled sample fixture")
    yield BUNDLED_SAMPLE_DIR


def find_bundle_file(bundle: Path, stem: str) -> Path | None:
    for suffix in (".csv", ".parquet"):
        candidate = bundle / f"{stem}{suffix}"
        if candidate.exists():
            return candidate
    return None


def load_seed(database_url: str, bundle: Path, start: date, end: date) -> dict[str, int]:
    metadata_file = find_bundle_file(bundle, "company_metadata")
    prices_file = find_bundle_file(bundle, "daily_ohlcv")
    indices_file = find_bundle_file(bundle, "indices")
    sectors_file = find_bundle_file(bundle, "sectors")
    if metadata_file is None or prices_file is None:
        raise SystemExit(
            f"bundle at {bundle} must contain company_metadata.csv and daily_ohlcv.csv/.parquet"
        )

    sectors = read_sectors(sectors_file) if sectors_file else []
    if not sectors:
        log.warning("no sectors.csv in bundle; securities will be loaded with sector_id NULL")
    sector_ids = {s.sector_name: sector_id(s.gics_code) for s in sectors}
    securities = {s.symbol: s for s in read_securities(metadata_file)}

    # Parse + validate price rows, restricted to the seed window.
    accepted: list[PriceRow] = []
    quarantined: list[tuple[PriceRow | None, dict, list[str]]] = []
    processed = 0
    for raw in iter_raw_rows(prices_file):
        processed += 1
        row = to_price_row(raw)
        if row is None:
            quarantined.append((None, dict(raw), ["unparseable_row"]))
            continue
        if not in_window(row.trade_date, start, end):
            continue
        violations = ohlc_violations(row)
        if violations:
            quarantined.append((row, dict(raw), violations))
            continue
        accepted.append(row)

    index_values: list[IndexValueRow] = []
    if indices_file:
        for raw in iter_raw_rows(indices_file):
            row = to_index_value_row(raw)
            if row is not None and in_window(row.trade_date, start, end):
                index_values.append(row)

    # Securities referenced by prices but missing from metadata get a stub row so
    # the daily_prices FK holds; they can be enriched by a later metadata re-run.
    for symbol in {r.symbol for r in accepted}:
        if symbol not in securities:
            log.warning("no company metadata for %s; inserting stub security row", symbol)
            securities[symbol] = SecurityRow(symbol, symbol.split(".")[0], None, None, None)

    price_ranges: dict[str, tuple[date, date]] = {}
    for row in accepted:
        lo, hi = price_ranges.get(row.symbol, (row.trade_date, row.trade_date))
        price_ranges[row.symbol] = (min(lo, row.trade_date), max(hi, row.trade_date))

    calendar_days = sorted({r.trade_date for r in accepted} | {r.trade_date for r in index_values})

    stats = {
        "sectors": len(sectors),
        "securities": len(securities),
        "calendar_days": len(calendar_days),
        "prices_processed": processed,
        "prices_accepted": len(accepted),
        "prices_quarantined": len(quarantined),
        "index_values": len(index_values),
    }

    with psycopg.connect(database_url) as conn, conn.transaction():
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO market_data.sectors (sector_id, gics_code, sector_name)
                VALUES (%s, %s, %s)
                ON CONFLICT (gics_code) DO UPDATE SET sector_name = EXCLUDED.sector_name
                """,
                [(sector_id(s.gics_code), s.gics_code, s.sector_name) for s in sectors],
            )

            cur.executemany(
                """
                INSERT INTO market_data.securities (
                    security_id, symbol, company_name, sector_id,
                    shares_outstanding, data_from, data_to
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (symbol) DO UPDATE SET
                    company_name = EXCLUDED.company_name,
                    sector_id = EXCLUDED.sector_id,
                    shares_outstanding = EXCLUDED.shares_outstanding,
                    data_from = EXCLUDED.data_from,
                    data_to = EXCLUDED.data_to
                """,
                [
                    (
                        security_id(s.symbol),
                        s.symbol,
                        s.company_name,
                        sector_ids.get(s.sector_name or ""),
                        s.shares_outstanding,
                        (price_ranges.get(s.symbol, (s.listed_date, None))[0]),
                        (price_ranges.get(s.symbol, (None, None))[1]),
                    )
                    for s in securities.values()
                ],
            )

            cur.executemany(
                """
                INSERT INTO market_data.trading_calendar (trade_date, is_trading_day)
                VALUES (%s, true)
                ON CONFLICT (trade_date) DO NOTHING
                """,
                [(day,) for day in calendar_days],
            )

            cur.execute(
                """
                INSERT INTO market_data.ingestion_runs (
                    run_id, completed_at, trigger_type, triggered_by_name,
                    records_processed, records_accepted, records_quarantined, status
                )
                VALUES (%s, now(), 'backfill', 'data-ingestion seed', %s, %s, %s, %s)
                ON CONFLICT (run_id) DO UPDATE SET
                    completed_at = EXCLUDED.completed_at,
                    records_processed = EXCLUDED.records_processed,
                    records_accepted = EXCLUDED.records_accepted,
                    records_quarantined = EXCLUDED.records_quarantined,
                    status = EXCLUDED.status
                """,
                (
                    SEED_RUN_ID,
                    processed,
                    len(accepted),
                    len(quarantined),
                    "partial" if quarantined else "succeeded",
                ),
            )

            cur.execute(
                """
                CREATE TEMP TABLE seed_prices (
                    security_id uuid, trade_date date,
                    open numeric, high numeric, low numeric, close numeric,
                    volume bigint
                ) ON COMMIT DROP
                """
            )
            with cur.copy(
                "COPY seed_prices (security_id, trade_date, open, high, low, close, volume) "
                "FROM STDIN"
            ) as copy:
                for row in accepted:
                    copy.write_row(
                        (
                            security_id(row.symbol),
                            row.trade_date,
                            row.open,
                            row.high,
                            row.low,
                            row.close,
                            row.volume,
                        )
                    )
            cur.execute(
                """
                INSERT INTO market_data.daily_prices (
                    security_id, trade_date, open, high, low, close, volume, ingestion_run_id
                )
                SELECT security_id, trade_date, open, high, low, close, volume, %s
                FROM seed_prices
                ON CONFLICT (security_id, trade_date) DO UPDATE SET
                    open = EXCLUDED.open,
                    high = EXCLUDED.high,
                    low = EXCLUDED.low,
                    close = EXCLUDED.close,
                    volume = EXCLUDED.volume,
                    ingestion_run_id = EXCLUDED.ingestion_run_id
                """,
                (SEED_RUN_ID,),
            )

            indices = sorted({(r.index_code, r.index_name) for r in index_values})
            cur.executemany(
                """
                INSERT INTO market_data.indices (index_code, index_name)
                VALUES (%s, %s)
                ON CONFLICT (index_code) DO UPDATE SET index_name = EXCLUDED.index_name
                """,
                indices,
            )
            cur.execute(
                """
                CREATE TEMP TABLE seed_index_values (
                    index_value_id uuid, index_code varchar, trade_date date, index_value numeric
                ) ON COMMIT DROP
                """
            )
            with cur.copy(
                "COPY seed_index_values (index_value_id, index_code, trade_date, index_value) "
                "FROM STDIN"
            ) as copy:
                for row in index_values:
                    copy.write_row(
                        (
                            index_value_id(row.index_code, row.trade_date),
                            row.index_code,
                            row.trade_date,
                            row.value,
                        )
                    )
            cur.execute(
                """
                INSERT INTO market_data.index_values (
                    index_value_id, index_code, trade_date, index_value
                )
                SELECT index_value_id, index_code, trade_date, index_value FROM seed_index_values
                ON CONFLICT (index_code, trade_date) DO UPDATE SET
                    index_value = EXCLUDED.index_value
                """
            )

            cur.executemany(
                """
                INSERT INTO market_data.quarantined_records (
                    record_id, run_id, raw_payload, failed_checks
                )
                VALUES (%s, %s, %s::jsonb, %s)
                ON CONFLICT (record_id) DO NOTHING
                """,
                [
                    (
                        quarantine_id(
                            (row.symbol if row else str(raw.get("symbol") or "?")),
                            (row.trade_date if row else parse_date(raw.get("date"))),
                            ",".join(checks),
                        ),
                        SEED_RUN_ID,
                        json.dumps(raw, default=str),
                        checks,
                    )
                    for row, raw, checks in quarantined
                ],
            )

    return stats


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = parse_args(argv)
    if not args.database_url:
        raise SystemExit(
            "database URL required (--database-url or DATA_INGESTION_MARKET_DATA_DATABASE_URL)"
        )
    start = parse_date(args.date_from) or DEFAULT_WINDOW_START
    end = parse_date(args.date_to) or DEFAULT_WINDOW_END

    with resolve_bundle(args.seed_dir) as bundle:
        log.info("seeding market_data from %s (window %s..%s)", bundle, start, end)
        stats = load_seed(args.database_url, bundle, start, end)

    log.info(
        "seed complete: %s sectors, %s securities, %s calendar days, "
        "%s/%s price rows accepted (%s quarantined), %s index values",
        stats["sectors"],
        stats["securities"],
        stats["calendar_days"],
        stats["prices_accepted"],
        stats["prices_processed"],
        stats["prices_quarantined"],
        stats["index_values"],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
