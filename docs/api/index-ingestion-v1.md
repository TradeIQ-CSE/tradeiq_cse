# Index ingestion API v1

`POST /internal/v1/ingestions/indices` stores one trading day's index closes
from cse-dataset. Authentication is the same as the
[EOD price route](./eod-ingestion-v1.md): `Authorization: Bearer
<MARKET_INGESTION_TOKEN>`, and `503` while the server token is unset.

It is a separate route because the price route refuses a date that already has
prices, so index values sent with them could never arrive late or be re-sent.

```json
{
  "trade_date": "2026-09-10",
  "calendar": { "is_trading_day": true, "source": "CSE circular 07-10-2025" },
  "values": [
    { "code": "ASPI", "close": "21357.74" },
    { "code": "SL20", "close": "6003.92" }
  ]
}
```

- `values` holds 1 to 20 closes, one per index. `code` must already be in
  `market_data.indices`, or the request is `400`. `close` is a positive decimal
  string with at most four places. Leave out a series the exchange didn't
  publish; never send zero.
- If the calendar has no entry for the date, `calendar` adds it as a trading
  day. A date recorded as closed is `409`.

Each index has one close per day:

- not stored yet: stored
- the same close already stored: unchanged
- a different close already stored: `409 CONFLICT`, and nothing in the batch is
  written

So re-sending a day is safe, and a later batch can add an index an earlier one
left out.

```json
{
  "data": {
    "trade_date": "2026-09-10",
    "stored": ["SL20"],
    "unchanged": ["ASPI"]
  }
}
```

Stored values show up in `GET /indices` and `GET /indices/{code}/values` at
once.
