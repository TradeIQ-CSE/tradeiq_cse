import { FeeConfig, PositionSizingConfig } from '../domain/types';
import { InvalidRuleError } from '../domain/errors';

/** Validate the repeated-strategy execution contract before preview or persistence. */
export function validateExecution(
  size: PositionSizingConfig,
  fees: FeeConfig,
): void {
  if (
    !size ||
    !['full_capital', 'percentage', 'absolute', 'fixed_quantity'].includes(
      size.type,
    ) ||
    (size.type !== 'full_capital' &&
      (!Number.isFinite(size.value) || !size.value || size.value <= 0)) ||
    (size.type === 'percentage' && size.value! > 100) ||
    (size.type === 'fixed_quantity' && !Number.isSafeInteger(size.value))
  ) {
    throw new InvalidRuleError('Invalid position sizing.', [
      {
        field: 'positionSizing',
        reason:
          'Use positive finite values; percentages cannot exceed 100 and share quantities must be whole.',
      },
    ]);
  }
  const rates = [
    'brokerageRate',
    'cseRate',
    'cdsRate',
    'secCessRate',
    'stlRate',
  ] as const;
  const totalRate = fees
    ? rates.reduce((total, key) => total + fees[key], 0)
    : NaN;
  if (
    !fees ||
    rates.some((key) => !Number.isFinite(fees[key]) || fees[key] < 0) ||
    !Number.isFinite(totalRate) ||
    totalRate >= 1
  ) {
    throw new InvalidRuleError(
      'Fee rates must be finite, nonnegative and total less than 100%.',
      [
        {
          field: 'feeConfig',
          reason:
            'Enter finite, nonnegative fee rates totaling less than 100%.',
        },
      ],
    );
  }
}
