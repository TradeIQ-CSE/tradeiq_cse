# ADR 0011: Long-trade predictor as a scheduled batch job in `ml-prediction`

- **Status:** Proposed
- **Date:** 2026-10-01
- **Source:** mentor design brief for the trading-wizard port (no Linear ticket yet)
- **Supersedes:** [ADR 0006](./0006-ml-prediction-integration-scope.md), the
  "PPO direction" model and its per-security up/down contract only. ADR 0006's
  empty-state, disclaimer and fault-containment rules still stand.

## Context

ADR 0006 deferred the model to its owners and fixed only the integration
contract, at the time a PPO model emitting up/flat/down per security. The
model that the ML owners actually researched is different. It lives in
`trading-wizard` (`machine_learning/long-trade-predictor.ipynb`, commit
`321fa67`) and is a supervised classifier:

- **Label**: a triple barrier on daily bars. 1 when a later bar's high reaches
  `close * (1 + pt)` before a later bar's low reaches `close * (1 - sl)`, within
  `H` trading days; 0 otherwise. The take profit is checked first on a bar
  that touches both.
- **Features**: 40 indicators (`best_40`) from trading-wizard's
  `services/indicator_engine.py`.
- **Model**: the average of `LogisticRegression(class_weight="balanced")` and
  `XGBClassifier` probabilities. A long signal is raised only when P(long)
  beats P(no profit) by a margin of at least 0.3, which means P(long) >= 0.65.
- **Grid**: one model per (pt, sl, H, test window) configuration. The committed
  grid is pt {1, 1.5, 2}% x sl {0.5, 0.75, 1}% x H {24, 36, 48} bars x 30 test
  days, 27 configurations per stock.

The notebook only evaluates on a held-out window. It never predicts "today".
The mentor's design for production is a single `main.py` that loads the stocks,
loops over each stock's configurations, trains each one, stores the probability
of a long trade and logs the result. That job is built into an image the
platform owner runs on a schedule. The platform owner asked for it to live in
the existing `ml-prediction` service, not a new one.

## Decision

1. **A one-shot batch job in `services/ml-prediction`**
   (`python -m app.long_trade.main`, image `ml-long-trade`, Dockerfile
   `Dockerfile.long-trade`). It is scheduled, never resident, the same
   principle as [ADR 0004](./0004-pipeline-deployment-scheduled-lambda.md). The
   FastAPI `/health` app is unchanged. The numeric stack is a separate
   dependency group installed only in the job image, so the API image does not
   grow.
2. **The notebook logic is ported exactly.** The indicator engine is copied
   verbatim. Labels, `dropna()[:-H]`, the train/test split, both models and
   the decision rule follow the notebook cell for cell. A parity check (see the
   service README) reproduces the notebook's features, labels, probabilities,
   classification report and profit summary bit for bit. That includes the
   research's own pinned library versions, which is why XGBoost is capped at
   3.2: 3.3 trains a different model from identical inputs.
3. **Each configuration is trained twice.** The *evaluate* fit is the notebook:
   train on the labelled rows minus the last `test_days` and score those, which
   gives the stored metrics. The *predict* fit trains on every labelled row and
   scores the latest bar (`data_as_of`). Its `prob_long` is the probability
   that, entering at that close, price reaches +pt before -sl within H trading
   days.
4. **Prices come over REST** from `market-trading` (`GET /securities`,
   `GET /securities/{symbol}/ohlcv`, with `from` always explicit). There is no
   cross-service SQL: the `ml` user cannot reach `market_data`.
5. **New tables, not `ml.predictions`.** That table keys on `security_id`, which
   the REST API never exposes, and requires three probabilities summing to 1.
   Migration `0002_long_trade_predictions` adds `ml.long_trade_runs` and
   `ml.long_trade_predictions`. The latter is unique on
   `(symbol, config_key, data_as_of)` and written by upsert, so re-running a
   market day is idempotent. The model is registered in the existing
   `ml.models` as `long-trade-ensemble` 1.0.0. The 0001 tables are untouched.
6. **Failures are contained per model.** A stock or configuration that cannot
   be trained (too little history, a single label class, a 404, persistent 5xx)
   is logged and counted, and the run continues. The run stops only when a
   dependency is gone: market-trading unreachable, or a database error. Its
   exit code tells the scheduler which case occurred.

### Deviations from the research, forced by the platform's data

| Research input | Platform | Handling | Effect |
|---|---|---|---|
| `trades_count` | not stored in `market_data.daily_prices` | `trades_sma12` dropped from `best_40`, leaving **39 features**. The engine gets a constant placeholder, which feeds only columns that are never features (asserted by a test) | Measured on COMBANK, 2015–2024 window, committed grid: mean test accuracy 0.363 → 0.312, mean profit-class precision 0.745 → 0.532, mean simulated return +0.49% → +0.20% per 30-day window |
| `tbba_volume` | not stored | synthesised as `volume / 2`, exactly what every trading-wizard CSV holds | none: no selected feature depends on it, and the 39 features are bit-identical whether the CSV's columns or the synthesised ones are used |
| `open` always present | may be `null` | previous bar's close; the first bar falls back to its own close | avoids NaN wick/body features silently dropping rows in `dropna()` |
| epoch-ms `open_time` | `date` | UTC midnight in epoch ms, the CSVs' convention | none |

The test windows are 30 bars, so per-configuration differences are noisy, but
losing `trades_sma12` (the research's third-ranked feature) is consistently
worse. cse-dataset's OHLCV schema does carry a `trades` column. The platform
drops it on import. Restoring it end to end (importer, `daily_prices`, the
OHLCV API) and retraining as model 1.1 is the first follow-up.

## Consequences

- The platform gets real model output: one row per (stock, configuration,
  market day), with the test-window metrics alongside each probability, so a
  consumer can weigh a signal by how its configuration has performed recently.
- ADR 0006's consumer rules carry over. A stock with no row for the latest
  `data_as_of` is an empty state, not a guess. Surfaces need disclaimers. Every
  deterministic function must keep working with this job never having run. No
  API serves these rows yet; exposing them is separate work.
- The job's CPU time lands on the shared 2 GiB t3.small. It uses one core
  (`n_jobs=1`, BLAS capped), holds one stock at a time (~215 MB peak) and runs
  under a 768 MB cgroup limit in local Compose. The production job is enabled
  separately in server-owned configuration after the CSE EOD delivery
  (proposed 19:30 Asia/Colombo, weekdays; rollout tracked in issue #190).
- Upgrading XGBoost, the features or the grid changes the model. Re-run the
  parity check and bump `MODEL_VERSION`, so stored predictions stay
  attributable.
- The logistic regression does not converge within its default 100 iterations
  on the unscaled features, as in the research. It is kept for parity and
  recorded per model in `metrics.evaluation.logreg_converged`.

## References

- trading-wizard@321fa67: `machine_learning/long-trade-predictor.ipynb`,
  `run_long_trade_predictor.py`, `services/indicator_engine.py`
- [ADR 0004](./0004-pipeline-deployment-scheduled-lambda.md),
  [ADR 0006](./0006-ml-prediction-integration-scope.md)
- [`services/ml-prediction/README.md`](../../services/ml-prediction/README.md)
- [`docs/ops/deployment.md`](../ops/deployment.md), "Long-trade predictions"
- [Endpoint catalogue](../api/endpoint-catalogue-v0.md) §3, §5
