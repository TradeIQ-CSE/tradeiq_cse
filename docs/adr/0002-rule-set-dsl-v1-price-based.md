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
- Conflicting daily signals use stop loss, take profit, then absolute target priority; final liquidation is a fallback.
- **No indicator conditions in v1** — SMA/EMA/BB/MACD are chart overlays only
  (SRS 3.1.1.3).
- The schema carries a version field from day one.

## Consequences

- Validation, the rule-builder UI, and the backtest engine stay small and
  testable; invalid configs are rejected with field-level errors (see
  `docs/api/error-envelope.md`).
- Indicators cannot drive strategies in v1 — a deliberate scope cut, not an
  oversight.
- Strategy versions allow execution behavior to evolve while preserving stored single-cycle rules. Indicators remain outside this contract.

## References

- SRS v1.1 §3.1.1.7, §3.1.1.3

## 2026-10-01 amendment: repeated price-based strategies

Version `2.0` separates the first purchase from subsequent purchases and waits
for a configurable fall from the most recent actual sale price (5% in both UI
modes by default). Every sale closes a position, not the strategy. Subsequent
entries begin checking on the next actual session; no new position opens on the
final session. Percentage sizing uses current available cash; fees apply on
every execution. Initial references, entry-day exit restrictions, conservative
exit precedence and mandatory final liquidation retain their documented meaning.

Missing API versions retain `1.0` and its single-cycle accounting. Existing saved
results and old previews preserve their rules; upgrading a draft requires review
and rerunning. Unsupported versions and incompatible re-entry fields are rejected.
No indicators, shorts or concurrent positions are introduced. See
[the complete strategy contract](../api/backtesting-strategies.md) for examples,
execution timing and compatibility.
