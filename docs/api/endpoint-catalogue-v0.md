# Endpoint Catalogue v0 — Market Data (SPA slice)

| | |
|---|---|
| **Status** | v0 — contract for FE/BE alignment (week 1) |
| **Owner** | `market-trading` service (NestJS) |
| **Linear / GitHub** | TIQ-41 / issue #4 |
| **SRS refs (v1.1)** | 3.1.1.1 (public markets), 3.1.2.1–3.1.2.3 (APIs, auth, errors), 3.1.3 (public developer API) |
| **Error format** | [error-envelope.md](./error-envelope.md) |

## 1. Scope

These four endpoints are the **week-1 market-data slice** consumed by the React SPA:

| Method | Path | Purpose |
|---|---|---|
| GET | `/securities` | Securities list/browse |
| GET | `/securities/{symbol}` | Single security detail |
| GET | `/securities/{symbol}/ohlcv` | OHLCV bars (daily/weekly/monthly) |
| GET | `/market/overview` | Top gainers / losers / most-active |

They are the **web application's internal API** (SRS 3.1.2.1). The **public developer
API** (SRS 3.1.3) is a *separate, versioned* surface scheduled for Phase 8 — nothing
here is versioned, and no `/v1` prefix is introduced in v0.

All four endpoints are **public market-data reads**: no authentication, read-only
(SRS 3.1.1.1, 3.1.2.2). Served by `market-trading` from the `market_data` database
(schema v2; ERD v2).

## 2. Conventions

### 2.1 Response envelopes

- **Success:** `{ "data": …, "meta": … }` — `meta` only where defined below.
- **Error:** `{ "error": … }` — see [error-envelope.md](./error-envelope.md).
  `data` and `error` never co-occur.

### 2.2 Types and formats

| Concept | Format |
|---|---|
| Dates | `YYYY-MM-DD` (ISO 8601 calendar date) |
| Datetimes | RFC 3339 UTC, e.g. `2026-08-11T04:30:00Z` |
| Prices | JSON number, ≤4 decimal places (`numeric(12,4)`) |
| Percentages | JSON number, ≤2 decimal places, unit = percent (e.g. `0.47` = 0.47 %) |
| Volumes / share counts | JSON integer |
| `symbol` | CSE ticker, uppercase, e.g. `JKH.N0000`. Path/query input is matched case-insensitively; responses always carry the canonical uppercase form |

Internal database identifiers (`security_id`, uuids) are **never** exposed.
Securities are identified by `symbol` only.

Monetary display formatting (`Rs.` prefix, 2 dp) is a frontend concern; the API
always returns raw numeric values.

### 2.3 Pagination

List endpoints accept:

| Param | Type | Default | Constraints |
|---|---|---|---|
| `page` | int | `1` | ≥ 1 |
| `page_size` | int | `50` | 1–200 |

and return `meta`:

```json
"meta": { "page": 1, "page_size": 50, "total": 312 }
```

`total` is the full matching row count (so FE can render page controls without a
second query). Out-of-range pages return `200` with an empty `data` array.

### 2.4 End-of-day semantics

The platform has **EOD data only** (SRS 3.1.1.1: no live market-status indicator).
Everywhere a "latest" value appears it is relative to `as_of` = the most recent
trading day in `trading_calendar` that has price data. Requests made on weekends,
holidays, or before the day's ingestion completes simply return the latest
completed trading day — this is normal operation, not an error.

### 2.5 Rate limiting

Requests are rate-limited per client IP inside the service. Over-limit requests
receive `429 RATE_LIMITED` with `reset_at` in the error body and a `Retry-After`
header (model per SRS 3.1.3.3). Normal SPA usage is far below the limit; FE only
needs to handle the 429 envelope gracefully.

---

## 3. `GET /securities`

Securities browser list.

### Query parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `sector` | string | — | Filter by GICS sector code (e.g. `4010`). Must be a code present in the sectors reference data |
| `search` | string | — | Case-insensitive match: prefix on `symbol`, substring on `company_name`. Min 1 char |
| `sort` | enum | `symbol` | `symbol` \| `company_name` (ascending) |
| `page`, `page_size` | — | — | See §2.3 |

### 200 — example

`GET /securities?sector=4010&page_size=2`

```json
{
  "data": [
    {
      "symbol": "COMB.N0000",
      "company_name": "Commercial Bank of Ceylon PLC",
      "sector": { "gics_code": "4010", "name": "Banks" },
      "shares_outstanding": 1467151555,
      "data_from": "2017-01-02",
      "data_to": "2025-12-31",
      "price": 89.70,
      "change": -0.80,
      "change_pct": -0.89,
      "volume": 512800,
      "pe_ratio": 6.2
    },
    {
      "symbol": "HNB.N0000",
      "company_name": "Hatton National Bank PLC",
      "sector": { "gics_code": "4010", "name": "Banks" },
      "shares_outstanding": 565107403,
      "data_from": "2017-01-02",
      "data_to": "2025-12-31",
      "price": 195.50,
      "change": 1.20,
      "change_pct": 0.62,
      "volume": 134200,
      "pe_ratio": 6.9
    }
  ],
  "meta": { "page": 1, "page_size": 2, "total": 3 }
}
```

### Field notes

- `data_from` / `data_to`: coverage window of price data for this security.
- `shares_outstanding`: `null` when unknown (excluded from market-cap filtering —
  see §6).
- `sector`: `null` when the security is unclassified.
- `price`, `change`, `change_pct`, `volume`: same "latest vs. previous trading
  day" semantics as `/securities/{symbol}`'s `latest` object (§4) — as-of the
  most recent trading day with price data (§2.4). All `null` when the security
  has no price history; `change`/`change_pct` individually `null` on the first
  day of coverage (no previous trading day).
- `pe_ratio`: currently valid P/E (`valid_to IS NULL` row in `market_ratios`),
  else `null`. Added as a v0.1 extension for the Browse Securities table
  (Figma `Market` frame) — additive and nullable, doesn't break existing
  consumers of the v0 shape.

### Errors

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Bad `sector` code, `search` empty, `sort` not in enum, pagination out of range |

---

## 4. `GET /securities/{symbol}`

Single-security detail.

### 200 — example

`GET /securities/JKH.N0000`

```json
{
  "data": {
    "symbol": "JKH.N0000",
    "company_name": "John Keells Holdings PLC",
    "cse_code": "JKH.N0000",
    "sector": { "gics_code": "2010", "name": "Capital Goods" },
    "shares_outstanding": 1513637385,
    "data_from": "2017-01-02",
    "data_to": "2025-12-31",
    "listing_status": "listed",
    "latest": {
      "trade_date": "2025-12-31",
      "close": 22.43,
      "change": 0.18,
      "change_pct": 0.81,
      "volume": 1631334
    },
    "ratios": {
      "valid_from": "2025-10-01",
      "pe_ratio": 12.34,
      "pb_ratio": 1.23
    }
  }
}
```

### Field notes

- `listing_status`: derived from the most recent `listing_events` row —
  `listed` \| `suspended` \| `delisted` (a `resumed` event reports as `listed`).
- `latest`: close, change and % change vs the **previous trading day**, plus
  volume. Whole object is `null` when the security has no price data;
  `change`/`change_pct` are individually `null` when there is no previous
  trading day (first day of coverage).
- `ratios`: currently valid P/E and P/B (`valid_to IS NULL` row), else `null`.

### Errors

| Status | Code | When |
|---|---|---|
| 404 | `SECURITY_NOT_FOUND` | No security with that symbol (incl. delisted symbols never in the dataset) |

---

## 5. `GET /securities/{symbol}/ohlcv`

OHLCV bar series for charting.

### Query parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `timeframe` | enum | `daily` | `daily` \| `weekly` \| `monthly` |
| `from` | date | `to` − 1 year | Range start (inclusive) |
| `to` | date | `as_of` | Range end (inclusive) |

Validation: `from` must be ≤ `to`; both must be valid calendar dates.

### 200 — daily example

`GET /securities/JKH.N0000/ohlcv?timeframe=daily&from=2025-01-01&to=2025-01-03`

```json
{
  "data": {
    "symbol": "JKH.N0000",
    "timeframe": "daily",
    "from": "2025-01-01",
    "to": "2025-01-03",
    "bars": [
      {
        "date": "2025-01-02",
        "open": 22.48,
        "high": 22.59,
        "low": 22.13,
        "close": 22.43,
        "adjusted_close": 22.31,
        "volume": 1631334
      }
    ]
  }
}
```

### 200 — weekly/monthly bar shape

Weekly/monthly bars come from `price_aggregates` and use period fields instead of
`date`; there is no `adjusted_close`:

```json
{
  "period_start": "2025-01-01",
  "period_end": "2025-01-05",
  "open": 22.31,
  "high": 22.75,
  "low": 22.1,
  "close": 22.6,
  "volume": 5123489
}
```

### Field notes

- Bars are **ascending** by date/period; only days/periods with data are returned
  (no gap-filling — markets close on weekends/holidays).
- `open` and `adjusted_close` may be `null` on daily bars; `high`, `low`,
  `close`, `volume` are always present.
- A range with no data returns `200` with `"bars": []` (e.g. pre-listing period)
  — not an error.

### Errors

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | `timeframe` not in enum; malformed `from`/`to`; `from` > `to` |
| 404 | `SECURITY_NOT_FOUND` | Unknown symbol |

---

## 6. `GET /market/overview`

Gainers / losers / most-active tables for the public markets landing page
(SRS 3.1.1.1), computable with its two filters.

### Query parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `sector` | string | — | Restrict to a GICS sector code |
| `market_cap` | enum | — | `large` \| `mid` \| `small` — bands below |
| `limit` | int | `10` | Rows per list, 1–50 |

**Market-cap bands** (computed as `shares_outstanding × latest close`):

| Band | Market capitalisation |
|---|---|
| `large` | ≥ Rs 20 B (20,000,000,000) |
| `mid` | ≥ Rs 5 B and < Rs 20 B |
| `small` | < Rs 5 B |

> ⚠️ **v0 proposal, pending sign-off.** SRS 3.1.1.1 requires band filtering
> but does not fix thresholds; these are tunable server-side constants. Securities
> with unknown `shares_outstanding` are excluded only while a `market_cap` filter
> is applied.

### 200 — example

`GET /market/overview?limit=2`

```json
{
  "data": {
    "as_of": "2025-12-31",
    "gainers": [
      { "rank": 1, "symbol": "COMB.N0000", "company_name": "Commercial Bank of Ceylon PLC", "close": 145.81, "change": 2.19, "change_pct": 1.52, "volume": 1584492 },
      { "rank": 2, "symbol": "JKH.N0000", "company_name": "John Keells Holdings PLC", "close": 22.43, "change": 0.18, "change_pct": 0.81, "volume": 1631334 }
    ],
    "losers": [
      { "rank": 1, "symbol": "SAMP.N0000", "company_name": "Sampath Bank PLC", "close": 83.05, "change": -0.96, "change_pct": -1.14, "volume": 1402906 }
    ],
    "most_active": [
      { "rank": 1, "symbol": "JKH.N0000", "company_name": "John Keells Holdings PLC", "close": 22.43, "change": 0.18, "change_pct": 0.81, "volume": 1631334 }
    ]
  }
}
```

### Field notes

- `as_of`: the trading day all three lists describe (see §2.4).
- Ranking: `gainers` by `change_pct` desc, `losers` by `change_pct` asc,
  `most_active` by `volume` desc; ties broken by `volume` desc then `symbol` asc.
- Lists are **rank-based, not sign-based**: in a uniformly down market the
  "gainers" list still returns the top `limit` rows (their `change_pct` may be
  negative). FE should render from the data, not assume sign.
- `change`/`change_pct` vs the previous trading day; `null` when no previous day
  exists (such rows sink to the bottom of gainers/losers, and are excluded from
  neither list).
- Each list may be shorter than `limit` near listing/epoch boundaries; `[]` is
  valid.

### Errors

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | `market_cap` not in enum; bad `sector` code; `limit` out of range |

---

## 7. Error summary

All errors use the envelope in [error-envelope.md](./error-envelope.md):

| Status | Code | Applies to |
|---|---|---|
| 400 | `VALIDATION_FAILED` | All endpoints — offending fields enumerated in `error.fields[]` (SRS 3.1.2.3) |
| 404 | `SECURITY_NOT_FOUND` | `/securities/{symbol}`, `/securities/{symbol}/ohlcv` |
| 429 | `RATE_LIMITED` | All endpoints — see §2.5 |
| 500 | `INTERNAL` | Unconditional fallback; generic message + `trace_id` only |

## 8. Known v0 simplifications

1. **No `GET /sectors` endpoint.** Filter options for the segment control are
   derivable from the distinct `sector` objects in `GET /securities` responses.
   A dedicated reference endpoint is a candidate for the next contract revision
   if FE finds derivation awkward.
2. **Market-cap thresholds are proposed constants** (§6), pending sign-off.
3. **No API versioning** on this internal surface; versioning arrives with the
   separate public developer API (SRS 3.1.3, Phase 8).
4. **Ratios coverage:** P/E and P/B only, matching schema v2 `market_ratios`.
