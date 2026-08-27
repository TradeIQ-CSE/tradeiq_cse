# ADR 0008: Deterministic EOD paper-trading execution

- **Status:** Proposed for review
- **Date:** 2026-08-27
- **Source:** TIQ-57 / GitHub issue #36
- **Contract:** [paper-trading-v1.md](../api/paper-trading-v1.md)

## Context

Paper trading spans user-owned money and position state in `identity-auth` and
prices owned by `market-trading`. Without a single execution contract, the API,
valuation and frontend tickets could choose incompatible dates, fees, rounding,
identifiers and retry behavior.

The initial auth schema contains the main portfolio and fill tables, but it
stores market UUIDs that the market API deliberately does not expose and lacks
idempotency and sell-to-lot allocation records.

## Decision

- `identity-auth` owns every user-specific paper-trading record.
- It receives prices only through a typed REST execution quote from
  `market-trading`; canonical symbols cross the boundary, not database UUIDs.
- V1 supports immediate all-or-rejected market orders only.
- Execution uses the unadjusted close from the latest completed EOD session.
  Weekend and holiday submissions therefore use the preceding session.
- Settlement is recorded as T+2 market days, while simulated cash and lots
  change atomically on the fill date.
- Equity fees are pinned as versioned simulator inputs and each component is
  rounded and stored separately.
- Sells consume lots deterministically using FIFO and persist each allocation.
- Portfolio creation and order submission require persistent idempotency keys.
- All financial calculations use explicit decimal precision and rounding.

## Consequences

- TIQ-58 through TIQ-61 can implement against one contract without duplicating
  financial calculations in the frontend.
- `identity-auth` needs new forward migrations before portfolio/order APIs are
  complete.
- `market-trading` needs the small execution-quote endpoint before order
  execution E2E tests can pass.
- The simulator is reproducible and auditable, but intentionally does not model
  live order books, partial fills, corporate actions or real brokerage behavior.

## References

- [CSE transaction fee table](https://cdn.cse.lk/pdf/investor-portal/invest-sri-lanka.pdf)
- [CSE amendment shortening equity settlement from T+3 to T+2](https://cdn.cse.lk/cmt/upload_report_file/f0OBhgMTj67atw5b_21May2024093353GMT_1716284033845.pdf)
- [ADR 0001: service and store naming](./0001-service-and-store-naming.md)
- [Structured error envelope](../api/error-envelope.md)
