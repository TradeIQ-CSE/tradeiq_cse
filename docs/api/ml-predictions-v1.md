# Saved ML predictions API v1

This is the authenticated API for TradeIQ's AI insights screen. It reads saved
long-trade predictions; requests never train models, run inference, place orders,
or change stored results. It is separate from the public developer API, so an
`X-API-Key` does not grant access.

## Address and authentication

| Environment | Base URL |
|---|---|
| Local API | `http://localhost:8001` |
| Hosted application | `https://tradeiqcse.tech/api/ml` |

Append the paths below to the base URL. All `/predictions` routes require
`Authorization: Bearer <access_token>` issued by identity-auth, for either an
investor or administrator. Refresh and sign-in use the existing
[authentication contract](auth-v1.md); this service does not accept refresh tokens.

Tokens must use RS256, a trusted `kid`, issuer `tradeiq-identity-auth`, audience
`tradeiq-spa`, an unexpired numeric `exp` and a UUID `sub`. Optional `iat` and
`nbf` must be valid numeric times. Public keys follow auth-v1's SPKI SHA-256
key ID and rotation convention. Requests with invalid credentials receive 401.

Successful responses contain `data`. Errors use the shared
[error envelope](error-envelope.md). Authenticated responses use
`Cache-Control: private, no-store`. `X-Request-Id` correlates responses with
service logs, including the error body's `trace_id`.

## Routes

| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/predictions/configurations` | none | Saved configuration catalog and presentation default |
| GET | `/predictions/status` | none | Latest attempted and latest completed batch summaries |
| GET | `/predictions/{symbol}` | optional `config_key` | Latest available result for that symbol and configuration |
| GET | `/health` | none | Unauthenticated process health; unchanged response |

`symbol` is case-sensitive: 1–30 uppercase letters, digits, dots or hyphens,
starting with a letter or digit, for example `COMB.N0000`. Use the exact symbol
from market-trading's securities API. The ML service does not check the company
registry: a well-formed unknown symbol has the same empty response as a security
without a saved prediction.

`config_key` must be a key in the published catalog. Malformed keys, unsupported
keys when a catalog exists, unknown query parameters, and repeated query
parameters receive 400. Omission selects the catalog's `default_config_key`.
When no completed batch exists, a syntactically valid supplied key is accepted
and returns an empty result; omission yields `config_key: null`.

## Configuration catalog

```json
{
  "data": {
    "configurations": [
      {
        "config_key": "pt0.015_sl0.0075_H36_T30",
        "take_profit_pct": 0.015,
        "stop_loss_pct": 0.0075,
        "horizon_bars": 36,
        "test_days": 30
      }
    ],
    "default_config_key": "pt0.015_sl0.0075_H36_T30"
  }
}
```

The catalog comes from the latest completed batch's saved grid. The example
shows one entry; the current standard grid has 27 entries. Operator overrides
appear here after their batch completes. Entries are ordered by `config_key`.

| Field | Type | Meaning |
|---|---|---|
| `config_key` | string | Stable saved setup ID; pass it without editing |
| `take_profit_pct` | number | Fractional target increase: `0.015` means 1.5% |
| `stop_loss_pct` | number | Fractional loss barrier: `0.0075` means 0.75% |
| `horizon_bars` | positive integer | Maximum number of trading bars in the prediction question |
| `test_days` | positive integer | Final labeled bars held out for model evaluation; not the forecast horizon |

The presentation default is `pt0.015_sl0.0075_H36_T30` if available, otherwise
the first catalog entry. This is a UI starting point, not a claim that the
configuration is optimal. With no completed batch the response is
`{"data":{"configurations":[],"default_config_key":null}}`.

## Prediction response

```json
{
  "data": {
    "symbol": "COMB.N0000",
    "config_key": "pt0.015_sl0.0075_H36_T30",
    "availability": "available",
    "prediction": {
      "prediction_id": "3a7cdd37-afc5-42b6-b694-5f12522f04df",
      "symbol": "COMB.N0000",
      "configuration": {
        "config_key": "pt0.015_sl0.0075_H36_T30",
        "take_profit_pct": 0.015,
        "stop_loss_pct": 0.0075,
        "horizon_bars": 36,
        "test_days": 30
      },
      "prob_long": 0.7123,
      "is_long_signal": true,
      "confidence_margin": 0.3,
      "data_as_of": "2026-10-07",
      "generated_at": "2026-10-08T03:40:00Z",
      "model_version": "1.0.0",
      "batch": {
        "run_id": "86154945-e5d6-4f6b-bc68-e57c08c214be",
        "status": "partial",
        "started_at": "2026-10-08T03:00:00Z",
        "completed_at": "2026-10-08T03:40:00Z",
        "data_as_of": "2026-10-07",
        "symbols_requested": 288,
        "models_trained": 7000,
        "models_skipped": 776,
        "models_failed": 0
      }
    }
  }
}
```

IDs and values above are illustrative. All probability/barrier/margin fields
are JSON numbers, dates are `YYYY-MM-DD`, timestamps include a UTC offset, and
IDs are UUID strings.

| Field | Meaning |
|---|---|
| `prob_long` | Saved ensemble probability, 0–1, that entering at the `data_as_of` close reaches the profit barrier before the loss barrier within the horizon |
| `is_long_signal` | Saved binary long-trade signal; it is not a buy/sell/hold classification |
| `confidence_margin` | Saved decision margin between the long and non-long probabilities |
| `data_as_of` | This security result's last input bar date; show it next to the result |
| `generated_at` | Completion time of the batch that produced this result |
| `model_version` | Version that produced the saved result |
| `configuration` | The exact barriers, horizon and evaluation window used for this result |
| `batch` | Summary of the producing batch, with the same fields as status below |

The existing signal uses a margin of 0.3, equivalent to a 0.65 probability
threshold. Probabilities are stored rounded to four decimals, while the signal
was decided before rounding. Clients must use `is_long_signal` and must not
recalculate it from `prob_long`. A false flag means the model's long condition
was not met; it does not recommend selling or promise a price direction.
The probability is a model estimate, not a guaranteed return or validated
confidence interval. No independent probability-calibration claim is made.

### Selection and empty results

1. The latest completed long-trade batch selects the catalog and model version.
   Completed means status `succeeded` or `partial`, with a completion timestamp.
   Order is completion time, then start time, then run ID descending.
2. Within that model version, symbol and configuration, choose the greatest
   result `data_as_of`, then batch completion time and prediction ID descending.
   Successful results from a partial batch are eligible. Running, failed or
   incomplete batches are excluded, even when they already contain saved rows.
3. A result may therefore come from an earlier completed batch. Its own dates
   and producing batch are returned; the latest batch date is not substituted.
   Results from older model versions are not used to fill missing current ones.

A same-day batch rerun replaces the saved row's producing batch. During that
rerun, the replaced row is unavailable until the new batch completes. The API
returns an earlier available completed result, or an empty result if none exists.
It does not expose in-progress predictions or manufacture historical versions.

An empty result is HTTP 200, not a service failure:

```json
{
  "data": {
    "symbol": "COMB.N0000",
    "config_key": "pt0.015_sl0.0075_H36_T30",
    "prediction": null,
    "availability": "no_prediction"
  }
}
```

`availability` is `available`, `no_prediction` (a completed batch exists but
no eligible result matches), or `no_completed_batch` (no completed batch exists).
The API does not infer whether absence means insufficient history, a skipped
configuration, a failed fit, or an unknown symbol. Detailed training diagnostics
remain outside this API.

## Batch status

```json
{
  "data": {
    "latest_run": null,
    "latest_completed_run": null
  }
}
```

Each non-null entry has the batch fields shown in the prediction example.
`latest_run` is the most recently started long-trade attempt, regardless of
status. `latest_completed_run` uses the same completed selection as the catalog.
Either may be null. Status is one of `running`, `succeeded`, `partial`, `failed`.
A newer running or failed attempt does not hide eligible completed results.

`symbols_requested` is the batch's selected security count; trained, skipped
and failed counts refer to **symbol/configuration fits**, not unique securities.
Counts on a running batch are not a live progress indicator. A run can target a
subset of companies; completion is not evidence that the entire market is current.
Batch `data_as_of` is its maximum input date and may be null. It does not establish
freshness for a particular company. `completed_at` is null for an ongoing attempt.

## Errors

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Invalid input; non-empty `error.fields` identifies the field |
| 401 | `UNAUTHENTICATED` | Missing, invalid or expired access token; includes `WWW-Authenticate: Bearer` |
| 404 | `NOT_FOUND` | Unknown route |
| 405 | `METHOD_NOT_ALLOWED` | Method is not supported; no mutation endpoints exist |
| 503 | `DEPENDENCY_UNAVAILABLE` | Authentication configuration or database reads are unavailable |
| 500 | `INTERNAL` | Unexpected failure; only a generic message and trace ID are exposed |

The API exposes no training metrics, raw batch settings, features, source paths,
internal addresses, SQL or exception messages. Health is process liveness only:
`{"status":"ok","service":"ml-prediction"}` does not assert database readiness
or the existence of completed predictions.

## Configuration and deployment

The API reads `ML_DATABASE_URL`, `AUTH_JWT_PUBLIC_KEYS`, `NODE_ENV`, and
`ML_PREDICTION_CORS_ORIGINS`. The root `.env.example`, local service launcher
and local Compose service supply these. The API uses public verification keys
only; identity-auth retains the private signing key. Production rejects the
published development key. Missing or invalid required configuration leaves
health available and protected reads fail closed with 503.

Before deploying this API, the server-owned ML API service must receive its
trusted `AUTH_JWT_PUBLIC_KEYS` and `NODE_ENV=production`, alongside the existing
ML database URL. Updating application code alone does not add environment
variables to the server-owned Compose file. The existing `/api/ml/` proxy path
already forwards to this API. The batch job needs no JWT keys or API CORS setting.

`ML_PREDICTION_CORS_ORIGINS` is a comma-separated explicit allowlist, normally
`http://localhost:5173` for native development. Same-origin production needs no
CORS origins. Wildcards are not enabled, cookies are not accepted by these routes,
and browser preflight permits GET with Authorization and Content-Type.

Database reads use a two-connection pool, a five-second connection/pool/query
limit, and a read-only repeatable-read snapshot for each request. There are no
schema changes or model imports in the API runtime. A GET never starts the batch.

OpenAPI is available at `/openapi.json`, with interactive API documentation at
`/docs`. These describe the response schemas and bearer security; they contain
no database configuration. For example:

```sh
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  'http://localhost:8001/predictions/COMB.N0000?config_key=pt0.015_sl0.0075_H36_T30'
```

Boundary/authentication tests run in the ML service's standard pytest suite.
Real PostgreSQL read-selection and write-rejection tests are required in CI's
migration job through `ML_TEST_DATABASE_URL` and `ML_REQUIRE_DB_TESTS=1`.
