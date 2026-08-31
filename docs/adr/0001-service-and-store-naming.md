# ADR 0001: Service and store naming

- **Status:** Accepted
- **Date:** 2026-08-11
- **Source:** IMPLEMENTATION_PLAN.md §0.1 (D1) · Linear TIQ-41

## Context

SRS v1.1 names no deployable services — only the data stores (3.10.1:
*market-data store*, *user store*, *machine-learning store*) — and states (3.1)
that allocating subsystems to services is a design decision. Schema v2
(`tradeiq_cse_schema_v2.sql`, verified 1:1 against ERD v2) fixes the
namespaces `auth` / `market_data` / `ml`. The repo skeleton already ships three
services.

## Decision

Keep all existing names; rename nothing:

| Service | Owns database | Remit |
|---|---|---|
| `identity-auth` | `auth` | Auth, users, portfolios, orders, fills, lots, cash |
| `market-trading` | `market_data` | Market data, OHLCV, execution quotes, public API, backtesting |
| `ml-prediction` | `ml` | Batch PPO directional predictions |

## Consequences

- Zero repo/infra churn; migrations, compose, and CI stay as built.
- Each service owns its DB exclusively; cross-service access over REST only
  (locked architecture rule) maps cleanly onto the three SRS stores.

## References

- SRS v1.1 §3.1, §3.10.1
- `tradeiq_cse_schema_v2.sql`; ERD v2 (`docs/diagrams/fig14-erd-v2`, project docs archive)
