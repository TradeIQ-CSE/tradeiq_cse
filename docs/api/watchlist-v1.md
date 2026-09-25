# Watchlist API v1

| | |
|---|---|
| **Status** | Binding |
| **Owner** | `market-trading` |
| **SRS ref** | 3.1.2.1 (watchlist endpoints) · an investor follows at most 10 securities |
| **Error format** | [error-envelope.md](./error-envelope.md) |

## 1. Scope

The securities an investor follows, with each one's latest close. It is a
reading aid: nothing on the watchlist affects portfolios, orders or backtests.

## 2. Storage and ownership

`market_data.watchlist_items`, one row per followed security, keyed by
`(user_id, symbol)`. It lives beside the prices each row shows, for the reason
paper trading does ([ADR 0009](../adr/0009-market-trading-owns-paper-trading.md)).
Like orders and fills it stores the canonical symbol, and `user_id` is a plain
uuid with no cross-database key. `auth.watchlists`, reserved in identity-auth's
initial schema, was never used and is superseded by this table.

Every route requires `Authorization: Bearer <token>`. The list belongs to the
token's user; there is no watchlist id in any path or body.

## 3. Endpoints

### 3.1 `GET /watchlist`

```json
{
  "data": {
    "limit": 10,
    "items": [
      {
        "symbol": "JKH.N0000",
        "company_name": "John Keells Holdings PLC",
        "added_at": "2026-09-01T04:00:00.000Z",
        "trade_date": "2026-09-24",
        "close": 21.5,
        "change": -0.5,
        "change_pct": -2.27
      }
    ]
  }
}
```

- `items` are in the order they were added, oldest first.
- `trade_date` is the security's own latest session, which can be older than
  the market's for a thinly traded or suspended security. `change` and
  `change_pct` compare it with the security's previous session.
- A security with no prices is still listed, with `trade_date`, `close`,
  `change` and `change_pct` all `null`. `change` and `change_pct` are also
  `null` when there is no previous session.

### 3.2 `POST /watchlist`

Body `{ "symbol": "jkh.n0000" }`, matched case-insensitively. Answers `200`
with the whole watchlist in the §3.1 shape.

Idempotent: following a security that is already on the list changes nothing
and succeeds, even when the list is full. Adds for one user are serialised, so
concurrent requests can never take the list past the limit.

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | `symbol` missing, not a string, or longer than 20 characters |
| 404 | `SECURITY_NOT_FOUND` | `symbol` matches no security |
| 422 | `WATCHLIST_FULL` | The list already holds `limit` securities |

### 3.3 `DELETE /watchlist/{symbol}`

Answers `204`. Idempotent: removing a symbol that is not on the list, or that
matches no security, also answers `204`.
