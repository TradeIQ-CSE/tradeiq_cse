# ml-prediction

Owns the `ml` Postgres database. Two deployables are built from this directory:

| | Image | Runs | Entry point |
|---|---|---|---|
| Read-only prediction API | `ml-prediction` (`Dockerfile`) | always (`docker compose up`) | `uvicorn app.main:app` |
| Long-trade job | `ml-long-trade` (`Dockerfile.long-trade`) | on demand; daily schedule requires operator setup | `python -m app.long_trade.main` |

The API serves `/health` and authenticated `GET /predictions/configurations`,
`GET /predictions/status`, and `GET /predictions/{symbol}`. See the
[read API contract](../../docs/api/ml-predictions-v1.md) for response schemas,
selection rules, configuration and deployment requirements. The remaining sections cover the
job. Why it exists and why it looks the way it does:
[ADR 0011](../../docs/adr/0011-long-trade-batch-predictor.md).

## The long-trade job

For every stock, for every training configuration, it trains a model and
stores the probability of a long trade:

```text
main()
  load_symbols()                        function 01: ML_LONG_TRADE_SYMBOLS, or every security
                                        with enough recent history (GET /securities)
  for each stock:
    daily bars                          GET /securities/{symbol}/ohlcv, fetched once per stock
    get_training_configs()              function 02: the 27-configuration grid
    for each configuration:
      train_and_predict()               evaluate on the last test_days, refit on everything,
                                        predict the latest bar
      repository.save()                 upsert into ml.long_trade_predictions
      log one line                      what was trained and what it said
```

A **configuration** is a triple-barrier question, "does price reach +pt before
-sl within H trading days?", plus how many final bars are held out to evaluate
it. The default grid is the one committed in trading-wizard: pt {0.01, 0.015,
0.02} x sl {0.005, 0.0075, 0.01} x H {24, 36, 48} x test_days {30}. Each has a
stable `config_key`, such as `pt0.015_sl0.005_H24_T30`.

**`prob_long`** is the average of a logistic regression's and an XGBoost
model's P(label = 1) for the latest bar (`data_as_of`): the chance that,
entering at that close, price reaches +pt before -sl within H trading days.
**`is_long_signal`** is true when that probability beats P(no profit) by at
least 0.3, which means `prob_long >= 0.65`.

The model is ported from trading-wizard's
`machine_learning/long-trade-predictor.ipynb` (commit `321fa67`). Production
uses 39 of the research's 40 features, because the platform has no trade
counts. That and the other data gaps are covered in the ADR.

| Module (`app/long_trade/`) | Does |
|---|---|
| `main.py` | the job: the loop above, failure isolation, exit codes |
| `settings.py` | reads and validates the `ML_*` variables once |
| `universe.py` | function 01 |
| `configs.py` | function 02, the default grid, `ML_LONG_TRADE_GRID` parsing |
| `market_client.py` | market-trading REST client (pagination, retries) |
| `features.py` | platform bars → the research's frame; the 39 feature columns |
| `indicator_engine.py` | verbatim copy of trading-wizard's engine |
| `labels.py` | triple-barrier labels |
| `model.py` | train, evaluate, predict for one (stock, configuration) |
| `evaluation.py` | the notebook's decision rule, classification report, profit simulation |
| `repository.py` | writes to the `ml` schema |

### Run it

Locally with uv, against the compose database and market-trading
(`docker compose up -d db market-trading ml-prediction-migrate`):

On macOS, XGBoost also requires the OpenMP runtime (`brew install libomp`).
The Docker batch image includes its Linux runtime dependencies.

```sh
# From the repository root, after copying .env.example to .env:
ML_LONG_TRADE_SYMBOLS=COMB.N0000 ./scripts/run.sh ml-prediction --group long-trade python -m app.long_trade.main
```

In Docker (the `jobs` profile keeps it out of a plain `docker compose up`):

```sh
docker compose build ml-long-trade-job
ML_LONG_TRADE_SYMBOLS=COMB.N0000,JKH.N0000 docker compose --profile jobs run --rm ml-long-trade-job
```

Both Dockerfiles use `services/ml-prediction` as their build context. The batch
image installs the locked `long-trade` dependency group and runs as a non-root
user. The API image keeps its existing lightweight dependencies. Local Compose
builds the job from source and limits it to one CPU and 768 MiB of memory.

GitHub Actions publishes the batch image in `job_images.ml-long-trade` within the
same completed release as the application images. The production scheduler and
Compose service are server-owned; activation remains a separate operator step
under issue #190. See [Deployment](../../docs/ops/deployment.md#scheduled-ml-training).

The bundled seed sample holds about 7 sessions, so every stock is skipped
(and the job exits 1). Load the 2017–2025 release first; see
[`pipeline/data-ingestion/README.md`](../../pipeline/data-ingestion/README.md).

### Environment

| Variable | Default | Meaning |
|---|---|---|
| `ML_DATABASE_URL` | required | The `ml` database. |
| `ML_MARKET_TRADING_API_URL` | required | market-trading's base URL. In Compose, `http://market-trading:3001`: the private network, not nginx. |
| `ML_LONG_TRADE_SYMBOLS` | every eligible security | Comma-separated symbols, e.g. `COMB.N0000,JKH.N0000`. When set, exactly these are run. |
| `ML_LONG_TRADE_MIN_HISTORY_BARS` | `400` | Stocks with fewer daily bars are skipped. About 120 bars go to indicator warm-up and H to the unlabelled tail. |
| `ML_LONG_TRADE_TRAIN_LOOKBACK_DAYS` | all history | Train on the last N calendar days only. |
| `ML_LONG_TRADE_GRID` | the committed grid | JSON with one list per parameter, expanded to every combination: `{"take_profit_pct": [0.01], "stop_loss_pct": [0.005, 0.01], "horizon_bars": [24], "test_days": [30]}`. Validated strictly; a bad value fails the run at start-up (exit 2). |
| `ML_LONG_TRADE_N_JOBS` | `1` | XGBoost threads, and the cap on BLAS threads. |
| `ML_LONG_TRADE_HTTP_TIMEOUT_SECONDS` | `30` | Per request to market-trading. Requests are retried 3 times with 1/2/4 s backoff. |
| `ML_LONG_TRADE_LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING` or `ERROR`. |

Empty means unset, so Compose can pass every variable through.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | The run completed. Some models may have been skipped; see the log and `ml.long_trade_runs`. |
| 1 | The run completed but trained nothing. |
| 2 | Invalid configuration. |
| 3 | The database or market-trading is unavailable. |

### What it writes

Migration `alembic/versions/0002_long_trade_predictions.py`:

- **`ml.models`**: the model is registered as `long-trade-ensemble` /
  `1.0.0`, with its features, default grid and decision margin in `metrics`.
  The row is upserted every run.
- **`ml.long_trade_runs`**: one row per run, covering `status` (`running` →
  `succeeded` | `partial` | `failed`), `data_as_of`, the counts
  `symbols_requested`, `models_trained`, `models_skipped` and `models_failed`
  (which sum to stocks x configurations), and the effective `settings`
  (never credentials). A row left at `running` belongs to a run that was
  killed.
- **`ml.long_trade_predictions`**: one row per (symbol, configuration,
  `data_as_of`), upserted, so re-running a day replaces its rows. It holds
  `prob_long`, `is_long_signal`, the barriers, the training window,
  `train_rows`/`test_rows` (the evaluation split; the prediction model is fitted
  on both), `positive_rate`, and `metrics`. `metrics` holds the test window's
  classification report and profit simulation, exactly as the notebook
  computes them.

`metrics.classification_report.Profit.precision` is 0 both when every test
signal lost and when there were no test signals. Check
`metrics.profit.trades_taken` to tell them apart.

### Tests

```sh
uv sync --all-groups
uv run ruff check .
uv run pytest                    # offline: no database, no network
ML_TEST_DATABASE_URL=postgresql://ml:changeme@localhost:5432/ml \
  uv run pytest tests/test_long_trade_repository.py   # against a real ml database
```

The repository tests skip without `ML_TEST_DATABASE_URL`. CI's migrations job
sets it together with `ML_REQUIRE_DB_TESTS=1`, so there they fail instead.

### Parity with the research

The port was checked against the notebook's own logic, run on trading-wizard's
`COMBANK_daily.csv` with the notebook's engine and the full `best_40`. Features
(all 112 engine columns), labels, splits, probabilities, the classification
report and the profit summary were identical, including under the research's
pinned versions (scikit-learn 1.8.0, XGBoost 3.2.0, pandas 3.0.2, numpy 2.4.4).
Re-run that check before you change `indicator_engine.py`, the labels, the
models or the XGBoost version. **XGBoost is capped below 3.3**: from 3.3 on,
the same data and parameters train a different model. Any such change is a new
`MODEL_VERSION` in `repository.py`.
