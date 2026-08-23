import { RuleSet, BuyCondition, SellCondition } from '../domain/types';
import { InvalidRuleError } from '../domain/errors';

export function validateRule(rules: RuleSet): void {
  const fields: { field: string; reason: string }[] = [];

  if (!rules) {
    throw new InvalidRuleError('Rules object is missing or null.');
  }

  if (!rules.version || typeof rules.version !== 'string') {
    fields.push({
      field: 'version',
      reason: 'version is required and must be a string.',
    });
  }

  if (!rules.buyCondition) {
    fields.push({
      field: 'buyCondition',
      reason: 'buyCondition is required and must specify exactly one condition.',
    });
  } else {
    const buy = rules.buyCondition;
    if (
      buy.type !== 'period_start' &&
      buy.type !== 'price_falls_to' &&
      buy.type !== 'price_falls_pct_from_period_start'
    ) {
      fields.push({
        field: 'buyCondition.type',
        reason: `Unsupported buy condition type: '${buy.type}'.`,
      });
    } else {
      if (buy.type === 'price_falls_to') {
        if (buy.value === undefined || buy.value === null || buy.value <= 0) {
          fields.push({
            field: 'buyCondition.value',
            reason: 'price_falls_to value must be a positive number greater than 0.',
          });
        }
      } else if (buy.type === 'price_falls_pct_from_period_start') {
        if (buy.value === undefined || buy.value === null || buy.value <= 0) {
          fields.push({
            field: 'buyCondition.value',
            reason: 'price_falls_pct_from_period_start value must be a positive percentage greater than 0.',
          });
        }
      }
    }
  }

  if (!rules.sellConditions || !Array.isArray(rules.sellConditions) || rules.sellConditions.length === 0) {
    fields.push({
      field: 'sellConditions',
      reason: 'sellConditions must contain at least one condition.',
    });
  } else {
    rules.sellConditions.forEach((sell, idx) => {
      const fieldPath = `sellConditions[${idx}]`;
      if (
        sell.type !== 'target_price' &&
        sell.type !== 'take_profit_pct' &&
        sell.type !== 'stop_loss_pct' &&
        sell.type !== 'end_of_period'
      ) {
        fields.push({
          field: `${fieldPath}.type`,
          reason: `Unsupported sell condition type: '${sell.type}'.`,
        });
      } else {
        if (sell.type === 'target_price') {
          if (sell.value === undefined || sell.value === null || sell.value <= 0) {
            fields.push({
              field: `${fieldPath}.value`,
              reason: 'target_price value must be a positive number greater than 0.',
            });
          }
        } else if (sell.type === 'take_profit_pct') {
          if (sell.value === undefined || sell.value === null || sell.value <= 0) {
            fields.push({
              field: `${fieldPath}.value`,
              reason: 'take_profit_pct value must be a positive percentage greater than 0.',
            });
          }
        } else if (sell.type === 'stop_loss_pct') {
          if (sell.value === undefined || sell.value === null || sell.value <= 0) {
            fields.push({
              field: `${fieldPath}.value`,
              reason: 'stop_loss_pct value must be a positive percentage greater than 0.',
            });
          }
        }
      }
    });
  }

  if (fields.length > 0) {
    throw new InvalidRuleError('Strategy validation failed.', fields);
  }
}
