# Paper-Trading API and Execution Contract v1

| | |
|---|---|
| **Status** | Binding |
| **Owner** | `market-trading` |
| **Linear / GitHub** | TIQ-57 / issue #36 · boundary revised by TIQ-128 / TIQ-130 |
| **ADR** | [0009](../adr/0009-market-trading-owns-paper-trading.md), superseding [0008](../adr/0008-paper-trading-v1-execution.md) |
| **Error format** | [error-envelope.md](./error-envelope.md) |
| **Currency** | LKR only |

## 1. Scope and service boundary

This contract defines the first paper-trading slice used by the TradeIQ SPA:
virtual portfolios, cash history, EOD market orders, fills, FIFO positions and
portfolio valuation. It does not model a live exchange or broker.

`market-trading` owns all of it, in the `market_data` database: securities,
trading sessions and prices, and the user-owned portfolios, orders, fills, fees,
FIFO lots, lot disposals and cash transactions. Every rule that makes a write
correct — the execution session, the fill date, T+2 settlement, the shared
valuation date — is a market rule, so the records and the prices they depend on
live together and an order fills in one local transaction. ADR 0009 records why.

`identity-auth` owns identity: users, credentials, sessions and tokens. It
issues the access token; `market-trading` verifies it. That is the only coupling
between the two services, and it runs one way.

- Canonical CSE symbols are stored on orders, fills and lots. Internal
  market-data UUIDs are not, so a client can resolve every identifier in a
  response through the public market API.
- `user_id` on these tables is a plain uuid. `auth.users` is in a different
  database with a different role, so it carries no foreign key and user deletion
  does not cascade — see ADR 0009.

All investor-facing endpoints below are unversioned internal SPA endpoints
served by `market-trading`. They require `Authorization: Bearer <token>`. The
authenticated `user_id` comes only from the verified token and is never accepted
in a path, query or request body. Tests may replace the guard with an injected
test principal; production code must not trust a client-supplied user header as
an authentication substitute.

## 2. V1 decisions

### 2.1 Supported order

V1 supports one order shape:

- `order_type`: `market`
- `side`: `buy` or `sell`
- `quantity`: a positive 32-bit integer number of shares
- no client-selected limit price, validity, fill date or execution price
- no partial fills: a valid order becomes either `filled` or `rejected`

The UI may call an estimate endpoint before confirmation, but an estimate does
not reserve cash, shares or a price. The submitted order response is final.

### 2.2 Execution date and price

Processing an order takes one execution quote for the canonical symbol
(§2.3): the latest completed market session, and that session's unadjusted EOD
`close`.

- An order placed on a weekend or holiday uses the previous completed session.
- Clients cannot backdate an order.
- `price_as_of` must equal `market_as_of`. A security whose latest price is
  older than the market session is stale and cannot be traded in v1.
- A security must be `listed`. Suspended and delisted securities cannot be
  traded.
- A missing or zero close rejects the order as `PRICE_UNAVAILABLE`.
- A stale price rejects the order as `STALE_PRICE`.

The fill date is `market_as_of`. Settlement is the second market day after the
fill date (T+2); the quote supplies `settlement_date` from the market calendar.
For this simulator, cash and lots change atomically on the fill date. The
settlement date is retained for audit and display, not deferred accounting.

### 2.3 Execution quote

The quote is resolved in process, against `market_data`, inside the order
transaction. It is not a REST endpoint: ADR 0009 withdrew
`GET /internal/paper-trading/quotes/{symbol}` when paper trading moved into
`market-trading`, because a fill must not depend on a network call. The shape it
returns is unchanged:

```json
{
  "symbol": "COMB.N0000",
  "listing_status": "listed",
  "market_as_of": "2025-01-10",
  "price_as_of": "2025-01-10",
  "close": 142.72,
  "settlement_date": "2025-01-14"
}
```

The quote reports facts and makes no trading judgement. It returns the listing
status and whatever the latest price is; §2.2 alone decides whether that means
`SECURITY_NOT_TRADABLE`, `PRICE_UNAVAILABLE` or `STALE_PRICE`. Keeping every
rejection rule in one place is what stops two readings of the same quote
disagreeing about whether an order was tradable.

- An unknown symbol is a domain outcome, not a failure. The order path receives
  the absence rather than an exception and persists a `201` rejection with
  `rejection_code` `SECURITY_NOT_FOUND` (§6.2).
- A known security with no usable price returns null `price_as_of`, `close` and
  `settlement_date`, and §2.2 records the corresponding rejection.

### 2.4 Valuation

The closes behind the §7 position and summary views, also resolved in process.
`GET /internal/paper-trading/valuations` was withdrawn with the quote endpoint.

```json
{
  "as_of": "2025-01-10",
  "prices": [
    { "symbol": "COMB.N0000", "close": 120 },
    { "symbol": "JKH.N0000", "close": null }
  ]
}
```

This is deliberately not the §2.3 quote. An execution quote answers "what is the
latest price at or before this session", which is right for filling an order.
Valuation asks "what did this security close at *on* this session", because
§3.4 requires every position in one response to share one date, and carrying a
previous day's close forward for a thinly traded symbol would mix dates across
positions without saying so. The two questions have different answers on exactly
the days it matters, so they stay two separate calls — valuation is never the
quote applied in a loop.

- The session is resolved once per valuation, which is what makes the
  single-session rule structural rather than something each caller maintains.
- An empty symbol list returns the session with an empty `prices` array, which
  is how a portfolio holding nothing still reports an `as_of`.
- `as_of` is optional and follows the market-data bounds contract: a date
  outside the available range is `400 VALIDATION_FAILED` on the §7 route that
  accepted it, and a weekend or holiday settles back to the preceding session.
  Omitted means the latest session.
- `as_of` is `null` when no price data exists at all.
- `prices` carries one entry per requested symbol, ordered by symbol ascending.
  Symbols are matched case-insensitively and deduplicated, and the canonical
  stored form is echoed back. `close` is `null` when the symbol is unknown or
  did not trade on the effective session. Both are the same outcome to the
  caller — §7 has no `SECURITY_NOT_FOUND` — so this call does not distinguish
  them.

## 3. Precision, rounding and fees

### 3.1 Decimal rules

- Application and database calculations use decimal arithmetic. JavaScript
  binary floating-point is not used for monetary calculations.
- Prices and LKR amounts are rounded to 4 decimal places.
- Fee rates are stored to 5 decimal places in percent units.
- Percentage returns are rounded to 2 decimal places for API output.
- Positive half values round up; negative half values round away from zero.
- Multiplication and division use unrounded operands. Rounding occurs only at
  the named result in the formulas below.
- API responses use JSON numbers. The backend converts PostgreSQL `numeric`
  values only after applying the specified decimal rounding.

Let `R4(x)` mean round to 4 decimal places and `R2(x)` mean round to 2.

### 3.2 V1 equity fee schedule

The simulator pins the fixed CSE equity schedule for transaction values up to
LKR 100 million. V1 rejects any single order whose gross consideration exceeds
that amount, so the negotiable higher band is never applied.

| Component | Percent rate |
|---|---:|
| Brokerage | 0.64000% |
| CSE | 0.08400% |
| CDS | 0.02400% |
| SEC cess | 0.07200% |
| Share transaction levy (`stl`) | 0.30000% |
| **Total** | **1.12000%** |

Source: Colombo Stock Exchange, [Invest Sri Lanka — Transaction Fee](https://cdn.cse.lk/pdf/investor-portal/invest-sri-lanka.pdf).
The rates are versioned simulator inputs, not a claim that TradeIQ executes a
real brokerage transaction. A future rate change requires a new contract and
must not rewrite historical fills.

For each fill:

```text
gross_consideration = R4(quantity × fill_price)
component_fee       = R4(gross_consideration × component_rate / 100)
fee_total           = R4(sum(component_fee))
buy_cash_debit      = R4(gross_consideration + fee_total)
sell_cash_credit    = R4(gross_consideration - fee_total)
```

Each component is rounded before it is summed. Buy and sell orders use the same
fee schedule.

### 3.3 FIFO cost and P/L

A filled buy creates one open lot. Its original cost is the buy gross
consideration plus all buy fees. Sells consume lots by:

1. `acquired_date` ascending;
2. `created_at` ascending;
3. `lot_id` ascending.

Every sell-to-lot allocation is persisted, including quantity and allocated
cost. For a partial allocation:

```text
allocated_cost = R4(original_lot_cost × allocated_quantity / original_quantity)
```

The final allocation that closes a lot receives its exact remaining cost. This
remainder rule prevents repeated rounding from losing or creating cost basis.

```text
sell_net_proceeds = R4(sell_gross - sell_fee_total)
realized_pnl      = R4(sell_net_proceeds - sum(allocated_cost))
```

Sell fees belong to the sell fill and are deducted once before realized P/L is
calculated. Buy fees are already part of lot cost.

### 3.4 Position and portfolio valuation

All positions in one response use the same effective `as_of` market session.
A weekend or holiday request settles to the preceding session and reports it.

```text
quantity           = sum(open lot remaining quantity)
cost_basis          = R4(sum(open lot remaining cost))
average_cost        = R4(cost_basis / quantity)
market_value        = R4(quantity × latest_close)
unrealized_pnl      = R4(market_value - cost_basis)
unrealized_return   = R2(unrealized_pnl / cost_basis × 100)
holdings_value      = R4(sum(position market_value))
total_equity        = R4(cash_balance + holdings_value)
total_pnl           = R4(total_equity - starting_capital)
total_return        = R2(total_pnl / starting_capital × 100)
realized_pnl        = R4(sum(completed sell realized_pnl))
```

A held security without a price on the effective session makes valuation
incomplete. The API returns `422 PRICE_UNAVAILABLE`; it never treats the
position as worth zero or mixes dates across positions.

## 4. Idempotency and concurrency

`Idempotency-Key` is required on portfolio creation and order submission. It is
an opaque 8–128 character printable ASCII value; UUIDs are recommended.

- Scope: authenticated user + HTTP method + route template + key.
- The service stores a canonical request hash and the completed response.
- Same key and same request returns the original status and body with
  `Idempotent-Replayed: true`.
- Same key and different request returns `409 IDEMPOTENCY_KEY_REUSED`.
- Keys are retained for the life of the created portfolio or order.
- Boundary validation failures and transient dependency failures are not stored,
  so a corrected request or safe retry can reuse the key. A transient failure is
  one that produced no auditable result — since ADR 0009 that means the
  datastore, not a service call, because there is no longer a service call in
  the order path.
- Domain rejections are stored because the rejected order is an auditable
  result.

Portfolio rows and open lots are locked during fill execution. Cash and
holdings are rechecked inside the transaction. The order, fill, component fees,
cash transaction, lot changes and disposal allocations either all commit or all
roll back.

## 5. Portfolio endpoints

### 5.1 Create a portfolio

`POST /portfolios`

Headers: `Authorization`, `Idempotency-Key`

```json
{ "name": "Evaluation portfolio", "starting_capital": 1000000 }
```

`name` is trimmed and must contain 1–100 characters. `starting_capital` must be
between LKR 100,000 and LKR 100,000,000 inclusive with at most 4 decimal places.

`201 Created`

```json
{
  "data": {
    "portfolio_id": "2e43a766-234f-4a4a-99dc-6becb57838ea",
    "name": "Evaluation portfolio",
    "currency": "LKR",
    "starting_capital": 1000000,
    "cash_balance": 1000000,
    "status": "active",
    "created_at": "2026-08-27T13:00:00Z"
  }
}
```

Creation atomically writes the portfolio and exactly one `initial_capital` cash
transaction with a positive amount and matching `balance_after`.

Errors: `400 VALIDATION_FAILED`, `401 UNAUTHENTICATED`,
`409 IDEMPOTENCY_KEY_REUSED`.

### 5.2 List portfolios

`GET /portfolios?page=1&page_size=50`

`200 OK`

```json
{
  "data": [
    {
      "portfolio_id": "2e43a766-234f-4a4a-99dc-6becb57838ea",
      "name": "Evaluation portfolio",
      "currency": "LKR",
      "starting_capital": 1000000,
      "cash_balance": 898880,
      "status": "active",
      "created_at": "2026-08-27T13:00:00Z"
    }
  ],
  "meta": { "page": 1, "page_size": 50, "total": 1 }
}
```

Soft-deleted portfolios are excluded. Ordering is `created_at` descending then
`portfolio_id` ascending.

Errors: `400 VALIDATION_FAILED`, `401 UNAUTHENTICATED`.

### 5.3 Retrieve a portfolio

`GET /portfolios/{portfolio_id}`

`200 OK` returns the same portfolio object as §5.1. A missing, deleted or
other-user portfolio returns the same `404 PORTFOLIO_NOT_FOUND` envelope.

Errors: `400 VALIDATION_FAILED`, `401 UNAUTHENTICATED`,
`404 PORTFOLIO_NOT_FOUND`.

### 5.4 Soft-delete a portfolio

`DELETE /portfolios/{portfolio_id}`

`204 No Content`

Deletion retains all ledger data but hides the portfolio from normal reads and
prevents new estimates or orders. A repeated delete returns
`404 PORTFOLIO_NOT_FOUND`.

Errors: `400 VALIDATION_FAILED`, `401 UNAUTHENTICATED`,
`404 PORTFOLIO_NOT_FOUND`.

### 5.5 Cash-transaction history

`GET /portfolios/{portfolio_id}/cash-transactions?page=1&page_size=50`

`200 OK`

```json
{
  "data": [
    {
      "transaction_id": "4eb43bc1-8d38-48ce-aaac-34e38a8dc9ed",
      "type": "buy_debit",
      "amount": -101120,
      "balance_after": 898880,
      "effective_date": "2025-01-10",
      "fill_id": "98a7e7d2-bdb1-46bd-8c53-352ccba06a36",
      "created_at": "2026-08-27T13:05:00Z"
    }
  ],
  "meta": { "page": 1, "page_size": 50, "total": 2 }
}
```

Credits are positive and debits are negative. A fill creates one net
`buy_debit` or `sell_credit` cash transaction; component fees remain separately
auditable through the fill and are not duplicated as cash rows. Ordering is
`created_at` descending then `transaction_id` ascending.

Errors: `400 VALIDATION_FAILED`, `401 UNAUTHENTICATED`,
`404 PORTFOLIO_NOT_FOUND`.

## 6. Order and fill endpoints

### 6.1 Estimate an order

`POST /portfolios/{portfolio_id}/orders/estimate`

```json
{ "symbol": "comb.n0000", "side": "buy", "quantity": 1000 }
```

`200 OK`

```json
{
  "data": {
    "symbol": "COMB.N0000",
    "side": "buy",
    "quantity": 1000,
    "price": 100,
    "price_as_of": "2025-01-10",
    "settlement_date": "2025-01-14",
    "gross_consideration": 100000,
    "fees": [
      { "type": "brokerage", "rate_percent": 0.64, "amount": 640 },
      { "type": "cse", "rate_percent": 0.084, "amount": 84 },
      { "type": "cds", "rate_percent": 0.024, "amount": 24 },
      { "type": "sec_cess", "rate_percent": 0.072, "amount": 72 },
      { "type": "stl", "rate_percent": 0.3, "amount": 300 }
    ],
    "fee_total": 1120,
    "cash_effect": -101120
  }
}
```

The estimate validates the current portfolio, quote, cash or holdings but makes
no database mutation. It does not use an idempotency key.

Errors: `400 VALIDATION_FAILED`, `401 UNAUTHENTICATED`,
`404 PORTFOLIO_NOT_FOUND`, `404 SECURITY_NOT_FOUND`,
`422 INSUFFICIENT_CASH`, `422 INSUFFICIENT_HOLDINGS`,
`422 TRANSACTION_LIMIT_EXCEEDED`,
`422 SECURITY_NOT_TRADABLE`, `422 PRICE_UNAVAILABLE`, `422 STALE_PRICE`,
`503 DEPENDENCY_UNAVAILABLE`.

### 6.2 Submit an order

`POST /portfolios/{portfolio_id}/orders`

Headers: `Authorization`, `Idempotency-Key`

```json
{ "symbol": "comb.n0000", "side": "buy", "quantity": 1000 }
```

`201 Created` for a filled order:

```json
{
  "data": {
    "order_id": "752af248-6552-4213-b58f-1ef4a01ffbf5",
    "portfolio_id": "2e43a766-234f-4a4a-99dc-6becb57838ea",
    "symbol": "COMB.N0000",
    "side": "buy",
    "order_type": "market",
    "quantity": 1000,
    "filled_quantity": 1000,
    "status": "filled",
    "rejection_code": null,
    "placed_at": "2026-08-27T13:05:00Z",
    "fill": {
      "fill_id": "98a7e7d2-bdb1-46bd-8c53-352ccba06a36",
      "fill_date": "2025-01-10",
      "settlement_date": "2025-01-14",
      "quantity": 1000,
      "price": 100,
      "gross_consideration": 100000,
      "fee_total": 1120,
      "cash_effect": -101120,
      "realized_pnl": null
    }
  }
}
```

A well-formed order that fails a domain check is still an auditable created
resource and returns `201 Created` with `status: "rejected"`, no fill, and one
of these stable rejection codes:

- `INSUFFICIENT_CASH`
- `INSUFFICIENT_HOLDINGS`
- `TRANSACTION_LIMIT_EXCEEDED`
- `SECURITY_NOT_FOUND`
- `SECURITY_NOT_TRADABLE`
- `PRICE_UNAVAILABLE`
- `STALE_PRICE`

```json
{
  "data": {
    "order_id": "8f6b97e8-b40a-46ac-bec8-1c3074ce9861",
    "portfolio_id": "2e43a766-234f-4a4a-99dc-6becb57838ea",
    "symbol": "COMB.N0000",
    "side": "buy",
    "order_type": "market",
    "quantity": 100000,
    "filled_quantity": 0,
    "status": "rejected",
    "rejection_code": "INSUFFICIENT_CASH",
    "placed_at": "2026-08-27T13:06:00Z",
    "fill": null
  }
}
```

Errors are reserved for requests that create no auditable order:
`400 VALIDATION_FAILED`, `401 UNAUTHENTICATED`,
`404 PORTFOLIO_NOT_FOUND`, `409 IDEMPOTENCY_KEY_REUSED`,
`503 DEPENDENCY_UNAVAILABLE`.

### 6.3 List orders

`GET /portfolios/{portfolio_id}/orders?status=filled&page=1&page_size=50`

`status` is optional: `filled` or `rejected`. The response contains the order
objects from §6.2 without the nested `fill`, plus pagination metadata. Ordering
is `placed_at` descending then `order_id` ascending.

```json
{
  "data": [
    {
      "order_id": "752af248-6552-4213-b58f-1ef4a01ffbf5",
      "portfolio_id": "2e43a766-234f-4a4a-99dc-6becb57838ea",
      "symbol": "COMB.N0000",
      "side": "buy",
      "order_type": "market",
      "quantity": 1000,
      "filled_quantity": 1000,
      "status": "filled",
      "rejection_code": null,
      "placed_at": "2026-08-27T13:05:00Z"
    }
  ],
  "meta": { "page": 1, "page_size": 50, "total": 1 }
}
```

Errors: `400 VALIDATION_FAILED`, `401 UNAUTHENTICATED`,
`404 PORTFOLIO_NOT_FOUND`.

### 6.4 Retrieve an order

`GET /portfolios/{portfolio_id}/orders/{order_id}`

`200 OK` returns the complete order object from §6.2, including its fill when
present. A missing order, an order in another portfolio, or an order owned by
another user returns the same `404 ORDER_NOT_FOUND` envelope.

Errors: `400 VALIDATION_FAILED`, `401 UNAUTHENTICATED`,
`404 PORTFOLIO_NOT_FOUND`, `404 ORDER_NOT_FOUND`.

### 6.5 List fills

`GET /portfolios/{portfolio_id}/fills?page=1&page_size=50`

`200 OK`

```json
{
  "data": [
    {
      "fill_id": "98a7e7d2-bdb1-46bd-8c53-352ccba06a36",
      "order_id": "752af248-6552-4213-b58f-1ef4a01ffbf5",
      "symbol": "COMB.N0000",
      "side": "buy",
      "fill_date": "2025-01-10",
      "settlement_date": "2025-01-14",
      "quantity": 1000,
      "price": 100,
      "gross_consideration": 100000,
      "fee_total": 1120,
      "cash_effect": -101120,
      "realized_pnl": null,
      "fees": [
        { "type": "brokerage", "rate_percent": 0.64, "amount": 640 },
        { "type": "cse", "rate_percent": 0.084, "amount": 84 },
        { "type": "cds", "rate_percent": 0.024, "amount": 24 },
        { "type": "sec_cess", "rate_percent": 0.072, "amount": 72 },
        { "type": "stl", "rate_percent": 0.3, "amount": 300 }
      ]
    }
  ],
  "meta": { "page": 1, "page_size": 50, "total": 1 }
}
```

Ordering is `created_at` descending then `fill_id` ascending.

Errors: `400 VALIDATION_FAILED`, `401 UNAUTHENTICATED`,
`404 PORTFOLIO_NOT_FOUND`.

## 7. Position and summary endpoints

### 7.1 Positions

`GET /portfolios/{portfolio_id}/positions?as_of=2025-01-12`

`as_of` is optional and follows the market-data bounds contract. It exists for
reproducible viewing only and does not affect order execution. It moves prices
alone: cash, open lots and realized P/L are always current state.

Prices come from the §2.4 valuation boundary, in one call, so every position in
a response is priced at the same session.

`200 OK`

```json
{
  "data": [
    {
      "symbol": "COMB.N0000",
      "quantity": 600,
      "cost_basis": 60672,
      "average_cost": 101.12,
      "price": 120,
      "market_value": 72000,
      "unrealized_pnl": 11328,
      "unrealized_return_pct": 18.67
    }
  ],
  "meta": {
    "as_of": "2025-01-10",
    "total": 1
  }
}
```

Positions are ordered by symbol ascending. Closed positions are omitted.

Errors: `400 VALIDATION_FAILED`, `401 UNAUTHENTICATED`,
`404 PORTFOLIO_NOT_FOUND`, `422 PRICE_UNAVAILABLE`,
`503 DEPENDENCY_UNAVAILABLE`.

### 7.2 Portfolio summary

`GET /portfolios/{portfolio_id}/summary?as_of=2025-01-12`

`200 OK`

```json
{
  "data": {
    "portfolio_id": "2e43a766-234f-4a4a-99dc-6becb57838ea",
    "currency": "LKR",
    "as_of": "2025-01-10",
    "starting_capital": 1000000,
    "cash_balance": 946342.4,
    "holdings_value": 72000,
    "total_equity": 1018342.4,
    "realized_pnl": 7014.4,
    "unrealized_pnl": 11328,
    "total_pnl": 18342.4,
    "total_return_pct": 1.83
  }
}
```

Errors: `400 VALIDATION_FAILED`, `401 UNAUTHENTICATED`,
`404 PORTFOLIO_NOT_FOUND`, `422 PRICE_UNAVAILABLE`,
`503 DEPENDENCY_UNAVAILABLE`.

## 8. Worked execution examples

All examples use the fee schedule in §3.2 and start with LKR 1,000,000 unless
stated otherwise.

### 8.1 Buy

Buy 1,000 shares at LKR 100:

| Item | Amount (LKR) |
|---|---:|
| Gross consideration | 100,000.0000 |
| Brokerage | 640.0000 |
| CSE | 84.0000 |
| CDS | 24.0000 |
| SEC cess | 72.0000 |
| STL | 300.0000 |
| Total fees | 1,120.0000 |
| Cash debit | 101,120.0000 |
| Cash after fill | 898,880.0000 |
| Original lot cost | 101,120.0000 |

The order, fill, five fee rows, one cash debit and one 1,000-share lot commit in
one transaction.

### 8.2 Partial sell

From the lot in §8.1, sell 400 shares at LKR 120:

| Item | Amount (LKR) |
|---|---:|
| Gross consideration | 48,000.0000 |
| Total sell fees | 537.6000 |
| Net proceeds | 47,462.4000 |
| FIFO allocated cost | 40,448.0000 |
| Realized P/L | 7,014.4000 |
| Cash after fill | 946,342.4000 |
| Remaining quantity | 600 shares |
| Remaining cost | 60,672.0000 |

### 8.3 Multi-lot FIFO sell

Buy lot A: 100 shares at LKR 50. Its total cost is LKR 5,056.0000. Buy
lot B: 150 shares at LKR 60. Its total cost is LKR 9,100.8000. Then sell
180 shares at LKR 70.

FIFO consumes all 100 shares of A and 80 shares of B:

| Item | Amount (LKR) |
|---|---:|
| Sell gross | 12,600.0000 |
| Sell fees | 141.1200 |
| Sell net proceeds | 12,458.8800 |
| Allocated cost from A | 5,056.0000 |
| Allocated cost from B | 4,853.7600 |
| Total allocated cost | 9,909.7600 |
| Realized P/L | 2,549.1200 |
| Remaining lot | B: 70 shares, LKR 4,247.0400 cost |
| Cash after all three fills | 998,302.0800 |

### 8.4 Insufficient cash

A portfolio has LKR 10,000 cash and submits a buy for 100 shares at LKR 100.
The required debit is LKR 10,112 after fees. The service creates one rejected
order with `INSUFFICIENT_CASH`; it creates no fill, fee, cash or lot rows and
cash remains LKR 10,000.

### 8.5 Missing price

The quote for `MISS.N0000` has `market_as_of: "2025-01-10"` and `close: null`.
The service creates one rejected order with `PRICE_UNAVAILABLE`; it creates no
fill, fee, cash or lot rows.

### 8.6 Insufficient holdings

A portfolio owns 50 shares and submits a sell for 75. The service creates one
rejected order with `INSUFFICIENT_HOLDINGS`; its open lots and cash remain
unchanged.

## 9. Error and rejection registry

### 9.1 HTTP error envelopes — no order created

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Invalid UUID, name, capital, symbol, side, quantity, pagination, date or missing/invalid idempotency key |
| 401 | `UNAUTHENTICATED` | Missing, invalid or expired bearer token |
| 404 | `PORTFOLIO_NOT_FOUND` | Portfolio is missing, deleted or owned by another user |
| 404 | `ORDER_NOT_FOUND` | Order is missing or not visible through this owned portfolio |
| 404 | `SECURITY_NOT_FOUND` | Estimate requested for an unknown symbol |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Same scoped key was used with a different canonical request |
| 422 | `INSUFFICIENT_CASH` | Estimate exceeds current available cash |
| 422 | `INSUFFICIENT_HOLDINGS` | Estimate exceeds current open quantity |
| 422 | `TRANSACTION_LIMIT_EXCEEDED` | Gross consideration exceeds the v1 LKR 100 million fee band |
| 422 | `SECURITY_NOT_TRADABLE` | Estimate targets a suspended or delisted security |
| 422 | `PRICE_UNAVAILABLE` | Estimate or valuation has no usable close |
| 422 | `STALE_PRICE` | Estimate quote is older than the effective market session |
| 503 | `DEPENDENCY_UNAVAILABLE` | A datastore the request needs was unavailable; the request is safe to retry |

### 9.2 Persisted order rejections

Order submission returns a `201` rejected order for expected domain outcomes,
as defined in §6.2. This is distinct from an error envelope because the order
identifier and rejection are part of the user's auditable history.

## 10. Persistence

These tables live in `market_data`, created by the `PaperTradingTables`
migration: `virtual_portfolios`, `paper_orders`, `fills`, `fill_fees`,
`position_lots`, `lot_disposals`, `cash_transactions` and
`idempotency_records`.

They carry the six properties this contract requires, all of which shipped with
TIQ-128:

1. Canonical `symbol` on orders, fills and lots. The market-data uuid is not
   stored, so every identifier in a response is resolvable through the public
   market API.
2. Persistent idempotency records with user, route, key, request hash, response
   status/body and optional created resource id.
3. A stable nullable `rejection_code` on paper orders; safe display text is
   mapped in application code.
4. Sell-to-lot disposal rows carrying sell fill, source lot, quantity and
   allocated cost, so FIFO and realized P/L are auditable.
5. Original and remaining lot cost at 4 decimal places, so final-lot remainder
   allocation is exact.
6. Uniqueness and check constraints preventing duplicate fill, opening-cash and
   idempotency records.

`user_id` is a plain uuid with no foreign key to `auth.users` — see §1 and ADR
0009. Every other relationship in the set is a real foreign key within
`market_data`.

Existing migrations are never edited after they have shipped; further changes
belong in new forward migrations.

## 11. Out of scope

- limit, stop, good-till-cancelled or partially filled orders;
- intraday prices or order matching;
- margin, leverage, short selling or negative cash;
- dividends, splits, rights, bonuses or other corporate-action adjustments;
- deposits, withdrawals, portfolio reset and transfers;
- real brokerage connectivity or claims of real execution;
- foreign currencies and the negotiable transaction-fee band;
- performance attribution, benchmarks, reports and strategy automation.
