# data-ingestion

Scheduled (not resident) Python job: fetches, normalises, and validates CSE
end-of-day data. Also provides the **`market-data-seed`** one-shot used on
`docker compose up`.

## Seed loader (`python -m data_ingestion.seed`)

Bulk-loads the validated 2017–2025 window from
[cse-dataset](https://github.com/TradeIQ-CSE/cse-dataset) into `market_data`,
in FK order: `sectors` → `securities` → `trading_calendar` → `ingestion_runs`
→ `daily_prices` → `indices` → `index_values`.

Guarantees:

- **Idempotent** — safe to run any number of times. All IDs are deterministic
  (uuid5 over symbol/GICS code/date), mutable fields upsert on conflict, and
  the single seed `ingestion_runs` row is rewritten per run.
- **Constraint-safe** — rows failing the `daily_prices` OHLC/volume checks are
  written to `quarantined_records` (with `failed_checks`) instead of aborting
  the load.
- **Atomic** — the whole seed runs in one transaction.

### Bundle contract

A seed bundle is a directory of canonical cse-dataset artifacts:

| File | Required | Loads into |
| --- | --- | --- |
| `company_metadata.csv` | yes | `securities` (canonical company metadata columns) |
| `daily_ohlcv.csv` / `daily_ohlcv.parquet` | yes | `trading_calendar`, `daily_prices` (canonical `ohlcv.schema.json` rows; `turnover`/`trades` are dropped — no schema-v2 columns) |
| `indices.csv` | no | `indices`, `index_values` (`date,index_name,close`; `ASPI` and `S&P SL20` normalised to `ASPI`/`SL20`) |
| `sectors.csv` | no | `sectors` (`gics_code,sector_name`); without it, `securities.sector_id` stays NULL |

Bundle resolution order: `--seed-dir` / `CSE_SEED_DATA_DIR` →
`CSE_DATA_SOURCE_URL` (a `.zip` of the above) → bundled sample fixture
(`src/data_ingestion/fixtures/sample`, used so a fresh `docker compose up`
always has queryable data).

### Building a bundle from cse-dataset

cse-dataset's `backfill_ohlcv.py` writes accepted OHLCV **one file per trading
date** (`data/raw/ohlcv/accepted/<date>/<source>/canonical_ohlcv.csv`), and its
generated artifacts are gitignored — so a fresh checkout has no bundle to point
at. `build_seed_bundle` regenerates one:

```sh
# in a cse-dataset checkout — produces the inputs (metadata hits the CSE API)
uv run python scripts/01_collect_metadata.py
uv run python scripts/backfill_ohlcv.py   # defaults to the 2025 source file

# back here — consolidate them into a bundle
uv run python -m data_ingestion.build_seed_bundle \
    --dataset-root ~/path/to/cse-dataset \
    --out /tmp/cse-bundle-2025 --from 2025-01-01 --to 2025-12-31

CSE_SEED_DATA_DIR=/tmp/cse-bundle-2025 docker compose up market-data-seed
```

It also normalises `listing_date` from the CSE API's `DD/MMM/YYYY` to ISO,
which `seed_data.parse_date` requires.

**Known gaps in the regenerated data:**

- **Sectors are unresolved.** `01_collect_metadata.py` hardcodes
  `sector = "Unknown"`, and no symbol→sector mapping exists in the CSE API,
  the daily price files (`MAIN TYPE`/`SUB TYPE` are share class), or
  `39GICS-Daily.xlsx` (sector *index values* only). `securities.sector_id`
  therefore stays NULL. `https://www.cse.lk/api/allSectors` does return the 22
  GICS sectors with codes, if a per-company mapping is ever found.
- **No `market_ratios`.** The seed never populates it, so `pe_ratio` is always
  null on API responses.
- **17 quarantined dates in 2025** (23 rejected rows) — a known source-data
  issue (TIQ-26); `repair_ohlcv_missing.py` upstream recovers 15 of them.

### Run it

```sh
# default: bundled sample fixture, window 2017-01-01..2025-12-31
uv run python -m data_ingestion.seed

# full validated dataset once cse-dataset publishes the artifacts
uv run python -m data_ingestion.seed --seed-dir /path/to/bundle
# or: CSE_DATA_SOURCE_URL=https://.../bundle.zip docker compose up market-data-seed

# narrower window
uv run python -m data_ingestion.seed --from 2020-01-01 --to 2024-12-31
```

Connection string comes from `--database-url` or
`DATA_INGESTION_MARKET_DATA_DATABASE_URL`.

## Development

```sh
uv sync --all-groups
uv run ruff check .
uv run pytest
```
