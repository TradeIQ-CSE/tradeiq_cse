"""The importer against a real market_data database (see conftest ``db``),
loading the test release (conftest ``TEST_RELEASE``)."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest

from data_ingestion import release_import
from data_ingestion.artifact import ArtifactError
from data_ingestion.release_import import ImportRefused, import_release

from .conftest import MARKET_TABLES, TEST_DATABASE_URL, TEST_RELEASE

RELEASE_COUNTS = {
    "daily_price_provenance": 12,
    "daily_prices": 12,
    # Two weeks and one month for each of the three securities.
    "price_aggregates": 9,
    "index_values": 20,
    "indices": 4,
    "quarantined_records": 0,
    "ingestion_runs": 1,
    # Five sessions and 25 Dec.
    "trading_calendar": 6,
    "securities": 3,
    "sectors": 0,
}


def run_import(source=TEST_RELEASE) -> dict:
    return import_release(str(source), TEST_DATABASE_URL)


def table_counts(conn) -> dict[str, int]:
    return {
        name: conn.execute(f"SELECT count(*) FROM market_data.{name}").fetchone()[0]
        for name in MARKET_TABLES
    }


def fetch(conn, sql: str, *params) -> list[tuple]:
    return conn.execute(sql, params).fetchall()


def deliver_eod_day(conn, symbol: str, day: date, security_id: uuid.UUID, name: str) -> None:
    """What the EOD ingestion API leaves behind for one price: a random security ID."""
    run_id = uuid.uuid4()
    conn.execute(
        "INSERT INTO market_data.ingestion_runs (run_id, trigger_type, status)"
        " VALUES (%s, 'scheduled', 'succeeded')",
        (run_id,),
    )
    conn.execute(
        "INSERT INTO market_data.trading_calendar (trade_date, is_trading_day) VALUES (%s, true)"
        " ON CONFLICT DO NOTHING",
        (day,),
    )
    conn.execute(
        """
        INSERT INTO market_data.securities (
            security_id, symbol, cse_code, company_name, data_from, data_to
        ) VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (symbol) DO UPDATE SET
            data_from = LEAST(market_data.securities.data_from, EXCLUDED.data_from),
            data_to = GREATEST(market_data.securities.data_to, EXCLUDED.data_to)
        """,
        (security_id, symbol, symbol, name, day, day),
    )
    conn.execute(
        """
        INSERT INTO market_data.daily_prices (
            security_id, trade_date, open, high, low, close, volume, ingestion_run_id
        ) VALUES (%s, %s, 20, 21, 19, 20, 1000, %s)
        """,
        (security_id, day, run_id),
    )


def drop_row(artifact, name: str, prefix: str) -> None:
    target = artifact.path / name
    lines = target.read_text().splitlines(keepends=True)
    kept = [line for line in lines if not line.startswith(prefix)]
    assert len(kept) == len(lines) - 1, f"{prefix} must match one row of {name}"
    target.write_text("".join(kept))


def make_correction(artifact) -> None:
    """2025-12-26.2 replaces 26 Dec: JKH has no price and COMB closes at 199."""
    drop_row(artifact, "daily_ohlcv.csv", "2025-12-26,JKH.N0000,")
    artifact.replace("trading_calendar.csv", "2025-12-26,accepted,3", "2025-12-26,accepted,2")
    artifact.replace(
        "daily_ohlcv.csv",
        "2025-12-26,COMB.N0000,198.75,199,198,198.75,",
        "2025-12-26,COMB.N0000,198.75,199,198,199,",
    )
    artifact.edit_manifest(
        lambda manifest: manifest.update(
            dataset_version="2025-12-26.2",
            kind="correction",
            base_version="2025-12-26.1",
            corrected_dates=["2025-12-26"],
        )
    )


def test_a_clean_import_loads_every_table(db):
    summary = run_import()

    assert table_counts(db) == RELEASE_COUNTS
    assert summary["tables"]["daily_prices"] == {
        "inserted": 12, "updated": 0, "unchanged": 0, "removed": 0
    }
    assert (summary["closed_days"], summary["quarantined_sessions"]) == (1, 1)
    # The quarantined session is a trading day with no prices; 25 Dec is closed.
    assert fetch(
        db, "SELECT trade_date, is_trading_day FROM market_data.trading_calendar ORDER BY 1"
    ) == [
        (date(2025, 12, 19), True),
        (date(2025, 12, 22), True),
        (date(2025, 12, 23), True),
        (date(2025, 12, 24), True),
        (date(2025, 12, 25), False),
        (date(2025, 12, 26), True),
    ]
    assert fetch(
        db, "SELECT count(*) FROM market_data.daily_prices WHERE trade_date = '2025-12-22'"
    ) == [(0,)]
    assert fetch(
        db,
        """
        SELECT status, trigger_type, dataset_version, dataset_kind, coverage_start,
               coverage_end, records_processed, records_accepted, producer_commit
        FROM market_data.ingestion_runs
        """,
    ) == [
        (
            "succeeded", "backfill", "2025-12-26.1", "full", date(2025, 12, 19),
            date(2025, 12, 26), 12, 12, "b0e6158fb261edb3da63c206b2c06cbe32114e99",
        )
    ]
    assert fetch(
        db,
        "SELECT company_name, data_from, data_to FROM market_data.securities"
        " WHERE symbol = 'COMB.N0000'",
    ) == [("COMMERCIAL BANK OF CEYLON PLC", date(2025, 12, 19), date(2025, 12, 26))]


def test_index_codes_are_matched_exactly(db):
    run_import()

    assert fetch(
        db,
        "SELECT index_code, index_value FROM market_data.index_values"
        " WHERE trade_date = '2025-12-19' ORDER BY 1",
    ) == [
        ("ASPI", Decimal("22149.09")),
        ("ASTRI", Decimal("33643.314")),
        ("SL20", Decimal("6056.544")),
        ("SL20TRI", Decimal("12366.71")),
    ]


def test_importing_twice_changes_nothing(db):
    first = run_import()
    before = table_counts(db)

    second = run_import()

    assert table_counts(db) == before
    for name, counts in second["tables"].items():
        assert counts == {
            "inserted": 0,
            "updated": 0,
            "unchanged": first["tables"][name]["inserted"],
            "removed": 0,
        }, name


def test_an_invalid_artifact_leaves_the_database_untouched(db, artifact):
    run_import()
    before = (table_counts(db), fetch(db, "SELECT * FROM market_data.ingestion_runs"))
    artifact.replace(
        "daily_ohlcv.csv", "2025-12-19,COMB.N0000,199.5,", "2025-12-19,COMB.N0000,199.6,",
        rehash=False,
    )

    with pytest.raises(ArtifactError):
        run_import(artifact.path)

    assert (table_counts(db), fetch(db, "SELECT * FROM market_data.ingestion_runs")) == before


def fail_after_prices(*args, **kwargs):
    raise RuntimeError("index load failed")


def test_a_failure_part_way_rolls_back_the_whole_import(db, monkeypatch):
    monkeypatch.setattr(release_import, "load_indices", fail_after_prices)

    with pytest.raises(RuntimeError):
        run_import()

    assert table_counts(db) == dict.fromkeys(MARKET_TABLES, 0) | {"ingestion_runs": 1}
    [(status, version, error)] = fetch(
        db, "SELECT status, dataset_version, error_details FROM market_data.ingestion_runs"
    )
    assert (status, version) == ("failed", "2025-12-26.1")
    assert error == {"error": "RuntimeError: index load failed"}


def test_a_failed_reimport_keeps_the_good_run(db, monkeypatch):
    run_import()
    monkeypatch.setattr(release_import, "load_indices", fail_after_prices)

    with pytest.raises(RuntimeError):
        run_import()

    assert table_counts(db) == RELEASE_COUNTS | {"ingestion_runs": 2}
    assert fetch(db, "SELECT status FROM market_data.ingestion_runs ORDER BY 1") == [
        ("failed",),
        ("succeeded",),
    ]


def test_a_security_from_the_eod_api_keeps_its_id_and_newer_data(db):
    eod_id = uuid.uuid4()
    deliver_eod_day(db, "COMB.N0000", date(2026, 9, 11), eod_id, "Commercial Bank of Ceylon PLC")

    run_import()

    # The 2026 price is after the release's coverage, so it survives, and the
    # EOD API's newer name is kept.
    assert fetch(
        db,
        "SELECT security_id, company_name, data_from, data_to FROM market_data.securities"
        " WHERE symbol = 'COMB.N0000'",
    ) == [(eod_id, "Commercial Bank of Ceylon PLC", date(2025, 12, 19), date(2026, 9, 11))]
    assert fetch(
        db,
        "SELECT trade_date FROM market_data.daily_prices WHERE security_id = %s ORDER BY 1",
        eod_id,
    ) == [
        (date(2025, 12, 19),),
        (date(2025, 12, 23),),
        (date(2025, 12, 24),),
        (date(2025, 12, 26),),
        (date(2026, 9, 11),),
    ]


def test_rows_the_release_lacks_are_removed_inside_its_coverage(db):
    aaf = uuid.uuid4()
    # 10 Dec is before the coverage; 20 Dec is a Saturday; 23 Dec is a session
    # the release has no AAF price for.
    for day in (date(2025, 12, 10), date(2025, 12, 20), date(2025, 12, 23)):
        deliver_eod_day(db, "AAF.N0000", day, aaf, "ASIA ASSET FINANCE PLC")
    db.execute("INSERT INTO market_data.indices (index_code, index_name) VALUES ('MPI', 'MPI')")
    for day in (date(2025, 12, 10), date(2025, 12, 23)):
        db.execute(
            "INSERT INTO market_data.index_values (index_value_id, index_code, trade_date,"
            " index_value) VALUES (%s, 'MPI', %s, 100)",
            (uuid.uuid4(), day),
        )

    summary = run_import()

    assert summary["tables"]["daily_prices"]["removed"] == 2
    assert summary["tables"]["index_values"]["removed"] == 1
    assert summary["tables"]["trading_calendar"]["removed"] == 1
    assert fetch(
        db, "SELECT trade_date FROM market_data.index_values WHERE index_code = 'MPI'"
    ) == [(date(2025, 12, 10),)]
    assert fetch(
        db, "SELECT trade_date FROM market_data.daily_prices WHERE security_id = %s", aaf
    ) == [(date(2025, 12, 10),)]
    assert fetch(
        db,
        "SELECT data_from, data_to FROM market_data.securities WHERE security_id = %s",
        aaf,
    ) == [(date(2025, 12, 10), date(2025, 12, 10))]
    assert fetch(
        db, "SELECT count(*) FROM market_data.trading_calendar WHERE trade_date = '2025-12-20'"
    ) == [(0,)]


def test_a_correction_replaces_its_sessions(db, artifact):
    run_import()
    make_correction(artifact)

    summary = run_import(artifact.path)

    prices = summary["tables"]["daily_prices"]
    assert (prices["updated"], prices["removed"]) == (1, 1)
    assert fetch(
        db,
        """
        SELECT s.symbol, p.close FROM market_data.daily_prices p
        JOIN market_data.securities s USING (security_id)
        WHERE p.trade_date = '2025-12-26' ORDER BY 1
        """,
    ) == [("COMB.N0000", Decimal("199")), ("HNB.N0000", Decimal("388.25"))]
    # JKH's week now ends on the 24th.
    assert fetch(
        db,
        """
        SELECT a.period_end, a.close FROM market_data.price_aggregates a
        JOIN market_data.securities s USING (security_id)
        WHERE s.symbol = 'JKH.N0000' AND a.period_type = 'weekly'
          AND a.period_start = '2025-12-22'
        """,
    ) == [(date(2025, 12, 24), Decimal("21"))]
    assert fetch(
        db, "SELECT dataset_version, status FROM market_data.ingestion_runs ORDER BY 1"
    ) == [("2025-12-26.1", "succeeded"), ("2025-12-26.2", "succeeded")]


def test_a_correction_needs_its_base_imported(db, artifact):
    make_correction(artifact)

    with pytest.raises(ImportRefused):
        run_import(artifact.path)

    assert table_counts(db) == dict.fromkeys(MARKET_TABLES, 0)


def test_a_release_that_would_cut_into_a_larger_one_is_refused(db, artifact):
    run_import()
    before = table_counts(db)
    # The same release without 19 Dec: a full release covering only part of it.
    for name in ("trading_calendar.csv", "daily_ohlcv.csv", "index_values.csv"):
        target = artifact.path / name
        lines = target.read_text().splitlines(keepends=True)
        target.write_text("".join(line for line in lines if not line.startswith("2025-12-19")))

    def narrow(manifest: dict) -> None:
        manifest.update(
            dataset_version="2025-12-26.2", coverage={"start": "2025-12-22", "end": "2025-12-26"}
        )
        for series in manifest["index_series"]:
            series["first_date"] = "2025-12-22"

    artifact.edit_manifest(narrow)
    artifact.rehash()

    with pytest.raises(ImportRefused):
        run_import(artifact.path)

    assert table_counts(db) == before


def test_a_row_the_price_check_would_refuse_is_quarantined(db, artifact):
    # HNB's high drops below its close and open.
    artifact.replace(
        "daily_ohlcv.csv", "2025-12-19,HNB.N0000,389.5,390,", "2025-12-19,HNB.N0000,389.5,389.4,"
    )

    summary = run_import(artifact.path)

    assert summary["quarantined_rows"] == 1
    assert fetch(db, "SELECT failed_checks FROM market_data.quarantined_records") == [
        (["high_below_close", "open_outside_high_low"],)
    ]
    assert fetch(
        db, "SELECT status, records_accepted, records_quarantined FROM market_data.ingestion_runs"
    ) == [("partial", 11, 1)]
    assert table_counts(db)["daily_prices"] == 11
