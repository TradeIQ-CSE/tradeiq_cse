import csv
from datetime import date
from pathlib import Path

import pytest

from data_ingestion.build_seed_bundle import (
    build_bundle,
    iter_accepted_files,
    normalise_metadata_date,
)
from data_ingestion.seed_data import read_securities, to_price_row

CANONICAL_HEADER = [
    "date",
    "symbol",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "turnover",
    "trades",
    "source",
]

METADATA_HEADER = [
    "symbol",
    "company_name",
    "sector",
    "delisting_date",
    "listing_date",
    "shares_outstanding",
]


def _write_accepted(root: Path, day: str, rows: list[dict], source: str = "src_a") -> None:
    target = root / "data/raw/ohlcv/accepted" / day / source
    target.mkdir(parents=True, exist_ok=True)
    with (target / "canonical_ohlcv.csv").open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=CANONICAL_HEADER)
        writer.writeheader()
        writer.writerows(rows)


def _row(day: str, symbol: str, close: str = "10.0") -> dict:
    return {
        "date": day,
        "symbol": symbol,
        "open": "9.5",
        "high": "10.5",
        "low": "9.0",
        "close": close,
        "volume": "1000",
        "turnover": "10000",
        "trades": "10",
        "source": "test",
    }


def _write_metadata(root: Path, rows: list[dict]) -> None:
    target = root / "data/processed"
    target.mkdir(parents=True, exist_ok=True)
    with (target / "company_metadata.csv").open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=METADATA_HEADER)
        writer.writeheader()
        writer.writerows(rows)


@pytest.fixture
def dataset_root(tmp_path: Path) -> Path:
    root = tmp_path / "cse-dataset"
    _write_accepted(root, "2025-01-02", [_row("2025-01-02", "JKH.N0000")])
    _write_accepted(root, "2025-01-03", [_row("2025-01-03", "JKH.N0000", close="11.0")])
    _write_metadata(
        root,
        [
            {
                "symbol": "JKH.N0000",
                "company_name": "John Keells Holdings PLC",
                "sector": "Unknown",
                "delisting_date": "",
                # CSE API format — the case that crashed the seed loader.
                "listing_date": "23/OCT/1986",
                "shares_outstanding": "1513637385",
            }
        ],
    )
    return root


class TestNormaliseMetadataDate:
    def test_converts_cse_api_format_to_iso(self):
        assert normalise_metadata_date("23/OCT/1986") == "1986-10-23"

    def test_passes_iso_through(self):
        assert normalise_metadata_date("1986-10-23") == "1986-10-23"

    def test_blank_stays_blank(self):
        assert normalise_metadata_date("") == ""
        assert normalise_metadata_date("   ") == ""

    def test_unrecognised_becomes_blank(self):
        assert normalise_metadata_date("not-a-date") == ""


class TestIterAcceptedFiles:
    def test_window_filters_dates(self, dataset_root: Path):
        accepted = dataset_root / "data/raw/ohlcv/accepted"
        found = list(iter_accepted_files(accepted, date(2025, 1, 3), None))
        assert [day for day, _ in found] == [date(2025, 1, 3)]

    def test_skips_non_date_directories(self, dataset_root: Path):
        accepted = dataset_root / "data/raw/ohlcv/accepted"
        (accepted / "not-a-date").mkdir()
        found = list(iter_accepted_files(accepted, None, None))
        assert [day for day, _ in found] == [date(2025, 1, 2), date(2025, 1, 3)]


class TestBuildBundle:
    def test_consolidates_and_normalises(self, dataset_root: Path, tmp_path: Path):
        out = tmp_path / "bundle"
        stats = build_bundle(dataset_root, out, None, None)

        assert stats == {"dates": 2, "rows": 2, "symbols": 1}

        # Prices survive the round trip through the seed loader's own parser.
        rows = list(csv.DictReader((out / "daily_ohlcv.csv").open(encoding="utf-8")))
        assert [r["date"] for r in rows] == ["2025-01-02", "2025-01-03"]
        assert all(to_price_row(r) is not None for r in rows)

        # The listing date that previously raised now parses.
        securities = read_securities(out / "company_metadata.csv")
        assert securities[0].listed_date == date(1986, 10, 23)

    def test_window_restricts_output(self, dataset_root: Path, tmp_path: Path):
        out = tmp_path / "bundle"
        stats = build_bundle(dataset_root, out, date(2025, 1, 3), date(2025, 1, 3))
        assert stats["dates"] == 1 and stats["rows"] == 1

    def test_merges_multiple_sources_for_one_date(self, dataset_root: Path, tmp_path: Path):
        # A date repaired from a second source must not be dropped.
        _write_accepted(
            dataset_root, "2025-01-02", [_row("2025-01-02", "COMB.N0000")], source="src_b"
        )
        stats = build_bundle(dataset_root, tmp_path / "bundle", None, None)
        assert stats["rows"] == 3
        assert stats["symbols"] == 2

    def test_missing_accepted_tree_is_fatal(self, tmp_path: Path):
        with pytest.raises(SystemExit, match="no accepted OHLCV"):
            build_bundle(tmp_path / "empty", tmp_path / "bundle", None, None)

    def test_missing_metadata_is_fatal(self, tmp_path: Path):
        root = tmp_path / "cse-dataset"
        _write_accepted(root, "2025-01-02", [_row("2025-01-02", "JKH.N0000")])
        with pytest.raises(SystemExit, match="no company metadata"):
            build_bundle(root, tmp_path / "bundle", None, None)

    def test_empty_window_is_fatal(self, dataset_root: Path, tmp_path: Path):
        with pytest.raises(SystemExit, match="no accepted OHLCV rows"):
            build_bundle(dataset_root, tmp_path / "bundle", date(2030, 1, 1), None)
