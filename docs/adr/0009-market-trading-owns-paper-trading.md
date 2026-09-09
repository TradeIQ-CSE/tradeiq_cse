# ADR 0009: `market-trading` owns paper trading

- **Status:** Accepted
- **Date:** 2026-09-08
- **Source:** TIQ-128 / TIQ-130
- **Supersedes:** [ADR 0001](./0001-service-and-store-naming.md) remit table;
  [ADR 0008](./0008-paper-trading-v1-execution.md) ownership and boundary decisions
- **Contract:** [paper-trading-v1.md](../api/paper-trading-v1.md)

## Context

ADR 0001 split the remit along the SRS data stores: `identity-auth` took the
`auth` store and, with it, portfolios, orders, fills, lots and cash. ADR 0008
then built the execution contract on that split — `identity-auth` holding the
user-owned records and fetching prices from `market-trading` over REST.

Implementation showed the split was drawn in the wrong place. Every rule that
makes a paper-trading write correct is a market rule:

- the execution price is the latest completed session's unadjusted close;
- the fill date is the market session, not the wall clock;
- settlement is T+2 *market* days;
- a position is only valuable if the security has a price on the effective
  session, and every position in one response must share that session.

Under ADR 0001 the service that had to enforce those rules was the one that
could not see the data behind them. `identity-auth` reached across a REST
boundary for a quote, then applied market semantics to the answer. The
boundary sat in the middle of a single transaction: order validation, pricing,
fee calculation, lot consumption and the cash write are one atomic unit, and
splitting them left the correctness of a fill depending on a network call.

That also produced a service whose remit had nothing to do with its name.
`identity-auth` owned FIFO lot disposal and a fee schedule.

## Decision

Draw the boundary at the domain, not at the SRS store:

| Service | Owns database | Remit |
|---|---|---|
| `identity-auth` | `auth` | Authentication, users, sessions, tokens |
| `market-trading` | `market_data` | Market data, OHLCV, backtesting, paper trading — portfolios, orders, fills, fees, lots, cash |
| `ml-prediction` | `ml` | Batch PPO directional predictions |

The trading algorithms define the service. Anything that needs a market
session, a price or a fee rule to be correct lives with the data those rules
read.

`identity-auth` issues the access token; `market-trading` verifies it and takes
the owning `user_id` from the verified claims. That is the only coupling left
between them, and it is one-directional.

The §2.3 execution-quote and §2.4 valuation REST endpoints are withdrawn. Their
rules survive unchanged as in-process calls — the distinction between "latest
price at or before this session" and "close on this session" is a correctness
rule, not an artifact of the transport.

## Consequences

- Order execution is one local transaction. No fill depends on a network call.
- `identity-auth` shrinks to identity. It no longer needs the paper-trading
  migrations ADR 0008 anticipated.
- **`user_id` in `market_data` has no foreign key to `auth.users`.** The
  databases are separate, with separate roles, so the reference cannot be
  enforced. It is a plain uuid, as `market_data.backtest_runs.owner_id` already
  was. Deleting a user no longer cascades to their portfolios, orders, fills,
  lots and cash. That path must be built explicitly before account deletion
  ships; until then, deleting an `auth.users` row orphans trading records.
- Referential integrity between a portfolio and its orders, fills and lots is
  unaffected — those all live in `market_data` and keep their foreign keys.
- **This diverges from ERD v2 and SRS v1.1 §3.10.1**, which place portfolios,
  orders, fills, lots and cash in the user store. The store names are unchanged;
  the allocation of tables to them is not. SRS §3.1 states that allocating
  subsystems to services is a design decision, which is the latitude this ADR
  uses. The ERD is now a record of the original design, not of the schema.
- Backtesting and paper trading share one database, so a future feature that
  settles a backtest into a portfolio needs no new boundary.

## References

- [ADR 0001: service and store naming](./0001-service-and-store-naming.md)
- [ADR 0008: deterministic EOD paper-trading execution](./0008-paper-trading-v1-execution.md)
- [Paper-trading API and execution contract v1](../api/paper-trading-v1.md)
- SRS v1.1 §3.1, §3.10.1; ERD v2 (`docs/diagrams/fig14-erd-v2`)
