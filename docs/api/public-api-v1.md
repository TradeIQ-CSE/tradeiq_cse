# Public developer API v1

| | |
|---|---|
| **Status** | Binding |
| **Owner** | `market-trading` |
| **SRS ref** | 3.1.3 (public developer API) · 3.4.3 (100+ active keys) · 3.4.5 (authentication security, per-key rate limits) · 3.4.6 (transport and storage security) · 3.4.8 (input validation) · 3.6.1 (Redis) · 3.7.3 (hosted docs) · 3.9.1 (key management on Settings / Profile) · 3.10.1 (keys in the market-data store) |
| **Error format** | [error-envelope.md](./error-envelope.md) |

## 1. Scope

A separate, versioned, read-only REST surface for external developers (SRS
3.1.3.1) — distinct from the SPA's internal API in
[endpoint-catalogue-v0.md](./endpoint-catalogue-v0.md), which carries no
version and no key. It exposes the securities list, per-security OHLCV,
index series, and the latest end-of-day dataset, all as public market-data
reads with no per-user data.

Base URL: `https://tradeiqcse.tech/api/public/v1`. nginx maps every request
under `/api/public/…` to `market-trading`'s `/public/…` routes; the `v1`
segment passes through unchanged, so it is part of every path below.

Changes inside v1 are additive only — a new optional field or query
parameter never breaks an existing client. Anything that would (removing or
renaming a field, changing a type, tightening a validation rule) ships as
`/api/public/v2` instead, alongside v1, not in place of it.

Key management (§7) is a different, internal surface: it authenticates with
the same session token as the rest of the SPA, not an API key, and is reached
at `/api/market/developer/…`, not under `/api/public/`.

## 2. Authentication

Every `/api/public/v1` route requires a header:

```
X-API-Key: tiq_oHBvRPOIvGrv5iFlbCBFNOgmBjMtpsiaOclRz3Aw
```

The key is `tiq_` followed by 40 base62 characters (`A`–`Z`, `a`–`z`, `0`–`9`).

A missing header, a malformed key (wrong shape), an unknown key, and a
revoked key all answer the same way:

```json
{ "error": { "code": "UNAUTHENTICATED",
             "message": "A valid API key is required",
             "trace_id": "…" } }
```

`401 UNAUTHENTICATED` in every case. The response never says which of the
four it was, so it can't reveal whether a key ever existed.

A key is never accepted from a query string, only the header, so it can't
end up in a browser history, a proxy access log, or a referrer. All traffic
is HTTPS; there is no unencrypted fallback.

## 3. Rate limit

100 requests per key per UTC clock hour by default, configurable per
deployment (`PUBLIC_API_HOURLY_LIMIT`, SRS 3.5.4). Every request that
resolves to an active key counts against its hour, including ones that go on
to answer with a 4xx (a bad symbol, a validation failure) — only requests
that never resolve a key (§2's `401`) are free.

Once a key is resolved, every response — success or 4xx — carries:

| Header | Meaning |
|---|---|
| `X-RateLimit-Limit` | The hourly limit in force for this key |
| `X-RateLimit-Remaining` | Requests left in the current UTC clock hour |
| `X-RateLimit-Reset` | RFC 3339 UTC instant the count resets (the start of the next hour) |

Past the limit:

```json
{ "error": { "code": "RATE_LIMITED", "message": "Rate limit exceeded.",
             "reset_at": "2026-09-26T10:00:00Z", "trace_id": "…" } }
```

`429 RATE_LIMITED` per [error-envelope.md](./error-envelope.md)'s extension,
with a `Retry-After` header in seconds mirroring `reset_at`.

This is on top of, not instead of, the per-IP edge limit nginx already
applies to every `/api/` route (catalogue §2.5) — a client can still be
edge-limited even with requests to spare on its key.

If the counter itself is briefly unavailable, a request is still served
rather than rejected; this needs no client handling.

## 4. CORS

Every `/api/public/v1` route allows any origin and answers only `GET`; the
key travels in a header, never a cookie, so there is nothing on this surface
for another site's script to borrow. `X-API-Key` is a non-simple header, so
browsers send a preflight `OPTIONS` request first — answered without a key
and not counted against the limit. Responses carry:

| Header | Value |
|---|---|
| `Access-Control-Allow-Origin` | `*` |
| `Access-Control-Allow-Methods` | `GET` |
| `Access-Control-Allow-Headers` | `X-API-Key` |
| `Access-Control-Expose-Headers` | `X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After` |

Without the expose header, browser code can't read the rate-limit headers on
a cross-origin response.

## 5. Pagination

List resources take `page` (≥ 1, default `1`) and `page_size`, and return

```json
"meta": { "page": 1, "page_size": 50, "total": 312 }
```

exactly as [endpoint-catalogue-v0.md](./endpoint-catalogue-v0.md) §2.3.
`page_size` bounds and defaults differ per resource — see each section below.
An out-of-range page answers `200` with an empty `data` array, not an error.

Dates, datetimes, prices, percentages and `symbol` follow the same formats as
[endpoint-catalogue-v0.md](./endpoint-catalogue-v0.md) §2.2.
No internal identifier (`security_id`, `api_key_id`, or any uuid) ever
appears in a public response (SRS 3.4.8) — only `symbol` and index `code`
identify things.

## 6. Resources

All six are `GET`, read-only, and share the errors in §2–§3 (`401`, `429`)
in addition to the table under each one.

### 6.1 `GET /securities`

The securities list, descriptive attributes only — no price. For price and
change on a specific day, see §6.6 `/eod` below.

| Param | Type | Default | Description |
|---|---|---|---|
| `search` | string | — | Case-insensitive: prefix match on `symbol`, substring match on `company_name`. Minimum 1 character |
| `sector` | string | — | GICS sector code (e.g. `4010`); must match a known sector |
| `page` | int | `1` | ≥ 1 |
| `page_size` | int | `50` | 1–200 |

`GET /securities?sector=4010&page_size=2`

```json
{
  "data": [
    {
      "symbol": "COMB.N0000",
      "company_name": "Commercial Bank of Ceylon PLC",
      "cse_code": "COMB.N0000",
      "sector": { "gics_code": "4010", "name": "Banks" },
      "listing_status": "listed",
      "shares_outstanding": 1467151555,
      "data_from": "2017-01-02",
      "data_to": "2025-12-31"
    },
    {
      "symbol": "HNB.N0000",
      "company_name": "Hatton National Bank PLC",
      "cse_code": "HNB.N0000",
      "sector": { "gics_code": "4010", "name": "Banks" },
      "listing_status": "listed",
      "shares_outstanding": 565107403,
      "data_from": "2017-01-02",
      "data_to": "2025-12-31"
    }
  ],
  "meta": { "page": 1, "page_size": 2, "total": 3 }
}
```

**Field notes**

- `cse_code` is the code CSE publishes for the security, usually identical
  to `symbol`. `null` when not recorded.
- `sector` is `null` for an unclassified security.
- `shares_outstanding` is `null` when unknown.
- `data_from` / `data_to` are the security's price-coverage window; both
  `null` when it has no price history yet.
- `listing_status` is `listed`, `suspended` or `delisted`.

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Bad `sector` code, empty `search`, or `page` below 1 or `page_size` outside its bounds |
| 401 | `UNAUTHENTICATED` | See §2 |
| 429 | `RATE_LIMITED` | See §3 |

### 6.2 `GET /securities/{symbol}`

One security, the same fields as §6.1's list.

`GET /securities/JKH.N0000`

```json
{
  "data": {
    "symbol": "JKH.N0000",
    "company_name": "John Keells Holdings PLC",
    "cse_code": "JKH.N0000",
    "sector": { "gics_code": "2010", "name": "Capital Goods" },
    "listing_status": "listed",
    "shares_outstanding": 1513637385,
    "data_from": "2017-01-02",
    "data_to": "2025-12-31"
  }
}
```

`symbol` is matched case-insensitively; the response always carries the
canonical uppercase form.

**Errors**

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | See §2 |
| 404 | `SECURITY_NOT_FOUND` | No security with that symbol |
| 429 | `RATE_LIMITED` | See §3 |

### 6.3 `GET /securities/{symbol}/ohlcv`

Bar series at daily, weekly or monthly resolution.

| Param | Type | Default | Description |
|---|---|---|---|
| `timeframe` | enum | `daily` | `daily` \| `weekly` \| `monthly` |
| `from` | date | `to` − 1 year | Range start (inclusive) |
| `to` | date | latest completed session | Range end (inclusive) |
| `page` | int | `1` | ≥ 1 |
| `page_size` | int | `500` | 1–1000 |

Validation: `from` must be on or before `to`; both must be valid calendar
dates; `timeframe` must be one of the three values.

`GET /securities/JKH.N0000/ohlcv?timeframe=daily&from=2025-01-01&to=2025-01-03`

```json
{
  "data": {
    "symbol": "JKH.N0000",
    "timeframe": "daily",
    "from": "2025-01-01",
    "to": "2025-01-03",
    "bars": [
      { "date": "2025-01-02", "open": 22.48, "high": 22.59, "low": 22.13,
        "close": 22.43, "volume": 1631334 }
    ]
  },
  "meta": { "page": 1, "page_size": 500, "total": 1 }
}
```

Weekly and monthly bars use `period_start` / `period_end` instead of `date`:

```json
{ "period_start": "2025-01-06", "period_end": "2025-01-10",
  "open": 22.43, "high": 22.84, "low": 21.75, "close": 22.73,
  "volume": 5186409 }
```

**Field notes**

- Bars are ascending by date/period; only days or periods with data are
  returned, with no gap-filling.
- `open` can be `null` on any bar — the source data doesn't carry a reliable
  opening price for every session (weekly/monthly reports `null` when no day
  inside the bar has one). `high`, `low`, `close` and `volume` are always
  present.
- A range with no bars answers `200` with `"bars": []` and `meta.total: 0` —
  not an error (e.g. a range before the security's `data_from`).
- `page`/`page_size` paginate the `bars` array; `meta.total` is the number of
  bars in the requested range, not the whole series.

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | `timeframe` not in enum; malformed `from`/`to`; `from` after `to`; `page` below 1 or `page_size` outside its bounds |
| 401 | `UNAUTHENTICATED` | See §2 |
| 404 | `SECURITY_NOT_FOUND` | Unknown symbol |
| 429 | `RATE_LIMITED` | See §3 |

### 6.4 `GET /indices`

Every index, each at its own latest value.

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | int | `1` | ≥ 1 |
| `page_size` | int | `50` | 1–200 |

`GET /indices?page_size=2`

```json
{
  "data": [
    { "code": "ASPI", "name": "All Share Price Index",
      "latest": { "date": "2025-01-10", "close": 15736.91,
                  "change": -87.4, "change_pct": -0.55 } },
    { "code": "SL20", "name": "S&P Sri Lanka 20",
      "latest": { "date": "2025-01-10", "close": 4734.44,
                  "change": -27.87, "change_pct": -0.59 } }
  ],
  "meta": { "page": 1, "page_size": 2, "total": 4 }
}
```

**Field notes**

- Ordered by `code`. The current release carries `ASPI`, `ASTRI`, `SL20`
  and `SL20TRI` — index codes are exact, and `SL20TRI` is a different
  series from `SL20`.
- Indices are close-only: no official source publishes an index open, high
  or low.
- Each index is valued at its own latest date; two indices can show
  different dates when the exchange didn't publish one of them on the same
  day.
- `change`/`change_pct` compare `close` with the index's previous value,
  which is normally the previous session but can be older across a gap in
  the series (see [endpoint-catalogue-v0.md](./endpoint-catalogue-v0.md) §9
  for how that comparison is made). Both are `null` when there is no
  previous value.
- `latest` is `null` for an index with no value at all.

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | `page` below 1 or `page_size` outside its bounds |
| 401 | `UNAUTHENTICATED` | See §2 |
| 429 | `RATE_LIMITED` | See §3 |

### 6.5 `GET /indices/{code}/values`

Daily close series for one index.

| Param | Type | Default | Description |
|---|---|---|---|
| `from` | date | `to` − 1 year | Range start (inclusive) |
| `to` | date | latest date any index has a value for | Range end (inclusive) |
| `page` | int | `1` | ≥ 1 |
| `page_size` | int | `500` | 1–1000 |

Validation: `from` must be on or before `to`; both must be valid calendar
dates; `code` must be at most 20 characters.

`GET /indices/SL20/values?from=2025-01-02&to=2025-01-03`

```json
{
  "data": {
    "code": "SL20",
    "name": "S&P Sri Lanka 20",
    "from": "2025-01-02",
    "to": "2025-01-03",
    "values": [
      { "date": "2025-01-02", "close": 4732.06 },
      { "date": "2025-01-03", "close": 4732.58 }
    ]
  },
  "meta": { "page": 1, "page_size": 500, "total": 2 }
}
```

**Field notes**

- `code` is matched case-insensitively but otherwise exactly; the response
  carries the canonical uppercase code.
- Values are ascending by date; only dates with a value are returned, with
  no gap-filling and no carried-forward value.
- A range with no values answers `200` with `"values": []` and
  `meta.total: 0` — not an error.

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Malformed `from`/`to`; `from` after `to`; `code` longer than 20 characters; `page` below 1 or `page_size` outside its bounds |
| 401 | `UNAUTHENTICATED` | See §2 |
| 404 | `INDEX_NOT_FOUND` | `code` matches no index |
| 429 | `RATE_LIMITED` | See §3 |

### 6.6 `GET /eod`

The full end-of-day dataset for one session: every security's OHLCV and
change on that day.

| Param | Type | Default | Description |
|---|---|---|---|
| `date` | date | latest completed session | The session to return |
| `page` | int | `1` | ≥ 1 |
| `page_size` | int | `200` | 1–500 |

`GET /eod?page_size=2`

```json
{
  "data": [
    { "symbol": "COMB.N0000", "date": "2025-12-31",
      "open": 90.10, "high": 90.55, "low": 88.90, "close": 89.70,
      "volume": 512800, "change": -0.80, "change_pct": -0.89 },
    { "symbol": "HNB.N0000", "date": "2025-12-31",
      "open": 194.00, "high": 196.20, "low": 193.50, "close": 195.50,
      "volume": 134200, "change": 1.20, "change_pct": 0.62 }
  ],
  "meta": { "page": 1, "page_size": 2, "total": 289, "as_of": "2025-12-31" }
}
```

**Field notes**

- One row per security that traded on `meta.as_of`, ordered by `symbol`.
- `meta.as_of` echoes the session actually returned — the default's latest
  completed session ([endpoint-catalogue-v0.md](./endpoint-catalogue-v0.md)
  §2.4), or the requested `date` when it is itself a session.
- `change`/`change_pct` compare with the security's previous session, the
  same semantics as `/securities/{symbol}`'s `latest` object in the internal
  catalogue (§4); `null` when there is no previous session.
- `open` can be `null`, same convention as §6.3's bars.
- **`date` with no session** (a weekend, a holiday, or a day with no
  prices) answers `200` with `"data": []`, `meta.total: 0` and
  `meta.as_of: null` — the same "no data for this range, not an error"
  pattern §6.3 and §6.5 already use for an empty OHLCV or index-values range,
  rather than silently substituting an earlier session the caller didn't
  ask for. A malformed `date` is a `400`.

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Malformed `date`; `page` below 1 or `page_size` outside its bounds |
| 401 | `UNAUTHENTICATED` | See §2 |
| 429 | `RATE_LIMITED` | See §3 |

## 7. Key management

An internal, JWT-authenticated surface served by `market-trading` and
reached from the SPA's Settings page (SRS 3.9.1), at
`/api/market/developer/…` — not part of `/api/public/v1` and not
key-authenticated. Every route requires `Authorization: Bearer <token>` and
acts only on the signed-in user's own key; there is never a key id in a path
or body.

### 7.1 `GET /developer/key`

The active key's metadata, or `null` when the user has none.

```json
{ "data": { "prefix": "tiq_oHBv", "label": "My backtesting script",
            "created_at": "2026-08-01T04:00:00.000Z",
            "last_used_at": "2026-09-25T14:12:00.000Z" } }
```

```json
{ "data": null }
```

`prefix` is the key's first 8 characters (`tiq_` plus 4) — enough to
recognise it in a list without exposing the secret. `last_used_at` is `null`
until the key's first use.

**Errors**

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid session token |

### 7.2 `POST /developer/key`

Body: `{ "label": "My backtesting script" }`

`label` is optional. It is trimmed, may be up to 100 characters, and an
empty label is stored as `null`.

`201 Created`:

```json
{ "data": { "key": "tiq_oHBvRPOIvGrv5iFlbCBFNOgmBjMtpsiaOclRz3Aw",
            "prefix": "tiq_oHBv", "label": "My backtesting script",
            "created_at": "2026-09-26T09:00:00.000Z" } }
```

`key` is the full secret and appears only here and in §7.3's response —
never again, and never in `GET /developer/key`.

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | `label` longer than 100 characters |
| 401 | `UNAUTHENTICATED` | Missing or invalid session token |
| 409 | `API_KEY_EXISTS` | The user already has an active key — regenerate or revoke it first |

### 7.3 `POST /developer/key/regenerate`

Revokes the active key and issues a new one in one transaction — the old
secret stops working immediately. It answers `201 Created` with §7.2's
request body and response. The label carries over unless the body sets one
(a blank label clears it).

If the user has no active key, this behaves exactly like §7.2: a new key is
issued straight away rather than erroring.

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | `label` longer than 100 characters |
| 401 | `UNAUTHENTICATED` | Missing or invalid session token |

### 7.4 `DELETE /developer/key`

Revokes the active key. `204`, idempotent: no active key also answers
`204`.

**Errors**

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid session token |

### 7.5 `GET /developer/usage`

This hour's count against the limit, plus the last 30 days. `data` is
`null` when the user has no active key.

```json
{
  "data": {
    "limit": 100,
    "used": 37,
    "reset_at": "2026-09-26T10:00:00Z",
    "daily": [
      { "date": "2026-08-28", "request_count": 0 },
      { "date": "2026-08-29", "request_count": 12 },
      { "date": "2026-09-25", "request_count": 88 },
      { "date": "2026-09-26", "request_count": 41 }
    ]
  }
}
```

`limit`, `used` and `reset_at` describe the current UTC clock hour, the same
numbers §3's headers would carry on the key's next request. `used` is
`null` when the hourly count can't be read. `daily` has exactly 30 entries,
one per UTC day including today, oldest first, with zeros for days without
requests. Each entry adds up all the user's keys, revoked ones included.

**Errors**

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid session token |

## 8. Storage and security

`market_data.api_keys` drops `owner_email` and adds `key_prefix`. An
`owner_email` column would be a second plaintext copy of the email — SRS
3.4.6 requires email addresses to be stored only encrypted at rest, with a
blind index, and §3.10 requires that no plaintext personal identifier is
stored; `user_id` already identifies the owner. A partial unique index on
`(user_id) WHERE revoked_at IS NULL` enforces one active key per user at the
database. The secret is never stored, logged, or returned outside
§7.2/§7.3 — only its SHA-256 hash. A new
`api_key_usage(api_key_id, usage_date, request_count)` table backs §7.5;
`last_used_at` updates at most once a minute per key. Full rationale is in
[ADR 0010](../adr/0010-public-developer-api.md).

## 9. Hosted docs

Reference documentation (SRS 3.1.3.4, 3.7.3) is hosted alongside the API,
no key required:

- Swagger UI: `https://tradeiqcse.tech/api/public/v1/docs`
- Raw OpenAPI spec: `https://tradeiqcse.tech/api/public/v1/openapi.json`

Both are generated from the public controllers only — the internal API and
key-management routes never appear in this spec.
