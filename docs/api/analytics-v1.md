# Analytics API v1

| | |
|---|---|
| **Status** | Binding |
| **Owner** | `market-trading` |
| **Error format** | [error-envelope.md](./error-envelope.md) |

## 1. Scope

Read-only views over the caller's own saved backtests and paper-trading
portfolios, each set beside the market over the same days. Nothing here
writes, and nothing changes how orders fill or backtests run.

## 2. Access

Every route requires `Authorization: Bearer <token>` and answers only for the
token's user. Another user's portfolio is `404 PORTFOLIO_NOT_FOUND`, the same
answer as a missing one (paper-trading-v1.md §9.1).

## 3. Endpoints

### 3.1 `GET /analytics/backtests?page=1&page_size=20`

The caller's saved runs, newest first. `page_size` is 1–50.

```json
{
  "data": [
    {
      "id": "…",
      "status": "completed",
      "symbol": "JKH.N0000",
      "company_name": "John Keells Holdings PLC",
      "start_date": "2025-01-01",
      "end_date": "2025-12-31",
      "created_at": "2026-09-20T04:00:00.000Z",
      "starting_capital": 100000,
      "final_equity": 112400,
      "total_return_pct": 12.4,
      "trade_count": 6,
      "max_drawdown_pct": -8.15,
      "aspi_return_pct": 9.02
    }
  ],
  "meta": { "page": 1, "page_size": 20, "total": 1 }
}
```

- `final_equity`, `total_return_pct`, `trade_count` and `max_drawdown_pct` are
  `null` until the run completes.
- `trade_count` counts trade-ledger entries, so a buy and its sell are two.
- `max_drawdown_pct` is the largest fall from a previous high in the run's
  equity curve, as a negative percentage (`0` when it never fell).
- `aspi_return_pct` is ASPI's change from its latest level on or before
  `start_date` to its latest level on or before `end_date`. A level counts
  only if it is at most 10 calendar days old, so a data gap at either end
  makes this `null` rather than measuring from a level months earlier.

### 3.2 `GET /analytics/portfolios/{portfolioId}/performance`

The portfolio's value at every session's close from its first activity to
the latest session, beside each benchmark over the same days.

```json
{
  "data": {
    "portfolio_id": "…",
    "starting_capital": 1000000,
    "start_date": "2026-09-01",
    "as_of": "2026-09-24",
    "benchmarks": [
      { "code": "ASPI", "name": "All Share Price Index" },
      { "code": "SL20", "name": "S&P Sri Lanka 20" }
    ],
    "points": [
      { "date": "2026-09-01", "value": 1000000, "return_pct": 0,
        "benchmarks": { "ASPI": 0, "SL20": 0 } }
    ]
  }
}
```

- **Value** is rebuilt for each day from what the portfolio held that day:
  starting capital, plus every cash movement on or before the day, plus each
  holding at its latest close on or before the day. Cash and shares both move
  on the fill date, so a trade never counts twice.
- **Start** is the session on or before the portfolio's first activity
  (its opening cash or first fill, whichever is earlier), so an order placed
  today, which fills at the previous close, is inside the series.
- **Benchmarks** are measured from their level on the first day (or the latest
  level before it) and carried forward over days without a value, for at most
  10 calendar days: enough for a weekend and holidays, never a data gap. A
  benchmark with no usable level on the first day, or on a given day, is
  `null` there.
- `points` is empty, and `start_date` and `as_of` are `null`, when there are
  no prices to value against.
