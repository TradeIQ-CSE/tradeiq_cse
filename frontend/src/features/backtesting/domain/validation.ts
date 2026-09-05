import { BacktestConfig, StepKey, ValidationError, ValidationResult } from './types';
import { CSE_DATASET_MIN_DATE, CSE_DATASET_MAX_DATE } from './defaults';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates the entire backtest configuration or a specific step.
 */
export function validateBacktestConfig(
  config: BacktestConfig,
  targetStep?: StepKey,
): ValidationResult {
  const errors: ValidationError[] = [];

  const shouldValidate = (step: StepKey) => !targetStep || targetStep === step;

  // 1. Security Validation
  if (shouldValidate('security')) {
    if (!config.security || !config.security.symbol || !config.security.symbol.trim()) {
      errors.push({
        step: 'security',
        field: 'symbol',
        message: 'Security selection is required.',
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
        message: 'Start date is required.',
      });
    } else if (!ISO_DATE_REGEX.test(startDate) || isNaN(Date.parse(startDate))) {
      errors.push({
        step: 'period',
        field: 'startDate',
        message: 'Start date must be a valid calendar date in YYYY-MM-DD format.',
      });
    }

    if (!endDate || !endDate.trim()) {
      errors.push({
        step: 'period',
        field: 'endDate',
        message: 'End date is required.',
      });
    } else if (!ISO_DATE_REGEX.test(endDate) || isNaN(Date.parse(endDate))) {
      errors.push({
        step: 'period',
        field: 'endDate',
        message: 'End date must be a valid calendar date in YYYY-MM-DD format.',
      });
    }

    if (startDate && endDate && ISO_DATE_REGEX.test(startDate) && ISO_DATE_REGEX.test(endDate)) {
      const startMs = Date.parse(startDate);
      const endMs = Date.parse(endDate);

      if (startMs >= endMs) {
        errors.push({
          step: 'period',
          field: 'startDate',
          message: 'Start date must be strictly before end date.',
        });
      }

      // Dataset bounds validation (2017-2025)
      if (startDate < CSE_DATASET_MIN_DATE) {
        errors.push({
          step: 'period',
          field: 'startDate',
          message: `Start date cannot precede the available dataset coverage (${CSE_DATASET_MIN_DATE}).`,
        });
      }

      if (endDate > CSE_DATASET_MAX_DATE) {
        errors.push({
          step: 'period',
          field: 'endDate',
          message: `End date cannot exceed the available dataset coverage (${CSE_DATASET_MAX_DATE}).`,
        });
      }

      // Security-specific historical coverage bounds if known
      if (config.security?.dataFrom && startDate < config.security.dataFrom) {
        errors.push({
          step: 'period',
          field: 'startDate',
          message: `Start date precedes historical price coverage for ${config.security.symbol} (${config.security.dataFrom}).`,
        });
      }

      if (config.security?.dataTo && endDate > config.security.dataTo) {
        errors.push({
          step: 'period',
          field: 'endDate',
          message: `End date exceeds historical price coverage for ${config.security.symbol} (${config.security.dataTo}).`,
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
        message: 'Exactly one buy condition is required.',
      });
    } else {
      const validBuyTypes = ['period_start', 'price_falls_to', 'price_falls_pct_from_period_start'];
      if (!validBuyTypes.includes(buy.type)) {
        errors.push({
          step: 'rules',
          field: 'buy.type',
          message: `Unsupported buy condition type '${buy.type}'. Indicator strategies are not supported in v1 DSL.`,
        });
      } else {
        if (buy.type === 'price_falls_to') {
          if (buy.value === undefined || buy.value === null || isNaN(buy.value) || buy.value <= 0) {
            errors.push({
              step: 'rules',
              field: 'buy.value',
              message: 'Target buy price must be a positive number greater than 0 LKR.',
            });
          }
        } else if (buy.type === 'price_falls_pct_from_period_start') {
          if (buy.value === undefined || buy.value === null || isNaN(buy.value) || buy.value <= 0) {
            errors.push({
              step: 'rules',
              field: 'buy.value',
              message: 'Price drop percentage must be greater than 0%.',
            });
          } else if (buy.value >= 100) {
            errors.push({
              step: 'rules',
              field: 'buy.value',
              message: 'Price drop percentage must be less than 100%.',
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
        message: 'At least one sell condition is required.',
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
            message: `Unsupported sell condition type '${sell.type}'. Indicator strategies are not supported in v1 DSL.`,
          });
          return;
        }

        if (seenTypes.has(sell.type)) {
          errors.push({
            step: 'rules',
            field: `${fieldName}.type`,
            message: `Duplicate sell condition type '${sell.type}'. Each exit rule type can only be added once.`,
          });
        }
        seenTypes.add(sell.type);

        if (sell.type === 'target_price') {
          if (sell.value === undefined || sell.value === null || isNaN(sell.value) || sell.value <= 0) {
            errors.push({
              step: 'rules',
              field: `${fieldName}.value`,
              message: 'Target exit price must be a positive number greater than 0 LKR.',
            });
          }
        } else if (sell.type === 'take_profit_pct') {
          if (sell.value === undefined || sell.value === null || isNaN(sell.value) || sell.value <= 0) {
            errors.push({
              step: 'rules',
              field: `${fieldName}.value`,
              message: 'Take profit percentage must be greater than 0%.',
            });
          } else if (sell.value > 1000) {
            errors.push({
              step: 'rules',
              field: `${fieldName}.value`,
              message: 'Take profit percentage cannot exceed 1000%.',
            });
          }
        } else if (sell.type === 'stop_loss_pct') {
          if (sell.value === undefined || sell.value === null || isNaN(sell.value) || sell.value <= 0) {
            errors.push({
              step: 'rules',
              field: `${fieldName}.value`,
              message: 'Stop loss percentage must be greater than 0%.',
            });
          } else if (sell.value >= 100) {
            errors.push({
              step: 'rules',
              field: `${fieldName}.value`,
              message: 'Stop loss percentage must be less than 100%.',
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
              message: `Incompatible rules: Target exit price (${targetPriceSell.value} LKR) must be higher than buy price (${buy.value} LKR).`,
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
        message: 'Position sizing strategy is required.',
      });
    } else {
      if (sizing.type === 'percentage') {
        if (sizing.value === undefined || sizing.value === null || isNaN(sizing.value) || sizing.value <= 0 || sizing.value > 100) {
          errors.push({
            step: 'execution',
            field: 'positionSizing.value',
            message: 'Position sizing percentage must be between 1% and 100%.',
          });
        }
      } else if (sizing.type === 'absolute') {
        if (sizing.value === undefined || sizing.value === null || isNaN(sizing.value) || sizing.value <= 0) {
          errors.push({
            step: 'execution',
            field: 'positionSizing.value',
            message: 'Absolute allocation amount must be greater than 0 LKR.',
          });
        }
      } else if (sizing.type === 'fixed_quantity') {
        if (sizing.value === undefined || sizing.value === null || isNaN(sizing.value) || sizing.value <= 0 || !Number.isInteger(sizing.value)) {
          errors.push({
            step: 'execution',
            field: 'positionSizing.value',
            message: 'Fixed share quantity must be a positive integer whole number.',
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
            message: `${feeKey} fee rate cannot be negative.`,
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
        message: 'Starting capital is required.',
      });
    } else if (capital <= 0) {
      errors.push({
        step: 'portfolio',
        field: 'startingCapital',
        message: 'Starting capital must be greater than 0 LKR.',
      });
    } else if (!Number.isFinite(capital)) {
      errors.push({
        step: 'portfolio',
        field: 'startingCapital',
        message: 'Starting capital must be a finite number.',
      });
    }
  }

  // 6. Metrics Validation
  if (shouldValidate('metrics')) {
    if (!config.metrics?.selected || config.metrics.selected.length === 0) {
      errors.push({
        step: 'metrics',
        field: 'selected',
        message: 'Please select at least one metric to track.',
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
