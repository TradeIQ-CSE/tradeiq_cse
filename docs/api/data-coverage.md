# Data coverage and gaps

`GET /coverage` is a public market-data read. It returns the available date range
and gaps for prices and indices inside the usual `{ "data": ... }` envelope.
The endpoint catalogue documents its response fields.

## 1. Coverage

The backend detects extended missing weekday ranges and caches the result for
ten minutes. Price and index coverage are calculated separately. Known exchange
closures are classified using the curated closure list, rather than treated as
missing observations.

- `missing_data`: trading may have occurred, but observations are absent.
- `market_closed`: a documented exchange closure with no trading sessions.

Coverage changes as data is ingested. Historical coverage dates in examples are
illustrations, not a promise of current availability.

## 2. Backtest validation

Start and end dates cannot fall inside a missing-data gap. Rejected dates use
`DATE_IN_DATA_GAP` and include the affected field and gap bounds. A period whose
endpoints are supported but which crosses a gap is allowed.

The separate backtesting policy limits new runs through `BACKTEST_MAX_DATE`,
currently 2025-12-31. Markets and paper trading retain their own data coverage.
Known exchange closures do not block a backtest. See
[backtesting-strategies.md](backtesting-strategies.md) for strategy semantics.

## 3. Frontend helpers

The shared gap helpers classify dates and intersect gaps with the selected
period. The period picker disables unavailable endpoints and explains a range
that crosses missing data. Both price and index screens use the same helpers.

## 4. Charts

Charts reserve space for gaps and split the series at missing observations.
They draw a labelled band instead of inventing prices, joining across missing
sessions or inserting zero values. Known closures use the same geometry with
a different label. A gap outside the displayed period produces no band.

## 5. Backtest period

The picker combines coverage with the backend's date policy. Extending the
policy after historical data is imported needs a configuration change rather
than a frontend calendar edit. If policy loading fails, the frontend retains
its conservative December 2025 fallback; the backend remains authoritative.

## 6. Results

The equity curve contains actual processed sessions only. It may split across
an intersecting gap, but gaps do not create synthetic observations or alter
the strategy's re-entry reference. Existing saved calculations remain intact.
