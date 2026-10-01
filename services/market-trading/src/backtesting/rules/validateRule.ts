import { RuleSet } from '../domain/types';
import { InvalidRuleError } from '../domain/errors';

export function validateRule(rules: RuleSet): void {
  const fields: { field: string; reason: string }[] = [];

  if (!rules) {
    throw new InvalidRuleError('Rules object is missing or null.');
  }

  if (!['1.0', '2.0'].includes(rules.version)) {
    fields.push({
      field: 'version',
      reason: 'Supported strategy versions are 1.0 and 2.0.',
    });
  }

  if (rules.version === '1.0' && rules.reentryCondition !== undefined) {
    fields.push({
      field: 'reentryCondition',
      reason: 'Version 1.0 does not support re-entry.',
    });
  }
  if (rules.version === '2.0') {
    const reentry = rules.reentryCondition;
    if (
      !reentry ||
      reentry.type !== 'price_falls_pct_from_last_sell' ||
      !Number.isFinite(reentry.value) ||
      reentry.value <= 0 ||
      reentry.value >= 100
    ) {
      fields.push({
        field: 'reentryCondition',
        reason:
          'Version 2.0 requires a last-sale fall greater than 0% and smaller than 100%.',
      });
    }
  }

  if (!rules.buyCondition) {
    fields.push({
      field: 'buyCondition',
      reason:
        'buyCondition is required and must specify exactly one condition.',
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
        if (
          !Number.isFinite(buy.value) ||
          buy.value === undefined ||
          buy.value <= 0
        ) {
          fields.push({
            field: 'buyCondition.value',
            reason:
              'price_falls_to value must be a positive number greater than 0.',
          });
        }
      } else if (buy.type === 'price_falls_pct_from_period_start') {
        if (
          !Number.isFinite(buy.value) ||
          buy.value === undefined ||
          buy.value <= 0
        ) {
          fields.push({
            field: 'buyCondition.value',
            reason:
              'price_falls_pct_from_period_start value must be a positive percentage greater than 0.',
          });
        }
      }
    }
  }

  if (
    !rules.sellConditions ||
    !Array.isArray(rules.sellConditions) ||
    rules.sellConditions.length === 0
  ) {
    fields.push({
      field: 'sellConditions',
      reason: 'sellConditions must contain at least one condition.',
    });
  } else {
    rules.sellConditions.forEach((sell, idx) => {
      const fieldPath = `sellConditions[${idx}]`;
      if (!sell || typeof sell !== 'object') {
        fields.push({
          field: fieldPath,
          reason: 'A sell condition must be an object.',
        });
        return;
      }
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
          if (
            !Number.isFinite(sell.value) ||
            sell.value === undefined ||
            sell.value <= 0
          ) {
            fields.push({
              field: `${fieldPath}.value`,
              reason:
                'target_price value must be a positive number greater than 0.',
            });
          }
        } else if (sell.type === 'take_profit_pct') {
          if (
            !Number.isFinite(sell.value) ||
            sell.value === undefined ||
            sell.value <= 0
          ) {
            fields.push({
              field: `${fieldPath}.value`,
              reason:
                'take_profit_pct value must be a positive percentage greater than 0.',
            });
          }
        } else if (sell.type === 'stop_loss_pct') {
          if (
            !Number.isFinite(sell.value) ||
            sell.value === undefined ||
            sell.value <= 0
          ) {
            fields.push({
              field: `${fieldPath}.value`,
              reason:
                'stop_loss_pct value must be a positive percentage greater than 0.',
            });
          }
        }
      }
    });
  }

  if (rules.version === '2.0') {
    if (
      rules.buyCondition?.type === 'price_falls_pct_from_period_start' &&
      rules.buyCondition.value! >= 100
    ) {
      fields.push({
        field: 'buyCondition.value',
        reason: 'A price fall must be smaller than 100%.',
      });
    }
    const seen = new Set<string>();
    for (const sell of Array.isArray(rules.sellConditions)
      ? rules.sellConditions
      : []) {
      if (!sell || typeof sell !== 'object') continue;
      if (seen.has(sell.type))
        fields.push({
          field: 'sellConditions',
          reason: 'Each sell rule may appear only once.',
        });
      seen.add(sell.type);
      if (sell.type === 'stop_loss_pct' && sell.value! >= 100)
        fields.push({
          field: 'sellConditions',
          reason: 'A stop loss must be smaller than 100%.',
        });
    }
  }

  if (fields.length > 0) {
    throw new InvalidRuleError('Strategy validation failed.', fields);
  }
}
