import { formatDay } from './descriptions';
import { BacktestConfig, StepKey, ValidationError, ValidationResult } from './types';
import { CSE_DATASET_MIN_DATE } from './defaults';
import { backtestDateGap, dateInGapMessage, DataGap } from '../../../lib/data-gaps';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates the entire backtest configuration or a specific step. `gaps`
 * (a security's price gaps, from `useDataCoverage`) is optional and
 * defaults to none, so a caller that predates the data-gap plan — or one
 * still waiting on coverage to load — keeps validating exactly as before;
 * a caller that has it loaded also catches a start/end date a typed edit or
 * a restored draft put inside a `missing_data` gap, with the same message
 * text the API itself would reject it with (docs/plans/data-gap-handling.md
 * §5).
 */
export function validateBacktestConfig(
  config: BacktestConfig,
  targetStep?: StepKey,
  gaps: readonly DataGap[] = [],
): ValidationResult {
  const errors: ValidationError[] = [];

  const shouldValidate = (step: StepKey) => !targetStep || targetStep === step;

  // 1. Security Validation
  if (shouldValidate('security')) {
    if (!config.security || !config.security.symbol || !config.security.symbol.trim()) {
      errors.push({
        step: 'security',
        field: 'symbol',
        message: 'Pick a company',
      });
    }
  }

  // 2. Period Validation
  if (shouldValidate('period')) {
    const { startDate, endDate } = config.period || {};

    if (!startDate || !startDate.trim()) {
      errors.push({
        step: 'period',
        field: 'startDate',
        message: 'Pick a start date',
      });
    } else if (!ISO_DATE_REGEX.test(startDate) || isNaN(Date.parse(startDate))) {
      errors.push({
        step: 'period',
        field: 'startDate',
        message: 'Pick a real start date',
      });
    }

    if (!endDate || !endDate.trim()) {
      errors.push({
        step: 'period',
        field: 'endDate',
        message: 'Pick an end date',
      });
    } else if (!ISO_DATE_REGEX.test(endDate) || isNaN(Date.parse(endDate))) {
      errors.push({
        step: 'period',
        field: 'endDate',
        message: 'Pick a real end date',
      });
    }

    if (startDate && endDate && ISO_DATE_REGEX.test(startDate) && ISO_DATE_REGEX.test(endDate)) {
      const startMs = Date.parse(startDate);
      const endMs = Date.parse(endDate);

      if (startMs >= endMs) {
        errors.push({
          step: 'period',
          field: 'startDate',
          message: 'The start date must be before the end date',
        });
      }

      // The dataset has no prices before 2017. There is no fixed upper
      // bound: daily ingestion extends coverage past the 2017–2025 seed, and
      // each security's own `dataTo` below is the real ceiling.
      if (startDate < CSE_DATASET_MIN_DATE) {
        errors.push({
          step: 'period',
          field: 'startDate',
          message: `Prices start on ${formatDay(CSE_DATASET_MIN_DATE)} · Pick a later start date`,
        });
      }

      // Security-specific historical coverage bounds if known
      if (config.security?.dataFrom && startDate < config.security.dataFrom) {
        errors.push({
          step: 'period',
          field: 'startDate',
          message: `${config.security.symbol} prices start on ${formatDay(config.security.dataFrom)} · Pick a later start date`,
        });
      }

      if (config.security?.dataTo && endDate > config.security.dataTo) {
        errors.push({
          step: 'period',
          field: 'endDate',
          message: `${config.security.symbol} prices end on ${formatDay(config.security.dataTo)} · Pick an earlier end date`,
        });
      }

      // Data-gap validation (docs/plans/data-gap-handling.md §5): the same
      // rule the API applies before its own DATE_IN_DATA_GAP rejection,
      // mirrored via `backtestDateGap`'s weekend roll (start forward, end
      // backward), so a typed or restored draft can't slip a gap date past
      // the client only to be bounced by the server.
      const startGap = backtestDateGap(gaps, startDate, 'start');
      if (startGap) {
        errors.push({
          step: 'period',
          field: 'startDate',
          message: dateInGapMessage(startGap),
        });
      }

      const endGap = backtestDateGap(gaps, endDate, 'end');
      if (endGap) {
        errors.push({
          step: 'period',
          field: 'endDate',
          message: dateInGapMessage(endGap),
        });
      }
    }
  }

  // 3. Rules Validation (v1 Price DSL)
  if (shouldValidate('rules')) {
    const buy = config.rules?.buy;
    const sells = config.rules?.sells;

    // Buy rule validation (exactly one buy condition)
    if (!buy || !buy.type) {
      errors.push({
        step: 'rules',
        field: 'buy',
        message: 'Pick one buy rule',
      });
    } else {
      const validBuyTypes = ['period_start', 'price_falls_to', 'price_falls_pct_from_period_start'];
      if (!validBuyTypes.includes(buy.type)) {
        errors.push({
          step: 'rules',
          field: 'buy.type',
          message: `That buy rule isn't available · Pick another one`,
        });
      } else {
        if (buy.type === 'price_falls_to') {
          if (buy.value === undefined || buy.value === null || isNaN(buy.value) || buy.value <= 0) {
            errors.push({
              step: 'rules',
              field: 'buy.value',
              message: 'Enter a buy price above LKR 0',
            });
          }
        } else if (buy.type === 'price_falls_pct_from_period_start') {
          if (buy.value === undefined || buy.value === null || isNaN(buy.value) || buy.value <= 0) {
            errors.push({
              step: 'rules',
              field: 'buy.value',
              message: 'Enter a fall bigger than 0%',
            });
          } else if (buy.value >= 100) {
            errors.push({
              step: 'rules',
              field: 'buy.value',
              message: 'Enter a fall smaller than 100%',
            });
          }
        }
      }
    }

    // Sell rules validation (at least one sell condition)
    if (!sells || !Array.isArray(sells) || sells.length === 0) {
      errors.push({
        step: 'rules',
        field: 'sells',
        message: 'Pick at least one sell rule',
      });
    } else {
      const validSellTypes = ['target_price', 'take_profit_pct', 'stop_loss_pct', 'end_of_period'];
      const seenTypes = new Set<string>();

      sells.forEach((sell, idx) => {
        const fieldName = `sells[${idx}]`;

        if (!sell.type || !validSellTypes.includes(sell.type)) {
          errors.push({
            step: 'rules',
            field: `${fieldName}.type`,
            message: `That sell rule isn't available · Pick another one`,
          });
          return;
        }

        if (seenTypes.has(sell.type)) {
          errors.push({
            step: 'rules',
            field: `${fieldName}.type`,
            message: `Each sell rule can only be added once`,
          });
        }
        seenTypes.add(sell.type);

        if (sell.type === 'target_price') {
          if (sell.value === undefined || sell.value === null || isNaN(sell.value) || sell.value <= 0) {
            errors.push({
              step: 'rules',
              field: `${fieldName}.value`,
              message: 'Enter a sell price above LKR 0',
            });
          }
        } else if (sell.type === 'take_profit_pct') {
          if (sell.value === undefined || sell.value === null || isNaN(sell.value) || sell.value <= 0) {
            errors.push({
              step: 'rules',
              field: `${fieldName}.value`,
              message: 'Enter a rise bigger than 0%',
            });
          } else if (sell.value > 1000) {
            errors.push({
              step: 'rules',
              field: `${fieldName}.value`,
              message: 'Enter a rise of 1000% or less',
            });
          }
        } else if (sell.type === 'stop_loss_pct') {
          if (sell.value === undefined || sell.value === null || isNaN(sell.value) || sell.value <= 0) {
            errors.push({
              step: 'rules',
              field: `${fieldName}.value`,
              message: 'Enter a fall bigger than 0%',
            });
          } else if (sell.value >= 100) {
            errors.push({
              step: 'rules',
              field: `${fieldName}.value`,
              message: 'Enter a fall smaller than 100%',
            });
          }
        }
      });

      // Compatibility check: price_falls_to buy vs target_price sell
      if (buy?.type === 'price_falls_to' && typeof buy.value === 'number') {
        const targetPriceSell = sells.find((s) => s.type === 'target_price');
        if (targetPriceSell && typeof targetPriceSell.value === 'number') {
          if (targetPriceSell.value <= buy.value) {
            errors.push({
              step: 'rules',
              field: 'sells',
              message: `The sell price (LKR ${targetPriceSell.value}) must be higher than the buy price (LKR ${buy.value})`,
            });
          }
        }
      }
    }
  }

  // 4. Execution Validation
  if (shouldValidate('execution')) {
    const sizing = config.execution?.positionSizing;
    const fees = config.execution?.fees;

    if (!sizing || !sizing.type) {
      errors.push({
        step: 'execution',
        field: 'positionSizing.type',
        message: 'Pick how much each buy uses',
      });
    } else {
      if (sizing.type === 'percentage') {
        if (sizing.value === undefined || sizing.value === null || isNaN(sizing.value) || sizing.value <= 0 || sizing.value > 100) {
          errors.push({
            step: 'execution',
            field: 'positionSizing.value',
            message: 'Enter a share of your portfolio between 1% and 100%',
          });
        }
      } else if (sizing.type === 'absolute') {
        if (sizing.value === undefined || sizing.value === null || isNaN(sizing.value) || sizing.value <= 0) {
          errors.push({
            step: 'execution',
            field: 'positionSizing.value',
            message: 'Enter an amount above LKR 0',
          });
        }
      } else if (sizing.type === 'fixed_quantity') {
        if (sizing.value === undefined || sizing.value === null || isNaN(sizing.value) || sizing.value <= 0 || !Number.isInteger(sizing.value)) {
          errors.push({
            step: 'execution',
            field: 'positionSizing.value',
            message: 'Enter a whole number of shares above 0',
          });
        }
      }
    }

    if (fees) {
      const feeKeys = ['brokerageRate', 'cseRate', 'cdsRate', 'secCessRate', 'stlRate'] as const;
      for (const feeKey of feeKeys) {
        const rate = fees[feeKey];
        if (rate !== undefined && (isNaN(rate) || rate < 0)) {
          errors.push({
            step: 'execution',
            field: `fees.${feeKey}`,
            message: `Charges can't be below 0%`,
          });
        }
      }
    }
  }

  // 5. Portfolio Validation
  if (shouldValidate('portfolio')) {
    const capital = config.portfolio?.startingCapital;
    if (capital === undefined || capital === null || isNaN(capital)) {
      errors.push({
        step: 'portfolio',
        field: 'startingCapital',
        message: 'Enter your starting cash',
      });
    } else if (capital <= 0) {
      errors.push({
        step: 'portfolio',
        field: 'startingCapital',
        message: 'Enter starting cash above LKR 0',
      });
    } else if (!Number.isFinite(capital)) {
      errors.push({
        step: 'portfolio',
        field: 'startingCapital',
        message: 'Enter your starting cash as a number',
      });
    }
  }

  // 6. Metrics Validation
  if (shouldValidate('metrics')) {
    if (!config.metrics?.selected || config.metrics.selected.length === 0) {
      errors.push({
        step: 'metrics',
        field: 'selected',
        message: 'Pick at least one result to show',
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
