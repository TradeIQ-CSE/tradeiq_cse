# Backtesting strategy contract

`POST /api/v1/backtests/preview` (guest) and `POST /api/v1/backtests` (authenticated) accept the same strategy and execution configuration. The saved results endpoint returns the same calculation plus strategy metadata. Owner checks still apply to saved runs.

```json
{
  "symbol": "CTC.N0000",
  "startDate": "2021-01-01",
  "endDate": "2025-12-31",
  "startingCapital": 1000000,
  "rule": {
    "version": "2.0",
    "buy": { "type": "period_start" },
    "reentry": { "type": "price_falls_pct_from_last_sell", "value": 5 },
    "sell": [
      { "type": "take_profit_pct", "value": 10 },
      { "type": "stop_loss_pct", "value": 5 },
      { "type": "end_of_period" }
    ]
  },
  "positionSizing": { "type": "full_capital" }
}
```

## Versions and compatibility

An omitted `rule.version` means `1.0`: one purchase and one exit. Version `1.0` rejects `reentry`. Version `2.0` requires `reentry` of type `price_falls_pct_from_last_sell` with a finite value strictly greater than 0 and smaller than 100. Unsupported versions and incompatible combinations are rejected, rather than silently changing the strategy.

Existing saved results retain their original calculations. Results expose `strategy`, containing the persisted `version`, `buyCondition`, `sellConditions`, and optional `reentryCondition`. Metadata comes from the owning run; viewing a result does not rerun it. JSONB rules and execution assumptions support both versions without a migration.

A guest preview retains its original version when submitted after sign-in. Changing an old preview's settings opens a draft with a proposed buy-again setting; the user reviews and accepts the new behavior before rerunning. Old unrun drafts keep company, dates, capital, initial entry, exits, fees and sizing, and require review of the proposed 5% re-entry before version-2 submission.

## First purchase and subsequent purchases

The initial buy rules are `period_start` (first available session's execution opening quote), `price_falls_to` (absolute threshold), and `price_falls_pct_from_period_start` (fall from the first available session's execution opening quote, with that reference fixed). In version 2, an unavailable or zero opening quote uses the observed positive close as an execution assumption, including the initial percentage reference; this cannot establish the actual intraday opening price. Conditional purchases occur when the daily low reaches the threshold. Execution is the threshold, or the opening price if the session opens lower.

After each version-2 sale, the actual execution price becomes the fixed reference for the next purchase. A sale at 100 with 5% re-entry waits for 95 or lower. The reference does not follow subsequent highs. Checks start on the next available session; re-entry cannot happen on the sale day. Every later purchase establishes its own percentage exit thresholds. The strategy waits in cash if the next dip never occurs or a whole share plus charges is unaffordable.

Version 2 never opens a position on the final available session, including the initial purchase. Version 1 retains its historical final-session purchase and immediate liquidation behavior. A source session with a zero high or low treats that bound as unavailable in version 2: threshold checks use only the observed positive open and close for that bound. This conservative fallback does not infer an unobserved intraday path or mutate stored history. Nonfinite prices and invalid positive bounds are rejected. Version 1 retains historical calculations. Only actual input bars are processed; data gaps do not create observations or reset the sale reference. The backtesting date policy remains independent of Markets and paper trading.

## Exits and accounting

No ordinary exit is evaluated on the purchase day. On subsequent sessions, conflicting daily signals use stop loss, take profit, absolute target priority. A stop-loss gap below the threshold executes at the open; a profit/target gap above the threshold executes at the open. Ordinary threshold exits are evaluated first on the final session with the same priority. If none triggers, remaining shares are closed at that session's close, even without an explicit `end_of_period` rule. Daily OHLC cannot determine the intraday order of multiple threshold hits; this fixed precedence is the simulation assumption.

Percentage exits refer to the current purchase price before transaction costs. All buys and sells incur configured fees. Version-2 fee rates must be finite and nonnegative, totaling less than 100%; quantities must fit the supported whole-share numeric range. Fee components normally round independently to four decimal places. If their rounded sum exceeds rounded gross consideration, version 2 removes only the excess 0.0001 rounding units in fixed order: STL, SEC cess, CDS, CSE, then brokerage. This bounded rounding applies to buys and sells, keeps each component nonnegative and the sum equal to total charges, and prevents negative sale proceeds without clamping portfolio cash. Version 1 retains its original rounding. Shares are whole, purchases are capped by cash and charges, and cash carries between cycles. Version-2 `percentage` sizing uses current available cash; version 1 uses starting capital. `full_capital` uses all available cash, `absolute` caps spending at the specified cash amount, and `fixed_quantity` caps the requested whole shares by affordability.

Ledger IDs are sequential executions: six trades can mean three buys and three sells. Equity has one point per actual session and is cash plus shares marked at the close. Final liquidation leaves final cash equal to final equity. Simple and Advanced share the same strategy defaults and preserve edited values across mode switches; only presentation differs.
