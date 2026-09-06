# EOD ingestion API v1

`market-trading` owns the recurring EOD machine-to-machine boundary. The
validated daily collector sends one complete CSE session without receiving
`market_data` database credentials. Controlled historical seed/import jobs,
including `market-data-seed` and the legacy `pipeline` profile, remain direct
database-write exceptions.

## Authentication

All routes require `Authorization: Bearer <MARKET_INGESTION_TOKEN>`. When the
server token is unset, the write surface is disabled with `503`. Production
callers use HTTPS.

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/internal/v1/ingestions/eod` | Atomically ingest one EOD session |
| `GET` | `/internal/v1/ingestions/eod/latest` | Latest successful delivery receipt |
| `GET` | `/internal/v1/ingestions/eod/{batch_id}` | Receipt lookup after a retry or timeout |

The POST body is limited to 2 MiB and 2,000 prices. `batch_id`,
`raw_payload_hash`, and `market_digest` are lowercase SHA-256 hex strings.
Prices are non-negative decimal strings with at most four decimal places.
`open` may instead be `null` when the validated source has no reliable opening
price; `high`, `low`, and `close` are always required. Volume and shares
outstanding are non-negative integer strings. A request must contain metadata
for every canonical uppercase CSE symbol in `prices`.

```json
{
  "contract_version": "1",
  "batch_id": "<sha256>",
  "trade_date": "2026-09-04",
  "source": {
    "name": "cse_trade_summary_current",
    "captured_at": "2026-09-04T09:18:00Z",
    "source_date_method": "colombo_capture_date",
    "raw_payload_hash": "<sha256>",
    "producer_commit": "<git sha>",
    "action_run_url": "https://github.com/TradeIQ-CSE/cse-dataset/actions/runs/123"
  },
  "calendar": {
    "is_trading_day": true,
    "source": "operator verified CSE calendar 2026",
    "verified_at": "2026-09-01T00:00:00Z"
  },
  "validation": {
    "processed": 1,
    "accepted": 1,
    "rejected": 0,
    "repaired": 0
  },
  "securities": [
    {
      "symbol": "COMB.N0000",
      "company_name": "Commercial Bank of Ceylon PLC",
      "cse_code": "COMB.N0000",
      "shares_outstanding": "1467151555"
    }
  ],
  "prices": [
    {
      "symbol": "COMB.N0000",
      "open": "141.0000",
      "high": "144.0000",
      "low": "140.5000",
      "close": "142.7200",
      "volume": "512800",
      "validation_warnings": [],
      "ohlc_repaired": false
    }
  ],
  "market_digest": "<sha256 over canonical symbol and OHLCV rows, excluding date>"
}
```

A successful response returns the durable receipt under `data`. An identical
retry returns the same receipt with `replayed: true`. Reusing a batch ID with
different content, sending a second batch for an occupied date, or attempting
an implicit correction returns `409 CONFLICT`. Invalid content and a market
digest repeated from a different date are rejected without changing canonical
market tables.

Daily prices, provenance, security coverage and the affected weekly/monthly
aggregates commit in one transaction. Existing market and paper-trading quote
APIs see the new session immediately after that commit.
