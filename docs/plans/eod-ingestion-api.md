# EOD ingestion API implementation plan

Saved on 2026-09-06 before implementation. This is the agreed first milestone
for moving validated current-day CSE data from `cse-dataset` into TradeIQ.

## Boundary

```text
CSE public endpoint
  -> cse-dataset fetch, normalisation and validation
  -> authenticated market-trading ingestion API
  -> market_data PostgreSQL database
  -> existing markets, execution-quote and valuation APIs
```

`market-trading` remains the sole owner and writer of `market_data`. Historical
2017-2025 loading remains a separate seed/import path. This milestone ends once
new EOD prices are visible through the existing market and paper-trading quote
APIs; the automatic order sweep and ML handoff remain separate work.

## Platform receiver

- Add a versioned internal endpoint for one complete EOD batch, plus endpoints
  for the latest successful receipt and receipt lookup by batch ID.
- Authenticate the endpoints with a dedicated bearer token supplied by
  environment configuration. Keep investor JWTs and public developer API keys
  outside this machine-to-machine boundary.
- Accept a versioned envelope containing batch identity, trading date, source
  and capture provenance, hashes, validation counts, security metadata and
  canonical OHLCV rows.
- Treat prices as four-decimal strings and volumes as integer strings at the
  boundary. Reject empty, mixed-date, duplicate-symbol, invalid-OHLC, invalid
  count/hash, unknown-contract and oversized batches.
- Write the run receipt, securities, calendar entry, daily prices, security
  coverage bounds and affected weekly/monthly aggregates atomically.
- Make retries idempotent. The same batch ID and digest returns the original
  receipt; the same ID with different content or changed data for an imported
  date returns a conflict.
- Persist enough provenance to trace a stored price to the dataset run. Record
  authenticated rejected batches and their validation details without changing
  canonical market data.

## Dataset sender

- Build a request only from the current invocation's accepted OHLCV output and
  matching metadata; never scan for an older accepted artifact as a fallback.
- Require the daily OHLCV validation result to be non-empty and fully accepted.
  Keep failures in other forward-data families independent.
- Generate a deterministic batch ID, canonical market digest and explicit
  request manifest. Retain the request, validation output and API receipt as
  GitHub Actions artifacts.
- Check the platform's latest receipt to carry stale-snapshot protection across
  fresh Action runners. Reject the same market digest on a different date.
- Retry timeouts, 429 and 5xx responses with bounded exponential backoff. Do not
  retry authentication, validation or conflict responses.
- Support replaying a retained request without fetching the CSE endpoint again.

## Delivery and validation

- Initially prove the integration against a temporary local/CI platform stack.
  Scheduled production delivery remains disabled until an HTTPS platform URL
  and credential are available through the AWS deployment work.
- Add unit tests for payload construction, authentication, validation,
  idempotency, conflicts, transaction rollback, stale snapshots and retries.
- Add an integration path that sends a real contract fixture through the Python
  sender into migrated PostgreSQL, then verifies the existing execution quote
  and valuation endpoints return the submitted close and `as_of` date.
- Keep index, corporate-action and listing-event ingestion, release artifacts,
  order sweep, ML handoff, Redis cache and broad admin data-ops APIs out of this
  first milestone.

## Related issues

- `tradeiq_cse` #94: bulk-write ingestion API
- `tradeiq_cse` #100: pipeline writes through the API
- `cse-dataset` #38-#40 and `tradeiq_cse` #31-#32: deferred versioned release
  and historical import path
- `tradeiq_cse` #101-#103: deferred simulation, order-sweep and ML handoffs
