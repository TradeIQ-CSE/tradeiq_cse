# Repeated trading in backtests

Status: implementation and independent review complete; release checks are tracked in the pull request.
Date: 2026-10-01.

## Product decision

A new backtest must keep evaluating the strategy until the selected period ends.
A sale closes the current position, not the strategy. The simulator holds at most
one long position at a time and can complete multiple buy/sell cycles.

The user selected **wait for a new price fall using a configurable re-entry rule**
for the default strategy after a sale. Initial entry and subsequent entries must
therefore be separate concepts. Buying again is conditional; repeated trading
must not manufacture trades when no later entry condition is satisfied.

The user also requested consistent defaults between Simple and Advanced while
retaining a friendly experience. Both modes must configure the **same strategy**;
the difference is how much configuration is displayed at once, not engine
behavior or hidden defaults.

Paper trading and Markets retain their current behavior. The configurable
backtesting date ceiling remains 2025-12-31 for now, including its existing path
for extending coverage later. Existing coverage gaps remain accurately rendered.

## Verified current context

- The checkout is at `9768aaa`, on the historical-period cutoff branch. There are
  unrelated untracked plans and visual tooling, which this work must preserve.
- `services/market-trading/src/backtesting/engine/runBacktest.ts` permits a buy
  only while `completed` is false. Every sell sets it true. This affects all three
  entry rules and all four exit rules.
- All 12 entry/exit combinations were exercised against synthetic bars during
  the preceding audit. Each produced one buy and one sell even where later bars
  satisfied conditional entry thresholds again. The existing engine suite
  passed 20 tests in 10 files; it does not establish support for repeated cycles.
- `BacktestRunsService.prepareRun` validates and maps requests for both guest
  preview and authenticated submission; `toEngineInput` supplies the same engine.
- The public request has no strategy version or re-entry configuration. The
  service hardcodes the persisted rule-set version to `1.0`, and the engine's
  validator currently does not enforce a supported-version list.
- Rules and execution assumptions are JSONB. Trade ledgers and equity curves
  already store arrays. The results table renders every execution; analytics
  counts ledger entries and calculates drawdown from the full curve. There is
  no structural two-execution limit outside the engine.
- Frontend Simple and Advanced share `RulesStep`, domain configuration, request
  mapping, draft restoration, preview storage, and result rendering. `RulesStep`
  explicitly says the test buys once. Percentage sizing is described as a share
  of the portfolio but calculated from original starting capital in the engine.
- Preview saving re-submits the recorded configuration to calculate a saved
  run. Version preservation matters across sign-in, reload, and saving.
- Current exits use daily highs/lows with opening-price gap handling, fixed
  stop-loss/take-profit/target precedence, and no ordinary exit on the entry day.
  Those assumptions require accurate explanations rather than unrelated changes
  to execution timing in this increment.

## Proposed strategy semantics

### Initial purchase

Keep the three existing rules and their meanings:

| Initial rule | Reference |
| --- | --- |
| On the first day | First available session's opening price |
| After a price fall | Percentage below the first available session's opening price |
| At a target price | Absolute configured buy price |

The initial percentage reference stays fixed; it must not silently become a
rolling peak or the latest sale price. Never buy if the initial condition is not
met or the available cash cannot cover at least one share and its fees.

### Buying again

Add a separate configurable rule: **buy again after the price falls X% below the
most recent sale price**. This applies after a sale regardless of which initial
buy rule was selected or which exit caused the sale.

- Proposed fresh-strategy default: **5%**, visibly configurable. This is a
  product default, not a profitability claim or an industry standard.
- Capture the actual last sale execution price. Re-entry target is that price
  multiplied by `1 - X / 100`, using the engine's rounding convention.
- Start evaluating on the next available trading session after the sale.
  A later bar whose low reaches the target permits entry. If its open is below
  the target, use that opening price, consistent with current buy gap handling.
- Keep the reference fixed while waiting. A rising price does not raise the
  reference; a fall from a new high is a different strategy and is not implied.
- On a subsequent sale, replace the reference with that sale's execution price.
- A fresh crossing above and back below the target is unnecessary here: the
  target is newly established below the sale price after every exit.
- If the next dip never occurs, remain in cash through the remaining period.
  That can legitimately produce a flat curve and few trades.
- Do not re-enter on the sale day or open a new position on the final session.
  Close an existing position on the final available session as today. A new
  version-2 initial purchase on the final session is also suppressed to avoid
  opening and forcibly closing it immediately; version 1 retains old behavior.

Example, before fees: an initial purchase at 100 stops out at 95. With 5%
re-entry, wait for 90.25 or lower. A purchase at 90.25 creates new stop-loss and
take-profit levels from 90.25. A later sale establishes a new re-entry reference.
The first stop loss never ends the strategy permanently.

### Exits, cash, and sizing

- Replace the permanent completion latch for version 2 with explicit position
  state: awaiting initial entry, holding shares, and awaiting re-entry. The end
  of the input period terminates simulation.
- Each entry records its own actual price, date, and quantity. Percentage exits
  always use the current position's entry price, not any previous cycle's price.
- Keep stop loss, take profit, absolute sell target, and mandatory final close.
  Retain current same-bar restrictions and conservative conflict precedence;
  disclose them. Changing execution timing is a separate change.
- Carry actual cash after every sale into subsequent purchases, including all
  costs. Charge configured fees on every execution and keep whole-share sizing.
- Full capital uses available cash. Percentage sizing in version 2 uses the
  selected percentage of **current available cash**, since entries occur only
  while flat. Absolute amount and fixed quantity retain their meanings, capped
  by affordability. Version 1 retains its original percentage calculation.
- Unaffordable entry signals leave the strategy waiting; there is no borrowing,
  negative cash, forced minimum purchase, or termination of later evaluation.
- Process only actual bars. Missing prices do not create simulated sessions,
  reset the reference, or allow reasoning about an unknown price path.

### Shared defaults and friendly presentation

Use the existing shared default configuration factory for both modes. The
proposed fresh defaults are:

| Setting | Simple and Advanced default |
| --- | --- |
| First purchase | On the first available trading day |
| Buy again | After a 5% fall from the most recent sale price |
| Take profit | 10% above the current purchase price |
| Stop loss | 5% below the current purchase price |
| Period-end exit | Close anything still held |
| Trade size | All available cash, allowing for fees |
| Starting capital and fees | Existing shared defaults |

Simple retains its current three-page flow. Show the initial purchase, exits,
and re-entry in plain-language summaries before running. Keep detailed controls
inside the existing configuration disclosure; do not add a mandatory wizard
page or require users to understand strategy versions. Advanced exposes the same
values with the existing detailed controls.

Mode changes, back/forward navigation, reload, and returning from review must
preserve all edited values. Summaries must use the actual configuration, not
hardcoded example defaults. Updating the initial entry rule must not reset a
custom re-entry percentage or unrelated exit/fee settings. “Reset to defaults”
uses the same factory in both modes. Any required review of an older draft uses
the existing review flow and explains changed trading behavior in plain words.

## Implementation sequence

1. **Define and version the contract.** Add an explicit version-2 rule contract
   containing initial buy, sell rules, and required re-entry percentage. Validate
   supported versions and finite values, with `0 < re-entry percentage < 100`.
   Use an unambiguous internal rule name such as
   `price_falls_pct_from_last_sell`; document its anchor and execution timing.
   Version-1 requests with no new fields keep legacy behavior. The new frontend
   sends version 2 explicitly; a missing version remains version 1 for older
   clients. Reject incompatible version/field combinations rather than silently
   dropping a re-entry rule.

2. **Implement repeated engine cycles.** Use the above states and references,
   reset position-specific data after exits, apply version-2 sizing, and retain
   exact accounting, sequential execution IDs, and one equity point per actual
   simulation session. Keep version-1 dispatch and characterization tests so
   historical strategies remain reproducible under their recorded rules.

3. **Wire preview, persistence, and result metadata.** Extend the DTO, shared
   request mapping/validation, and persisted rule configuration. Add strategy
   version to preview/saved result metadata so consumers can identify legacy
   calculations. JSONB can hold the additions without a schema migration;
   verify this against the entity and migration contracts. Do not recompute or
   overwrite previously completed runs. An old guest preview retains its
   original version when saved; changing it to version 2 requires reviewing
   the new configuration and running it again.

4. **Update both frontend workflows.** Present “First purchase”, “Sell”, and
   “Buy again” in the existing Rules step. Simple mode shows a compact default
   re-entry summary and editable percentage; Advanced exposes the same setting.
   Update configuration types, defaults, mapper, validator, draft restoration,
   review summaries, and trade-reason formatting. Preserve existing company,
   dates, capital, fee, and rule selections in older drafts; require review of
   the newly proposed re-entry setting when upgrading an unrun draft. Preserve
   the original version on stored previews. Remove the “buys once” statement,
   explain the last-sale anchor, and show percentage sizing as current cash.

5. **Make results clear and usable.** Render all executions and the full equity
   curve. Show the strategy/re-entry summary and distinguish a legacy
   single-cycle result from a new repeated strategy. Retain the existing
   transaction count meaning (“buys and sells”); if showing completed cycles,
   give them a separate label. Check mobile rendering and a long trade ledger;
   add pagination only if needed for usable results. Correct the closing-price
   footer to explain daily OHLC execution and close-based portfolio valuation.
   Use truthful no-execution copy when affordability prevented entry.

6. **Update documentation and validation.** Amend ADR 0002 and endpoint examples
   with versioning, initial/re-entry references, final-session behavior, sizing,
   and execution assumptions. This is price-based strategy support; it does
   not introduce indicator strategies, short selling, or concurrent positions.

## Acceptance and validation

- Deterministic fixtures produce at least three complete cycles when successive
  dips and exit signals occur; also test one cycle and no trades when later
  conditions are absent. A sale must never permanently disable version 2.
- Exercise all three initial rules and all four exit rules across repeated
  cycles. Verify each exit resets the re-entry anchor and each entry resets
  percentage exit thresholds. Include stop-loss re-entry and profit-taking
  re-entry, gap opens, simultaneous exits, and sparse/gapped dates.
- Assert no same-day re-entry, retained entry-day exit restrictions, no new
  final-session entries, correct final liquidation, and no invented gap bars.
  Version 1 preserves the previously characterized final-bar behavior.
- Test all four sizing modes, compounding after gains/losses, affordability
  after fees, and insufficient funds. Cash never becomes negative and holdings
  stay whole and nonnegative. Cash plus marked holdings equals curve equity;
  final liquidation yields final cash equal to final equity.
- Confirm direct engine execution, guest preview, and saved run give identical
  version-2 outputs for identical inputs. Verify stored configuration and
  strategy metadata, ownership, and rejection of invalid/unsupported versions.
- Cover legacy API requests, saved results, old drafts, preview reload/sign-in/
  save, and explicit upgrade-and-rerun. No legacy result changes merely by
  viewing it or deploying the feature.
- Test Simple/Advanced request equivalence, field errors, new descriptions,
  many-execution ledgers, animation completion, reduced motion, and analytics
  transaction counts/drawdown. Do not invent win-rate/profit-factor values from
  ledger rows; those need completed-cycle accounting if implemented separately.
- Assert fresh Simple and Advanced use identical defaults and submit identical
  requests. Edit re-entry, initial entry, exits, capital, size, and fees; switch
  modes both ways and reload, then verify all values and visible summaries.
  Verify the Simple flow still has three pages and reset uses shared defaults.
- Run backend/frontend suites, lint, typechecks, builds, API integration tests,
  and isolated Compose smoke checks matching the current CI workflow. Verify
  guest and authenticated journeys in the browser at desktop/mobile widths.
  Repeat the CTC five-year scenario to inspect real re-entry behavior; do not
  prescribe a trade count without actual later prices satisfying the rule.
- Regress the 2025 cutoff and earlier gap rendering. Paper trading and Markets
  retain existing data/behavior. Keep tests and review focused on backtesting.
- After implementation, obtain an independent adversarial review of semantics,
  cash accounting, version compatibility, and complete journeys; collect its
  findings and make one consolidated correction pass, then rerun affected checks.

## Main risks to review

The largest risk is silent strategy drift: changing an initial rule's anchor,
using current-day information before it existed, re-running an old preview under
new rules, or sizing later purchases from the original capital. Explicit
re-entry semantics, recorded versions, next-session eligibility, and accounting
fixtures address these risks. Daily OHLC cannot reveal the complete intraday
path; this increment retains and documents the existing execution assumptions.

Implementation follows this plan; review and release verification are recorded in the pull request.

## Consolidated independent-review corrections

The independent review identified zero opening quotes retained as decimal strings
in the database, missing aggregate fee-rate validation, independently rounded
fees exceeding very small consideration, and an incomplete OHLC explanation.
All were addressed together: version 2 substitutes positive close for unavailable
zero opens before normalizing unavailable bounds, rejects nonfinite or 100%+
combined charges before persistence, and bounds rounding residues in reconciled
fee components. Results and API documentation disclose closing-price execution
fallbacks and final-session threshold priority. Legacy calculations and stored
market data remain unchanged. Targeted engine, service and HTTP regressions cover
the reported cases. Isolated integration and desktop/mobile browser checks passed,
including actual CTC history, guest preview restoration, sign-in and saving,
and matching persisted results. Remote release checks are tracked in the pull request.
