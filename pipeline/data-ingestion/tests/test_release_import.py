"""Checks that need no database: what the importer refuses, and its pure helpers."""

from __future__ import annotations

from datetime import date

import pytest

from data_ingestion import release_import
from data_ingestion.artifact import ArtifactError
from data_ingestion.release_import import (
    SAMPLE_ARTIFACT,
    closed_weekdays,
    fetched,
    ohlc_violations,
    open_release,
)


def refused_code(path) -> str:
    with pytest.raises(ArtifactError) as caught:
        open_release(path)
    return caught.value.code


def test_the_bundled_sample_is_a_valid_release():
    release = open_release(SAMPLE_ARTIFACT)
    assert release.version == "2025-01-10.1"
    assert (release.start, release.end) == (date(2025, 1, 2), date(2025, 1, 10))


def test_a_file_that_differs_from_its_checksum_is_refused(artifact):
    artifact.replace(
        "daily_ohlcv.csv", "2025-12-19,COMB.N0000,199.5,", "2025-12-19,COMB.N0000,199.6,",
        rehash=False,
    )
    assert refused_code(artifact.path) == "checksum_mismatch"


def test_another_contract_major_version_is_refused(artifact):
    artifact.edit_manifest(lambda manifest: manifest.update(contract_version="2.0.0"))
    assert refused_code(artifact.path) == "unsupported_contract"


def test_a_missing_required_file_is_refused(artifact):
    (artifact.path / "index_values.csv").unlink()
    assert refused_code(artifact.path) == "missing_file"


def test_a_file_the_manifest_does_not_list_is_refused(artifact):
    (artifact.path / "extra.csv").write_text("a\n1\n")
    assert refused_code(artifact.path) == "unlisted_file"


def test_a_refused_artifact_never_opens_the_database(artifact, monkeypatch):
    def connect(*args, **kwargs):
        raise AssertionError("the database was opened for an invalid artifact")

    monkeypatch.setattr(release_import.psycopg, "connect", connect)
    artifact.edit_manifest(lambda manifest: manifest.update(contract_version="2.0.0"))
    with pytest.raises(ArtifactError):
        release_import.import_release(str(artifact.path), "postgresql://unused")


def test_only_https_urls_are_fetched():
    with pytest.raises(SystemExit), fetched("http://example.com/release.zip"):
        pass


RELEASE_URL = "https://example.com/release.zip"


def serve_redirects(monkeypatch, *locations: str) -> None:
    """Redirect RELEASE_URL through ``locations`` in turn, then serve the archive."""
    httpx = release_import.httpx
    hops = dict(zip([RELEASE_URL, *locations], locations))

    def handler(request):
        location = hops.get(str(request.url))
        if location:
            return httpx.Response(302, headers={"location": location})
        return httpx.Response(200, content=b"archive bytes")

    client = httpx.Client(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(httpx, "stream", client.stream)


def test_a_redirect_over_https_is_followed(monkeypatch):
    serve_redirects(monkeypatch, "https://assets.example.com/asset")

    with fetched(RELEASE_URL) as (path, source_url):
        assert path.read_bytes() == b"archive bytes"
        assert source_url == RELEASE_URL


def test_a_redirect_to_plain_http_is_refused(monkeypatch):
    serve_redirects(monkeypatch, "http://assets.example.com/asset")

    with pytest.raises(SystemExit), fetched(RELEASE_URL):
        pass


def test_a_redirect_through_plain_http_is_refused(monkeypatch):
    # An attacker on the http hop could send the download anywhere, over https.
    serve_redirects(monkeypatch, "http://mirror.example.com/hop", "https://assets.example.com/asset")

    with pytest.raises(SystemExit), fetched(RELEASE_URL):
        pass


def test_closed_days_are_weekdays_without_a_session():
    sessions = {date(2025, 12, day) for day in (19, 22, 23, 24, 26)}
    # 20 and 21 are a weekend; 25 is the only weekday without a session.
    assert closed_weekdays(date(2025, 12, 19), date(2025, 12, 26), sessions) == [
        date(2025, 12, 25)
    ]


@pytest.mark.parametrize(
    ("change", "violations"),
    [
        ({}, []),
        ({"open": ""}, []),
        ({"high": "9.5"}, ["high_below_low", "high_below_close", "open_outside_high_low"]),
        ({"low": "10.6"}, ["low_above_close", "open_outside_high_low"]),
        ({"open": "11.5"}, ["open_outside_high_low"]),
    ],
)
def test_ohlc_violations_mirror_the_table_check(change, violations):
    row = {"open": "10.5", "high": "11", "low": "10", "close": "10.5"} | change
    assert ohlc_violations(row) == violations


def test_only_the_default_sample_steps_aside_quietly(monkeypatch):
    # compose runs the import on every `up`; a database holding a larger
    # release must keep it without failing the job. An explicit import that is
    # refused still fails.
    def refuse(source, database_url):
        raise release_import.ImportRefused("a larger release is already imported")

    monkeypatch.setattr(release_import, "import_release", refuse)
    monkeypatch.delenv("CSE_DATASET_ARTIFACT", raising=False)
    database = ["--database-url", "postgresql://unused"]
    assert release_import.main(database) == 0
    assert release_import.main([*database, "--artifact", "x.zip"]) == 1
