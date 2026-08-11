# ADR 0002: Rule-set DSL v1 is price-based only

- **Status:** Accepted
- **Date:** 2026-08-11
- **Source:** IMPLEMENTATION_PLAN.md §0.1 (D2) · Linear TIQ-41

## Context

Backtest rule sets are authored as JSON configs and need a DSL. SRS 3.1.1.7
scopes v1; indicator-rich strategy languages were considered and rejected for v1.

## Decision

DSL v1 is **price-based only**:

- **Buy (exactly 1):** `period_start` | `price_falls_to(value)` |
  `price_falls_pct_from_period_start(x)`
- **Sell (≥1):** `target_price(p)` | `take_profit_pct(x)` | `stop_loss_pct(x)` |
  `end_of_period` (always-on fallback)
- First triggered sell rule wins.
- **No indicator conditions in v1** — SMA/EMA/BB/MACD are chart overlays only
  (SRS 3.1.1.3).
- The schema carries a version field from day one.

## Consequences

- Validation, the rule-builder UI, and the backtest engine stay small and
  testable; invalid configs are rejected with field-level errors (see
  `docs/api/error-envelope.md`).
- Indicators cannot drive strategies in v1 — a deliberate scope cut, not an
  oversight.
- The version field lets a future DSL v2 (indicators) land without breaking
  stored v1 rule sets.

## References

- SRS v1.1 §3.1.1.7, §3.1.1.3
