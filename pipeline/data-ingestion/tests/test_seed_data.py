from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import pytest

from data_ingestion.seed_data import (
    PriceRow,
    in_window,
    normalise_index_name,
    ohlc_violations,
    parse_date,
    parse_decimal,
    parse_int,
    read_sectors,
    read_securities,
    sector_id,
    security_id,
    to_index_value_row,
    to_price_row,
)

FIXTURE_DIR = (
    Path(__file__).resolve().parent.parent / "src" / "data_ingestion" / "fixtures" / "sample"
)


def _price(**overrides) -> PriceRow:
    base = {
        "symbol": "COMB.N0000",
        "trade_date": date(2025, 1, 2),
        "open": Decimal("100.0"),
        "high": Decimal("105.0"),
        "low": Decimal("99.0"),
        "close": Decimal("103.0"),
        "volume": 1000,
    }
    return PriceRow(**(base | overrides))


class TestParsers:
    def test_parse_date_iso(self) -> None:
        assert parse_date("2025-01-02") == date(2025, 1, 2)

    def test_parse_date_datetime_and_empty(self) -> None:
        assert parse_date(datetime(2025, 1, 2, 9, 30)) == date(2025, 1, 2)
        assert parse_date("") is None
        assert parse_date(None) is None

    def test_parse_date_rejects_garbage(self) -> None:
        with pytest.raises(ValueError):
            parse_date("not-a-date")

    def test_parse_decimal(self) -> None:
        assert parse_decimal("1,234.50") == Decimal("1234.50")
        assert parse_decimal("") is None
        assert parse_decimal("nan") is None
        assert parse_decimal("abc") is None

    def test_parse_int(self) -> None:
        assert parse_int("1467151555") == 1467151555
        assert parse_int("") is None


class TestNormaliseIndexName:
    def test_known_aliases(self) -> None:
        assert normalise_index_name("ASPI") == ("ASPI", "All Share Price Index")
        assert normalise_index_name("S&P SL20") == ("SL20", "S&P Sri Lanka 20")

    def test_unknown_falls_back_to_stable_code(self) -> None:
        code, name = normalise_index_name("Some New Index")
        assert code == "SOME_NEW_INDEX"
        assert name == "Some New Index"


class TestOhlcViolations:
    def test_valid_row_has_no_violations(self) -> None:
        assert ohlc_violations(_price()) == []

    def test_open_none_allowed(self) -> None:
        assert ohlc_violations(_price(open=None)) == []

    @pytest.mark.parametrize(
        ("overrides", "check"),
        [
            (
                {"high": Decimal("98"), "low": Decimal("99"), "close": Decimal("99")},
                "high_below_low",
            ),
            ({"close": Decimal("106")}, "high_below_close"),
            ({"close": Decimal("98")}, "low_above_close"),
            ({"open": Decimal("106")}, "open_outside_high_low"),
            ({"open": Decimal("98")}, "open_outside_high_low"),
            ({"volume": -1}, "negative_volume"),
        ],
    )
    def test_violations_detected(self, overrides: dict, check: str) -> None:
        assert check in ohlc_violations(_price(**overrides))


class TestDeterministicIds:
    def test_security_id_stable(self) -> None:
        assert security_id("COMB.N0000") == security_id("COMB.N0000")

    def test_security_id_distinct(self) -> None:
        assert security_id("COMB.N0000") != security_id("HNB.N0000")

    def test_sector_id_stable(self) -> None:
        assert sector_id("4010") == sector_id("4010")


class TestRowConverters:
    def test_to_price_row_valid(self) -> None:
        raw = {
            "date": "2025-01-02",
            "symbol": "COMB.N0000",
            "open": "143.62",
            "high": "146.52",
            "low": "143.03",
            "close": "145.81",
            "volume": "1584492",
            "turnover": "231034778.52",
            "trades": "569",
        }
        row = to_price_row(raw)
        assert row is not None
        assert row.symbol == "COMB.N0000"
        assert row.close == Decimal("145.81")
        assert row.volume == 1584492

    def test_to_price_row_missing_required(self) -> None:
        valid = {"symbol": "X", "date": "2025-01-02", "high": "1", "low": "1", "close": "1"}
        assert to_price_row(valid | {"symbol": ""}) is None
        assert to_price_row(valid | {"date": ""}) is None
        assert to_price_row(valid | {"high": ""}) is None

    def test_to_index_value_row(self) -> None:
        row = to_index_value_row(
            {"date": "2025-01-02", "index_name": "S&P SL20", "close": "4732.06"}
        )
        assert row is not None
        assert row.index_code == "SL20"
        assert row.value == Decimal("4732.06")


class TestInWindow:
    def test_bounds(self) -> None:
        start, end = date(2017, 1, 1), date(2025, 12, 31)
        assert in_window(date(2020, 6, 15), start, end)
        assert not in_window(date(2016, 12, 31), start, end)
        assert not in_window(date(2026, 1, 1), start, end)


class TestBundledSampleFixture:
    """Guards the committed sample fixture used by default `docker compose up`."""

    def test_sectors(self) -> None:
        sectors = read_sectors(FIXTURE_DIR / "sectors.csv")
        assert len(sectors) == 4
        assert {s.gics_code for s in sectors} == {"4010", "2010", "3020", "5030"}

    def test_securities(self) -> None:
        securities = read_securities(FIXTURE_DIR / "company_metadata.csv")
        assert len(securities) == 6
        comb = next(s for s in securities if s.symbol == "COMB.N0000")
        assert comb.sector_name == "Banks"
        assert comb.shares_outstanding == 1467151555

    def test_prices_all_valid_and_in_window(self) -> None:
        import csv

        start, end = date(2017, 1, 1), date(2025, 12, 31)
        with (FIXTURE_DIR / "daily_ohlcv.csv").open(newline="") as fh:
            rows = [to_price_row(raw) for raw in csv.DictReader(fh)]
        assert len(rows) == 42  # 6 symbols x 7 trading days
        assert all(row is not None for row in rows)
        assert all(in_window(row.trade_date, start, end) for row in rows if row)
        assert all(ohlc_violations(row) == [] for row in rows if row)
