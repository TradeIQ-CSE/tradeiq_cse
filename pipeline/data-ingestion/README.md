# data-ingestion

Scheduled (not resident) Python job: fetches, normalises, and validates CSE
end-of-day data. Also provides the **release importer**, which runs as the
`market-data-seed` one-shot on `docker compose up`.

## Release importer (`python -m data_ingestion.release_import`)

Loads a [cse-dataset](https://github.com/TradeIQ-CSE/cse-dataset) release into
`market_data`. A release is a zip in the format of cse-dataset's artifact
contract v1 (`docs/contracts/dataset-artifact-v1.md` there). The first one,
`dataset-2025-12-31.1`, covers 2017-01-02 to 2025-12-31.

```sh
# the bundled sample
uv run python -m data_ingestion.release_import

# the published 2017-2025 release
uv run python -m data_ingestion.release_import --artifact \
  https://github.com/TradeIQ-CSE/cse-dataset/releases/download/dataset-2025-12-31.1/cse-dataset-2025-12-31.1.zip

# a local zip, or the same files unpacked into a directory
uv run python -m data_ingestion.release_import --artifact ~/Downloads/cse-dataset-2025-12-31.1.zip

# through compose
CSE_DATASET_ARTIFACT=https://github.com/.../cse-dataset-2025-12-31.1.zip docker compose up market-data-seed
```

`--artifact` defaults to `CSE_DATASET_ARTIFACT`, then to the bundled sample.
Only `https://` URLs are fetched. The connection string comes from
`--database-url` or `DATA_INGESTION_MARKET_DATA_DATABASE_URL`. This is one of
the direct database writers `docs/api/eod-ingestion-v1.md` allows; daily prices
arrive through the EOD ingestion API instead.

How it behaves:

- **Checked before anything is written.** The whole artifact is validated
  before the database is opened: manifest, contract version (major 1 only),
  checksums, file list, columns, values, keys and references. `artifact.py` is
  cse-dataset's `validate_artifact.py`, copied at b0e6158. A failed check
  prints `FAIL <code>: <reason>`, exits 1 and changes nothing.
- **One transaction.** Sectors, securities, the trading calendar, prices and
  their provenance, indices and index values load together. Then each changed
  security's coverage dates and weekly and monthly aggregates are rebuilt from
  every stored row. A failure rolls all of it back and records a `failed` run.
- **The release is authoritative inside its coverage.** From `coverage.start`
  to `coverage.end`, rows the release doesn't carry are removed. Nothing after
  `coverage.end` is touched, so days delivered by the EOD API survive a
  re-import.
- **Calendar.** Every session is a trading day, including quarantined ones,
  which have no prices. Weekdays with no session are recorded as closed.
  Weekends are left to the weekday rule that `settlement-date.ts` applies.
- **Securities keep their IDs** and are matched by symbol. A security with
  prices after the release keeps its newer non-empty metadata. An empty release
  value never erases a known one.
- **Index codes are matched exactly.** SL20TRI is a different series from SL20.
- **Idempotent.** Importing the same release again changes nothing. Each
  release version has one `ingestion_runs` row, which records
  `dataset_version`, `dataset_kind`, `coverage_start`, `coverage_end`,
  `source_url` and `producer_commit`.
- **Corrections and incrementals** load the same way. They are refused unless
  their `base_version` has already been imported.
- **A release never cuts into a larger one.** A release that overlaps an
  imported one without covering all of it is refused, because it would replace
  that release's rows in the overlap. With nothing configured and a larger
  release already loaded, the sample import steps aside and exits 0, so a plain
  `docker compose up` keeps the real data.
- **Row checks.** A price the `daily_prices` OHLC check would refuse goes to
  `quarantined_records`, and the run is marked `partial`.

The run logs inserted, updated, unchanged and removed counts for each table.
The same summary is stored in the run's `validation_summary`.

### The bundled sample

`src/data_ingestion/fixtures/sample` is the small hand-made dataset the old
seed shipped, rewritten in the v1 format: six securities from 2025-01-02 to
2025-01-10, four sectors, and ASPI and SL20. cse-dataset didn't build it, so its
`source_commit` is all zeros. The market-trading e2e tests and the compose
smoke test assert on its content.

### Known gaps in `dataset-2025-12-31.1`

- **No sectors.** No per-company GICS mapping has been sourced, so
  `securities.sector_id` stays NULL.
- **Listing and delisting dates, ISINs and boards aren't loaded.** `securities`
  has no columns for them.
- **94 quarantined sessions have no prices.** The release notes list them.
- **No `market_ratios`**, so `pe_ratio` is always null on API responses.

## Development

```sh
uv sync --all-groups
uv run ruff check .
uv run pytest
```

The tests in `tests/test_release_import_db.py` need a `market_data` database
with the market-trading migrations applied, and they empty its market tables
before and after each test. Point them at a throwaway database:

```sh
DATA_INGESTION_TEST_DATABASE_URL=postgresql://market_data:changeme@localhost:5433/market_data \
  uv run pytest
```

Without that variable they're skipped. CI also sets
`DATA_INGESTION_REQUIRE_DB_TESTS=1`, so a missing URL fails the run instead.
