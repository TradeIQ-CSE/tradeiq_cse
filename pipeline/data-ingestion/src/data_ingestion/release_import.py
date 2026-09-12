"""Import a cse-dataset release into market_data.

The release format is cse-dataset's artifact contract v1
(``docs/contracts/dataset-artifact-v1.md`` in that repository). The whole
artifact is checked before the database is opened, so a release that fails a
check changes nothing.

Inside the release's coverage the database ends up matching the release: rows
it doesn't carry are removed, and weekdays with no session are recorded as
closed. Nothing after ``coverage.end`` is touched, so sessions delivered later
through the EOD ingestion API survive a re-import.

Usage: ``python -m data_ingestion.release_import [--artifact ZIP|DIR|URL]``.
With no artifact configured, the bundled sample is loaded.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import logging
import os
import tempfile
import uuid
from collections.abc import Iterable, Iterator
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

import httpx
import psycopg

from data_ingestion.artifact import ArtifactError, load_manifest, read_artifact, validate_files

log = logging.getLogger("data_ingestion.release_import")

SAMPLE_ARTIFACT = Path(__file__).resolve().parent / "fixtures" / "sample"

# The namespace the old seed used, so the securities and index values it
# created keep their IDs. Never change it.
NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "https://github.com/TradeIQ-CSE/tradeiq_cse/seed")

# The EOD ingestion API takes this lock for each delivery. Holding it too stops
# an import and a delivery from interleaving.
EOD_LOCK = "market_data.eod_ingestion"


class ImportRefused(Exception):
    """The release is valid but can't be loaded onto this database."""


@dataclass(frozen=True)
class Release:
    """A checked artifact. Rows are read on demand: the full release has 508k prices."""

    manifest: dict
    files: dict[str, bytes]

    @property
    def version(self) -> str:
        return self.manifest["dataset_version"]

    @property
    def start(self) -> date:
        return date.fromisoformat(self.manifest["coverage"]["start"])

    @property
    def end(self) -> date:
        return date.fromisoformat(self.manifest["coverage"]["end"])

    def rows(self, name: str) -> Iterator[dict[str, str]]:
        data = self.files.get(name)
        if data is not None:
            yield from csv.DictReader(io.StringIO(data.decode("utf-8"), newline=""))


@dataclass
class Counts:
    inserted: int = 0
    updated: int = 0
    unchanged: int = 0
    removed: int = 0


def open_release(path: Path) -> Release:
    """Read and check the whole artifact. Raises ArtifactError at the first failed check."""
    files = read_artifact(path)
    validate_files(files)
    return Release(manifest=load_manifest(files), files=files)


@contextmanager
def fetched(source: str) -> Iterator[tuple[Path, str]]:
    """Yield a local path for the artifact, and the URL to record for it."""
    if source.startswith("https://"):
        with tempfile.TemporaryDirectory(prefix="cse-release-") as tmp:
            archive = Path(tmp) / "artifact.zip"
            log.info("downloading %s", source)
            with httpx.stream("GET", source, follow_redirects=True, timeout=300) as response:
                response.raise_for_status()
                with archive.open("wb") as fh:
                    for chunk in response.iter_bytes():
                        fh.write(chunk)
            yield archive, source
        return
    if "://" in source:
        raise SystemExit(f"artifact must be a local path or an https:// URL, not {source}")
    path = Path(source).expanduser().resolve()
    yield path, path.as_uri()


def ohlc_violations(row: dict[str, str]) -> list[str]:
    """The daily_prices_ohlc_chk rules. The contract checks formats, not these."""
    high, low, close = (Decimal(row[key]) for key in ("high", "low", "close"))
    opening = Decimal(row["open"]) if row["open"] else None
    violations = []
    if high < low:
        violations.append("high_below_low")
    if high < close:
        violations.append("high_below_close")
    if low > close:
        violations.append("low_above_close")
    if opening is not None and not low <= opening <= high:
        violations.append("open_outside_high_low")
    return violations


def closed_weekdays(start: date, end: date, sessions: set[date]) -> list[date]:
    """Weekdays in the window with no session. Weekends are left to the weekday rule."""
    days = (start + timedelta(days=offset) for offset in range((end - start).days + 1))
    return [day for day in days if day.weekday() < 5 and day not in sessions]


def stage(cur: psycopg.Cursor, table: str, columns: str, rows: Iterable[tuple]) -> int:
    """COPY rows into a temp table dropped at commit. Column types must not contain commas."""
    cur.execute(f"CREATE TEMP TABLE {table} ({columns}) ON COMMIT DROP")
    names = ", ".join(column.split()[0] for column in columns.split(","))
    staged = 0
    with cur.copy(f"COPY {table} ({names}) FROM STDIN") as copy:
        for row in rows:
            copy.write_row(row)
            staged += 1
    # Autovacuum never analyzes temp tables; without this the planner guesses.
    cur.execute(f"ANALYZE {table}")
    return staged


def upsert(cur: psycopg.Cursor, insert: str, params: dict, staged: int) -> Counts:
    """Run an INSERT .. ON CONFLICT DO UPDATE .. WHERE changed, and count what it did."""
    cur.execute(
        f"""
        WITH up AS ({insert} RETURNING (xmax = 0) AS inserted)
        SELECT count(*) FILTER (WHERE inserted), count(*) FILTER (WHERE NOT inserted) FROM up
        """,
        params,
    )
    inserted, updated = cur.fetchone()
    return Counts(inserted, updated, staged - inserted - updated)


def require_base(cur: psycopg.Cursor, release: Release) -> None:
    kind = release.manifest["kind"]
    if kind == "full":
        return
    base = release.manifest["base_version"]
    cur.execute(
        """
        SELECT 1 FROM market_data.ingestion_runs
        WHERE dataset_version = %s AND status IN ('succeeded', 'partial')
        """,
        (base,),
    )
    if cur.fetchone() is None:
        raise ImportRefused(f"{kind} {release.version} builds on {base}, which isn't imported")


def require_coverage(cur: psycopg.Cursor, release: Release) -> None:
    """Refuse a release that would cut into a larger one already imported.

    Inside its coverage a release replaces everything, so a smaller release that
    overlaps a larger one, such as the bundled sample over the 2017-2025 history,
    would delete most of the larger one's rows in that window.
    """
    cur.execute(
        """
        SELECT dataset_version, coverage_start, coverage_end FROM market_data.ingestion_runs
        WHERE dataset_version <> %(version)s AND status IN ('succeeded', 'partial')
          AND coverage_start <= %(end)s AND coverage_end >= %(start)s
          AND NOT (coverage_start >= %(start)s AND coverage_end <= %(end)s)
        LIMIT 1
        """,
        {"version": release.version, "start": release.start, "end": release.end},
    )
    row = cur.fetchone()
    if row:
        other, start, end = row
        raise ImportRefused(
            f"{release.version} covers {release.start}..{release.end}, only part of"
            f" {other} ({start}..{end}), which is already imported"
        )


def start_run(cur: psycopg.Cursor, run_id: uuid.UUID, release: Release, source_url: str) -> None:
    manifest = release.manifest
    cur.execute(
        """
        INSERT INTO market_data.ingestion_runs (
            run_id, trigger_type, triggered_by_name, status, records_processed,
            contract_version, producer_commit, dataset_version, dataset_kind,
            coverage_start, coverage_end, source_url
        )
        VALUES (%s, 'backfill', 'data-ingestion release import', 'running', %s,
                %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (run_id) DO UPDATE SET
            started_at = now(),
            completed_at = NULL,
            status = 'running',
            records_processed = EXCLUDED.records_processed,
            records_accepted = 0,
            records_quarantined = 0,
            contract_version = EXCLUDED.contract_version,
            producer_commit = EXCLUDED.producer_commit,
            source_url = EXCLUDED.source_url,
            validation_summary = NULL,
            error_details = NULL
        """,
        (
            run_id,
            sum(1 for _ in release.rows("daily_ohlcv.csv")),
            manifest["contract_version"],
            manifest["source_commit"],
            release.version,
            manifest["kind"],
            release.start,
            release.end,
            source_url,
        ),
    )


def load_sectors(cur: psycopg.Cursor, release: Release) -> Counts:
    rows = [
        (uuid.uuid5(NAMESPACE, f"sector:{row['gics_code']}"), row["gics_code"], row["sector_name"])
        for row in release.rows("sectors.csv")
    ]
    staged = stage(cur, "stage_sectors", "sector_id uuid, gics_code text, sector_name text", rows)
    return upsert(
        cur,
        """
        INSERT INTO market_data.sectors AS t (sector_id, gics_code, sector_name)
        SELECT sector_id, gics_code, sector_name FROM stage_sectors
        ON CONFLICT (gics_code) DO UPDATE SET sector_name = EXCLUDED.sector_name
        WHERE t.sector_name IS DISTINCT FROM EXCLUDED.sector_name
        """,
        {},
        staged,
    )


def load_securities(cur: psycopg.Cursor, release: Release) -> tuple[Counts, dict[str, uuid.UUID]]:
    """Upsert securities and return every symbol's ID.

    An existing security keeps its ID: the EOD API creates securities with random
    ones. A security with prices after the release's coverage has newer metadata
    from the EOD API, so its non-empty values win. An empty release value never
    erases a known one.
    """
    rows = [
        (
            uuid.uuid5(NAMESPACE, f"security:{row['symbol']}"),
            row["symbol"],
            row["company_name"],
            row["shares_outstanding"] or None,
            row["sector_code"] or None,
        )
        for row in release.rows("company_metadata.csv")
    ]
    staged = stage(
        cur,
        "stage_securities",
        "security_id uuid, symbol text, company_name text, shares_outstanding bigint,"
        " sector_code text",
        rows,
    )
    counts = upsert(
        cur,
        """
        INSERT INTO market_data.securities AS t (
            security_id, symbol, cse_code, company_name, sector_id, shares_outstanding
        )
        SELECT
            st.security_id,
            st.symbol,
            COALESCE(s.cse_code, st.symbol),
            CASE WHEN s.data_to > %(end)s AND s.company_name <> 'Unknown'
                 THEN s.company_name ELSE st.company_name END,
            CASE WHEN s.data_to > %(end)s THEN COALESCE(s.sector_id, sec.sector_id)
                 ELSE COALESCE(sec.sector_id, s.sector_id) END,
            CASE WHEN s.data_to > %(end)s THEN COALESCE(s.shares_outstanding, st.shares_outstanding)
                 ELSE COALESCE(st.shares_outstanding, s.shares_outstanding) END
        FROM stage_securities st
        LEFT JOIN market_data.securities s ON s.symbol = st.symbol
        LEFT JOIN market_data.sectors sec ON sec.gics_code = st.sector_code
        ON CONFLICT (symbol) DO UPDATE SET
            cse_code = EXCLUDED.cse_code,
            company_name = EXCLUDED.company_name,
            sector_id = EXCLUDED.sector_id,
            shares_outstanding = EXCLUDED.shares_outstanding
        WHERE (t.cse_code, t.company_name, t.sector_id, t.shares_outstanding)
              IS DISTINCT FROM
              (EXCLUDED.cse_code, EXCLUDED.company_name, EXCLUDED.sector_id,
               EXCLUDED.shares_outstanding)
        """,
        {"end": release.end},
        staged,
    )
    cur.execute(
        """
        SELECT s.symbol, s.security_id FROM market_data.securities s
        JOIN stage_securities st ON st.symbol = s.symbol
        """
    )
    return counts, dict(cur.fetchall())


def load_calendar(cur: psycopg.Cursor, release: Release) -> tuple[Counts, int]:
    """Sessions, quarantined ones included, are trading days; other weekdays are closed."""
    note = f"cse-dataset {release.version}"
    sessions = {
        date.fromisoformat(row["date"]): row["ohlcv_status"]
        for row in release.rows("trading_calendar.csv")
    }
    closed = closed_weekdays(release.start, release.end, set(sessions))
    rows = [
        (day, True, note if status == "accepted" else f"{note}: prices quarantined")
        for day, status in sessions.items()
    ] + [(day, False, f"{note}: no session") for day in closed]
    staged = stage(
        cur, "stage_calendar", "trade_date date, is_trading_day boolean, note text", rows
    )
    counts = upsert(
        cur,
        """
        INSERT INTO market_data.trading_calendar AS t (trade_date, is_trading_day, note)
        SELECT trade_date, is_trading_day, note FROM stage_calendar
        ON CONFLICT (trade_date) DO UPDATE SET
            is_trading_day = EXCLUDED.is_trading_day,
            note = EXCLUDED.note
        WHERE (t.is_trading_day, t.note) IS DISTINCT FROM (EXCLUDED.is_trading_day, EXCLUDED.note)
        """,
        {},
        staged,
    )
    return counts, len(closed)


def load_prices(
    cur: psycopg.Cursor,
    release: Release,
    run_id: uuid.UUID,
    security_ids: dict[str, uuid.UUID],
) -> tuple[Counts, Counts, int, list[uuid.UUID]]:
    """Prices and their provenance. Returns both counts, the quarantined row count and
    the securities whose prices changed."""
    quarantined: list[tuple[dict[str, str], list[str]]] = []

    def accepted() -> Iterator[tuple]:
        for row in release.rows("daily_ohlcv.csv"):
            violations = ohlc_violations(row)
            if violations:
                quarantined.append((row, violations))
                continue
            yield (
                security_ids[row["symbol"]],
                row["date"],
                row["open"] or None,
                row["high"],
                row["low"],
                row["close"],
                row["volume"],
                row["source"],
                row["raw_payload_hash"],
            )

    staged = stage(
        cur,
        "stage_prices",
        "security_id uuid, trade_date date, open numeric, high numeric, low numeric,"
        " close numeric, volume bigint, source text, raw_payload_hash text",
        accepted(),
    )
    cur.execute("CREATE UNIQUE INDEX ON stage_prices (security_id, trade_date)")
    window = {"start": release.start, "end": release.end, "run_id": run_id}

    cur.execute(
        """
        WITH up AS (
            INSERT INTO market_data.daily_prices AS t (
                security_id, trade_date, open, high, low, close, volume, ingestion_run_id
            )
            SELECT security_id, trade_date, open, high, low, close, volume, %(run_id)s
            FROM stage_prices
            ON CONFLICT (security_id, trade_date) DO UPDATE SET
                open = EXCLUDED.open,
                high = EXCLUDED.high,
                low = EXCLUDED.low,
                close = EXCLUDED.close,
                volume = EXCLUDED.volume,
                ingestion_run_id = EXCLUDED.ingestion_run_id
            WHERE (t.open, t.high, t.low, t.close, t.volume)
                  IS DISTINCT FROM
                  (EXCLUDED.open, EXCLUDED.high, EXCLUDED.low, EXCLUDED.close, EXCLUDED.volume)
            RETURNING t.security_id, (xmax = 0) AS inserted
        )
        SELECT count(*) FILTER (WHERE inserted), count(*) FILTER (WHERE NOT inserted),
               array_agg(DISTINCT security_id)
        FROM up
        """,
        window,
    )
    inserted, updated, changed = cur.fetchone()
    prices = Counts(inserted, updated, staged - inserted - updated)

    cur.execute(
        """
        WITH gone AS (
            DELETE FROM market_data.daily_prices d
            WHERE d.trade_date BETWEEN %(start)s AND %(end)s
              AND NOT EXISTS (
                  SELECT 1 FROM stage_prices s
                  WHERE s.security_id = d.security_id AND s.trade_date = d.trade_date
              )
            RETURNING d.security_id
        )
        SELECT count(*), array_agg(DISTINCT security_id) FROM gone
        """,
        window,
    )
    prices.removed, removed_from = cur.fetchone()

    provenance = upsert(
        cur,
        """
        INSERT INTO market_data.daily_price_provenance AS t (
            security_id, trade_date, ingestion_run_id, source_name, raw_payload_hash,
            validation_warnings, ohlc_repaired
        )
        SELECT s.security_id, s.trade_date, p.ingestion_run_id, s.source, s.raw_payload_hash,
               '[]'::jsonb, false
        FROM stage_prices s
        JOIN market_data.daily_prices p USING (security_id, trade_date)
        ON CONFLICT (security_id, trade_date) DO UPDATE SET
            ingestion_run_id = EXCLUDED.ingestion_run_id,
            source_name = EXCLUDED.source_name,
            raw_payload_hash = EXCLUDED.raw_payload_hash,
            validation_warnings = EXCLUDED.validation_warnings,
            ohlc_repaired = EXCLUDED.ohlc_repaired
        WHERE (t.ingestion_run_id, t.source_name, t.raw_payload_hash,
               t.validation_warnings, t.ohlc_repaired)
              IS DISTINCT FROM
              (EXCLUDED.ingestion_run_id, EXCLUDED.source_name, EXCLUDED.raw_payload_hash,
               EXCLUDED.validation_warnings, EXCLUDED.ohlc_repaired)
        """,
        {},
        staged,
    )

    cur.executemany(
        """
        INSERT INTO market_data.quarantined_records (record_id, run_id, raw_payload, failed_checks)
        VALUES (%s, %s, %s::jsonb, %s)
        ON CONFLICT (record_id) DO NOTHING
        """,
        [
            (
                uuid.uuid5(
                    NAMESPACE, f"quarantine:{release.version}:{row['symbol']}:{row['date']}"
                ),
                run_id,
                json.dumps(row),
                checks,
            )
            for row, checks in quarantined
        ],
    )
    touched = sorted(set(changed or []) | set(removed_from or []))
    return prices, provenance, len(quarantined), touched


def load_indices(cur: psycopg.Cursor, release: Release) -> tuple[Counts, Counts]:
    """Index codes are matched exactly: SL20TRI is a different series from SL20."""
    staged = stage(
        cur,
        "stage_indices",
        "index_code text, index_name text, base_date date",
        (
            (row["index_code"], row["index_name"], row["base_date"] or None)
            for row in release.rows("indices.csv")
        ),
    )
    indices = upsert(
        cur,
        """
        INSERT INTO market_data.indices AS t (index_code, index_name, base_date)
        SELECT index_code, index_name, base_date FROM stage_indices
        ON CONFLICT (index_code) DO UPDATE SET
            index_name = EXCLUDED.index_name,
            base_date = EXCLUDED.base_date
        WHERE (t.index_name, t.base_date) IS DISTINCT FROM (EXCLUDED.index_name, EXCLUDED.base_date)
        """,
        {},
        staged,
    )

    staged = stage(
        cur,
        "stage_index_values",
        "index_value_id uuid, index_code text, trade_date date, index_value numeric",
        (
            (
                uuid.uuid5(NAMESPACE, f"index-value:{row['index_code']}:{row['date']}"),
                row["index_code"],
                row["date"],
                row["close"],
            )
            for row in release.rows("index_values.csv")
        ),
    )
    values = upsert(
        cur,
        """
        INSERT INTO market_data.index_values AS t (
            index_value_id, index_code, trade_date, index_value
        )
        SELECT index_value_id, index_code, trade_date, index_value FROM stage_index_values
        ON CONFLICT (index_code, trade_date) DO UPDATE SET index_value = EXCLUDED.index_value
        WHERE t.index_value IS DISTINCT FROM EXCLUDED.index_value
        """,
        {},
        staged,
    )
    cur.execute(
        """
        DELETE FROM market_data.index_values v
        WHERE v.trade_date BETWEEN %(start)s AND %(end)s
          AND NOT EXISTS (
              SELECT 1 FROM stage_index_values s
              WHERE s.index_code = v.index_code AND s.trade_date = v.trade_date
          )
        """,
        {"start": release.start, "end": release.end},
    )
    values.removed = cur.rowcount
    return indices, values


def remove_other_calendar_days(cur: psycopg.Cursor, release: Release) -> int:
    """Calendar rows in the window the release doesn't account for: weekends marked
    open by older data. Runs after prices and index values, which reference them."""
    cur.execute(
        """
        DELETE FROM market_data.trading_calendar c
        WHERE c.trade_date BETWEEN %(start)s AND %(end)s
          AND NOT EXISTS (SELECT 1 FROM stage_calendar s WHERE s.trade_date = c.trade_date)
        """,
        {"start": release.start, "end": release.end},
    )
    return cur.rowcount


def refresh_securities(cur: psycopg.Cursor, security_ids: list[uuid.UUID]) -> None:
    """Recompute price coverage and weekly/monthly aggregates from all stored rows,
    for the securities whose prices changed. Rows after the release count too."""
    if not security_ids:
        return
    cur.execute(
        """
        UPDATE market_data.securities s
        SET data_from = r.first_day, data_to = r.last_day
        FROM (
            SELECT sec.security_id, min(p.trade_date) AS first_day, max(p.trade_date) AS last_day
            FROM market_data.securities sec
            LEFT JOIN market_data.daily_prices p ON p.security_id = sec.security_id
            WHERE sec.security_id = ANY(%(ids)s)
            GROUP BY sec.security_id
        ) r
        WHERE s.security_id = r.security_id
          AND (s.data_from, s.data_to) IS DISTINCT FROM (r.first_day, r.last_day)
        """,
        {"ids": security_ids},
    )
    for period_type, trunc in (("weekly", "week"), ("monthly", "month")):
        cur.execute(
            """
            DELETE FROM market_data.price_aggregates
            WHERE security_id = ANY(%s) AND period_type = %s
            """,
            (security_ids, period_type),
        )
        cur.execute(
            f"""
            INSERT INTO market_data.price_aggregates (
                aggregate_id, security_id, period_type, period_start, period_end,
                open, high, low, close, volume
            )
            SELECT
                md5(
                    p.security_id::text || ':' || %s || ':' ||
                    date_trunc('{trunc}', p.trade_date)::date::text
                )::uuid,
                p.security_id,
                %s,
                date_trunc('{trunc}', p.trade_date)::date,
                max(p.trade_date),
                (array_agg(p.open ORDER BY p.trade_date) FILTER (WHERE p.open IS NOT NULL))[1],
                max(p.high),
                min(p.low),
                (array_agg(p.close ORDER BY p.trade_date DESC))[1],
                sum(p.volume)
            FROM market_data.daily_prices p
            WHERE p.security_id = ANY(%s)
            GROUP BY p.security_id, date_trunc('{trunc}', p.trade_date)::date
            """,
            (period_type, period_type, security_ids),
        )


def load_release(conn: psycopg.Connection, release: Release, source_url: str) -> dict:
    """Load a checked release in one transaction and return its summary."""
    run_id = uuid.uuid5(NAMESPACE, f"import:{release.version}")
    tables: dict[str, Counts] = {}
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (EOD_LOCK,))
        require_base(cur, release)
        require_coverage(cur, release)
        start_run(cur, run_id, release, source_url)
        tables["sectors"] = load_sectors(cur, release)
        tables["securities"], security_ids = load_securities(cur, release)
        tables["trading_calendar"], closed_days = load_calendar(cur, release)
        prices, provenance, quarantined, touched = load_prices(cur, release, run_id, security_ids)
        tables["daily_prices"], tables["daily_price_provenance"] = prices, provenance
        tables["indices"], tables["index_values"] = load_indices(cur, release)
        tables["trading_calendar"].removed = remove_other_calendar_days(cur, release)
        refresh_securities(cur, touched)

        summary = {
            "dataset_version": release.version,
            "kind": release.manifest["kind"],
            "tables": {name: asdict(counts) for name, counts in tables.items()},
            "closed_days": closed_days,
            "quarantined_sessions": release.manifest["quarantine"]["dates"],
            "quarantined_rows": quarantined,
        }
        accepted = prices.inserted + prices.updated + prices.unchanged
        cur.execute(
            """
            UPDATE market_data.ingestion_runs
            SET completed_at = now(), status = %s, records_accepted = %s,
                records_quarantined = %s, validation_summary = %s::jsonb
            WHERE run_id = %s
            """,
            (
                "partial" if quarantined else "succeeded",
                accepted,
                quarantined,
                json.dumps(summary),
                run_id,
            ),
        )
    return summary


def record_failure(
    conn: psycopg.Connection, release: Release, source_url: str, error: Exception
) -> None:
    """Record a failed load as its own run, so it never overwrites a good import's row."""
    manifest = release.manifest
    with conn.transaction(), conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO market_data.ingestion_runs (
                run_id, completed_at, trigger_type, triggered_by_name, status,
                contract_version, producer_commit, dataset_version, dataset_kind,
                coverage_start, coverage_end, source_url, error_details
            )
            VALUES (%s, now(), 'backfill', 'data-ingestion release import', 'failed',
                    %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            """,
            (
                uuid.uuid4(),
                manifest["contract_version"],
                manifest["source_commit"],
                release.version,
                manifest["kind"],
                release.start,
                release.end,
                source_url,
                json.dumps({"error": f"{type(error).__name__}: {error}"}),
            ),
        )


def import_release(source: str, database_url: str) -> dict:
    """Check the artifact at ``source``, then load it. Raises ArtifactError before
    connecting when the artifact fails a check, and ImportRefused when it can't be
    loaded onto this database."""
    with fetched(source) as (path, source_url):
        release = open_release(path)
    with psycopg.connect(database_url, autocommit=True) as conn:
        try:
            return load_release(conn, release, source_url)
        except ImportRefused:
            raise
        except Exception as error:
            try:
                record_failure(conn, release, source_url, error)
            except psycopg.Error:
                log.exception("could not record the failed run")
            raise


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import a cse-dataset release into market_data.")
    parser.add_argument(
        "--artifact",
        default=os.environ.get("CSE_DATASET_ARTIFACT") or str(SAMPLE_ARTIFACT),
        help="Release zip, unpacked directory, or https:// URL. Defaults to the bundled sample.",
    )
    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATA_INGESTION_MARKET_DATA_DATABASE_URL"),
        help="Defaults to env DATA_INGESTION_MARKET_DATA_DATABASE_URL.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = parse_args(argv)
    if not args.database_url:
        raise SystemExit(
            "database URL required (--database-url or DATA_INGESTION_MARKET_DATA_DATABASE_URL)"
        )
    try:
        summary = import_release(args.artifact, args.database_url)
    except ArtifactError as error:
        log.error("FAIL %s: %s", error.code, error.reason)
        return 1
    except ImportRefused as error:
        if args.artifact == str(SAMPLE_ARTIFACT):
            # compose runs this on every `up`; a database holding a larger
            # release keeps it, and the job still succeeds.
            log.info("not loading the bundled sample: %s", error)
            return 0
        log.error("refused: %s", error)
        return 1

    log.info("imported %s (%s)", summary["dataset_version"], summary["kind"])
    for name, counts in summary["tables"].items():
        log.info(
            "  %-22s %8d inserted %8d updated %8d unchanged %8d removed",
            name,
            counts["inserted"],
            counts["updated"],
            counts["unchanged"],
            counts["removed"],
        )
    log.info(
        "  %d closed weekdays, %d quarantined sessions, %d quarantined rows",
        summary["closed_days"],
        summary["quarantined_sessions"],
        summary["quarantined_rows"],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
