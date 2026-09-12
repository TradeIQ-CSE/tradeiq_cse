from __future__ import annotations

import hashlib
import json
import os
import shutil
from collections.abc import Callable, Iterator
from pathlib import Path

import psycopg
import pytest

TEST_DATABASE_URL = os.environ.get("DATA_INGESTION_TEST_DATABASE_URL")

# A slice of dataset-2025-12-31.1: COMB, HNB and JKH from 2025-12-19 to
# 2025-12-26, with 22 Dec quarantined, 25 Dec closed and all four index series.
TEST_RELEASE = Path(__file__).resolve().parent / "fixtures" / "release-2025-12-26"

# Every table an import writes, plus the ones that reference securities.
MARKET_TABLES = (
    "daily_price_provenance",
    "daily_prices",
    "price_aggregates",
    "index_values",
    "indices",
    "quarantined_records",
    "ingestion_runs",
    "trading_calendar",
    "securities",
    "sectors",
)


class Artifact:
    """A writable copy of the test release. Edits refresh the manifest checksums
    and row counts unless told not to, so the edit is the only thing that changed."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def edit_manifest(self, change: Callable[[dict], None]) -> None:
        target = self.path / "manifest.json"
        manifest = json.loads(target.read_text())
        change(manifest)
        target.write_text(json.dumps(manifest, indent=2) + "\n")

    def rehash(self) -> None:
        def refresh(manifest: dict) -> None:
            for entry in manifest["files"]:
                data = (self.path / entry["path"]).read_bytes()
                entry["sha256"] = hashlib.sha256(data).hexdigest()
                entry["rows"] = data.count(b"\n") - 1

        self.edit_manifest(refresh)

    def replace(self, name: str, old: str, new: str, *, rehash: bool = True) -> None:
        target = self.path / name
        text = target.read_text()
        assert text.count(old) == 1, f"the edit must match exactly one place in {name}"
        target.write_text(text.replace(old, new))
        if rehash:
            self.rehash()


@pytest.fixture
def artifact(tmp_path: Path) -> Artifact:
    target = tmp_path / "artifact"
    shutil.copytree(TEST_RELEASE, target)
    return Artifact(target)


def truncate(conn: psycopg.Connection) -> None:
    tables = ", ".join(f"market_data.{name}" for name in MARKET_TABLES)
    conn.execute(f"TRUNCATE {tables} CASCADE")


@pytest.fixture
def db() -> Iterator[psycopg.Connection]:
    """An empty market_data database with the market-trading migrations applied."""
    if not TEST_DATABASE_URL:
        if os.environ.get("DATA_INGESTION_REQUIRE_DB_TESTS") == "1":
            pytest.fail("DATA_INGESTION_TEST_DATABASE_URL is unset")
        pytest.skip("DATA_INGESTION_TEST_DATABASE_URL is unset")
    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as conn:
        truncate(conn)
        yield conn
        truncate(conn)
